import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { fromDb, toDb } from "@/lib/bigmoney";
import { formatCents } from "@/lib/money";
import {
  applyXp,
  describeProgression,
  xpForWager,
  type LevelUpEvent,
  type Progression,
} from "@/lib/progression";

/**
 * The single place where fake balance moves. Every mutation is an atomic,
 * conditional SQL update so two concurrent requests can never spend the same
 * balance twice, and every settled bet writes exactly one Transaction row.
 *
 * There is deliberately no function here that adds balance from an external
 * source. The only credits are the daily bonus, the sign-up grant and level-up
 * rewards — no payment provider is imported anywhere in this project.
 *
 * Money columns are BigInt in the database; everything above this file works in
 * plain `number` cents. `fromDb` / `toDb` are the only conversion points.
 */

export type LedgerKind = "BET" | "BONUS" | "SIGNUP" | "LEVELUP" | "REBIRTH";
export type LedgerOutcome = "WIN" | "LOSS" | "PUSH" | "CREDIT";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("Not enough balance.");
    this.name = "InsufficientBalanceError";
  }
}

type Tx = Prisma.TransactionClient;

async function readBalance(tx: Tx, userId: string): Promise<number> {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balanceCents: true } });
  return fromDb(u.balanceCents);
}

/**
 * Atomically removes `cents` from the balance, failing if the player cannot
 * cover it. Returns the balance after the debit.
 */
export async function debit(tx: Tx, userId: string, cents: number): Promise<number> {
  if (cents < 0) throw new Error("debit: cents must be >= 0");
  if (cents === 0) return readBalance(tx, userId);

  // Conditional update: the WHERE clause is the concurrency guard.
  const updated = await tx.user.updateMany({
    where: { id: userId, balanceCents: { gte: toDb(cents) } },
    data: { balanceCents: { decrement: toDb(cents) } },
  });
  if (updated.count === 0) throw new InsufficientBalanceError();

  return readBalance(tx, userId);
}

export async function credit(tx: Tx, userId: string, cents: number): Promise<number> {
  if (cents < 0) throw new Error("credit: cents must be >= 0");
  if (cents === 0) return readBalance(tx, userId);
  const u = await tx.user.update({
    where: { id: userId },
    data: { balanceCents: { increment: toDb(cents) } },
    select: { balanceCents: true },
  });
  return fromDb(u.balanceCents);
}

export type LogInput = {
  userId: string;
  game: string;
  kind: LedgerKind;
  betCents: number;
  payoutCents: number;
  outcome: LedgerOutcome;
  summary: string;
  balanceAfterCents: number;
  detail?: unknown;
};

export async function writeTransaction(tx: Tx, input: LogInput) {
  return tx.transaction.create({
    data: {
      userId: input.userId,
      game: input.game,
      kind: input.kind,
      betCents: toDb(input.betCents),
      payoutCents: toDb(input.payoutCents),
      netCents: toDb(input.payoutCents - input.betCents),
      outcome: input.outcome,
      summary: input.summary,
      balanceAfterCents: toDb(input.balanceAfterCents),
      detail: input.detail === undefined ? null : JSON.stringify(input.detail),
    },
  });
}

// ---------------------------------------------------------------------------
// Life progression
// ---------------------------------------------------------------------------

export type ProgressUpdate = {
  xpGained: number;
  levelUps: LevelUpEvent[];
  progression: Progression;
};

/**
 * Awards career XP for a settled wager and rolls the player up through any
 * levels it covers, recording each one it passes.
 *
 * XP is a function of the AMOUNT STAKED only — never of the result — so
 * progression can't be farmed by a lucky streak or stalled by a cold one.
 * Leveling and rebirth pay no currency of their own: with XP earned on
 * volume alone, any cash reward here would be free money bought by betting
 * enough times rather than won — betting the table limit repeatedly at even
 * the app's lowest house edge nets more from a reward like that than the
 * guaranteed losses cost, many times over. Progression raises the table
 * limit and unlocks features; the daily bonus is still the only top-up.
 */
export async function awardProgress(
  tx: Tx,
  userId: string,
  wagerCents: number,
  payoutCents: number,
): Promise<ProgressUpdate> {
  const before = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      level: true,
      xp: true,
      rebirths: true,
      balanceCents: true,
      lifetimeWageredCents: true,
      lifetimeWonCents: true,
      biggestWinCents: true,
      bestMultiplierX100: true,
    },
  });

  const xpGained = xpForWager(wagerCents, before.rebirths);
  const rolled = applyXp({ level: before.level, xp: before.xp, rebirths: before.rebirths }, xpGained);

  const multiplierX100 = wagerCents > 0 ? Math.round((payoutCents / wagerCents) * 100) : 0;

  await tx.user.update({
    where: { id: userId },
    data: {
      level: rolled.level,
      xp: rolled.xp,
      lifetimeWageredCents: { increment: toDb(wagerCents) },
      lifetimeWonCents: { increment: toDb(payoutCents) },
      biggestWinCents: toDb(Math.max(fromDb(before.biggestWinCents), payoutCents)),
      bestMultiplierX100: Math.max(before.bestMultiplierX100, multiplierX100),
    },
  });

  const balanceCents = fromDb(before.balanceCents);

  for (const up of rolled.levelUps) {
    // Zero-value row: recorded for the history feed, not a balance change.
    await writeTransaction(tx, {
      userId,
      game: "life",
      kind: "LEVELUP",
      betCents: 0,
      payoutCents: 0,
      outcome: "CREDIT",
      summary: `Level ${up.level} — ${up.stage.title}. Table limit now ${formatCents(up.maxBetCents)}.`,
      balanceAfterCents: balanceCents,
      detail: { level: up.level, unlocked: up.unlocked, maxBetCents: up.maxBetCents },
    });
  }

  const after = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      level: true,
      xp: true,
      rebirths: true,
      lifetimeWageredCents: true,
      lifetimeWonCents: true,
      biggestWinCents: true,
      bestMultiplierX100: true,
    },
  });

  return {
    xpGained,
    levelUps: rolled.levelUps,
    progression: describeProgression({
      level: after.level,
      xp: after.xp,
      rebirths: after.rebirths,
      lifetimeWageredCents: fromDb(after.lifetimeWageredCents),
      lifetimeWonCents: fromDb(after.lifetimeWonCents),
      biggestWinCents: fromDb(after.biggestWinCents),
      bestMultiplierX100: after.bestMultiplierX100,
    }),
  };
}

export type SettledBet = {
  balanceCents: number;
  transactionId: string;
  netCents: number;
  progress: ProgressUpdate;
};

/**
 * One-shot bet: debit the stake, credit the return, log it, then award career
 * XP. Used by slots and roulette, where the whole bet resolves inside a single
 * request.
 */
export async function settleOneShotBet(args: {
  userId: string;
  game: string;
  betCents: number;
  payoutCents: number;
  outcome: LedgerOutcome;
  summary: string;
  detail?: unknown;
}): Promise<SettledBet> {
  return prisma.$transaction(async (tx) => {
    await debit(tx, args.userId, args.betCents);
    const balanceCents = await credit(tx, args.userId, args.payoutCents);
    const row = await writeTransaction(tx, {
      userId: args.userId,
      game: args.game,
      kind: "BET",
      betCents: args.betCents,
      payoutCents: args.payoutCents,
      outcome: args.outcome,
      summary: args.summary,
      balanceAfterCents: balanceCents,
      detail: args.detail,
    });

    const progress = await awardProgress(tx, args.userId, args.betCents, args.payoutCents);

    return {
      balanceCents,
      transactionId: row.id,
      netCents: args.payoutCents - args.betCents,
      progress,
    };
  });
}

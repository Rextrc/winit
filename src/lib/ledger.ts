import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { fromDb, toDb } from "@/lib/bigmoney";
import { MIN_BET_CENTS, formatCents } from "@/lib/money";
import * as Career from "@/lib/life/career";
import type { CareerState, DeathCause } from "@/lib/life/career";
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

export type LedgerKind =
  | "BET"
  | "BONUS"
  | "SIGNUP"
  | "LEVELUP"
  | "REBIRTH"
  | "COMEBACK"
  | "DEATH"
  | "TRAVEL"
  | "NEWLIFE";
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
  career: CareerState;
  careerEvents: CareerEvent[];
};

/** Something the career layer did to you as a result of the bet just settled. */
export type CareerEvent =
  | { kind: "COMEBACK"; comebacksLeft: number; stakeCents: number; balanceCents: number }
  | { kind: "DEATH"; cause: DeathCause; ageAtEnd: number; epitaph: string };

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
      livesLived: true,
      careerDays: true,
      careerStartedAt: true,
      betsThisLife: true,
      comebacksUsed: true,
      peakBalanceCents: true,
      venueId: true,
      deathCause: true,
    },
  });

  const xpGained = xpForWager(wagerCents, before.rebirths, before.livesLived);
  const rolled = applyXp({ level: before.level, xp: before.xp, rebirths: before.rebirths }, xpGained);

  const multiplierX100 = wagerCents > 0 ? Math.round((payoutCents / wagerCents) * 100) : 0;

  // This runs after the stake and the return have both been applied, so the
  // row we just read already carries the final post-settlement balance.
  let balanceCents = fromDb(before.balanceCents);
  const peakBalanceCents = Math.max(fromDb(before.peakBalanceCents), balanceCents);

  // Every settled bet spends the same fixed slice of the life.
  let careerDays = before.careerDays + Career.DAYS_PER_BET;
  let comebacksUsed = before.comebacksUsed;
  const careerEvents: CareerEvent[] = [];

  await tx.user.update({
    where: { id: userId },
    data: {
      level: rolled.level,
      xp: rolled.xp,
      lifetimeWageredCents: { increment: toDb(wagerCents) },
      lifetimeWonCents: { increment: toDb(payoutCents) },
      biggestWinCents: toDb(Math.max(fromDb(before.biggestWinCents), payoutCents)),
      bestMultiplierX100: Math.max(before.bestMultiplierX100, multiplierX100),
      betsThisLife: { increment: 1 },
      peakBalanceCents: toDb(peakBalanceCents),
    },
  });

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

  // --- Ruin -----------------------------------------------------------------
  // Broke means broke everywhere: below the global minimum stake, there is no
  // room on the circuit that will deal to you, not even the back room.
  const broke = balanceCents < MIN_BET_CENTS;
  let deathCause: DeathCause | null = null;

  if (broke && comebacksUsed < Career.COMEBACKS_PER_LIFE) {
    comebacksUsed += 1;
    // Finding the money took three years you are not getting back.
    careerDays += Career.COMEBACK_DAYS;
    balanceCents = await credit(tx, userId, Career.COMEBACK_STAKE_CENTS);
    await writeTransaction(tx, {
      userId,
      game: "life",
      kind: "COMEBACK",
      betCents: 0,
      payoutCents: Career.COMEBACK_STAKE_CENTS,
      outcome: "CREDIT",
      summary:
        `Wiped out. Scraped together ${formatCents(Career.COMEBACK_STAKE_CENTS)} and lost three years ` +
        `doing it — ${Career.COMEBACKS_PER_LIFE - comebacksUsed} comeback(s) left.`,
      balanceAfterCents: balanceCents,
      detail: { comebacksUsed, daysLost: Career.COMEBACK_DAYS },
    });
    careerEvents.push({
      kind: "COMEBACK",
      comebacksLeft: Career.COMEBACKS_PER_LIFE - comebacksUsed,
      stakeCents: Career.COMEBACK_STAKE_CENTS,
      balanceCents,
    });
  } else if (broke) {
    deathCause = "RUIN";
  }

  // --- Old age --------------------------------------------------------------
  // Checked after the comeback, because the three years it costs can be the
  // three years that finish you.
  if (!deathCause && Career.isOverTheHill(careerDays)) deathCause = "OLD_AGE";

  const diedAt = deathCause ? new Date() : null;

  await tx.user.update({
    where: { id: userId },
    data: { careerDays, comebacksUsed, deathCause, diedAt },
  });

  if (deathCause) {
    const summary: Career.LifeSummary = {
      cause: deathCause,
      ageAtEnd: Career.ageFromDays(careerDays),
      level: rolled.level,
      rebirths: before.rebirths,
      peakBalanceCents,
      lifetimeWageredCents: fromDb(before.lifetimeWageredCents) + wagerCents,
      biggestWinCents: Math.max(fromDb(before.biggestWinCents), payoutCents),
      venueId: before.venueId,
    };
    const epitaph = Career.epitaphFor(summary);

    // The gravestone. Written once, never updated.
    await tx.life.create({
      data: {
        userId,
        ordinal: before.livesLived + 1,
        cause: deathCause,
        ageAtEnd: summary.ageAtEnd,
        level: summary.level,
        rebirths: summary.rebirths,
        venueId: summary.venueId,
        epitaph,
        peakBalanceCents: toDb(summary.peakBalanceCents),
        lifetimeWageredCents: toDb(summary.lifetimeWageredCents),
        biggestWinCents: toDb(summary.biggestWinCents),
        betsPlaced: before.betsThisLife + 1,
        startedAt: before.careerStartedAt,
      },
    });

    await writeTransaction(tx, {
      userId,
      game: "life",
      kind: "DEATH",
      betCents: 0,
      payoutCents: 0,
      outcome: "CREDIT",
      summary:
        deathCause === "RUIN"
          ? `Ruined at ${summary.ageAtEnd}. ${epitaph}`
          : `Reached ${summary.ageAtEnd} and the clock ran out. ${epitaph}`,
      balanceAfterCents: balanceCents,
      detail: { ...summary, epitaph },
    });

    careerEvents.push({ kind: "DEATH", cause: deathCause, ageAtEnd: summary.ageAtEnd, epitaph });
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

  const progression = describeProgression({
    level: after.level,
    xp: after.xp,
    rebirths: after.rebirths,
    lifetimeWageredCents: fromDb(after.lifetimeWageredCents),
    lifetimeWonCents: fromDb(after.lifetimeWonCents),
    biggestWinCents: fromDb(after.biggestWinCents),
    bestMultiplierX100: after.bestMultiplierX100,
  });

  return {
    xpGained,
    levelUps: rolled.levelUps,
    progression,
    career: Career.describeCareer(
      {
        livesLived: before.livesLived,
        careerDays,
        comebacksUsed,
        betsThisLife: before.betsThisLife + 1,
        peakBalanceCents,
        venueId: before.venueId,
        deathCause,
      },
      progression.maxBetCents,
      MIN_BET_CENTS,
    ),
    careerEvents,
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

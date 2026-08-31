import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * The single place where fake balance moves. Every mutation is an atomic,
 * conditional SQL update so two concurrent requests can never spend the same
 * balance twice, and every settled bet writes exactly one Transaction row.
 *
 * There is deliberately no function here that adds balance from an external
 * source. The only credits are `recordBonus` (the daily bonus) and the
 * sign-up grant — no payment provider is imported anywhere in this project.
 */

export type LedgerKind = "BET" | "BONUS" | "SIGNUP";
export type LedgerOutcome = "WIN" | "LOSS" | "PUSH" | "CREDIT";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("Not enough balance.");
    this.name = "InsufficientBalanceError";
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Atomically removes `cents` from the balance, failing if the player cannot
 * cover it. Returns the balance after the debit.
 */
export async function debit(tx: Tx, userId: string, cents: number): Promise<number> {
  if (cents < 0) throw new Error("debit: cents must be >= 0");
  if (cents === 0) {
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balanceCents: true } });
    return u.balanceCents;
  }

  // Conditional update: the WHERE clause is the concurrency guard.
  const updated = await tx.user.updateMany({
    where: { id: userId, balanceCents: { gte: cents } },
    data: { balanceCents: { decrement: cents } },
  });
  if (updated.count === 0) throw new InsufficientBalanceError();

  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balanceCents: true } });
  return u.balanceCents;
}

export async function credit(tx: Tx, userId: string, cents: number): Promise<number> {
  if (cents < 0) throw new Error("credit: cents must be >= 0");
  if (cents === 0) {
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balanceCents: true } });
    return u.balanceCents;
  }
  const u = await tx.user.update({
    where: { id: userId },
    data: { balanceCents: { increment: cents } },
    select: { balanceCents: true },
  });
  return u.balanceCents;
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
      betCents: input.betCents,
      payoutCents: input.payoutCents,
      netCents: input.payoutCents - input.betCents,
      outcome: input.outcome,
      summary: input.summary,
      balanceAfterCents: input.balanceAfterCents,
      detail: input.detail === undefined ? null : JSON.stringify(input.detail),
    },
  });
}

export type SettledBet = {
  balanceCents: number;
  transactionId: string;
  netCents: number;
};

/**
 * One-shot bet: debit the stake, credit the return, log it. Used by slots and
 * roulette, where the whole bet resolves inside a single request.
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
    return { balanceCents, transactionId: row.id, netCents: args.payoutCents - args.betCents };
  });
}

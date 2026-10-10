import type { CrashRound, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { awardProgress, credit, writeTransaction, type ProgressUpdate } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { fromDb } from "@/lib/bigmoney";
import { cashoutMultiplier, drawCrashPoint, timeToReach } from "@/lib/games/crash";

/**
 * WINIT CRASH — MULTIPLAYER
 * ---------------------------------------------------------------------------
 * Everyone shares one round at a time. There is no background worker: the
 * next round is created by whichever request first notices the last one has
 * finished, with a unique round number as the lock, so this runs anywhere —
 * one server or many, serverless or not.
 *
 *   countdown (bets open) → flight (cash out any time) → crashed (hold) → …
 *
 * The crash point is drawn when a round is created and is never sent to a
 * client until the curve has reached it. Cash-outs are priced from the
 * server's clock. Auto cash-outs are paid at their target the moment any
 * request sees the curve pass it, and anything still riding when the round
 * crashes is settled as a loss.
 * ---------------------------------------------------------------------------
 */

export const COUNTDOWN_MS = 6_000;
export const CRASHED_HOLD_MS = 3_000;

export type Phase = "countdown" | "flight" | "crashed";

export function phaseOf(round: CrashRound, now: number): Phase {
  if (now < round.startsAt.getTime()) return "countdown";
  if (now < round.crashAt.getTime()) return "flight";
  return "crashed";
}

/** The round everyone is looking at right now, creating the next if due. */
export async function currentRound(now = Date.now()): Promise<CrashRound> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await prisma.crashRound.findFirst({ orderBy: { id: "desc" } });
    if (latest && now < latest.crashAt.getTime() + CRASHED_HOLD_MS) return latest;

    if (latest && !latest.settled) await settleRound(latest.id);

    const scheduled = latest ? latest.crashAt.getTime() + CRASHED_HOLD_MS + COUNTDOWN_MS : 0;
    const startsAt = Math.max(scheduled, now + COUNTDOWN_MS);
    const crashPoint = drawCrashPoint();
    try {
      return await prisma.crashRound.create({
        data: {
          id: (latest?.id ?? 0) + 1,
          startsAt: new Date(startsAt),
          crashPoint,
          crashAt: new Date(startsAt + timeToReach(crashPoint)),
        },
      });
    } catch {
      // Another request created it first — read theirs.
    }
  }
  const latest = await prisma.crashRound.findFirst({ orderBy: { id: "desc" } });
  if (!latest) throw new Error("Couldn't start a crash round.");
  return latest;
}

async function payOut(
  tx: Prisma.TransactionClient,
  bet: { id: string; userId: string; betCents: bigint },
  round: CrashRound,
  multiplier: number,
  how: "auto" | "manual",
): Promise<{ balanceCents: number; payoutCents: number; progress: ProgressUpdate } | null> {
  // The conditional update is the lock against paying a bet twice.
  const stake = fromDb(bet.betCents);
  const payoutCents = Math.round(stake * multiplier);
  const claimed = await tx.crashBet.updateMany({
    where: { id: bet.id, status: "ACTIVE" },
    data: { status: "CASHED", cashedAt: multiplier, payoutCents: BigInt(payoutCents) },
  });
  if (claimed.count === 0) return null;

  const balanceCents = await credit(tx, bet.userId, payoutCents);
  await writeTransaction(tx, {
    userId: bet.userId,
    game: "crash",
    kind: "BET",
    betCents: stake,
    payoutCents,
    outcome: payoutCents > stake ? "WIN" : payoutCents === stake ? "PUSH" : "LOSS",
    summary: `${how === "auto" ? "Auto cashed" : "Cashed"} at ${multiplier.toFixed(2)}x — round #${round.id} — paid ${formatCents(payoutCents)}`,
    balanceAfterCents: balanceCents,
    detail: { roundId: round.id, cashedAt: multiplier },
  });
  const progress = await awardProgress(tx, bet.userId, "crash", stake, payoutCents);
  await tx.crashBet.update({ where: { id: bet.id }, data: { progressJson: JSON.stringify(progress) } });
  return { balanceCents, payoutCents, progress };
}

/** Pays every auto cash-out the live curve has already passed. */
export async function settleAutoCashouts(round: CrashRound, now = Date.now()) {
  if (phaseOf(round, now) !== "flight") return;
  const reached = cashoutMultiplier(now - round.startsAt.getTime());
  const due = await prisma.crashBet.findMany({
    where: { roundId: round.id, status: "ACTIVE", autoTarget: { lte: reached } },
    select: { id: true, userId: true, betCents: true, autoTarget: true },
  });
  for (const bet of due) {
    await prisma.$transaction((tx) => payOut(tx, bet, round, bet.autoTarget!, "auto"));
  }
}

/** Once crashed: pays auto targets at or under the crash point, loses the rest. */
export async function settleRound(roundId: number) {
  const round = await prisma.crashRound.findUnique({ where: { id: roundId } });
  if (!round || round.settled || Date.now() < round.crashAt.getTime()) return;

  const open = await prisma.crashBet.findMany({
    where: { roundId, status: "ACTIVE" },
    select: { id: true, userId: true, betCents: true, autoTarget: true },
  });
  for (const bet of open) {
    await prisma.$transaction(async (tx) => {
      if (bet.autoTarget !== null && bet.autoTarget <= round.crashPoint) {
        await payOut(tx, bet, round, bet.autoTarget, "auto");
        return;
      }
      const lost = await tx.crashBet.updateMany({ where: { id: bet.id, status: "ACTIVE" }, data: { status: "LOST" } });
      if (lost.count === 0) return;
      const stake = fromDb(bet.betCents);
      const { balanceCents } = await tx.user.findUniqueOrThrow({ where: { id: bet.userId }, select: { balanceCents: true } });
      await writeTransaction(tx, {
        userId: bet.userId,
        game: "crash",
        kind: "BET",
        betCents: stake,
        payoutCents: 0,
        outcome: "LOSS",
        summary: `Crashed at ${round.crashPoint.toFixed(2)}x — round #${round.id}`,
        balanceAfterCents: fromDb(balanceCents),
        detail: { roundId: round.id, crashPoint: round.crashPoint, autoTarget: bet.autoTarget },
      });
      const progress = await awardProgress(tx, bet.userId, "crash", stake, 0);
      await tx.crashBet.update({ where: { id: bet.id }, data: { progressJson: JSON.stringify(progress) } });
    });
  }
  await prisma.crashRound.update({ where: { id: roundId }, data: { settled: true } });
}

/** A manual cash-out, priced from the server's clock. */
export async function cashOut(userId: string) {
  const now = Date.now();
  const round = await currentRound(now);
  if (phaseOf(round, now) !== "flight") throw new Error("Nothing to cash out — the round isn't in the air.");

  const bet = await prisma.crashBet.findUnique({
    where: { roundId_userId: { roundId: round.id, userId } },
    select: { id: true, userId: true, betCents: true, autoTarget: true, status: true },
  });
  if (!bet || bet.status !== "ACTIVE") throw new Error("You have no live bet this round.");

  const reached = cashoutMultiplier(now - round.startsAt.getTime());
  // An auto target the curve has already passed is paid at the target.
  const multiplier = bet.autoTarget !== null && bet.autoTarget <= reached ? bet.autoTarget : reached;
  const paid = await prisma.$transaction((tx) => payOut(tx, bet, round, multiplier, "manual"));
  if (!paid) throw new Error("That bet has already been settled.");
  return { roundId: round.id, multiplier, ...paid };
}

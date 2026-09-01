import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { InsufficientBalanceError } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import { describeProgression, type Progression } from "@/lib/progression";
import { describeCareer, type CareerState } from "@/lib/life/career";
import { MIN_BET_CENTS, formatCents } from "@/lib/money";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * The caller, with every BigInt money column already converted to `number`
 * cents and their live progression derived. Routes never touch raw Prisma
 * money values.
 */
export type CurrentUser = {
  id: string;
  username: string;
  email: string | null;
  balanceCents: number;
  lastBonusAt: Date | null;
  bonusStreak: number;
  level: number;
  xp: number;
  rebirths: number;
  progression: Progression;
  career: CareerState;
  /** Per-life reputation — can go down, unlike everything else. */
  reputation: number;
  /** Drives the VIP ladder, which no reset ever clears. */
  lifetimeWageredCents: number;
};

/** Loads the caller, or returns a 401 response to bail out with. */
export async function requireUser(): Promise<
  { user: CurrentUser; response: null } | { user: null; response: NextResponse }
> {
  const id = await currentUserId();
  if (!id) return { user: null, response: jsonError("Sign in to play.", 401) };

  const row = await prisma.user.findUnique({ where: { id } });
  if (!row) return { user: null, response: jsonError("Account not found.", 401) };

  const progression = describeProgression({
    level: row.level,
    xp: row.xp,
    rebirths: row.rebirths,
    lifetimeWageredCents: fromDb(row.lifetimeWageredCents),
    lifetimeWonCents: fromDb(row.lifetimeWonCents),
    biggestWinCents: fromDb(row.biggestWinCents),
    bestMultiplierX100: row.bestMultiplierX100,
  });

  const career = describeCareer(
    {
      livesLived: row.livesLived,
      careerDays: row.careerDays,
      comebacksUsed: row.comebacksUsed,
      betsThisLife: row.betsThisLife,
      peakBalanceCents: fromDb(row.peakBalanceCents),
      venueId: row.venueId,
      deathCause: row.deathCause,
    },
    progression.maxBetCents,
    MIN_BET_CENTS,
  );

  return {
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      balanceCents: fromDb(row.balanceCents),
      lastBonusAt: row.lastBonusAt,
      bonusStreak: row.bonusStreak,
      level: row.level,
      xp: row.xp,
      rebirths: row.rebirths,
      progression,
      career,
      reputation: row.reputation,
      lifetimeWageredCents: fromDb(row.lifetimeWageredCents),
    },
    response: null,
  };
}

/**
 * The two things the career layer can refuse a bet for, checked in one place
 * so every game route enforces them identically. Returns a response to bail
 * out with, or null to carry on.
 *
 * Note this is about eligibility to sit down, not about odds: a room that
 * won't take your stake still deals exactly the same game at exactly the same
 * published RTP as every other room.
 */
export function assertBettable(user: CurrentUser, stakeCents: number): NextResponse | null {
  if (user.career.over) {
    return jsonError(
      user.career.deathCause === "RUIN"
        ? "That career ended in ruin. Start a new life to play again."
        : "That career reached the end of the clock. Start a new life to play again.",
      409,
    );
  }
  if (stakeCents < user.career.tableMinCents) {
    return jsonError(
      `${user.career.venueName} won't take less than ${formatCents(user.career.tableMinCents)} a bet. ` +
        `Travel somewhere cheaper, or raise your stake.`,
      409,
    );
  }
  return null;
}

/** Maps thrown errors onto sensible API responses. */
export function handleError(err: unknown) {
  if (err instanceof InsufficientBalanceError) return jsonError("Not enough balance for that bet.", 409);
  if (err instanceof Error) return jsonError(err.message, 400);
  return jsonError("Something went wrong.", 500);
}

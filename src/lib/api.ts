import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { InsufficientBalanceError } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import { describeProgression, type Progression } from "@/lib/progression";

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
    },
    response: null,
  };
}

/** Maps thrown errors onto sensible API responses. */
export function handleError(err: unknown) {
  if (err instanceof InsufficientBalanceError) return jsonError("Not enough balance for that bet.", 409);
  if (err instanceof Error) return jsonError(err.message, 400);
  return jsonError("Something went wrong.", 500);
}

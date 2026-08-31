import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { fromDb, toDb } from "@/lib/bigmoney";
import { writeTransaction } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import {
  MAX_LEVEL,
  MAX_REBIRTHS,
  STARTING_BALANCE_CENTS,
  describeProgression,
  maxBetCents,
  rebirthMultiplier,
} from "@/lib/progression";

export const runtime = "nodejs";

/**
 * REBIRTH — the prestige step.
 *
 * You trade a maxed-out level for a permanent ×3 on every future table limit.
 * Your bankroll is never reduced: the fresh stake is granted as a FLOOR, so a
 * player who arrives rich keeps what they have. The cost is the level reset,
 * not the money.
 *
 * Like every other credit in this app the grant is fake currency created by
 * the app itself. There is still no deposit, no purchase and no conversion.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { level: true, rebirths: true, balanceCents: true },
      });

      if (before.level < MAX_LEVEL) return { error: `Rebirth unlocks at level ${MAX_LEVEL}.` as const };
      if (before.rebirths >= MAX_REBIRTHS) return { error: "You have taken every rebirth there is." as const };

      const rebirths = before.rebirths + 1;
      const balanceBefore = fromDb(before.balanceCents);
      const floorCents = STARTING_BALANCE_CENTS * rebirthMultiplier(rebirths);
      const grantCents = Math.max(0, floorCents - balanceBefore);

      // Conditional update doubles as the lock: a second concurrent rebirth
      // matches zero rows because the level has already been reset.
      const done = await tx.user.updateMany({
        where: { id: user.id, level: { gte: MAX_LEVEL }, rebirths: before.rebirths },
        data: {
          level: 1,
          xp: 0,
          rebirths,
          balanceCents: { increment: toDb(grantCents) },
        },
      });
      if (done.count === 0) return { error: "That rebirth was already taken." as const };

      const balanceCents = balanceBefore + grantCents;

      await writeTransaction(tx, {
        userId: user.id,
        game: "life",
        kind: "REBIRTH",
        betCents: 0,
        payoutCents: grantCents,
        outcome: "CREDIT",
        summary: `Rebirth ${rebirths} — table limit ×${rebirthMultiplier(rebirths)}, now ${formatCents(
          maxBetCents(1, rebirths),
        )}.`,
        balanceAfterCents: balanceCents,
        detail: { rebirths, grantCents, floorCents },
      });

      const after = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
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
        balanceCents,
        grantCents,
        rebirths,
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
    });

    if ("error" in result && result.error) return jsonError(result.error, 409);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

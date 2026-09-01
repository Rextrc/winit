import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { fromDb, toDb } from "@/lib/bigmoney";
import { writeTransaction } from "@/lib/ledger";
import { STARTING_BALANCE_CENTS, formatCents } from "@/lib/money";
import { MAX_LEVEL, MAX_REBIRTHS, describeProgression, maxBetCents, rebirthMultiplier } from "@/lib/progression";

export const runtime = "nodejs";

/**
 * REBIRTH — the prestige step.
 *
 * You trade a maxed-out level AND your bankroll for a permanent ×3 on every
 * future table limit. Everything you are holding above the sign-up stake is
 * gone; you start the ladder again at level 1 with beginner money and a much
 * higher ceiling, which is the whole tension of the thing.
 *
 * The wipe is `min(balance, starting stake)`, so it is a pure sink and can
 * never hand anybody a cent: a player who arrives at level 50 already below
 * the sign-up stake keeps exactly what they had rather than being topped up
 * to it. That matters, because XP is earned on volume alone — any cash grant
 * tied to reaching level 50 would be free money bought by wagering enough
 * rather than won, and it would compound with every rebirth taken. The daily
 * bonus remains the only balance top-up in the app.
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
      const wasCents = fromDb(before.balanceCents);
      // The wipe: back down to the sign-up stake, never up to it.
      const balanceCents = Math.min(wasCents, STARTING_BALANCE_CENTS);
      const surrenderedCents = wasCents - balanceCents;

      // Conditional update doubles as the lock: a second concurrent rebirth
      // matches zero rows because the level has already been reset.
      const done = await tx.user.updateMany({
        where: { id: user.id, level: { gte: MAX_LEVEL }, rebirths: before.rebirths },
        data: { level: 1, xp: 0, rebirths, balanceCents: toDb(balanceCents) },
      });
      if (done.count === 0) return { error: "That rebirth was already taken." as const };

      await writeTransaction(tx, {
        userId: user.id,
        game: "life",
        kind: "REBIRTH",
        // Logged as a stake with no return, because that is what it is: the
        // bankroll leaves the account and nothing comes back but a multiplier.
        betCents: surrenderedCents,
        payoutCents: 0,
        outcome: surrenderedCents > 0 ? "LOSS" : "CREDIT",
        summary:
          `Rebirth ${rebirths} — surrendered ${formatCents(surrenderedCents)}, ` +
          `table limit ×${rebirthMultiplier(rebirths)}, now ${formatCents(maxBetCents(1, rebirths))}.`,
        balanceAfterCents: balanceCents,
        detail: { rebirths, surrenderedCents },
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

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { bonusAmountForStreak, bonusStatus, nextStreak } from "@/lib/bonus";
import { credit, writeTransaction } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { BONUS_COOLDOWN_MS } from "@/lib/money";

export const runtime = "nodejs";

/**
 * Claims the daily bonus. This is the only balance top-up in WinIt — there is
 * no deposit endpoint, no payment webhook and no real-money path to reach.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - BONUS_COOLDOWN_MS);

      const streak = nextStreak(user.lastBonusAt, user.bonusStreak, now);
      const amountCents = bonusAmountForStreak(streak);

      // Conditional update doubles as the cooldown lock: a second concurrent
      // claim matches zero rows because lastBonusAt has already moved.
      const claimed = await tx.user.updateMany({
        where: {
          id: user.id,
          OR: [{ lastBonusAt: null }, { lastBonusAt: { lte: cutoff } }],
        },
        data: { lastBonusAt: now, bonusStreak: streak },
      });
      if (claimed.count === 0) return null;

      const balanceCents = await credit(tx, user.id, amountCents);
      await writeTransaction(tx, {
        userId: user.id,
        game: "bonus",
        kind: "BONUS",
        betCents: 0,
        payoutCents: amountCents,
        outcome: "CREDIT",
        summary: `Daily bonus — day ${streak} streak, ${formatCents(amountCents)} credits`,
        balanceAfterCents: balanceCents,
        detail: { streak },
      });

      return { balanceCents, amountCents, streak, lastBonusAt: now };
    });

    if (!result) {
      return jsonError("Your daily bonus isn't ready yet.", 429);
    }

    return NextResponse.json({
      ok: true,
      amountCents: result.amountCents,
      balanceCents: result.balanceCents,
      bonus: bonusStatus(result.lastBonusAt, result.streak),
    });
  } catch (err) {
    return handleError(err);
  }
}

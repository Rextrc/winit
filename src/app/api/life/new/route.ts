import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { fromDb, toDb } from "@/lib/bigmoney";
import { writeTransaction } from "@/lib/ledger";
import { STARTING_BALANCE_CENTS, formatCents } from "@/lib/money";
import { legacyXpMultiplier, startingLevel, START_AGE } from "@/lib/life/career";
import { DEFAULT_VENUE_ID } from "@/lib/life/venues";

export const runtime = "nodejs";

/**
 * START A NEW LIFE — only possible once the previous one has ended.
 *
 * Almost nothing carries over. Balance, level, XP, rebirths, venue and the
 * comeback allowance all reset; what an heir inherits is a faster climb
 * (+25% XP per finished career) and a slightly higher starting level, both
 * capped, and both worth exactly zero currency.
 *
 * The reset balance is the same fake sign-up stake every account already gets,
 * and it is set rather than added — it can be a large downgrade for someone
 * who retired rich. It is not a top-up path: reaching it costs an entire
 * career first, which makes it a strictly worse way to obtain fake credits
 * than simply claiming the daily bonus. There is still no real-money path
 * anywhere in this app.
 */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  if (!user.career.over) {
    return jsonError("You are still alive. Play this career out first.", 409);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { livesLived: true, deathCause: true, balanceCents: true },
      });

      // The conditional update is the lock: a second concurrent call matches
      // zero rows because deathCause has already been cleared.
      const livesLived = before.livesLived + 1;
      const level = startingLevel(livesLived);

      const done = await tx.user.updateMany({
        where: { id: user.id, deathCause: { not: null } },
        data: {
          livesLived,
          level,
          xp: 0,
          rebirths: 0,
          balanceCents: toDb(STARTING_BALANCE_CENTS),
          peakBalanceCents: toDb(STARTING_BALANCE_CENTS),
          careerDays: 0,
          careerStartedAt: new Date(),
          betsThisLife: 0,
          comebacksUsed: 0,
          venueId: DEFAULT_VENUE_ID,
          deathCause: null,
          diedAt: null,
        },
      });
      if (done.count === 0) return { error: "That life has already been started." as const };

      // Any hand or round left open by the previous life dies with it.
      await tx.round.updateMany({
        where: { userId: user.id, status: "ACTIVE" },
        data: { status: "SETTLED" },
      });

      // The reset moves the balance, so it has to be logged as a movement:
      // the ledger's invariant is that netCents explains every change, and a
      // zero-value row here would silently break the chain. Retiring rich
      // surrenders the difference; dying broke is restored up to the stake.
      const wasCents = fromDb(before.balanceCents);
      const surrenderedCents = Math.max(0, wasCents - STARTING_BALANCE_CENTS);
      const restoredCents = Math.max(0, STARTING_BALANCE_CENTS - wasCents);

      await writeTransaction(tx, {
        userId: user.id,
        game: "life",
        kind: "NEWLIFE",
        betCents: surrenderedCents,
        payoutCents: restoredCents,
        outcome: surrenderedCents > restoredCents ? "LOSS" : "CREDIT",
        summary:
          `Life ${livesLived + 1} begins at ${START_AGE} with ${formatCents(STARTING_BALANCE_CENTS)}, ` +
          `level ${level} and ×${legacyXpMultiplier(livesLived).toFixed(2)} XP from the ones before it.`,
        balanceAfterCents: STARTING_BALANCE_CENTS,
        detail: { livesLived, level, previousCause: before.deathCause, surrenderedCents, restoredCents },
      });

      return {
        livesLived,
        level,
        balanceCents: STARTING_BALANCE_CENTS,
        surrenderedCents,
        legacyXpMultiplier: legacyXpMultiplier(livesLived),
      };
    });

    if ("error" in result && result.error) return jsonError(result.error, 409);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

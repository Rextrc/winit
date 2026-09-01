import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { shuffle } from "@/lib/rng";
import { KENO_DRAWN, KENO_MAX_PICKS, KENO_POOL, kenoPaytable, payoutFor } from "@/lib/games/originals";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  picks: z.array(z.number().int().min(1).max(KENO_POOL)).min(1).max(KENO_MAX_PICKS),
});

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid bet.");

  const picks = [...new Set(parsed.data.picks)];
  if (picks.length !== parsed.data.picks.length) return jsonError("Duplicate picks.");

  const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!bet.ok) return jsonError(bet.error, 409);
  const gate = assertBettable(user, bet.cents);
  if (gate) return gate;

  try {
    // Shuffle the whole pool and take the first KENO_DRAWN — an unbiased way
    // to draw 10 of 40 without replacement.
    const pool = shuffle(Array.from({ length: KENO_POOL }, (_, i) => i + 1));
    const drawn = pool.slice(0, KENO_DRAWN);
    const drawnSet = new Set(drawn);
    const hits = picks.filter((n) => drawnSet.has(n)).length;

    const table = kenoPaytable(picks.length);
    const multiplier = table[hits] ?? 0;
    const payoutCents = payoutFor(bet.cents, multiplier);

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "keno",
      betCents: bet.cents,
      payoutCents,
      outcome: payoutCents > bet.cents ? "WIN" : payoutCents === bet.cents ? "PUSH" : "LOSS",
      summary:
        payoutCents > 0
          ? `${hits}/${picks.length} hits — paid ${formatCents(payoutCents)}`
          : `${hits}/${picks.length} hits — no pay`,
      detail: { picks, drawn, hits, multiplier },
    });

    return NextResponse.json({
      ok: true,
      drawn,
      hits,
      multiplier,
      payoutCents,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
      bonus: bonusStatus(user.lastBonusAt, user.bonusStreak),
    });
  } catch (err) {
    return handleError(err);
  }
}

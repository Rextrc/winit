import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { randomFloat } from "@/lib/rng";
import { limboResultFromUniform, limboValidTarget, payoutFor, roundMultiplier } from "@/lib/games/originals";

export const runtime = "nodejs";

const schema = z.object({ betCents: z.number().int(), target: z.number() });

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

  const target = roundMultiplier(parsed.data.target);
  if (!limboValidTarget(target)) return jsonError("Target must be between 1.01x and 10,000x.", 409);

  const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!bet.ok) return jsonError(bet.error, 409);
  const gate = assertBettable(user, bet.cents);
  if (gate) return gate;

  try {
    // u is uniform on (0, 1]: 1 - randomFloat() excludes 0, which would
    // otherwise divide by zero and hand out an infinite multiplier.
    const u = 1 - randomFloat();
    const result = limboResultFromUniform(u);
    const won = result >= target;
    const payoutCents = won ? payoutFor(bet.cents, target) : 0;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "limbo",
      betCents: bet.cents,
      payoutCents,
      outcome: won ? "WIN" : "LOSS",
      summary: won
        ? `Crashed at ${result.toFixed(2)}x, needed ${target.toFixed(2)}x — paid ${formatCents(payoutCents)}`
        : `Crashed at ${result.toFixed(2)}x, needed ${target.toFixed(2)}x — no pay`,
      detail: { result, target },
    });

    return NextResponse.json({
      ok: true,
      result,
      target,
      won,
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { randomInt } from "@/lib/rng";
import { WHEEL_SEGMENTS, payoutFor, type WheelRisk } from "@/lib/games/originals";

export const runtime = "nodejs";

const schema = z.object({ betCents: z.number().int(), risk: z.enum(["low", "medium", "high"]) });

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

  const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!bet.ok) return jsonError(bet.error, 409);

  try {
    const risk = parsed.data.risk as WheelRisk;
    const segments = WHEEL_SEGMENTS[risk];
    const index = randomInt(segments.length);
    const multiplier = segments[index];
    const payoutCents = payoutFor(bet.cents, multiplier);
    const won = payoutCents > bet.cents;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "wheel",
      betCents: bet.cents,
      payoutCents,
      outcome: payoutCents > 0 ? (won ? "WIN" : payoutCents === bet.cents ? "PUSH" : "LOSS") : "LOSS",
      summary:
        payoutCents > 0
          ? `Landed on ${multiplier}x — paid ${formatCents(payoutCents)}`
          : "Landed on 0x — no pay",
      detail: { risk, index, multiplier },
    });

    return NextResponse.json({
      ok: true,
      risk,
      index,
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

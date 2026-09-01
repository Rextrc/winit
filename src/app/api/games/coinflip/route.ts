import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { randomInt } from "@/lib/rng";
import { COINFLIP_MULTIPLIER, payoutFor, type CoinSide } from "@/lib/games/originals";

export const runtime = "nodejs";

const schema = z.object({ betCents: z.number().int(), side: z.enum(["heads", "tails"]) });

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
  const gate = await assertBettable(user, bet.cents, "coinflip");
  if (gate) return gate;

  try {
    const result: CoinSide = randomInt(2) === 0 ? "heads" : "tails";
    const won = result === parsed.data.side;
    const payoutCents = won ? payoutFor(bet.cents, COINFLIP_MULTIPLIER) : 0;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "coinflip",
      betCents: bet.cents,
      payoutCents,
      outcome: won ? "WIN" : "LOSS",
      summary: won ? `${result} — paid ${formatCents(payoutCents)}` : `${result} — no pay`,
      detail: { result, side: parsed.data.side },
    });

    return NextResponse.json({
      ok: true,
      result,
      won,
      multiplier: COINFLIP_MULTIPLIER,
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

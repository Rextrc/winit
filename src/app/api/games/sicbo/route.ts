import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { labelFor, multiplierFor, roll, validBet, type SicBoBet } from "@/lib/games/sicbo";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  bet: z.object({
    type: z.enum(["small", "big", "anyTriple", "triple", "total", "single"]),
    face: z.number().int().optional(),
    total: z.number().int().optional(),
  }),
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

  const bet = parsed.data.bet as SicBoBet;
  if (!validBet(bet)) return jsonError("That isn't a bet on this table.");

  const stake = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!stake.ok) return jsonError(stake.error, 409);
  const gate = await assertBettable(user, stake.cents, "sicbo");
  if (gate) return gate;

  try {
    const thrown = roll();
    const multiplier = multiplierFor(bet, thrown);
    const payoutCents = Math.round(stake.cents * multiplier);
    const won = payoutCents > 0;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "sicbo",
      betCents: stake.cents,
      payoutCents,
      outcome: won ? "WIN" : "LOSS",
      summary: won
        ? `${thrown.join("-")} — ${labelFor(bet)} paid ${formatCents(payoutCents)}`
        : `${thrown.join("-")} — ${labelFor(bet)} missed`,
      detail: { throw: thrown, bet, multiplier },
    });

    return NextResponse.json({
      ok: true,
      throw: thrown,
      bet,
      multiplier,
      payoutCents,
      won,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
    });
  } catch (err) {
    return handleError(err);
  }
}

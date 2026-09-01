import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { randomInt } from "@/lib/rng";
import {
  DICE_OUTCOMES,
  diceChance,
  diceMultiplier,
  diceValidTarget,
  diceWins,
  payoutFor,
  type DiceDirection,
} from "@/lib/games/originals";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  direction: z.enum(["over", "under"]),
  target: z.number().int(),
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

  const { direction, target } = parsed.data as { direction: DiceDirection; target: number };
  if (!diceValidTarget(direction, target)) {
    return jsonError("That target is outside the allowed win chance (2%–98%).", 409);
  }

  const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!bet.ok) return jsonError(bet.error, 409);
  const gate = await assertBettable(user, bet.cents, "dice");
  if (gate) return gate;

  try {
    const roll = randomInt(DICE_OUTCOMES);
    const won = diceWins(direction, target, roll);
    const multiplier = diceMultiplier(direction, target);
    const payoutCents = won ? payoutFor(bet.cents, multiplier) : 0;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "dice",
      betCents: bet.cents,
      payoutCents,
      outcome: won ? "WIN" : "LOSS",
      summary: won
        ? `Rolled ${(roll / 100).toFixed(2)}, ${direction} ${(target / 100).toFixed(2)} — paid ${formatCents(payoutCents)}`
        : `Rolled ${(roll / 100).toFixed(2)}, ${direction} ${(target / 100).toFixed(2)} — no pay`,
      detail: { roll, direction, target, multiplier, chance: diceChance(direction, target) },
    });

    return NextResponse.json({
      ok: true,
      roll,
      won,
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { horseById, race } from "@/lib/games/racing";

export const runtime = "nodejs";

const schema = z.object({ betCents: z.number().int(), horseId: z.number().int() });

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

  const horse = horseById(parsed.data.horseId);
  if (!horse) return jsonError("That horse isn't in this race.");

  const stake = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!stake.ok) return jsonError(stake.error, 409);
  const gate = await assertBettable(user, stake.cents, "racing");
  if (gate) return gate;

  try {
    const result = race(horse.id, stake.cents);
    const winner = horseById(result.winner)!;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "racing",
      betCents: stake.cents,
      payoutCents: result.payoutCents,
      outcome: result.won ? "WIN" : "LOSS",
      summary: result.won
        ? `${winner.name} won — paid ${formatCents(result.payoutCents)}`
        : `${winner.name} won — ${horse.name} beaten`,
      detail: { order: result.order, backed: horse.id, winner: result.winner },
    });

    return NextResponse.json({
      ok: true,
      result,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
    });
  } catch (err) {
    return handleError(err);
  }
}

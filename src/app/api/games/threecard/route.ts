import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { HAND_LABELS, deal } from "@/lib/games/threecard";

export const runtime = "nodejs";

const schema = z.object({ betCents: z.number().int() });

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

  const stake = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!stake.ok) return jsonError(stake.error, 409);
  const gate = assertBettable(user, stake.cents);
  if (gate) return gate;

  try {
    const result = deal(stake.cents);
    const won = result.payoutCents > 0;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "threecard",
      betCents: stake.cents,
      payoutCents: result.payoutCents,
      outcome: won ? "WIN" : "LOSS",
      summary: won
        ? `${HAND_LABELS[result.hand]} — paid ${formatCents(result.payoutCents)}`
        : `${HAND_LABELS[result.hand]} — no pay`,
      detail: result,
    });

    return NextResponse.json({
      ok: true,
      result,
      won,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
    });
  } catch (err) {
    return handleError(err);
  }
}

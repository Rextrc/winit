import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { scratch } from "@/lib/games/scratch";

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
    // The card is decided here, in full, before the client sees anything.
    const card = scratch(stake.cents);
    const won = card.payoutCents > 0;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "scratch",
      betCents: stake.cents,
      payoutCents: card.payoutCents,
      outcome: won ? "WIN" : "LOSS",
      summary: won
        ? `Three ${card.winningSymbol} — ${card.multiplier}x, ${formatCents(card.payoutCents)}`
        : "No matching three — no pay",
      detail: { panels: card.panels, symbol: card.winningSymbol, multiplier: card.multiplier },
    });

    return NextResponse.json({
      ok: true,
      card,
      won,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
    });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { PICKS, draw, validTicket } from "@/lib/games/lottery";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  numbers: z.array(z.number().int()).length(PICKS),
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
  if (!parsed.success) return jsonError(`Pick exactly ${PICKS} numbers.`);
  if (!validTicket(parsed.data.numbers)) return jsonError("That ticket has a duplicate or out-of-range number.");

  const stake = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!stake.ok) return jsonError(stake.error, 409);
  const gate = await assertBettable(user, stake.cents, "lottery");
  if (gate) return gate;

  try {
    const result = draw(parsed.data.numbers, stake.cents);
    const won = result.payoutCents > 0;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "lottery",
      betCents: stake.cents,
      payoutCents: result.payoutCents,
      outcome: won ? "WIN" : "LOSS",
      summary: won
        ? `${result.hits} of ${PICKS} — paid ${formatCents(result.payoutCents)}`
        : `${result.hits} of ${PICKS} — no pay`,
      detail: { drawn: result.drawn, ticket: result.ticket, hits: result.hits },
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

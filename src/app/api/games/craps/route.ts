import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { play, type CrapsBet } from "@/lib/games/craps";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  bet: z.enum(["pass", "dontPass", "field"]),
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

  const stake = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!stake.ok) return jsonError(stake.error, 409);
  const gate = await assertBettable(user, stake.cents, "craps");
  if (gate) return gate;

  try {
    // The whole come-out-and-point sequence resolves here, server-side.
    const result = play(parsed.data.bet as CrapsBet, stake.cents);

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "craps",
      betCents: stake.cents,
      payoutCents: result.payoutCents,
      outcome: result.outcome,
      summary: result.summary,
      detail: { bet: result.bet, rolls: result.rolls, point: result.point },
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

import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet } from "@/lib/money";
import { spin } from "@/lib/games/slots";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";

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

  const bet = validateBet(parsed.data.betCents, user.balanceCents);
  if (!bet.ok) return jsonError(bet.error, 409);

  try {
    const result = spin(bet.cents);
    const settled = await settleOneShotBet({
      userId: user.id,
      game: "slots",
      betCents: bet.cents,
      payoutCents: result.payoutCents,
      outcome: result.outcome,
      summary: result.summary,
      detail: { reels: result.reels, multiplier: result.multiplier },
    });

    return NextResponse.json({
      ok: true,
      result,
      betCents: bet.cents,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      bonus: bonusStatus(user.lastBonusAt, user.bonusStreak),
    });
  } catch (err) {
    return handleError(err);
  }
}

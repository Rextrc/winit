import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { BUY_FEATURE_PRICE_MULTIPLIER, type CandyMode } from "@/lib/games/candy";
import { playRound } from "@/lib/games/candy.engine";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { isUnlocked, UNLOCK_LEVELS } from "@/lib/progression";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  mode: z.enum(["SPIN", "BUY_FEATURE"]).default("SPIN"),
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

  const mode = parsed.data.mode as CandyMode;

  const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!bet.ok) return jsonError(bet.error, 409);

  if (mode === "BUY_FEATURE") {
    if (!isUnlocked("BUY_FREE", user.level, user.rebirths)) {
      return jsonError(`Buy Feature unlocks at level ${UNLOCK_LEVELS.BUY_FREE}.`, 403);
    }
    const price = BUY_FEATURE_PRICE_MULTIPLIER * bet.cents;
    if (price > user.balanceCents) {
      return jsonError(`Buy Feature costs ${formatCents(price)} at that stake.`, 409);
    }
  }

  try {
    const round = playRound(mode, bet.cents);
    const settled = await settleOneShotBet({
      userId: user.id,
      game: "slots",
      betCents: round.chargeCents,
      payoutCents: round.payoutCents,
      outcome: round.outcome,
      summary: round.summary,
      detail: {
        mode,
        bonusTriggered: round.bonusTriggered,
        blockCount: round.blocks.length,
        multiplier: Number(round.roundMultiplier.toFixed(4)),
      },
    });

    return NextResponse.json({
      ok: true,
      round,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
      bonus: bonusStatus(user.lastBonusAt, user.bonusStreak, undefined, user.rebirths),
    });
  } catch (err) {
    return handleError(err);
  }
}

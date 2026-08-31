import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { buyFor, quantiseStake, type SlotsMode } from "@/lib/games/slots";
import { playRound } from "@/lib/games/slots.engine";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { isUnlocked, UNLOCK_LEVELS } from "@/lib/progression";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  mode: z.enum(["SPIN", "BUY_FREE", "BUY_SUPER"]).default("SPIN"),
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

  const mode = parsed.data.mode as SlotsMode;

  // The stake is always checked against the player's own table limit, which is
  // derived from the persisted level and rebirth count — never from the client.
  const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!bet.ok) return jsonError(bet.error, 409);

  const { stakeCents } = quantiseStake(bet.cents);
  if (stakeCents <= 0) return jsonError("Stake must cover all ten paylines.", 409);

  const buy = buyFor(mode);
  if (buy) {
    if (!isUnlocked(buy.key, user.level, user.rebirths)) {
      return jsonError(`${buy.label} unlocks at level ${UNLOCK_LEVELS[buy.key]}.`, 403);
    }
    const price = buy.priceMultiplier * stakeCents;
    if (price > user.balanceCents) {
      return jsonError(`${buy.label} costs ${formatCents(price)} at that stake.`, 409);
    }
  }

  try {
    const round = playRound(mode, stakeCents);
    const settled = await settleOneShotBet({
      userId: user.id,
      game: "slots",
      betCents: round.chargeCents,
      payoutCents: round.payoutCents,
      outcome: round.outcome,
      summary: round.summary,
      detail: {
        mode,
        stakeCents: round.stakeCents,
        freeSpinsPlayed: round.freeSpinsPlayed,
        multiplier: Number(round.roundMultiplier.toFixed(4)),
        finalGrid: round.spins[round.spins.length - 1]?.grid,
      },
    });

    return NextResponse.json({
      ok: true,
      round,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
      bonus: bonusStatus(user.lastBonusAt, user.bonusStreak),
    });
  } catch (err) {
    return handleError(err);
  }
}

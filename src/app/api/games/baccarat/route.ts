import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { PAYOUT, payoutFor, playHand, type BetType } from "@/lib/games/baccarat";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  bet: z.enum(["player", "banker", "tie"]),
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

  const bet = parsed.data.bet as BetType;
  const stake = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!stake.ok) return jsonError(stake.error, 409);

  try {
    const hand = playHand();
    const payoutCents = payoutFor(bet, stake.cents, hand.winner);
    const won = payoutCents > stake.cents;
    const pushed = hand.winner === "tie" && bet !== "tie";

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "baccarat",
      betCents: stake.cents,
      payoutCents,
      outcome: won ? "WIN" : pushed ? "PUSH" : "LOSS",
      summary: pushed
        ? `Tie — ${formatCents(stake.cents)} on ${bet} pushed`
        : won
          ? `${hand.winner} wins ${hand.playerTotal}-${hand.bankerTotal} — paid ${formatCents(payoutCents)}`
          : `${hand.winner} wins ${hand.playerTotal}-${hand.bankerTotal} — no pay`,
      detail: { bet, hand, payout: PAYOUT[bet] },
    });

    return NextResponse.json({
      ok: true,
      hand,
      bet,
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

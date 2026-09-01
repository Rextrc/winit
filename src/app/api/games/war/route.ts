import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { play } from "@/lib/games/war";

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

  // A tie doubles the amount at risk, so the hand is only dealt if the player
  // could actually cover that outcome — the alternative is dealing a hand that
  // might be impossible to settle.
  const worstCase = stake.cents * 2;
  if (worstCase > user.balanceCents) {
    return jsonError(
      `A tie doubles your stake, so this needs ${formatCents(worstCase)} available. Lower the bet.`,
      409,
    );
  }
  if (worstCase > user.progression.maxBetCents) {
    return jsonError(
      `A tie would put ${formatCents(worstCase)} at risk, over your ${formatCents(
        user.progression.maxBetCents,
      )} table limit. Lower the bet.`,
      409,
    );
  }
  const gate = await assertBettable(user, stake.cents, "war");
  if (gate) return gate;

  try {
    const hand = play(stake.cents);
    const won = hand.payoutCents > hand.stakeCents;
    const outcome = hand.payoutCents > hand.stakeCents ? "WIN" : hand.payoutCents === hand.stakeCents ? "PUSH" : "LOSS";

    const summary =
      hand.outcome === "WIN"
        ? `${hand.player.r} beat ${hand.dealer.r} — paid ${formatCents(hand.payoutCents)}`
        : hand.outcome === "LOSS"
          ? `${hand.player.r} lost to ${hand.dealer.r}`
          : hand.outcome === "WAR_WIN"
            ? `War on ${hand.player.r} — won it, paid ${formatCents(hand.payoutCents)}`
            : `War on ${hand.player.r} — lost it`;

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "war",
      // The real stake, which is double on a war. Anything else would make the
      // ledger disagree with the balance.
      betCents: hand.stakeCents,
      payoutCents: hand.payoutCents,
      outcome,
      summary,
      detail: hand,
    });

    return NextResponse.json({
      ok: true,
      hand,
      won,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
    });
  } catch (err) {
    return handleError(err);
  }
}

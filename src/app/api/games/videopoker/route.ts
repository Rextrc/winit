import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { awardProgress, credit, debit, writeTransaction } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import {
  HAND_LABELS,
  drawTo,
  newRound,
  payoutMultiplier,
  toView,
  type VideoPokerState,
} from "@/lib/games/videopoker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("deal"), betCents: z.number().int() }),
  z.object({
    action: z.literal("draw"),
    roundId: z.string().min(1),
    held: z.array(z.number().int().min(0).max(4)).max(5),
  }),
]);

function parseState(raw: string): VideoPokerState {
  return JSON.parse(raw) as VideoPokerState;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const round = await prisma.round.findFirst({
    where: { userId: user.id, game: "videopoker", status: "ACTIVE" },
  });
  if (!round) return NextResponse.json({ round: null, balanceCents: user.balanceCents });

  return NextResponse.json({
    round: { id: round.id, view: toView(parseState(round.state)) },
    balanceCents: user.balanceCents,
  });
}

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
  if (!parsed.success) return jsonError("Invalid action.");

  try {
    if (parsed.data.action === "deal") {
      const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
      if (!bet.ok) return jsonError(bet.error, 409);
      const gate = assertBettable(user, bet.cents);
      if (gate) return gate;

      const existing = await prisma.round.findFirst({
        where: { userId: user.id, game: "videopoker", status: "ACTIVE" },
      });
      if (existing) return jsonError("Finish the hand you are holding first.", 409);

      const result = await prisma.$transaction(async (tx) => {
        const balanceCents = await debit(tx, user.id, bet.cents);
        // The whole deck is shuffled and stored now, so the replacement cards
        // are fixed before any hold is chosen — the draw cannot react to it.
        const state = newRound(bet.cents);
        const round = await tx.round.create({
          data: {
            userId: user.id,
            game: "videopoker",
            status: "ACTIVE",
            betCents: bet.cents,
            state: JSON.stringify(state),
          },
        });
        return { roundId: round.id, view: toView(state), balanceCents };
      });

      return NextResponse.json({ ok: true, ...result });
    }

    const { roundId, held } = parsed.data;
    const uniqueHeld = [...new Set(held)].sort((a, b) => a - b);

    const result = await prisma.$transaction(async (tx) => {
      const round = await tx.round.findFirst({
        where: { id: roundId, userId: user.id, game: "videopoker", status: "ACTIVE" },
      });
      if (!round) throw new Error("That hand is no longer in play.");

      const state = parseState(round.state);
      const drawn = drawTo(state, uniqueHeld);
      const hand = drawn.result!;
      const multiplier = payoutMultiplier(hand);
      const payoutCents = Math.round(state.betCents * multiplier);

      const balanceCents =
        payoutCents > 0
          ? await credit(tx, user.id, payoutCents)
          : fromDb(
              (await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { balanceCents: true } }))
                .balanceCents,
            );

      await tx.round.update({
        where: { id: round.id },
        data: { status: "SETTLED", state: JSON.stringify(drawn) },
      });
      await writeTransaction(tx, {
        userId: user.id,
        game: "videopoker",
        kind: "BET",
        betCents: state.betCents,
        payoutCents,
        outcome: payoutCents > state.betCents ? "WIN" : payoutCents === state.betCents ? "PUSH" : "LOSS",
        summary:
          payoutCents > 0
            ? `${HAND_LABELS[hand]} — ${multiplier}x, ${formatCents(payoutCents)}`
            : `${HAND_LABELS[hand]} — no pay`,
        balanceAfterCents: balanceCents,
        detail: { dealt: state.hand, held: uniqueHeld, finalHand: drawn.finalHand, hand },
      });
      const progress = await awardProgress(tx, user.id, state.betCents, payoutCents);

      return { view: toView(drawn), balanceCents, progress, roundId: round.id };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

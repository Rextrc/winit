import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet } from "@/lib/money";
import { awardProgress, credit, debit, writeTransaction, type ProgressUpdate } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import {
  applyAction,
  deal,
  overallOutcome,
  resultSummary,
  toView,
  totalPayout,
  totalStake,
  type BlackjackState,
} from "@/lib/games/blackjack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("deal"), betCents: z.number().int() }),
  z.object({ action: z.enum(["hit", "stand", "double", "split"]), roundId: z.string().min(1) }),
]);

function parseState(raw: string): BlackjackState {
  return JSON.parse(raw) as BlackjackState;
}

/** Writes the settlement of a finished hand: credit the return, log one row. */
async function settleRound(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  roundId: string,
  state: BlackjackState,
) {
  const stake = totalStake(state);
  const payout = totalPayout(state);
  const balanceCents = await credit(tx, userId, payout);

  await tx.round.update({
    where: { id: roundId },
    data: { status: "SETTLED", state: JSON.stringify(state), betCents: stake },
  });

  await writeTransaction(tx, {
    userId,
    game: "blackjack",
    kind: "BET",
    betCents: stake,
    payoutCents: payout,
    outcome: overallOutcome(state),
    summary: resultSummary(state),
    balanceAfterCents: balanceCents,
    detail: {
      dealer: state.dealer,
      hands: state.hands.map((h) => h.cards),
      results: state.results,
    },
  });

  // Career XP is awarded on the hand's total stake, doubles and splits
  // included, once the hand is actually settled. It never changes the
  // balance, so the credited amount above is still the final figure.
  const progress = await awardProgress(tx, userId, stake, payout);

  return { balanceCents, progress };
}

/** Returns the caller's in-progress hand, if any, so a refresh doesn't lose it. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const round = await prisma.round.findFirst({
    where: { userId: user.id, game: "blackjack", status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
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
        where: { userId: user.id, game: "blackjack", status: "ACTIVE" },
      });
      if (existing) return jsonError("Finish the hand you're already playing.", 409);

      const result = await prisma.$transaction(async (tx) => {
        let balanceCents = await debit(tx, user.id, bet.cents);
        const state = deal(bet.cents);

        const round = await tx.round.create({
          data: {
            userId: user.id,
            game: "blackjack",
            status: state.phase === "DONE" ? "SETTLED" : "ACTIVE",
            betCents: bet.cents,
            state: JSON.stringify(state),
          },
        });

        // A natural (either side) resolves before the player acts.
        let progress: ProgressUpdate | null = null;
        if (state.phase === "DONE") {
          const settled = await settleRound(tx, user.id, round.id, state);
          balanceCents = settled.balanceCents;
          progress = settled.progress;
        }

        return { roundId: round.id, state, balanceCents, progress };
      });

      return NextResponse.json({
        ok: true,
        roundId: result.roundId,
        view: toView(result.state),
        balanceCents: result.balanceCents,
        progress: result.progress,
      });
    }

    // --- hit / stand / double / split ---
    const { action, roundId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const round = await tx.round.findFirst({
        where: { id: roundId, userId: user.id, game: "blackjack", status: "ACTIVE" },
      });
      if (!round) throw new Error("That hand is no longer in play.");

      const state = parseState(round.state);
      const { state: next, extraStakeCents } = applyAction(state, action);

      let balanceCents = user.balanceCents;
      if (extraStakeCents > 0) {
        // Throws InsufficientBalanceError, which rolls the whole action back.
        balanceCents = await debit(tx, user.id, extraStakeCents);
      }

      let progress: ProgressUpdate | null = null;
      if (next.phase === "DONE") {
        const settled = await settleRound(tx, user.id, round.id, next);
        balanceCents = settled.balanceCents;
        progress = settled.progress;
      } else {
        await tx.round.update({
          where: { id: round.id },
          data: { state: JSON.stringify(next), betCents: totalStake(next) },
        });
        const fresh = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { balanceCents: true },
        });
        balanceCents = fromDb(fresh.balanceCents);
      }

      return { state: next, balanceCents, roundId: round.id, progress };
    });

    return NextResponse.json({
      ok: true,
      roundId: result.roundId,
      view: toView(result.state),
      balanceCents: result.balanceCents,
      progress: result.progress,
    });
  } catch (err) {
    return handleError(err);
  }
}

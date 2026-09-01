import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { awardProgress, credit, debit, writeTransaction } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import { RANK_VALUE, directionAvailable, multiplierFor, newRound, toView, type Direction, type HiloState } from "@/lib/games/hilo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("start"), betCents: z.number().int() }),
  z.object({ action: z.literal("guess"), roundId: z.string().min(1), direction: z.enum(["higher", "lower"]) }),
  z.object({ action: z.literal("cashout"), roundId: z.string().min(1) }),
]);

function parseState(raw: string): HiloState {
  return JSON.parse(raw) as HiloState;
}

/** Returns the caller's in-progress round, if any, so a refresh doesn't lose it. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const round = await prisma.round.findFirst({ where: { userId: user.id, game: "hilo", status: "ACTIVE" } });
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
    if (parsed.data.action === "start") {
      const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
      if (!bet.ok) return jsonError(bet.error, 409);

      const existing = await prisma.round.findFirst({ where: { userId: user.id, game: "hilo", status: "ACTIVE" } });
      if (existing) return jsonError("Cash out or lose your current round before starting another.", 409);

      const result = await prisma.$transaction(async (tx) => {
        const balanceCents = await debit(tx, user.id, bet.cents);
        const state = newRound(bet.cents);
        const round = await tx.round.create({
          data: { userId: user.id, game: "hilo", status: "ACTIVE", betCents: bet.cents, state: JSON.stringify(state) },
        });
        return { roundId: round.id, view: toView(state), balanceCents };
      });

      return NextResponse.json({ ok: true, ...result });
    }

    const { action, roundId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const round = await tx.round.findFirst({ where: { id: roundId, userId: user.id, game: "hilo", status: "ACTIVE" } });
      if (!round) throw new Error("That round is no longer in play.");

      const state = parseState(round.state);

      if (action === "cashout") {
        const payoutCents = Math.round(state.betCents * state.streakMultiplier);
        state.status = "CASHED_OUT";
        const balanceCents = await credit(tx, user.id, payoutCents);
        await tx.round.update({ where: { id: round.id }, data: { status: "SETTLED", state: JSON.stringify(state) } });
        await writeTransaction(tx, {
          userId: user.id,
          game: "hilo",
          kind: "BET",
          betCents: state.betCents,
          payoutCents,
          outcome: "WIN",
          summary: `Cashed out after ${state.steps} correct guesses — paid ${formatCents(payoutCents)}`,
          balanceAfterCents: balanceCents,
          detail: { steps: state.steps, streakMultiplier: state.streakMultiplier },
        });
        const progress = await awardProgress(tx, user.id, state.betCents, payoutCents);
        return { view: toView(state), balanceCents, progress, roundId: round.id };
      }

      // guess
      const direction = (parsed.data as { direction: Direction }).direction;
      const value = RANK_VALUE[state.current.r];
      if (!directionAvailable(state.deck, value, direction)) {
        throw new Error("That guess can't win from here — the other direction is certain or the deck is out.");
      }

      const stepMultiplier = multiplierFor(state.deck, value, direction);
      const next = state.deck.shift()!;
      const nextValue = RANK_VALUE[next.r];
      const correct = direction === "higher" ? nextValue > value : nextValue < value;

      if (!correct) {
        state.status = "LOST";
        const currentBalance = fromDb(
          (await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { balanceCents: true } })).balanceCents,
        );
        const revealedState = { ...state, current: next };
        await tx.round.update({ where: { id: round.id }, data: { status: "SETTLED", state: JSON.stringify(revealedState) } });
        await writeTransaction(tx, {
          userId: user.id,
          game: "hilo",
          kind: "BET",
          betCents: state.betCents,
          payoutCents: 0,
          outcome: "LOSS",
          summary: `Guessed ${direction}, drew ${next.r} after ${state.current.r} — no pay`,
          balanceAfterCents: currentBalance,
          detail: { steps: state.steps, from: state.current, to: next },
        });
        const progress = await awardProgress(tx, user.id, state.betCents, 0);
        return { view: toView(revealedState, next), balanceCents: currentBalance, progress, roundId: round.id };
      }

      state.streakMultiplier = Math.round(state.streakMultiplier * stepMultiplier * 10_000) / 10_000;
      state.steps += 1;
      state.current = next;

      if (state.deck.length === 0) {
        // Ran the whole deck down correctly — auto-cash at the final multiplier.
        state.status = "WON_OUT";
        const payoutCents = Math.round(state.betCents * state.streakMultiplier);
        const balanceCents = await credit(tx, user.id, payoutCents);
        await tx.round.update({ where: { id: round.id }, data: { status: "SETTLED", state: JSON.stringify(state) } });
        await writeTransaction(tx, {
          userId: user.id,
          game: "hilo",
          kind: "BET",
          betCents: state.betCents,
          payoutCents,
          outcome: "WIN",
          summary: `Ran the deck out — paid ${formatCents(payoutCents)}`,
          balanceAfterCents: balanceCents,
          detail: { steps: state.steps },
        });
        const progress = await awardProgress(tx, user.id, state.betCents, payoutCents);
        return { view: toView(state), balanceCents, progress, roundId: round.id };
      }

      await tx.round.update({ where: { id: round.id }, data: { state: JSON.stringify(state) } });
      const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { balanceCents: true } });
      return { view: toView(state), balanceCents: fromDb(fresh.balanceCents), progress: null, roundId: round.id };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

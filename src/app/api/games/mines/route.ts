import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { awardProgress, credit, debit, writeTransaction } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import {
  GRID_SIZE,
  maxSafeReveals,
  multiplierAt,
  newRound,
  toView,
  validMinesCount,
  type MinesState,
} from "@/lib/games/mines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("start"), betCents: z.number().int(), mines: z.number().int() }),
  z.object({ action: z.literal("reveal"), roundId: z.string().min(1), cell: z.number().int() }),
  z.object({ action: z.literal("cashout"), roundId: z.string().min(1) }),
]);

function parseState(raw: string): MinesState {
  return JSON.parse(raw) as MinesState;
}

/** Returns the caller's in-progress round, if any, so a refresh doesn't lose it. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const round = await prisma.round.findFirst({ where: { userId: user.id, game: "mines", status: "ACTIVE" } });
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
      if (!validMinesCount(parsed.data.mines)) {
        return jsonError(`Mines must be between 1 and ${GRID_SIZE - 1}.`, 409);
      }
      const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
      if (!bet.ok) return jsonError(bet.error, 409);
      const gate = await assertBettable(user, bet.cents, "mines");
      if (gate) return gate;

      const existing = await prisma.round.findFirst({
        where: { userId: user.id, game: "mines", status: "ACTIVE" },
      });
      if (existing) return jsonError("Cash out or lose your current round before starting another.", 409);

      const minesCount = parsed.data.mines;
      const result = await prisma.$transaction(async (tx) => {
        const balanceCents = await debit(tx, user.id, bet.cents);
        const state = newRound(bet.cents, minesCount);
        const round = await tx.round.create({
          data: { userId: user.id, game: "mines", status: "ACTIVE", betCents: bet.cents, state: JSON.stringify(state) },
        });
        return { roundId: round.id, view: toView(state), balanceCents };
      });

      return NextResponse.json({ ok: true, ...result });
    }

    // --- reveal / cashout ---
    const { action, roundId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const round = await tx.round.findFirst({
        where: { id: roundId, userId: user.id, game: "mines", status: "ACTIVE" },
      });
      if (!round) throw new Error("That round is no longer in play.");

      const state = parseState(round.state);

      if (action === "cashout") {
        const payoutCents = Math.round(state.betCents * multiplierAt(state.mines, state.revealed.length));
        state.status = "CASHED_OUT";
        const balanceCents = await credit(tx, user.id, payoutCents);
        await tx.round.update({ where: { id: round.id }, data: { status: "SETTLED", state: JSON.stringify(state) } });
        await writeTransaction(tx, {
          userId: user.id,
          game: "mines",
          kind: "BET",
          betCents: state.betCents,
          payoutCents,
          outcome: "WIN",
          summary: `Cashed out after ${state.revealed.length} safe reveals — paid ${formatCents(payoutCents)}`,
          balanceAfterCents: balanceCents,
          detail: { mines: state.mines, revealed: state.revealed, minePositions: state.minePositions },
        });
        const progress = await awardProgress(tx, user.id, "mines", state.betCents, payoutCents);
        return { view: toView(state), balanceCents, progress, roundId: round.id };
      }

      // reveal
      const cell = (parsed.data as { cell: number }).cell;
      if (cell < 0 || cell >= GRID_SIZE) throw new Error("Cell out of range.");
      if (state.revealed.includes(cell)) throw new Error("That cell is already revealed.");

      const hitMine = state.minePositions.includes(cell);
      state.revealed.push(cell);

      if (hitMine) {
        state.status = "LOST";
        const currentBalance = fromDb(
          (await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { balanceCents: true } })).balanceCents,
        );
        await tx.round.update({ where: { id: round.id }, data: { status: "SETTLED", state: JSON.stringify(state) } });
        await writeTransaction(tx, {
          userId: user.id,
          game: "mines",
          kind: "BET",
          betCents: state.betCents,
          payoutCents: 0,
          outcome: "LOSS",
          summary: `Hit a mine on reveal ${state.revealed.length} — no pay`,
          balanceAfterCents: currentBalance,
          detail: { mines: state.mines, revealed: state.revealed, minePositions: state.minePositions },
        });
        const progress = await awardProgress(tx, user.id, "mines", state.betCents, 0);
        return { view: toView(state), balanceCents: currentBalance, progress, roundId: round.id };
      }

      // Revealed every safe cell — the board auto-cashes at the top multiplier.
      if (state.revealed.length >= maxSafeReveals(state.mines)) {
        const payoutCents = Math.round(state.betCents * multiplierAt(state.mines, state.revealed.length));
        state.status = "WON";
        const balanceCents = await credit(tx, user.id, payoutCents);
        await tx.round.update({ where: { id: round.id }, data: { status: "SETTLED", state: JSON.stringify(state) } });
        await writeTransaction(tx, {
          userId: user.id,
          game: "mines",
          kind: "BET",
          betCents: state.betCents,
          payoutCents,
          outcome: "WIN",
          summary: `Cleared the board — paid ${formatCents(payoutCents)}`,
          balanceAfterCents: balanceCents,
          detail: { mines: state.mines, revealed: state.revealed, minePositions: state.minePositions },
        });
        const progress = await awardProgress(tx, user.id, "mines", state.betCents, payoutCents);
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

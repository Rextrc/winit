import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { awardProgress, credit, debit, writeTransaction } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import {
  SHAPES,
  isDifficulty,
  isSafe,
  multiplierAt,
  newRound,
  toView,
  type TowersState,
} from "@/lib/games/towers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("start"), betCents: z.number().int(), difficulty: z.string() }),
  z.object({ action: z.literal("pick"), roundId: z.string().min(1), column: z.number().int() }),
  z.object({ action: z.literal("cashout"), roundId: z.string().min(1) }),
]);

function parseState(raw: string): TowersState {
  return JSON.parse(raw) as TowersState;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const round = await prisma.round.findFirst({
    where: { userId: user.id, game: "towers", status: "ACTIVE" },
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
    if (parsed.data.action === "start") {
      const difficulty = parsed.data.difficulty;
      if (!isDifficulty(difficulty)) return jsonError("Unknown difficulty.");

      const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
      if (!bet.ok) return jsonError(bet.error, 409);
      const gate = await assertBettable(user, bet.cents, "towers");
      if (gate) return gate;

      const existing = await prisma.round.findFirst({
        where: { userId: user.id, game: "towers", status: "ACTIVE" },
      });
      if (existing) return jsonError("Finish or cash out your current climb first.", 409);

      const result = await prisma.$transaction(async (tx) => {
        const balanceCents = await debit(tx, user.id, bet.cents);
        const state = newRound(bet.cents, difficulty);
        const round = await tx.round.create({
          data: {
            userId: user.id,
            game: "towers",
            status: "ACTIVE",
            betCents: bet.cents,
            state: JSON.stringify(state),
          },
        });
        return { roundId: round.id, view: toView(state), balanceCents };
      });

      return NextResponse.json({ ok: true, ...result });
    }

    const { action, roundId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const round = await tx.round.findFirst({
        where: { id: roundId, userId: user.id, game: "towers", status: "ACTIVE" },
      });
      if (!round) throw new Error("That climb is no longer in play.");

      const state = parseState(round.state);
      const shape = SHAPES[state.difficulty];

      if (action === "cashout") {
        const floors = state.picks.length;
        if (floors === 0) throw new Error("Climb at least one floor before cashing out.");

        const payoutCents = Math.round(state.betCents * multiplierAt(state.difficulty, floors));
        state.status = "CASHED_OUT";
        const balanceCents = await credit(tx, user.id, payoutCents);
        await tx.round.update({
          where: { id: round.id },
          data: { status: "SETTLED", state: JSON.stringify(state) },
        });
        await writeTransaction(tx, {
          userId: user.id,
          game: "towers",
          kind: "BET",
          betCents: state.betCents,
          payoutCents,
          outcome: "WIN",
          summary: `Cashed out on floor ${floors} — paid ${formatCents(payoutCents)}`,
          balanceAfterCents: balanceCents,
          detail: { difficulty: state.difficulty, picks: state.picks, safeTiles: state.safeTiles },
        });
        const progress = await awardProgress(tx, user.id, "towers", state.betCents, payoutCents);
        return { view: toView(state), balanceCents, progress, roundId: round.id };
      }

      // pick
      const column = (parsed.data as { column: number }).column;
      if (column < 0 || column >= shape.cols) throw new Error("That tile isn't on this floor.");

      const floor = state.picks.length;
      if (floor >= shape.floors) throw new Error("This tower has already been topped out.");

      const safe = isSafe(state, floor, column);
      state.picks.push(column);

      if (!safe) {
        state.status = "FELL";
        const balanceCents = fromDb(
          (await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { balanceCents: true } })).balanceCents,
        );
        await tx.round.update({
          where: { id: round.id },
          data: { status: "SETTLED", state: JSON.stringify(state) },
        });
        await writeTransaction(tx, {
          userId: user.id,
          game: "towers",
          kind: "BET",
          betCents: state.betCents,
          payoutCents: 0,
          outcome: "LOSS",
          summary: `Fell on floor ${floor + 1} — no pay`,
          balanceAfterCents: balanceCents,
          detail: { difficulty: state.difficulty, picks: state.picks, safeTiles: state.safeTiles },
        });
        const progress = await awardProgress(tx, user.id, "towers", state.betCents, 0);
        return { view: toView(state), balanceCents, progress, roundId: round.id };
      }

      // Topped the tower out — it pays automatically at the highest floor.
      if (state.picks.length >= shape.floors) {
        const payoutCents = Math.round(state.betCents * multiplierAt(state.difficulty, shape.floors));
        state.status = "CASHED_OUT";
        const balanceCents = await credit(tx, user.id, payoutCents);
        await tx.round.update({
          where: { id: round.id },
          data: { status: "SETTLED", state: JSON.stringify(state) },
        });
        await writeTransaction(tx, {
          userId: user.id,
          game: "towers",
          kind: "BET",
          betCents: state.betCents,
          payoutCents,
          outcome: "WIN",
          summary: `Topped out all ${shape.floors} floors — paid ${formatCents(payoutCents)}`,
          balanceAfterCents: balanceCents,
          detail: { difficulty: state.difficulty, picks: state.picks, safeTiles: state.safeTiles },
        });
        const progress = await awardProgress(tx, user.id, "towers", state.betCents, payoutCents);
        return { view: toView(state), balanceCents, progress, roundId: round.id };
      }

      await tx.round.update({ where: { id: round.id }, data: { state: JSON.stringify(state) } });
      const fresh = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { balanceCents: true },
      });
      return { view: toView(state), balanceCents: fromDb(fresh.balanceCents), progress: null, roundId: round.id };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

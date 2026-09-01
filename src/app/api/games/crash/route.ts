import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { awardProgress, credit, debit, writeTransaction } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import {
  cashoutMultiplier,
  hasBusted,
  newRound,
  toView,
  validTarget,
  type CrashState,
} from "@/lib/games/crash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({
    action: z.literal("start"),
    betCents: z.number().int(),
    autoTarget: z.number().nullable().optional(),
  }),
  z.object({ action: z.literal("cashout"), roundId: z.string().min(1) }),
]);

function parseState(raw: string): CrashState {
  return JSON.parse(raw) as CrashState;
}

/**
 * Settles a round whose curve has already passed its crash point. Called
 * before anything else touches a live round, so a round abandoned mid-flight
 * can never sit ACTIVE forever, and can never be cashed out after the fact.
 */
async function settleIfBusted(tx: Prisma.TransactionClient, userId: string, roundId: string, state: CrashState) {
  state.status = "BUSTED";
  const balanceCents = fromDb(
    (await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balanceCents: true } })).balanceCents,
  );
  await tx.round.update({ where: { id: roundId }, data: { status: "SETTLED", state: JSON.stringify(state) } });
  await writeTransaction(tx, {
    userId,
    game: "crash",
    kind: "BET",
    betCents: state.betCents,
    payoutCents: 0,
    outcome: "LOSS",
    summary: `Crashed at ${state.crashPoint.toFixed(2)}x — no cash-out`,
    balanceAfterCents: balanceCents,
    detail: { crashPoint: state.crashPoint, autoTarget: state.autoTarget },
  });
  const progress = await awardProgress(tx, userId, "crash", state.betCents, 0);
  return { view: toView(state), balanceCents, progress };
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const round = await prisma.round.findFirst({
    where: { userId: user.id, game: "crash", status: "ACTIVE" },
  });
  if (!round) return NextResponse.json({ round: null, balanceCents: user.balanceCents });

  const state = parseState(round.state);
  if (hasBusted(state)) {
    const settled = await prisma.$transaction((tx) => settleIfBusted(tx, user.id, round.id, state));
    return NextResponse.json({ round: { id: round.id, ...settled }, balanceCents: settled.balanceCents });
  }

  return NextResponse.json({
    round: { id: round.id, view: toView(state) },
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
      const autoTarget = parsed.data.autoTarget ?? null;
      if (autoTarget !== null && !validTarget(autoTarget)) {
        return jsonError("That auto cash-out target is out of range.");
      }

      const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
      if (!bet.ok) return jsonError(bet.error, 409);
      const gate = assertBettable(user, bet.cents);
      if (gate) return gate;

      const existing = await prisma.round.findFirst({
        where: { userId: user.id, game: "crash", status: "ACTIVE" },
      });
      if (existing) {
        const state = parseState(existing.state);
        if (!hasBusted(state)) return jsonError("You already have a round in the air.", 409);
        await prisma.$transaction((tx) => settleIfBusted(tx, user.id, existing.id, state));
      }

      const result = await prisma.$transaction(async (tx) => {
        const balanceCents = await debit(tx, user.id, bet.cents);
        const state = newRound(bet.cents, autoTarget);

        // An auto target is settled here and now: the crash point is already
        // drawn, so the answer is deterministic and reaction time cannot enter
        // into it. The client animates a result that already exists.
        if (autoTarget !== null) {
          const reached = state.crashPoint >= autoTarget;
          const payoutCents = reached ? Math.round(bet.cents * autoTarget) : 0;
          state.status = reached ? "CASHED_OUT" : "BUSTED";
          state.cashedAt = reached ? autoTarget : null;

          const after = reached ? await credit(tx, user.id, payoutCents) : balanceCents;
          const round = await tx.round.create({
            data: {
              userId: user.id,
              game: "crash",
              status: "SETTLED",
              betCents: bet.cents,
              state: JSON.stringify(state),
            },
          });
          await writeTransaction(tx, {
            userId: user.id,
            game: "crash",
            kind: "BET",
            betCents: bet.cents,
            payoutCents,
            outcome: reached ? "WIN" : "LOSS",
            summary: reached
              ? `Auto cashed at ${autoTarget}x (crashed ${state.crashPoint.toFixed(2)}x) — paid ${formatCents(payoutCents)}`
              : `Crashed at ${state.crashPoint.toFixed(2)}x before ${autoTarget}x`,
            balanceAfterCents: after,
            detail: { crashPoint: state.crashPoint, autoTarget },
          });
          const progress = await awardProgress(tx, user.id, "crash", bet.cents, payoutCents);
          return { roundId: round.id, view: toView(state), balanceCents: after, progress };
        }

        const round = await tx.round.create({
          data: {
            userId: user.id,
            game: "crash",
            status: "ACTIVE",
            betCents: bet.cents,
            state: JSON.stringify(state),
          },
        });
        return { roundId: round.id, view: toView(state), balanceCents, progress: null };
      });

      return NextResponse.json({ ok: true, ...result });
    }

    const { roundId } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const round = await tx.round.findFirst({
        where: { id: roundId, userId: user.id, game: "crash", status: "ACTIVE" },
      });
      if (!round) throw new Error("That round is no longer in play.");

      const state = parseState(round.state);

      // The multiplier comes from the SERVER's clock, never from the client.
      const now = Date.now();
      if (hasBusted(state, now)) {
        const settled = await settleIfBusted(tx, user.id, round.id, state);
        return { ...settled, roundId: round.id };
      }

      const multiplier = cashoutMultiplier(now - state.startedAt);
      const payoutCents = Math.round(state.betCents * multiplier);
      state.status = "CASHED_OUT";
      state.cashedAt = multiplier;

      const balanceCents = await credit(tx, user.id, payoutCents);
      await tx.round.update({
        where: { id: round.id },
        data: { status: "SETTLED", state: JSON.stringify(state) },
      });
      await writeTransaction(tx, {
        userId: user.id,
        game: "crash",
        kind: "BET",
        betCents: state.betCents,
        payoutCents,
        outcome: payoutCents > state.betCents ? "WIN" : payoutCents === state.betCents ? "PUSH" : "LOSS",
        summary: `Cashed at ${multiplier.toFixed(2)}x (crashed ${state.crashPoint.toFixed(2)}x) — paid ${formatCents(payoutCents)}`,
        balanceAfterCents: balanceCents,
        detail: { crashPoint: state.crashPoint, cashedAt: multiplier },
      });
      const progress = await awardProgress(tx, user.id, "crash", state.betCents, payoutCents);
      return { view: toView(state), balanceCents, progress, roundId: round.id };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

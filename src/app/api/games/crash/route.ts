import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { currentUserId } from "@/lib/auth";
import { validateBet } from "@/lib/money";
import { debit } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import { validTarget } from "@/lib/games/crash";
import { cashOut, currentRound, phaseOf, settleAutoCashouts, settleRound } from "@/lib/games/crashLive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ action: z.literal("bet"), betCents: z.number().int(), autoTarget: z.number().nullable().optional() }),
  z.object({ action: z.literal("cashout") }),
]);

/**
 * The shared room, polled by every viewer — signed in or not. Doing the
 * settlement work here is what keeps the round moving without a worker.
 */
export async function GET() {
  try {
    const now = Date.now();
    let round = await currentRound(now);
    const phase = phaseOf(round, now);
    if (phase === "flight") await settleAutoCashouts(round, now);
    if (phase === "crashed" && !round.settled) {
      await settleRound(round.id);
      round = (await prisma.crashRound.findUnique({ where: { id: round.id } })) ?? round;
    }

    const [bets, history, userId] = await Promise.all([
      prisma.crashBet.findMany({
        where: { roundId: round.id },
        orderBy: { betCents: "desc" },
        take: 50,
        select: { userId: true, username: true, betCents: true, status: true, cashedAt: true, payoutCents: true },
      }),
      prisma.crashRound.findMany({
        where: { crashAt: { lte: new Date(now) } },
        orderBy: { id: "desc" },
        take: 14,
        select: { id: true, crashPoint: true },
      }),
      currentUserId(),
    ]);

    let me = null;
    if (userId) {
      const mine = await prisma.crashBet.findUnique({ where: { roundId_userId: { roundId: round.id, userId } } });
      // The newest settled bet whose progress this user hasn't picked up yet —
      // settled by someone else's request, so it reaches its owner here.
      const unseen = await prisma.crashBet.findFirst({
        where: { userId, status: { not: "ACTIVE" }, progressSeen: false, progressJson: { not: null } },
        orderBy: { createdAt: "desc" },
      });
      if (unseen) {
        await prisma.crashBet.updateMany({ where: { userId, progressSeen: false, status: { not: "ACTIVE" } }, data: { progressSeen: true } });
      }
      const { balanceCents } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balanceCents: true } });
      me = {
        balanceCents: fromDb(balanceCents),
        bet: mine
          ? {
              roundId: mine.roundId,
              betCents: fromDb(mine.betCents),
              autoTarget: mine.autoTarget,
              status: mine.status,
              cashedAt: mine.cashedAt,
              payoutCents: fromDb(mine.payoutCents),
            }
          : null,
        settled: unseen
          ? {
              roundId: unseen.roundId,
              betCents: fromDb(unseen.betCents),
              status: unseen.status,
              cashedAt: unseen.cashedAt,
              payoutCents: fromDb(unseen.payoutCents),
              progress: JSON.parse(unseen.progressJson!),
            }
          : null,
      };
    }

    const crashed = phaseOf(round, now) === "crashed";
    return NextResponse.json({
      serverNow: now,
      round: {
        id: round.id,
        phase: phaseOf(round, now),
        startsAt: round.startsAt.getTime(),
        // Only once the curve has got there — never before.
        crashPoint: crashed ? round.crashPoint : null,
      },
      players: bets.map((b) => ({
        username: b.username,
        betCents: fromDb(b.betCents),
        status: b.status,
        cashedAt: b.cashedAt,
        payoutCents: fromDb(b.payoutCents),
        isMe: b.userId === userId,
      })),
      history: history.map((h) => h.crashPoint),
      me,
    });
  } catch (err) {
    return handleError(err);
  }
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
    if (parsed.data.action === "cashout") {
      const result = await cashOut(user.id);
      return NextResponse.json({ ok: true, ...result });
    }

    const autoTarget = parsed.data.autoTarget ?? null;
    if (autoTarget !== null && !validTarget(autoTarget)) return jsonError("That auto cash-out target is out of range.");

    const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
    if (!bet.ok) return jsonError(bet.error, 409);
    const gate = await assertBettable(user, bet.cents, "crash");
    if (gate) return gate;

    const now = Date.now();
    const round = await currentRound(now);
    if (phaseOf(round, now) !== "countdown") return jsonError("Bets are closed — you're in on the next round.", 409);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.crashBet.findUnique({ where: { roundId_userId: { roundId: round.id, userId: user.id } } });
      if (existing) throw new Error("You already have a bet on this round.");
      const balanceCents = await debit(tx, user.id, bet.cents);
      await tx.crashBet.create({
        data: { roundId: round.id, userId: user.id, username: user.username, betCents: BigInt(bet.cents), autoTarget },
      });
      return { balanceCents };
    });
    return NextResponse.json({ ok: true, roundId: round.id, ...result });
  } catch (err) {
    return handleError(err);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireReason, requireStaff } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { fromDb, toDb } from "@/lib/bigmoney";
import { credit, writeTransaction } from "@/lib/ledger";
import { feedConfigured, quotaRemaining } from "@/lib/sports/provider";
import { cacheSummary } from "@/lib/sports/feed";
import { settlePending } from "@/lib/sports/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin visibility into sports betting: nothing here prices a market or picks
 * a winner — that's the feed and the real final score. This only shows what
 * state things are in, and gives staff two escape hatches: run settlement
 * early, or void a bet the feed can never resolve on its own (an event the
 * provider dropped, a data mixup).
 */
export async function GET() {
  const { staff, response } = await requireStaff("sports.view");
  if (!staff) return response;

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);

  const [pendingBets, pendingLegs, settledToday, totalStaked, recentBets, oldestPending] = await Promise.all([
    prisma.sportsBet.count({ where: { status: "PENDING" } }),
    prisma.sportsBetLeg.count({ where: { status: "PENDING" } }),
    prisma.sportsBet.count({ where: { status: { not: "PENDING" }, settledAt: { gte: dayAgo } } }),
    prisma.sportsBet.aggregate({ where: { status: "PENDING" }, _sum: { stakeCents: true } }),
    prisma.sportsBet.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { legs: true, user: { select: { username: true } } },
    }),
    prisma.sportsBetLeg.findFirst({ where: { status: "PENDING" }, orderBy: { commenceTime: "asc" } }),
  ]);

  return NextResponse.json({
    feed: { configured: feedConfigured(), quotaRemaining: quotaRemaining() },
    counts: {
      pendingBets,
      pendingLegs,
      settledToday,
      stakedPendingCents: fromDb(totalStaked._sum.stakeCents ?? 0n),
      oldestPendingKickoff: oldestPending?.commenceTime.toISOString() ?? null,
    },
    cache: await cacheSummary(),
    bets: recentBets.map((b) => ({
      id: b.id,
      username: b.user.username,
      kind: b.kind,
      status: b.status,
      stakeCents: fromDb(b.stakeCents),
      priceDecimal: b.priceDecimal,
      payoutCents: b.payoutCents === null ? null : fromDb(b.payoutCents),
      createdAt: b.createdAt.toISOString(),
      settledAt: b.settledAt?.toISOString() ?? null,
      legs: b.legs.map((l) => ({
        id: l.id,
        leagueTitle: l.leagueTitle,
        homeTeam: l.homeTeam,
        awayTeam: l.awayTeam,
        commenceTime: l.commenceTime.toISOString(),
        market: l.market,
        selection: l.selection,
        point: l.point,
        status: l.status,
      })),
    })),
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settle") }),
  z.object({ action: z.literal("void"), betId: z.string().min(1), reason: z.string().optional() }),
]);

export async function POST(req: Request) {
  const { staff, response } = await requireStaff("sports.manage");
  if (!staff) return response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  if (parsed.data.action === "settle") {
    if (!feedConfigured()) {
      return NextResponse.json({ error: "The odds feed has no API key configured." }, { status: 409 });
    }
    const result = await settlePending();
    await writeAudit({
      actor: staff,
      action: "sports.settle",
      reason: "Manual settlement run from the dashboard.",
      metadata: result,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  // --- Void -------------------------------------------------------------
  const reasonCheck = requireReason(parsed.data.reason, staff);
  if ("error" in reasonCheck) return reasonCheck.error;

  const bet = await prisma.sportsBet.findUnique({
    where: { id: parsed.data.betId },
    include: { legs: true, user: { select: { username: true } } },
  });
  if (!bet) return NextResponse.json({ error: "No such bet." }, { status: 404 });
  if (bet.status !== "PENDING") {
    return NextResponse.json({ error: "That bet has already settled." }, { status: 409 });
  }

  const stakeCents = fromDb(bet.stakeCents);

  const result = await prisma.$transaction(async (tx) => {
    const flipped = await tx.sportsBet.updateMany({
      where: { id: bet.id, status: "PENDING" },
      data: { status: "VOID", payoutCents: toDb(stakeCents), settledAt: new Date() },
    });
    if (flipped.count === 0) throw new Error("That bet has already settled.");
    await tx.sportsBetLeg.updateMany({ where: { betId: bet.id, status: "PENDING" }, data: { status: "VOID" } });

    const balanceCents = await credit(tx, bet.userId, stakeCents);
    await writeTransaction(tx, {
      userId: bet.userId,
      game: "sports",
      kind: "BET",
      betCents: stakeCents,
      payoutCents: stakeCents,
      outcome: "PUSH",
      summary: `${bet.legs.length}-leg ${bet.kind.toLowerCase()} voided by staff — stake refunded`,
      balanceAfterCents: balanceCents,
      detail: { betId: bet.id, voidedBy: staff.username },
    });
    await writeAudit(
      {
        actor: staff,
        action: "sports.void",
        target: { id: bet.userId, username: bet.user.username },
        field: "sportsBet",
        oldValue: "PENDING",
        newValue: "VOID",
        reason: reasonCheck.reason,
        metadata: { betId: bet.id, stakeCents },
      },
      tx,
    );
    return { balanceCents };
  });

  return NextResponse.json({ ok: true, ...result });
}

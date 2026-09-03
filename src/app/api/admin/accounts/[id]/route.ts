import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fromDb } from "@/lib/bigmoney";
import { requireStaff } from "@/lib/admin/guard";
import { capabilitiesOf } from "@/lib/admin/roles";
import { describeProgression } from "@/lib/progression";
import { describeCareer } from "@/lib/life/career";
import { tierFor, nextTier } from "@/lib/life/reputation";
import { vipFor, nextVip } from "@/lib/life/vip";
import { MIN_BET_CENTS } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Everything about one account: progression, career, per-game counters,
 * achievements, recent transactions, recent events and the staff actions taken
 * against it. Read-only.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { staff, response } = await requireStaff("accounts.view");
  if (!staff) return response;

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "No such account." }, { status: 404 });

  const [stats, achievements, transactions, events, audit, lives, rounds] = await Promise.all([
    prisma.gameStat.findMany({ where: { userId: user.id }, orderBy: { bets: "desc" } }),
    prisma.achievementUnlock.findMany({ where: { userId: user.id }, orderBy: { unlockedAt: "desc" } }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.lifeEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.auditLog.findMany({ where: { targetId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.life.findMany({ where: { userId: user.id }, orderBy: { ordinal: "desc" } }),
    prisma.round.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true, game: true, betCents: true, createdAt: true },
    }),
  ]);

  const lifetimeWagered = fromDb(user.lifetimeWageredCents);
  const progression = describeProgression({
    level: user.level,
    xp: user.xp,
    rebirths: user.rebirths,
    lifetimeWageredCents: lifetimeWagered,
    lifetimeWonCents: fromDb(user.lifetimeWonCents),
    biggestWinCents: fromDb(user.biggestWinCents),
    bestMultiplierX100: user.bestMultiplierX100,
  });

  let venuesVisited: string[] = [];
  try {
    const parsed = JSON.parse(user.visitedVenuesJson);
    if (Array.isArray(parsed)) venuesVisited = parsed as string[];
  } catch {
    venuesVisited = [];
  }

  const strikeLog = await prisma.strike.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    // What the caller is allowed to do, so the dashboard can grey out what it
    // must — the server still re-checks every action regardless.
    viewerCapabilities: capabilitiesOf(staff.role),
    account: {
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      lastSeenAt: user.lastSeenAt,
      adminRole: user.adminRole,
      suspended: user.suspendedAt !== null,
      suspendedAt: user.suspendedAt,
      suspendedReason: user.suspendedReason,
      deleted: user.deletedAt !== null,
      deletedAt: user.deletedAt,
      banned: user.bannedAt !== null,
      bannedAt: user.bannedAt,
      bannedReason: user.bannedReason,
      strikes: user.strikes,
      strikeLog: strikeLog.map((s) => ({
        id: s.id,
        kind: s.kind,
        reason: s.reason,
        outcome: s.outcome,
        detail: s.detail,
        createdAt: s.createdAt,
      })),
      referralCode: user.referralCode,
      signupIp: user.signupIp,

      balanceCents: fromDb(user.balanceCents),
      peakBalanceCents: fromDb(user.peakBalanceCents),
      lifetimeWageredCents: lifetimeWagered,
      lifetimeWonCents: fromDb(user.lifetimeWonCents),
      biggestWinCents: fromDb(user.biggestWinCents),
      bestMultiplier: user.bestMultiplierX100 / 100,

      progression,
      career: describeCareer(
        {
          livesLived: user.livesLived,
          careerDays: user.careerDays,
          comebacksUsed: user.comebacksUsed,
          betsThisLife: user.betsThisLife,
          peakBalanceCents: fromDb(user.peakBalanceCents),
          venueId: user.venueId,
          deathCause: user.deathCause,
        },
        progression.maxBetCents,
        MIN_BET_CENTS,
      ),
      reputation: {
        points: user.reputation,
        tier: tierFor(user.reputation),
        next: nextTier(user.reputation),
      },
      vip: { tier: vipFor(lifetimeWagered), next: nextVip(lifetimeWagered) },
      venuesVisited,
      bonusStreak: user.bonusStreak,
      lastBonusAt: user.lastBonusAt,
    },
    gameStats: stats.map((s) => ({
      game: s.game,
      bets: s.bets,
      wins: s.wins,
      wageredCents: fromDb(s.wageredCents),
      wonCents: fromDb(s.wonCents),
      biggestWinCents: fromDb(s.biggestWinCents),
      bestMultiplier: s.bestMultiplierX100 / 100,
    })),
    achievements: achievements.map((a) => ({ key: a.key, unlockedAt: a.unlockedAt })),
    transactions: transactions.map((t) => ({
      id: t.id,
      game: t.game,
      kind: t.kind,
      betCents: fromDb(t.betCents),
      payoutCents: fromDb(t.payoutCents),
      netCents: fromDb(t.netCents),
      outcome: t.outcome,
      summary: t.summary,
      balanceAfterCents: fromDb(t.balanceAfterCents),
      createdAt: t.createdAt,
    })),
    events: events.map((e) => ({
      id: e.id,
      key: e.key,
      status: e.status,
      choiceKey: e.choiceKey,
      outcomeText: e.outcomeText,
      netCents: fromDb(e.netCents),
      createdAt: e.createdAt,
    })),
    lives: lives.map((l) => ({
      ordinal: l.ordinal,
      cause: l.cause,
      ageAtEnd: l.ageAtEnd,
      level: l.level,
      epitaph: l.epitaph,
      endedAt: l.endedAt,
    })),
    activeRounds: rounds.map((r) => ({
      id: r.id,
      game: r.game,
      betCents: fromDb(r.betCents),
      createdAt: r.createdAt,
    })),
    staffActions: audit.map((a) => ({
      id: a.id,
      actorUsername: a.actorUsername,
      actorRole: a.actorRole,
      action: a.action,
      field: a.field,
      oldValue: a.oldValue,
      newValue: a.newValue,
      reason: a.reason,
      createdAt: a.createdAt,
    })),
  });
}

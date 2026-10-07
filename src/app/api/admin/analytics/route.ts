import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fromDb } from "@/lib/bigmoney";
import { requireStaff } from "@/lib/admin/guard";
import { ENGINE_KEY, PLAYABLE } from "@/lib/games/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Anyone seen within this window counts as online. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Operational analytics, all computed from live data rather than a stats table
 * that could drift. Every figure here is a query, so it is always the truth as
 * of the moment it was asked for.
 */
export async function GET() {
  const { staff, response } = await requireStaff("analytics.view");
  if (!staff) return response;

  const now = Date.now();
  const online = new Date(now - ONLINE_WINDOW_MS);
  const dayAgo = new Date(now - 24 * 3600 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);

  const [
    totalUsers,
    deletedUsers,
    suspendedUsers,
    staffUsers,
    onlineNow,
    activeToday,
    activeWeek,
    newToday,
    newWeek,
    balanceAgg,
    wagerAgg,
    betCount,
    biggestWins,
    recentSignups,
    activeRounds,
    gameStats,
    recentAdmin,
    liveCareers,
    endedCareers,
    betsForTrend,
    signupsForTrend,
    guestsTotal,
    guestsToday,
    guestsActive,
  ] = await Promise.all([
    prisma.user.count({ where: { isGuest: false, deletedAt: null } }),
    prisma.user.count({ where: { isGuest: false, deletedAt: { not: null } } }),
    prisma.user.count({ where: { isGuest: false, suspendedAt: { not: null }, deletedAt: null } }),
    prisma.user.count({ where: { isGuest: false, adminRole: { not: null }, deletedAt: null } }),
    prisma.user.count({ where: { isGuest: false, deletedAt: null, lastSeenAt: { gte: online } } }),
    prisma.user.count({ where: { isGuest: false, deletedAt: null, lastSeenAt: { gte: dayAgo } } }),
    prisma.user.count({ where: { isGuest: false, deletedAt: null, lastSeenAt: { gte: weekAgo } } }),
    prisma.user.count({ where: { isGuest: false, createdAt: { gte: dayAgo } } }),
    prisma.user.count({ where: { isGuest: false, createdAt: { gte: weekAgo } } }),
    prisma.user.aggregate({
      where: { deletedAt: null },
      _sum: { balanceCents: true },
      _avg: { balanceCents: true },
      _max: { balanceCents: true },
    }),
    prisma.user.aggregate({
      where: { deletedAt: null },
      _sum: { lifetimeWageredCents: true, lifetimeWonCents: true },
      _avg: { level: true },
    }),
    prisma.transaction.count({ where: { kind: "BET" } }),
    prisma.transaction.findMany({
      where: { kind: "BET" },
      orderBy: { payoutCents: "desc" },
      take: 10,
      select: { id: true, game: true, payoutCents: true, betCents: true, summary: true, createdAt: true, user: { select: { username: true } } },
    }),
    prisma.user.findMany({
      where: { isGuest: false },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, username: true, createdAt: true, level: true, deletedAt: true },
    }),
    prisma.round.count({ where: { status: "ACTIVE" } }),
    prisma.gameStat.groupBy({
      by: ["game"],
      _sum: { bets: true, wageredCents: true, wonCents: true },
      orderBy: { _sum: { bets: "desc" } },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, actorUsername: true, action: true, targetUsername: true, reason: true, createdAt: true },
    }),
    prisma.user.count({ where: { isGuest: false, deletedAt: null, deathCause: null } }),
    prisma.user.count({ where: { isGuest: false, deletedAt: null, deathCause: { not: null } } }),
    // Bucketed in JS below rather than with a SQL date-trunc: SQLite has no
    // native one, and this stays portable if the database ever changes.
    prisma.transaction.findMany({
      where: { kind: "BET", createdAt: { gte: dayAgo } },
      select: { createdAt: true, betCents: true },
      take: 20_000,
    }),
    prisma.user.findMany({
      where: { isGuest: false, createdAt: { gte: dayAgo } },
      select: { createdAt: true },
      take: 20_000,
    }),
    prisma.user.count({ where: { isGuest: true, deletedAt: null } }),
    prisma.user.count({ where: { isGuest: true, createdAt: { gte: dayAgo } } }),
    prisma.user.count({ where: { isGuest: true, deletedAt: null, lastSeenAt: { gte: online } } }),
  ]);

  // 24 one-hour buckets, oldest first, ending in the one containing `now`.
  const HOURS = 24;
  const HOUR_MS = 3_600_000;
  function bucketize<T extends { createdAt: Date }>(rows: T[], value: (row: T) => number): number[] {
    const buckets = new Array(HOURS).fill(0);
    for (const row of rows) {
      const idx = HOURS - 1 - Math.floor((now - row.createdAt.getTime()) / HOUR_MS);
      if (idx >= 0 && idx < HOURS) buckets[idx] += value(row);
    }
    return buckets;
  }
  const bucketLabels = Array.from({ length: HOURS }, (_, i) =>
    new Date(now - (HOURS - 1 - i) * HOUR_MS).toLocaleTimeString(undefined, { hour: "numeric" }),
  );

  const totalWagered = fromDb(wagerAgg._sum.lifetimeWageredCents ?? 0n);
  const totalWon = fromDb(wagerAgg._sum.lifetimeWonCents ?? 0n);

  // The house edge the app has ACTUALLY delivered across every bet ever
  // settled — the single most useful number for spotting a broken paytable in
  // production, because it should track the weighted average of the published
  // figures and nothing else.
  const realisedRtp = totalWagered > 0 ? totalWon / totalWagered : null;

  const nameFor = new Map(PLAYABLE.map((g) => [ENGINE_KEY[g.slug], g.name]));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    guests: { total: guestsTotal, today: guestsToday, online: guestsActive },
    users: {
      total: totalUsers,
      deleted: deletedUsers,
      suspended: suspendedUsers,
      staff: staffUsers,
      onlineNow,
      activeToday,
      activeWeek,
      newToday,
      newWeek,
    },
    economy: {
      totalBalanceCents: fromDb(balanceAgg._sum.balanceCents ?? 0n),
      averageBalanceCents: Math.round(Number(balanceAgg._avg.balanceCents ?? 0)),
      richestBalanceCents: fromDb(balanceAgg._max.balanceCents ?? 0n),
      totalWageredCents: totalWagered,
      totalWonCents: totalWon,
      realisedRtp,
      betCount,
    },
    progression: {
      averageLevel: Number(wagerAgg._avg.level ?? 0),
      liveCareers,
      endedCareers,
      activeRounds,
    },
    topGames: gameStats.map((g) => ({
      game: g.game,
      name: nameFor.get(g.game) ?? g.game,
      bets: g._sum.bets ?? 0,
      wageredCents: fromDb(g._sum.wageredCents ?? 0n),
      wonCents: fromDb(g._sum.wonCents ?? 0n),
      realisedRtp:
        fromDb(g._sum.wageredCents ?? 0n) > 0
          ? fromDb(g._sum.wonCents ?? 0n) / fromDb(g._sum.wageredCents ?? 0n)
          : null,
    })),
    biggestWins: biggestWins.map((w) => ({
      id: w.id,
      username: w.user.username,
      game: nameFor.get(w.game) ?? w.game,
      payoutCents: fromDb(w.payoutCents),
      betCents: fromDb(w.betCents),
      summary: w.summary,
      createdAt: w.createdAt,
    })),
    recentSignups: recentSignups.map((u) => ({
      id: u.id,
      username: u.username,
      level: u.level,
      deleted: u.deletedAt !== null,
      createdAt: u.createdAt,
    })),
    recentStaffActions: recentAdmin,
    trends: {
      labels: bucketLabels,
      betsPerHour: bucketize(betsForTrend, () => 1),
      wageredCentsPerHour: bucketize(betsForTrend, (r) => fromDb(r.betCents)),
      signupsPerHour: bucketize(signupsForTrend, () => 1),
    },
  });
}

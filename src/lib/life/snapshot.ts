import { prisma } from "@/lib/prisma";
import { fromDb } from "@/lib/bigmoney";
import { REP_TIERS, tierFor } from "@/lib/life/reputation";
import { vipFor } from "@/lib/life/vip";
import { ageFromDays } from "@/lib/life/career";
import type { StatSnapshot } from "@/lib/life/achievements";

/**
 * Builds the statistics snapshot that achievements, goals and the career page
 * are all evaluated against. There is exactly one of these so those three can
 * never disagree about what is true of an account.
 */
export async function buildSnapshot(userId: string): Promise<{
  snapshot: StatSnapshot;
  xp: number;
  unlocked: Set<string>;
}> {
  const [user, stats, unlocks] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.gameStat.findMany({ where: { userId } }),
    prisma.achievementUnlock.findMany({ where: { userId }, select: { key: true } }),
  ]);

  const games: StatSnapshot["games"] = {};
  for (const s of stats) {
    games[s.game] = {
      bets: s.bets,
      wins: s.wins,
      wageredCents: fromDb(s.wageredCents),
      biggestWinCents: fromDb(s.biggestWinCents),
    };
  }

  let venuesVisited: string[];
  try {
    const parsed = JSON.parse(user.visitedVenuesJson);
    venuesVisited = Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    venuesVisited = [];
  }

  const lifetimeWageredCents = fromDb(user.lifetimeWageredCents);

  return {
    xp: user.xp,
    unlocked: new Set(unlocks.map((u) => u.key)),
    snapshot: {
      level: user.level,
      rebirths: user.rebirths,
      livesLived: user.livesLived,
      reputation: user.reputation,
      repTierIndex: REP_TIERS.indexOf(tierFor(user.reputation)),
      vipLevel: vipFor(lifetimeWageredCents).level,
      lifetimeWageredCents,
      lifetimeWonCents: fromDb(user.lifetimeWonCents),
      biggestWinCents: fromDb(user.biggestWinCents),
      bestMultiplier: user.bestMultiplierX100 / 100,
      betsThisLife: user.betsThisLife,
      careerDays: user.careerDays,
      age: ageFromDays(user.careerDays),
      balanceCents: fromDb(user.balanceCents),
      peakBalanceCents: fromDb(user.peakBalanceCents),
      comebacksUsed: user.comebacksUsed,
      venueId: user.venueId,
      venuesVisited,
      games,
      distinctGamesPlayed: stats.length,
      distinctGamesWon: stats.filter((s) => s.wins > 0).length,
    },
  };
}

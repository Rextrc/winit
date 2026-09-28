import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { featuredLeagueKeys, getCatalog, getLeagues, isStarted } from "@/lib/sports/feed";
import { feedErrorResponse } from "@/lib/sports/http";
import type { LeagueEvents, SportEvent } from "@/lib/sports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Most leagues pulled for Upcoming — each uncached one costs quota. */
const UPCOMING_LEAGUES = 10;
const TRENDING_COUNT = 6;
/** Leagues of a sport loaded up front; the rest load when their panel opens. */
const GROUP_PRELOAD = 2;

function filterLeagues(leagues: LeagueEvents[], keep: (e: SportEvent) => boolean): LeagueEvents[] {
  return leagues.map((l) => ({ ...l, events: l.events.filter(keep) })).filter((l) => l.events.length > 0);
}

/** Upcoming events, most-backed on WinIt first, then soonest. */
async function trending(leagues: LeagueEvents[]): Promise<SportEvent[]> {
  const upcoming = leagues.flatMap((l) => l.events).filter((e) => !isStarted(e));
  if (upcoming.length === 0) return [];
  const counts = await prisma.sportsBetLeg.groupBy({
    by: ["eventId"],
    where: { eventId: { in: upcoming.map((e) => e.id) } },
    _count: { _all: true },
  });
  const backed = new Map(counts.map((c) => [c.eventId, c._count._all]));
  return upcoming
    .sort((a, b) => (backed.get(b.id) ?? 0) - (backed.get(a.id) ?? 0) || a.commenceTime.localeCompare(b.commenceTime))
    .slice(0, TRENDING_COUNT);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "featured";
  const groupName = url.searchParams.get("group");

  try {
    const catalog = await getCatalog();
    const featured = await getLeagues(await featuredLeagueKeys());
    const liveCount = featured.flatMap((l) => l.events).filter((e) => isStarted(e)).length;
    const now = Date.now();

    if (view === "group" && groupName) {
      const group = catalog.groups.find((g) => g.name === groupName);
      if (!group) return NextResponse.json({ error: "That sport isn't on the board right now." }, { status: 404 });
      const preload = await getLeagues(group.leagues.slice(0, GROUP_PRELOAD).map((l) => l.key)).catch(() => []);
      const leagues = group.leagues.map((league) => preload.find((p) => p.league.key === league.key) ?? { league, events: null });
      return NextResponse.json({ catalog, liveCount, leagues });
    }

    if (view === "upcoming") {
      // Featured leagues plus the top league of every other sport.
      const keys = featured.map((l) => l.league.key);
      for (const g of catalog.groups) {
        if (keys.length >= UPCOMING_LEAGUES) break;
        for (const l of g.leagues.slice(0, 2)) if (keys.length < UPCOMING_LEAGUES && !keys.includes(l.key)) keys.push(l.key);
      }
      const extra = await getLeagues(keys.filter((k) => !featured.some((f) => f.league.key === k))).catch(() => []);
      const leagues = filterLeagues([...featured, ...extra], (e) => {
        const t = new Date(e.commenceTime).getTime();
        return t > now && t - now < UPCOMING_WINDOW_MS;
      });
      return NextResponse.json({ catalog, liveCount, leagues });
    }

    if (view === "live") {
      return NextResponse.json({ catalog, liveCount, leagues: filterLeagues(featured, (e) => isStarted(e)) });
    }

    const leagues = filterLeagues(featured, (e) => !isStarted(e));
    return NextResponse.json({ catalog, liveCount, trending: await trending(featured), leagues });
  } catch (err) {
    return feedErrorResponse(err);
  }
}

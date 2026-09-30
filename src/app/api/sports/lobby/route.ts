import { NextResponse } from "next/server";
import { featuredLeagueKeys, getCatalog, getLeagues, getSchedule, groupCounts, isStarted } from "@/lib/sports/feed";
import { feedErrorResponse } from "@/lib/sports/http";
import type { LeagueEvents, SportEvent } from "@/lib/sports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPCOMING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const TRENDING_COUNT = 6;
/** Leagues of a sport loaded up front; the rest load when their panel opens. */
const GROUP_PRELOAD = 2;

function filterLeagues(leagues: LeagueEvents[], keep: (e: SportEvent) => boolean): LeagueEvents[] {
  return leagues.map((l) => ({ ...l, events: l.events.filter(keep) })).filter((l) => l.events.length > 0);
}

/** What's actually happening right now first (live), then whatever kicks off soonest. */
function trending(leagues: LeagueEvents[]): SportEvent[] {
  const all = leagues.flatMap((l) => l.events);
  if (all.length === 0) return [];
  const live = all.filter((e) => isStarted(e)).sort((a, b) => b.commenceTime.localeCompare(a.commenceTime));
  const upcoming = all.filter((e) => !isStarted(e)).sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));
  return [...live, ...upcoming].slice(0, TRENDING_COUNT);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "featured";
  const groupName = url.searchParams.get("group");

  try {
    const catalog = await getCatalog();
    const featured = await getLeagues(await featuredLeagueKeys());
    const liveCount = featured.flatMap((l) => l.events).filter((e) => isStarted(e)).length;
    const schedule = await getSchedule().catch(() => new Map() as Awaited<ReturnType<typeof getSchedule>>);
    const counts = groupCounts(schedule);
    const leagueCounts = Object.fromEntries(Array.from(schedule.entries()).map(([k, v]) => [k, v.count]));
    const now = Date.now();

    if (view === "group" && groupName) {
      const group = catalog.groups.find((g) => g.name === groupName);
      if (!group) return NextResponse.json({ error: "That sport isn't on the board right now." }, { status: 404 });
      const preload = await getLeagues(group.leagues.slice(0, GROUP_PRELOAD).map((l) => l.key)).catch(() => []);
      const leagues = group.leagues.map((league) => preload.find((p) => p.league.key === league.key) ?? { league, events: null });
      return NextResponse.json({ catalog, liveCount, counts, leagueCounts, leagues });
    }

    if (view === "upcoming") {
      // Every league with a fixture this week, soonest first. Odds for the
      // featured ones are already cached; the rest load when opened.
      const leagues = Array.from(schedule.values())
        .sort((a, b) => a.firstStart.localeCompare(b.firstStart))
        .map(({ league }) => {
          const known = featured.find((f) => f.league.key === league.key);
          return {
            league,
            events: known
              ? known.events.filter((e) => {
                  const t = new Date(e.commenceTime).getTime();
                  return t > now && t - now < UPCOMING_WINDOW_MS;
                })
              : null,
          };
        });
      return NextResponse.json({ catalog, liveCount, counts, leagueCounts, leagues });
    }

    if (view === "live") {
      return NextResponse.json({ catalog, liveCount, counts, leagueCounts, leagues: filterLeagues(featured, (e) => isStarted(e)) });
    }

    const leagues = filterLeagues(featured, (e) => !isStarted(e));
    return NextResponse.json({ catalog, liveCount, counts, leagueCounts, trending: trending(featured), leagues });
  } catch (err) {
    return feedErrorResponse(err);
  }
}

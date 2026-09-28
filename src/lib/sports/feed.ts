import { prisma } from "@/lib/prisma";
import { FEATURED_LEAGUES, FEATURED_LIMIT, GROUP_ORDER } from "@/lib/sports/meta";
import { FeedError, fetchEvents, fetchOdds, fetchSports, type RawEvent, type RawFixture, type RawSport } from "@/lib/sports/provider";
import { normalizeEvent } from "@/lib/sports/normalize";
import type { Catalog, League, LeagueEvents, SportEvent } from "@/lib/sports/types";

/**
 * Cached access to the odds feed. Every response is kept in memory and in the
 * OddsCache table, so a page view only spends quota when the cached copy is
 * older than ODDS_CACHE_MINUTES, a restart doesn't refetch everything, and a
 * feed outage (or a spent quota) falls back to the last good copy.
 */

const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

function oddsTtlMs(): number {
  const mins = Number(process.env.ODDS_CACHE_MINUTES);
  return (Number.isFinite(mins) && mins > 0 ? mins : 20) * 60 * 1000;
}

/** Events that started this long ago are dropped from listings. */
const STALE_EVENT_MS = 4 * 60 * 60 * 1000;

type Entry = { data: unknown; fetchedAt: number };
const memory = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry>>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<{ data: T; fetchedAt: Date }> {
  const now = Date.now();
  let entry = memory.get(key);

  if (!entry) {
    const row = await prisma.oddsCache.findUnique({ where: { key } });
    if (row) {
      entry = { data: JSON.parse(row.body), fetchedAt: row.fetchedAt.getTime() };
      memory.set(key, entry);
    }
  }

  if (entry && now - entry.fetchedAt < ttlMs) return { data: entry.data as T, fetchedAt: new Date(entry.fetchedAt) };

  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const data = await load();
      const fresh: Entry = { data, fetchedAt: Date.now() };
      memory.set(key, fresh);
      const body = JSON.stringify(data);
      const fetchedAt = new Date(fresh.fetchedAt);
      await prisma.oddsCache.upsert({ where: { key }, create: { key, body, fetchedAt }, update: { body, fetchedAt } });
      return fresh;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    const fresh = await pending;
    return { data: fresh.data as T, fetchedAt: new Date(fresh.fetchedAt) };
  } catch (err) {
    if (entry) return { data: entry.data as T, fetchedAt: new Date(entry.fetchedAt) };
    throw err;
  }
}

function groupRank(name: string): number {
  const i = GROUP_ORDER.indexOf(name);
  return i === -1 ? GROUP_ORDER.length : i;
}

function leagueRank(key: string): number {
  const i = FEATURED_LEAGUES.indexOf(key);
  return i === -1 ? FEATURED_LEAGUES.length : i;
}

export async function getCatalog(): Promise<Catalog> {
  const { data } = await cached<RawSport[]>("sports", CATALOG_TTL_MS, fetchSports);
  const byGroup = new Map<string, League[]>();
  for (const s of data) {
    if (!s.active || s.has_outrights) continue;
    const list = byGroup.get(s.group) ?? [];
    list.push({ key: s.key, title: s.title, group: s.group });
    byGroup.set(s.group, list);
  }
  const groups = Array.from(byGroup.entries())
    .map(([name, leagues]) => ({
      name,
      leagues: leagues.sort((a, b) => leagueRank(a.key) - leagueRank(b.key) || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => groupRank(a.name) - groupRank(b.name) || a.name.localeCompare(b.name));
  return { groups };
}

export async function findLeague(sportKey: string): Promise<League | null> {
  const catalog = await getCatalog();
  for (const g of catalog.groups) {
    const l = g.leagues.find((x) => x.key === sportKey);
    if (l) return l;
  }
  return null;
}

export async function getLeague(sportKey: string): Promise<LeagueEvents> {
  const league = await findLeague(sportKey);
  if (!league) throw new FeedError("That league isn't on the board right now.");

  const { data, fetchedAt } = await cached<RawEvent[]>(`odds:${sportKey}`, oddsTtlMs(), () => fetchOdds(sportKey));
  const cutoff = Date.now() - STALE_EVENT_MS;
  const events = data
    .filter((e) => new Date(e.commence_time).getTime() > cutoff)
    .map((e) => normalizeEvent(e, league.group, league.title))
    .filter((e): e is SportEvent => e !== null)
    .sort((a, b) => a.commenceTime.localeCompare(b.commenceTime));

  return { league, events, fetchedAt: fetchedAt.toISOString() };
}

export async function getEvent(sportKey: string, eventId: string): Promise<SportEvent | null> {
  const { events } = await getLeague(sportKey);
  return events.find((e) => e.id === eventId) ?? null;
}

/** The leagues on the Featured tab: the priority list first, topped up from the biggest sports. */
export async function featuredLeagueKeys(): Promise<string[]> {
  const catalog = await getCatalog();
  const active = new Set(catalog.groups.flatMap((g) => g.leagues.map((l) => l.key)));
  const keys = FEATURED_LEAGUES.filter((k) => active.has(k)).slice(0, FEATURED_LIMIT);
  for (const g of catalog.groups) {
    if (keys.length >= FEATURED_LIMIT) break;
    const first = g.leagues[0];
    if (first && !keys.includes(first.key)) keys.push(first.key);
  }
  return keys;
}

export async function getLeagues(keys: string[]): Promise<LeagueEvents[]> {
  const results = await Promise.allSettled(keys.map((k) => getLeague(k)));
  const out: LeagueEvents[] = [];
  for (const r of results) if (r.status === "fulfilled") out.push(r.value);
  if (out.length === 0 && keys.length > 0) {
    const firstError = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw firstError?.reason instanceof FeedError ? firstError.reason : new FeedError("Couldn't load any odds.");
  }
  return out;
}

export function isStarted(e: SportEvent, now = Date.now()): boolean {
  return new Date(e.commenceTime).getTime() <= now;
}

const SCHEDULE_TTL_MS = 30 * 60 * 1000;
const SCHEDULE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SCHEDULE_CONCURRENCY = 8;

export type Schedule = Map<string, { league: League; count: number; firstStart: string }>;

/**
 * Every upcoming fixture across every league on the board, from the free
 * events endpoint — counts per league without spending any odds quota.
 */
export async function getSchedule(): Promise<Schedule> {
  const catalog = await getCatalog();
  const leagues = catalog.groups.flatMap((g) => g.leagues);
  const out: Schedule = new Map();
  const now = Date.now();
  let i = 0;
  const worker = async () => {
    while (i < leagues.length) {
      const league = leagues[i++];
      try {
        const { data } = await cached<RawFixture[]>(`events:${league.key}`, SCHEDULE_TTL_MS, () => fetchEvents(league.key));
        const upcoming = data
          .filter((e) => {
            const t = new Date(e.commence_time).getTime();
            return t > now && t - now < SCHEDULE_WINDOW_MS;
          })
          .sort((a, b) => a.commence_time.localeCompare(b.commence_time));
        if (upcoming.length > 0) out.set(league.key, { league, count: upcoming.length, firstStart: upcoming[0].commence_time });
      } catch {
        /* one league failing shouldn't blank the board */
      }
    }
  };
  await Promise.all(Array.from({ length: SCHEDULE_CONCURRENCY }, worker));
  return out;
}

export function groupCounts(schedule: Schedule): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { league, count } of Array.from(schedule.values())) counts[league.group] = (counts[league.group] ?? 0) + count;
  return counts;
}

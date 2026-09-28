import { oddsRegionFor } from "@/lib/sports/meta";

/**
 * Raw client for The Odds API (https://the-odds-api.com). Every call here
 * spends quota except `/sports`, so nothing outside lib/sports/feed.ts and
 * lib/sports/settle.ts should call it directly — those two cache.
 *
 * Cost per call is (markets × regions): an odds call for one league with
 * three markets in one region costs 3; a scores call with daysFrom costs 2.
 */

export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedError";
  }
}

export function feedConfigured(): boolean {
  return Boolean(process.env.ODDS_API_KEY);
}

function base(): string {
  return (process.env.ODDS_API_BASE ?? "https://api.the-odds-api.com/v4").replace(/\/$/, "");
}

export type RawSport = {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
  has_outrights: boolean;
};

export type RawOutcome = { name: string; price: number; point?: number };
export type RawMarket = { key: string; outcomes: RawOutcome[] };
export type RawBookmaker = { key: string; title: string; markets: RawMarket[] };

export type RawEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: RawBookmaker[];
};

export type RawScore = {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
};

/** Credits left this month, from the last response's headers. */
let lastRemaining: number | null = null;
export function quotaRemaining(): number | null {
  return lastRemaining;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new FeedError("Sports betting isn't switched on yet — the odds feed has no API key.");

  const url = new URL(`${base()}${path}`);
  url.searchParams.set("apiKey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new FeedError("Couldn't reach the odds feed.");
  }

  const remaining = Number(res.headers.get("x-requests-remaining"));
  if (Number.isFinite(remaining) && res.headers.has("x-requests-remaining")) lastRemaining = remaining;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 429) {
      console.warn(`[sports] odds feed refused (${res.status}): ${body.slice(0, 200)}`);
      throw new FeedError("The odds feed is out of requests for now.");
    }
    throw new FeedError(`Odds feed error ${res.status}.`);
  }
  return (await res.json()) as T;
}

/** Every sport the provider covers. Free — doesn't count against the quota. */
export function fetchSports(): Promise<RawSport[]> {
  return get<RawSport[]>("/sports");
}

/** Upcoming and in-play events for one league, with h2h, spreads and totals. */
export function fetchOdds(sportKey: string): Promise<RawEvent[]> {
  return get<RawEvent[]>(`/sports/${encodeURIComponent(sportKey)}/odds`, {
    regions: oddsRegionFor(sportKey),
    markets: "h2h,spreads,totals",
    oddsFormat: "decimal",
    dateFormat: "iso",
  });
}

export type RawFixture = Omit<RawEvent, "bookmakers">;

/** Scheduled fixtures for one league, without odds. Free — no quota cost. */
export function fetchEvents(sportKey: string): Promise<RawFixture[]> {
  return get<RawFixture[]>(`/sports/${encodeURIComponent(sportKey)}/events`, { dateFormat: "iso" });
}

/** Results for one league over the last few days, completed games included. */
export function fetchScores(sportKey: string, daysFrom: number): Promise<RawScore[]> {
  return get<RawScore[]>(`/sports/${encodeURIComponent(sportKey)}/scores`, {
    daysFrom: String(Math.min(3, Math.max(1, daysFrom))),
    dateFormat: "iso",
  });
}

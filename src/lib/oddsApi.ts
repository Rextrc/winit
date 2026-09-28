/**
 * Thin client for The Odds API (https://the-odds-api.com) — real bookmaker
 * odds for real sporting events. WinIt never generates these outcomes: a
 * sports bet is settled against the actual final score, fetched from the
 * same provider once the event completes.
 *
 * Requires ODDS_API_KEY in the environment. Free tier: 500 requests/month.
 */

const BASE = "https://api.the-odds-api.com/v4";

export class OddsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OddsApiError";
  }
}

function apiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new OddsApiError("Sports betting isn't configured yet — no ODDS_API_KEY set.");
  return key;
}

export type SportInfo = {
  key: string;
  group: string;
  title: string;
  description: string;
  active: boolean;
};

export type Outcome = {
  name: string;
  price: number;
  point?: number;
};

export type Market = {
  key: "h2h" | "spreads" | "totals";
  outcomes: Outcome[];
};

export type Bookmaker = {
  key: string;
  title: string;
  last_update: string;
  markets: Market[];
};

export type OddsEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
};

export type ScoreEvent = {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
};

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("apiKey", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OddsApiError(`Odds API ${res.status}: ${body.slice(0, 200) || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** The handful of sports we show in the lobby — kept short to stay inside the free quota. */
export const FEATURED_SPORT_KEYS = [
  "soccer_epl",
  "basketball_nba",
  "americanfootball_nfl",
  "icehockey_nhl",
  "baseball_mlb",
  "mma_mixed_martial_arts",
];

export function listSports(): Promise<SportInfo[]> {
  return get<SportInfo[]>("/sports");
}

/** Upcoming + live events with odds for one sport, from the best-priced US/UK books. */
export function listOdds(sportKey: string): Promise<OddsEvent[]> {
  return get<OddsEvent[]>(`/sports/${sportKey}/odds`, {
    regions: "us,uk",
    markets: "h2h,spreads,totals",
    oddsFormat: "decimal",
    dateFormat: "iso",
  });
}

/** Scores for events from the last `daysFrom` days, including completed ones. */
export function listScores(sportKey: string, daysFrom = 3): Promise<ScoreEvent[]> {
  return get<ScoreEvent[]>(`/sports/${sportKey}/scores`, { daysFrom: String(daysFrom) });
}

/** Picks one bookmaker's markets to quote — whichever book has the most markets listed first. */
export function bestBookmaker(event: OddsEvent): Bookmaker | null {
  if (event.bookmakers.length === 0) return null;
  return [...event.bookmakers].sort((a, b) => b.markets.length - a.markets.length)[0];
}

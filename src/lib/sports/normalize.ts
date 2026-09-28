import type { RawEvent } from "@/lib/sports/provider";
import type { Market, MarketKey, MarketLine, Outcome, SportEvent } from "@/lib/sports/types";

/**
 * Turns one provider event — the same match priced separately by a dozen
 * bookmakers — into a single book: for every line, each outcome's price is
 * the MEDIAN of what the bookmakers quote.
 *
 * The median keeps a normal bookmaker's margin in the price. Quoting the best
 * price across books instead would hand players a free arbitrage whenever
 * two books disagree, so a guard also re-applies a minimum margin to any line
 * whose medians happen to land below it.
 */

const MIN_OVERROUND = 1.02;
const MAX_LINES = 6;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Scales a line's prices down if the median book is margin-free. */
function withMargin(outcomes: Outcome[]): Outcome[] {
  const overround = outcomes.reduce((s, o) => s + 1 / o.price, 0);
  const scale = overround < MIN_OVERROUND ? overround / MIN_OVERROUND : 1;
  return outcomes.map((o) => ({ ...o, price: Math.max(1.01, round2(o.price * scale)) }));
}

/**
 * Quarter lines (±0.25, 2.75, …) split the stake across two neighbouring
 * lines and settle as half-wins and half-losses. Only whole and half lines
 * are offered, so every leg settles cleanly as won, lost or pushed.
 */
function isWholeOrHalf(point: number): boolean {
  return Number.isInteger(point * 2);
}

type Bucket = { point: number | null; names: string[]; prices: Map<string, number[]>; books: number };

function buildMarket(raw: RawEvent, key: MarketKey): Market | null {
  const buckets = new Map<string, Bucket>();

  for (const book of raw.bookmakers) {
    const m = book.markets.find((x) => x.key === key);
    if (!m) continue;

    let lineKey: string;
    let point: number | null = null;
    let names: string[];

    if (key === "h2h") {
      names = m.outcomes.map((o) => o.name);
      if (!names.includes(raw.home_team) || !names.includes(raw.away_team)) continue;
      lineKey = names.includes("Draw") ? "3way" : "2way";
    } else if (key === "spreads") {
      const home = m.outcomes.find((o) => o.name === raw.home_team);
      const away = m.outcomes.find((o) => o.name === raw.away_team);
      if (!home || !away || home.point === undefined || away.point === undefined) continue;
      if (home.point !== -away.point || !isWholeOrHalf(home.point)) continue;
      point = home.point;
      lineKey = String(point);
      names = [raw.home_team, raw.away_team];
    } else {
      const over = m.outcomes.find((o) => o.name === "Over");
      const under = m.outcomes.find((o) => o.name === "Under");
      if (!over || !under || over.point === undefined || over.point !== under.point) continue;
      if (!isWholeOrHalf(over.point)) continue;
      point = over.point;
      lineKey = String(point);
      names = ["Over", "Under"];
    }

    let b = buckets.get(lineKey);
    if (!b) {
      b = { point, names, prices: new Map(), books: 0 };
      buckets.set(lineKey, b);
    }
    b.books += 1;
    for (const o of m.outcomes) {
      if (!b.names.includes(o.name) || !(o.price > 1)) continue;
      const list = b.prices.get(o.name) ?? [];
      list.push(o.price);
      b.prices.set(o.name, list);
    }
  }

  const lines: (MarketLine & { books: number; balance: number })[] = [];
  for (const b of Array.from(buckets.values())) {
    if (!b.names.every((n) => (b.prices.get(n)?.length ?? 0) > 0)) continue;
    const outcomes = withMargin(
      b.names.map((name) => {
        const own =
          key === "spreads" ? (name === raw.home_team ? b.point : b.point === null ? null : -b.point) : b.point;
        return { name, price: round2(median(b.prices.get(name)!)), point: own };
      }),
    );
    const prices = outcomes.map((o) => o.price);
    lines.push({ point: b.point, outcomes, books: b.books, balance: Math.max(...prices) - Math.min(...prices) });
  }
  if (lines.length === 0) return null;

  // h2h can arrive both 2-way and 3-way from different books; keep the one
  // more books agree on.
  if (key === "h2h") {
    lines.sort((a, b) => b.books - a.books);
    const top = lines[0];
    return { key, lines: [{ point: null, outcomes: top.outcomes }] };
  }

  // Main line = the one the most books quote, closest to even money on ties.
  lines.sort((a, b) => b.books - a.books || a.balance - b.balance);
  const main = lines[0];
  const rest = lines
    .slice(1, MAX_LINES)
    .sort((a, b) => (a.point ?? 0) - (b.point ?? 0));
  return {
    key,
    lines: [main, ...rest].map(({ point, outcomes }) => ({ point, outcomes })),
  };
}

export function normalizeEvent(raw: RawEvent, group: string, leagueTitle: string): SportEvent | null {
  const markets = (["h2h", "spreads", "totals"] as const)
    .map((k) => buildMarket(raw, k))
    .filter((m): m is Market => m !== null);
  if (!markets.some((m) => m.key === "h2h")) return null;

  return {
    id: raw.id,
    sportKey: raw.sport_key,
    leagueTitle,
    group,
    homeTeam: raw.home_team,
    awayTeam: raw.away_team,
    commenceTime: raw.commence_time,
    bookmakers: raw.bookmakers.length,
    markets,
  };
}

/** Finds a priced selection on an event, or null if it's no longer offered. */
export function findOutcome(
  event: SportEvent,
  market: MarketKey,
  name: string,
  point: number | null,
): Outcome | null {
  const m = event.markets.find((x) => x.key === market);
  if (!m) return null;
  for (const line of m.lines) {
    for (const o of line.outcomes) {
      if (o.name === name && (o.point ?? null) === (point ?? null)) return o;
    }
  }
  return null;
}

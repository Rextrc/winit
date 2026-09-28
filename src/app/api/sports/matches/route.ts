import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { FEATURED_SPORT_KEYS, OddsApiError, bestBookmaker, listOdds } from "@/lib/oddsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type MatchView = {
  eventId: string;
  sportKey: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmaker: string | null;
  h2h: { name: string; price: number }[];
  spreads: { name: string; price: number; point: number }[];
  totals: { name: string; price: number; point: number }[];
};

function toView(sportKey: string, sportTitle: string, event: Awaited<ReturnType<typeof listOdds>>[number]): MatchView {
  const book = bestBookmaker(event);
  const h2h = book?.markets.find((m) => m.key === "h2h")?.outcomes.map((o) => ({ name: o.name, price: o.price })) ?? [];
  const spreads =
    book?.markets
      .find((m) => m.key === "spreads")
      ?.outcomes.map((o) => ({ name: o.name, price: o.price, point: o.point ?? 0 })) ?? [];
  const totals =
    book?.markets
      .find((m) => m.key === "totals")
      ?.outcomes.map((o) => ({ name: o.name, price: o.price, point: o.point ?? 0 })) ?? [];

  return {
    eventId: event.id,
    sportKey,
    sportTitle,
    homeTeam: event.home_team,
    awayTeam: event.away_team,
    commenceTime: event.commence_time,
    bookmaker: book?.title ?? null,
    h2h,
    spreads,
    totals,
  };
}

/**
 * Pulls live odds for the featured sports and flattens them into one list.
 * Cached in memory for 30s so browsing the lobby doesn't burn the monthly
 * quota — the free tier is 500 requests/month.
 */
let cache: { at: number; matches: MatchView[] } | null = null;
const CACHE_MS = 30_000;

export async function GET() {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ matches: cache.matches });
  }

  try {
    const results = await Promise.allSettled(FEATURED_SPORT_KEYS.map((key) => listOdds(key)));
    const matches: MatchView[] = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const sportKey = FEATURED_SPORT_KEYS[i];
      for (const event of r.value) {
        if (event.bookmakers.length === 0) continue;
        matches.push(toView(sportKey, event.sport_title, event));
      }
    });
    matches.sort((a, b) => new Date(a.commenceTime).getTime() - new Date(b.commenceTime).getTime());
    cache = { at: Date.now(), matches };
    return NextResponse.json({ matches });
  } catch (err) {
    if (err instanceof OddsApiError) return jsonError(err.message, 503);
    return jsonError("Couldn't reach the odds feed.", 503);
  }
}

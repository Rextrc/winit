import type { SportsBet, SportsBetLeg } from "@prisma/client";
import { fromDb } from "@/lib/bigmoney";
import { getLeague } from "@/lib/sports/feed";
import { findOutcome } from "@/lib/sports/normalize";
import type { MarketKey } from "@/lib/sports/types";

/** Cash out closes this long before the next unsettled leg starts. */
export const CASHOUT_CUTOFF_MS = 60 * 60 * 1000;
/** The house keeps this share of the fair value, as any book does. */
const CASHOUT_MARGIN = 0.05;

export type CashoutQuote =
  | { available: true; amountCents: number }
  | { available: false; reason: string };

/**
 * What a multi is worth right now: the stake times every settled leg's
 * price, times each still-open leg's (price taken ÷ price now) — the fair
 * value of the remaining risk at today's odds — less a 5% margin.
 */
export async function quoteCashout(bet: SportsBet & { legs: SportsBetLeg[] }, now = Date.now()): Promise<CashoutQuote> {
  if (bet.kind !== "MULTI") return { available: false, reason: "Cash out is for multis." };
  if (bet.status !== "PENDING") return { available: false, reason: "This bet is already settled." };
  if (bet.legs.some((l) => l.status === "LOST")) return { available: false, reason: "A leg has lost." };
  if (!bet.legs.some((l) => l.status === "WON")) return { available: false, reason: "Available once a leg has won." };

  const open = bet.legs.filter((l) => l.status === "PENDING");
  if (open.length === 0) return { available: false, reason: "Settling now." };
  const nextStart = Math.min(...open.map((l) => l.commenceTime.getTime()));
  if (nextStart - now < CASHOUT_CUTOFF_MS) {
    return { available: false, reason: "Cash out closes 1 hour before the next game starts." };
  }

  let value = fromDb(bet.stakeCents);
  for (const l of bet.legs) if (l.status === "WON") value *= l.priceDecimal;

  for (const l of open) {
    let current: number | null = null;
    try {
      const { events } = await getLeague(l.sportKey);
      const event = events.find((e) => e.id === l.eventId);
      current = event ? (findOutcome(event, l.market as MarketKey, l.selection, l.point)?.price ?? null) : null;
    } catch {
      current = null;
    }
    if (!current) return { available: false, reason: "A leg isn't priced right now — try again shortly." };
    value *= l.priceDecimal / current;
  }

  const cap = Math.round(fromDb(bet.stakeCents) * bet.priceDecimal);
  return { available: true, amountCents: Math.min(cap, Math.floor(value * (1 - CASHOUT_MARGIN))) };
}

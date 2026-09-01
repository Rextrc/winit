import { shuffle } from "@/lib/rng";
import { TARGET_RTP, roundMultiplier } from "@/lib/games/originals";

/**
 * WINIT LOTTERY — pick 6 of 49, six are drawn
 * ---------------------------------------------------------------------------
 * A real lottery keeps somewhere near half of every ticket. This one does not:
 * the paytable is DERIVED rather than written down, using the same technique as
 * Keno. A fixed shape (pays rise geometrically from the lowest paying hit
 * count) is scaled so the exact hypergeometric expectation lands on
 * TARGET_RTP, and `exactRtp()` then recomputes the return from the rounded
 * multipliers so the published figure is the one actually paid.
 * ---------------------------------------------------------------------------
 */

export const POOL = 49;
export const PICKS = 6;
export const DRAWN = 6;
/** Below this many hits the ticket pays nothing. */
export const MIN_PAYING_HITS = 2;

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Exact P(exactly `hits` of the six picks are among the six drawn). */
export function hitProbability(hits: number): number {
  return (choose(PICKS, hits) * choose(POOL - PICKS, DRAWN - hits)) / choose(POOL, DRAWN);
}

/**
 * Multiplier per hit count. The shape is 6^(h - MIN_PAYING_HITS), which makes
 * the jackpot worth chasing without any hand-tuning, then the whole row is
 * scaled so the expectation is exactly TARGET_RTP.
 */
export function paytable(): number[] {
  const shape = Array.from({ length: PICKS + 1 }, (_, h) =>
    h < MIN_PAYING_HITS ? 0 : 6 ** (h - MIN_PAYING_HITS),
  );
  const raw = shape.reduce((sum, w, h) => sum + w * hitProbability(h), 0);
  const scale = TARGET_RTP / raw;
  return shape.map((w) => (w === 0 ? 0 : roundMultiplier(w * scale)));
}

export function exactRtp(): number {
  const table = paytable();
  return table.reduce((sum, m, h) => sum + m * hitProbability(h), 0);
}

export function validTicket(numbers: number[]): boolean {
  if (!Array.isArray(numbers) || numbers.length !== PICKS) return false;
  const seen = new Set<number>();
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > POOL) return false;
    if (seen.has(n)) return false;
    seen.add(n);
  }
  return true;
}

/** A random valid ticket, for the quick-pick button. */
export function quickPick(): number[] {
  const pool = Array.from({ length: POOL }, (_, i) => i + 1);
  return shuffle(pool).slice(0, PICKS).sort((a, b) => a - b);
}

export type LotteryResult = {
  drawn: number[];
  ticket: number[];
  matched: number[];
  hits: number;
  multiplier: number;
  payoutCents: number;
};

export function draw(ticket: number[], betCents: number): LotteryResult {
  const pool = Array.from({ length: POOL }, (_, i) => i + 1);
  const drawn = shuffle(pool).slice(0, DRAWN).sort((a, b) => a - b);
  const matched = ticket.filter((n) => drawn.includes(n)).sort((a, b) => a - b);
  const hits = matched.length;
  const multiplier = paytable()[hits];

  return {
    drawn,
    ticket: [...ticket].sort((a, b) => a - b),
    matched,
    hits,
    multiplier,
    payoutCents: Math.round(betCents * multiplier),
  };
}

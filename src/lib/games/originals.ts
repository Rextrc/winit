/**
 * WINIT ORIGINALS — the shared maths
 * ===========================================================================
 * Six instant-settle games (Dice, Limbo, Coinflip, Wheel, Plinko, Keno) built
 * on one honest primitive.
 *
 * THE FAIR MULTIPLIER
 * ---------------------------------------------------------------------------
 * Every payout in this family is derived from the true probability of the
 * outcome it pays for:
 *
 *     multiplier = (1 - HOUSE_EDGE) / P(win)
 *
 * That is the whole model. There is no separate paytable to fudge, no bonus
 * weighting and no per-bet tuning: pick any target, any risk level, any number
 * of Keno picks, and the return is 99% by construction. Where a game uses a
 * fixed table instead (Wheel, Plinko, Keno), the table is checked against the
 * true outcome distribution and the exact resulting RTP is published rather
 * than assumed.
 *
 * Multipliers are rounded to 4 decimal places before they are paid, so the
 * figure shown to the player is the figure used in the maths. `exactRtp()` for
 * each game is computed from the ROUNDED multipliers, so the published number
 * is what the code actually pays, not the idealised formula.
 * ===========================================================================
 */

export const HOUSE_EDGE = 0.01;
export const TARGET_RTP = 1 - HOUSE_EDGE; // 0.99

export const ORIGINALS = ["dice", "limbo", "coinflip", "wheel", "plinko", "keno"] as const;
export type OriginalGame = (typeof ORIGINALS)[number];

/** Multipliers are quoted and paid to 4dp so display and maths never diverge. */
export function roundMultiplier(m: number): number {
  return Math.round(m * 10_000) / 10_000;
}

/** The fair price of an outcome that happens with probability `p`. */
export function fairMultiplier(p: number): number {
  if (!(p > 0) || p > 1) throw new Error(`fairMultiplier: probability ${p} out of range`);
  return roundMultiplier(TARGET_RTP / p);
}

/**
 * Rounds to the nearest cent rather than flooring. Flooring would quietly skim
 * up to a cent off every win, which at the 0.10 minimum bet is a real bias;
 * rounding to nearest is unbiased.
 */
export function payoutFor(betCents: number, multiplier: number): number {
  return Math.round(betCents * multiplier);
}

// ===========================================================================
// DICE — roll 00.00 to 99.99, bet over or under a target
// ===========================================================================

/** The roll is an integer 0..9999, displayed as 00.00–99.99. */
export const DICE_OUTCOMES = 10_000;
export const DICE_MIN_CHANCE = 0.02;
export const DICE_MAX_CHANCE = 0.98;

export type DiceDirection = "over" | "under";

/** Number of the 10,000 outcomes that win, for a target in hundredths. */
export function diceWinningOutcomes(direction: DiceDirection, target: number): number {
  return direction === "over" ? DICE_OUTCOMES - 1 - target : target;
}

export function diceChance(direction: DiceDirection, target: number): number {
  return diceWinningOutcomes(direction, target) / DICE_OUTCOMES;
}

export function diceValidTarget(direction: DiceDirection, target: number): boolean {
  if (!Number.isInteger(target)) return false;
  const p = diceChance(direction, target);
  return p >= DICE_MIN_CHANCE && p <= DICE_MAX_CHANCE;
}

export function diceMultiplier(direction: DiceDirection, target: number): number {
  return fairMultiplier(diceChance(direction, target));
}

export function diceWins(direction: DiceDirection, target: number, roll: number): boolean {
  return direction === "over" ? roll > target : roll < target;
}

/** Exact RTP for one dice bet: probability times the multiplier actually paid. */
export function diceExactRtp(direction: DiceDirection, target: number): number {
  return diceChance(direction, target) * diceMultiplier(direction, target);
}

// ===========================================================================
// LIMBO — a multiplier is drawn; you win if it reaches your target
// ===========================================================================

export const LIMBO_MIN_TARGET = 1.01;
export const LIMBO_MAX_TARGET = 10_000;
/** The drawn multiplier is capped here. Capping cannot change any bet's odds
 *  because a capped result is still >= every reachable target. */
export const LIMBO_CAP = 1_000_000;

/**
 * With u uniform on (0,1], the drawn multiplier is TARGET_RTP / u, so
 * P(result >= M) = TARGET_RTP / M and the return is exactly TARGET_RTP for
 * every target. The edge is in the numerator, nowhere else.
 */
export function limboResultFromUniform(u: number): number {
  return Math.min(LIMBO_CAP, Math.max(1, roundMultiplier(TARGET_RTP / u)));
}

export function limboChance(target: number): number {
  return TARGET_RTP / target;
}

export function limboValidTarget(target: number): boolean {
  return Number.isFinite(target) && target >= LIMBO_MIN_TARGET && target <= LIMBO_MAX_TARGET;
}

export function limboExactRtp(target: number): number {
  return limboChance(target) * roundMultiplier(target);
}

// ===========================================================================
// COINFLIP — the simplest possible statement of the same idea
// ===========================================================================

export const COINFLIP_MULTIPLIER = fairMultiplier(0.5); // 1.98
export type CoinSide = "heads" | "tails";

export function coinflipExactRtp(): number {
  return 0.5 * COINFLIP_MULTIPLIER;
}

// ===========================================================================
// WHEEL — a segmented wheel, one multiplier per segment
// ===========================================================================

export type WheelRisk = "low" | "medium" | "high";

/**
 * Each wheel has 10 equally likely segments whose multipliers sum to 9.9, so
 * the mean is exactly 0.99 whichever risk level you pick. Risk changes the
 * shape of the distribution, never the return.
 */
export const WHEEL_SEGMENTS: Record<WheelRisk, number[]> = {
  low: [0, 1.2, 0, 1.2, 1.5, 1.2, 0, 1.2, 1.5, 2.1],
  medium: [0, 0, 1.9, 0, 1.8, 0, 3.0, 0, 1.8, 1.4],
  high: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9.9],
};

export function wheelExactRtp(risk: WheelRisk): number {
  const s = WHEEL_SEGMENTS[risk];
  return s.reduce((a, b) => a + b, 0) / s.length;
}

// ===========================================================================
// PLINKO — a ball bounces down a peg pyramid into a multiplier bucket
// ===========================================================================

export type PlinkoRisk = "low" | "medium" | "high";
export const PLINKO_ROWS = [8, 12, 16] as const;
export type PlinkoRows = (typeof PLINKO_ROWS)[number];

/**
 * A ball takes `rows` independent left/right bounces, so the bucket it lands
 * in is Binomial(rows, 1/2). The tables are symmetric; `plinkoExactRtp()`
 * weights each bucket by its exact binomial probability, and the resulting
 * figure is what gets published — no table is assumed to be 99%.
 */
export const PLINKO_TABLES: Record<PlinkoRisk, Record<PlinkoRows, number[]>> = {
  low: {
    8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  },
  medium: {
    8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  },
  high: {
    8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
  },
};

/** Exact P(bucket k) for `rows` bounces: Binomial(rows, 1/2). */
export function plinkoBucketProbabilities(rows: PlinkoRows): number[] {
  const out: number[] = [];
  for (let k = 0; k <= rows; k++) {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (rows - i)) / (i + 1);
    out.push(c / 2 ** rows);
  }
  return out;
}

export function plinkoExactRtp(risk: PlinkoRisk, rows: PlinkoRows): number {
  const probs = plinkoBucketProbabilities(rows);
  const table = PLINKO_TABLES[risk][rows];
  return table.reduce((sum, m, k) => sum + m * probs[k], 0);
}

// ===========================================================================
// KENO — pick numbers, 10 are drawn from 40
// ===========================================================================

export const KENO_POOL = 40;
export const KENO_DRAWN = 10;
export const KENO_MAX_PICKS = 10;

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Exact hypergeometric P(exactly `hits` of your `picks` are drawn). */
export function kenoHitProbability(picks: number, hits: number): number {
  return (
    (choose(picks, hits) * choose(KENO_POOL - picks, KENO_DRAWN - hits)) / choose(KENO_POOL, KENO_DRAWN)
  );
}

/** Hits below this pay nothing, which is what makes the top end worth chasing. */
export function kenoMinPayingHits(picks: number): number {
  if (picks <= 2) return picks;
  if (picks <= 6) return picks - 1;
  return picks - 2;
}

/**
 * The paytable is derived, not hand-written. Pays rise geometrically from the
 * minimum paying hit count, then the whole row is scaled so the exact
 * hypergeometric expectation lands on TARGET_RTP. Rounding to 4dp is applied
 * after scaling, and `kenoExactRtp` re-derives the return from those rounded
 * numbers so the published figure is the one that is actually paid.
 */
export function kenoPaytable(picks: number): number[] {
  const min = kenoMinPayingHits(picks);
  const shape = Array.from({ length: picks + 1 }, (_, h) => (h < min ? 0 : 4 ** (h - min)));
  const raw = shape.reduce((sum, w, h) => sum + w * kenoHitProbability(picks, h), 0);
  const scale = TARGET_RTP / raw;
  return shape.map((w) => (w === 0 ? 0 : roundMultiplier(w * scale)));
}

export function kenoExactRtp(picks: number): number {
  const table = kenoPaytable(picks);
  return table.reduce((sum, m, h) => sum + m * kenoHitProbability(picks, h), 0);
}

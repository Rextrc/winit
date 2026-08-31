/**
 * CANDY CASCADE — cluster pays with tumbling wins
 * ===========================================================================
 * A 7x7 grid where adjacent groups of 5+ matching candies pay, the winners
 * vanish, everything above falls to fill the gaps, and fresh candies drop in
 * from the top — repeating until nothing new lines up. Each drop in one spin
 * raises a shared multiplier, and during the free-spins feature that
 * multiplier keeps climbing across the whole round instead of resetting.
 *
 * There is no wild here — clusters are pure same-symbol groups, which is what
 * keeps "which cells does this cluster actually cover" unambiguous.
 *
 * WHY THIS RTP IS SIMULATED, NOT EXACT
 * ---------------------------------------------------------------------------
 * Every other game in WinIt publishes a closed-form RTP because its outcome
 * space is small enough to enumerate or reduce to a known distribution (a
 * 5-reel payline is 9^5 tuples; a Binomial bucket count; a hypergeometric
 * draw). A 49-cell grid that RE-DRAWS itself after every match, arbitrarily
 * many times in a row, has no such reduction — the outcome space is
 * effectively unbounded and there is no known closed form for it. This is why
 * every real cluster-pays slot in the industry publishes a *simulated* RTP
 * (typically billions of rounds), not an enumerated one, and WinIt does the
 * same: `npm run rtp` runs millions of full rounds through `playRound()` (the
 * exact function the API calls) and reports the measured return with a
 * confidence interval, rather than pretending to a precision the maths
 * doesn't support.
 * ===========================================================================
 */

export const COLS = 7;
export const ROWS = 7;
export const MIN_CLUSTER = 5;

export const SYMBOLS = ["STAR", "GEM", "HEX", "HEART", "BEAR", "CANDY", "LOLLI"] as const;
export type Sym = (typeof SYMBOLS)[number];

/** Symbols that can form a paying cluster. Scatters (LOLLI) never cluster. */
export const PAYING_SYMBOLS = ["STAR", "GEM", "HEX", "HEART", "BEAR", "CANDY"] as const;
export type PaySym = (typeof PAYING_SYMBOLS)[number];

export const LOW_TIER: PaySym[] = ["STAR", "GEM", "HEX", "HEART"];
export const HIGH_TIER: PaySym[] = ["BEAR", "CANDY"];

/** One shared pool for the initial grid and every refill after a tumble. */
export const SYMBOL_WEIGHTS: Record<Sym, number> = {
  STAR: 24,
  GEM: 22,
  HEX: 20,
  HEART: 18,
  BEAR: 8,
  CANDY: 5,
  LOLLI: 3,
};

export const STRIP_LENGTH = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0); // 106

export const SYMBOL_STRIP: Sym[] = SYMBOLS.flatMap((s) =>
  Array.from({ length: SYMBOL_WEIGHTS[s] }, () => s),
);

export const SYMBOL_NAMES: Record<Sym, string> = {
  STAR: "Star Candy",
  GEM: "Gem Drop",
  HEX: "Honey Hex",
  HEART: "Heart Candy",
  BEAR: "Gummy Bear",
  CANDY: "Rainbow Swirl",
  LOLLI: "Lollipop",
};

/** Cluster size bands: 5-6, 7-9, 10-13, 14-19, 20+. */
export const TIER_FLOORS = [5, 7, 10, 14, 20] as const;

export function tierIndex(size: number): number {
  let idx = 0;
  for (let i = 0; i < TIER_FLOORS.length; i++) if (size >= TIER_FLOORS[i]) idx = i;
  return idx;
}

/** Pay per cluster, as a fraction of the total bet, indexed by tier. */
export const CLUSTER_PAYS: Record<PaySym, [number, number, number, number, number]> = {
  STAR: [0.001068, 0.002136, 0.004263, 0.01067, 0.032318],
  GEM: [0.001294, 0.00267, 0.00533, 0.012932, 0.037168],
  HEX: [0.00162, 0.003231, 0.006462, 0.016163, 0.042662],
  HEART: [0.002136, 0.004263, 0.008534, 0.021331, 0.053332],
  BEAR: [0.004263, 0.008534, 0.017068, 0.042662, 0.127994],
  CANDY: [0.008534, 0.017068, 0.034128, 0.085332, 0.266649],
};

/** Anywhere-pay for landing scatters, as a fraction of the total bet. */
export const SCATTER_PAYS: Record<number, number> = { 4: 0.018, 5: 0.045, 6: 0.135, 7: 0.36 };

/** Free spins awarded by scatter count at trigger. */
export const FREE_SPINS_AWARD: Record<number, number> = { 4: 10, 5: 12, 6: 15, 7: 20 };

/** Extra scatters needed DURING the bonus, in one spin, to add more spins. */
export const RETRIGGER_SCATTERS = 3;
export const RETRIGGER_SPINS = 5;

export const BUY_FEATURE_SPINS = 10;
/** Determined by simulation (see the header note) and fixed here as a constant. */
export const BUY_FEATURE_PRICE_MULTIPLIER = 11;

/**
 * The multiplier applied to a cascade's pay, indexed by how many cascades
 * have already resolved in the current spin (0 = the very first evaluation).
 * A deliberately original ladder — not any specific published game's trail.
 */
export const MULTIPLIER_TRAIL = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100] as const;

export function trailMultiplier(index: number): number {
  return MULTIPLIER_TRAIL[Math.min(index, MULTIPLIER_TRAIL.length - 1)];
}

/** Safety caps — reached only with astronomically unlikely luck. */
export const MAX_CASCADES_PER_SPIN = 40;
export const MAX_BONUS_SPINS = 80;

export type Grid = Sym[][]; // grid[col][row], row 0 = top

export type Cluster = { symbol: PaySym; cells: [number, number][]; size: number };

export function countScatters(grid: Grid): number {
  let n = 0;
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) if (grid[c][r] === "LOLLI") n += 1;
  return n;
}

/** Flood-fills same-symbol orthogonal groups. Pure — no randomness. */
export function findClusters(grid: Grid): Cluster[] {
  const visited: boolean[][] = Array.from({ length: COLS }, () => Array(ROWS).fill(false));
  const clusters: Cluster[] = [];

  for (let c0 = 0; c0 < COLS; c0++) {
    for (let r0 = 0; r0 < ROWS; r0++) {
      if (visited[c0][r0]) continue;
      const sym = grid[c0][r0];
      visited[c0][r0] = true;
      if (!(PAYING_SYMBOLS as readonly string[]).includes(sym)) continue;

      const cells: [number, number][] = [[c0, r0]];
      const stack: [number, number][] = [[c0, r0]];
      while (stack.length > 0) {
        const [c, r] = stack.pop()!;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          if (visited[nc][nr]) continue;
          if (grid[nc][nr] !== sym) continue;
          visited[nc][nr] = true;
          cells.push([nc, nr]);
          stack.push([nc, nr]);
        }
      }

      if (cells.length >= MIN_CLUSTER) clusters.push({ symbol: sym as PaySym, cells, size: cells.length });
    }
  }

  return clusters;
}

/** Total cluster pay for one cascade, in cents, before the trail multiplier. */
export function clusterPayCents(clusters: Cluster[], betCents: number): number {
  let total = 0;
  for (const cl of clusters) {
    const frac = CLUSTER_PAYS[cl.symbol][tierIndex(cl.size)];
    total += Math.round(frac * betCents);
  }
  return total;
}

export function scatterPayCents(scatterCount: number, betCents: number): number {
  const capped = Math.min(scatterCount, 7);
  const frac = SCATTER_PAYS[capped] ?? (capped >= 4 ? SCATTER_PAYS[7] : 0);
  return capped >= 4 ? Math.round(frac * betCents) : 0;
}

export function freeSpinsAward(scatterCount: number): number {
  const capped = Math.min(scatterCount, 7);
  return FREE_SPINS_AWARD[capped] ?? (capped >= 4 ? FREE_SPINS_AWARD[7] : 0);
}

// ---------------------------------------------------------------------------
// Round shape shared with the client
// ---------------------------------------------------------------------------

export type CascadeStep = {
  /** The grid as it stood when this cascade was evaluated. */
  grid: Grid;
  clusters: Cluster[];
  /** This step's cluster pay, after the trail multiplier. */
  payCents: number;
  multiplier: number;
  /** Set once, on the step that ends a spin (no more clusters to clear). */
  final: boolean;
};

export type SpinBlock = {
  kind: "BASE" | "BONUS";
  /** 1-based index within the bonus round; 0 for the base spin. */
  index: number;
  steps: CascadeStep[];
  scatterCount: number;
  scatterPayCents: number;
  awardedSpins: number;
  spinsRemaining: number;
};

export type CandyMode = "SPIN" | "BUY_FEATURE";

export type CandyRound = {
  mode: CandyMode;
  chargeCents: number;
  betCents: number;
  blocks: SpinBlock[];
  bonusTriggered: boolean;
  payoutCents: number;
  outcome: "WIN" | "LOSS";
  summary: string;
  roundMultiplier: number;
};

export function paytableRows(): { symbol: PaySym; tier: "low" | "high"; pays: number[] }[] {
  return PAYING_SYMBOLS.map((s) => ({
    symbol: s,
    tier: (LOW_TIER as string[]).includes(s) ? "low" : "high",
    pays: CLUSTER_PAYS[s],
  }));
}

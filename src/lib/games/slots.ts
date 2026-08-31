/**
 * WINIT SLOTS — "VOLT REELS"
 * ===========================================================================
 * 5 reels x 3 rows, 10 fixed paylines, wilds, scatters, a free-spins round
 * that retriggers, and two bonus buys.
 *
 * HOW THE MATHS STAYS EXACT
 * ---------------------------------------------------------------------------
 * Every one of the 15 visible cells is drawn independently from its own reel's
 * virtual strip with crypto.randomInt. That independence is what keeps the RTP
 * closed-form rather than a simulation guess:
 *
 *   - A payline takes exactly one cell from each reel, so a line outcome is
 *     five independent draws. A line's pay depends only on the five SYMBOL
 *     CLASSES, so enumerating 9^5 = 59,049 class tuples (weighted by their
 *     exact probabilities) gives the true expected line pay. Not sampled.
 *
 *   - All ten lines have the same distribution, and the total stake is ten
 *     line bets, so the line RTP per unit staked is just that expected line
 *     multiplier.
 *
 *   - Scatters pay on COUNT anywhere in the grid. With independent cells the
 *     count is a sum of five Binomial(3, q) reels, computed exactly by
 *     convolution.
 *
 *   - Free spins retrigger, so the expected number of free spins is a
 *     geometric series N / (1 - e) where e is the expected extra spins per
 *     free spin. Exact, as long as e < 1 (it is ~0.10).
 *
 * `exactRtp()` therefore returns the true return-to-player, and `npm run rtp`
 * checks it against millions of simulated rounds. Nothing adapts to your
 * balance, your history, or how long you have been losing.
 * ===========================================================================
 */

export const SYMBOLS = [
  "WILD",
  "SCATTER",
  "SEVEN",
  "DIAMOND",
  "BELL",
  "BAR",
  "CHERRY",
  "LEMON",
  "CLOVER",
] as const;
export type Sym = (typeof SYMBOLS)[number];

/** Symbols that can start and extend a payline win. */
export const PAYING_SYMBOLS = ["SEVEN", "DIAMOND", "BELL", "BAR", "CHERRY", "LEMON", "CLOVER"] as const;
export type PaySym = (typeof PAYING_SYMBOLS)[number];

export const REELS = 5;
export const ROWS = 3;
export const LINE_COUNT = 10;

/** Row index touched on each reel, left to right. */
export const PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 2],
];

/**
 * Virtual reel strips, 50 stops each. Wilds live on the middle three reels
 * only, which is what makes a line's leading symbol always a real symbol and
 * removes any "which symbol does an all-wild line pay as" ambiguity.
 */
export const REEL_WEIGHTS: Record<Sym, number>[] = [
  { WILD: 0, SCATTER: 2, SEVEN: 2, DIAMOND: 3, BELL: 4, BAR: 6, CHERRY: 8, LEMON: 11, CLOVER: 14 },
  { WILD: 3, SCATTER: 2, SEVEN: 2, DIAMOND: 3, BELL: 4, BAR: 6, CHERRY: 7, LEMON: 10, CLOVER: 13 },
  { WILD: 4, SCATTER: 2, SEVEN: 2, DIAMOND: 3, BELL: 4, BAR: 5, CHERRY: 7, LEMON: 10, CLOVER: 13 },
  { WILD: 3, SCATTER: 2, SEVEN: 2, DIAMOND: 3, BELL: 4, BAR: 6, CHERRY: 7, LEMON: 10, CLOVER: 13 },
  { WILD: 0, SCATTER: 2, SEVEN: 2, DIAMOND: 3, BELL: 4, BAR: 6, CHERRY: 8, LEMON: 11, CLOVER: 14 },
];

export const STRIP_LENGTHS = REEL_WEIGHTS.map((w) =>
  SYMBOLS.reduce((sum, s) => sum + w[s], 0),
);

/** Expanded strips, one entry per virtual stop, used by the actual draw. */
export const REEL_STRIPS: Sym[][] = REEL_WEIGHTS.map((w) =>
  SYMBOLS.flatMap((s) => Array.from({ length: w[s] }, () => s)),
);

/** Line pays as a multiple of the LINE bet, indexed by match length 3/4/5. */
export const LINE_PAYS: Record<PaySym, { 3: number; 4: number; 5: number }> = {
  SEVEN: { 3: 40, 4: 250, 5: 1500 },
  DIAMOND: { 3: 25, 4: 100, 5: 550 },
  BELL: { 3: 15, 4: 55, 5: 250 },
  BAR: { 3: 10, 4: 32, 5: 145 },
  CHERRY: { 3: 6, 4: 20, 5: 80 },
  LEMON: { 3: 3, 4: 12, 5: 45 },
  CLOVER: { 3: 3, 4: 9, 5: 30 },
};

/** Scatter pays as a multiple of the TOTAL bet, indexed by scatter count. */
export const SCATTER_PAYS: Record<number, number> = { 3: 2, 4: 10, 5: 50 };

/** Free spins awarded for 3 / 4 / 5+ scatters. */
export const SCATTER_SPINS: Record<number, number> = { 3: 10, 4: 15, 5: 20 };

/** Extra spins granted when 3+ scatters land during the free-spins round. */
export const RETRIGGER_SPINS = 5;

export const FREE_SPIN_MULTIPLIER = 2;
export const SUPER_SPIN_MULTIPLIER = 3;
export const SUPER_SPIN_COUNT = 20;

/**
 * A free-spins round is a geometric series, so it terminates with probability
 * 1 but has no hard bound. This cap exists purely so a request can never hang;
 * reaching it has probability well under 1 in 10^400.
 */
export const MAX_FREE_SPINS_PER_ROUND = 500;

export const SYMBOL_GLYPHS: Record<Sym, string> = {
  WILD: "W",
  SCATTER: "★",
  SEVEN: "7",
  DIAMOND: "◆",
  BELL: "▲",
  BAR: "▬",
  CHERRY: "●",
  LEMON: "◐",
  CLOVER: "✦",
};

export const SYMBOL_NAMES: Record<Sym, string> = {
  WILD: "Wild",
  SCATTER: "Scatter",
  SEVEN: "Seven",
  DIAMOND: "Diamond",
  BELL: "Bell",
  BAR: "Bar",
  CHERRY: "Cherry",
  LEMON: "Lemon",
  CLOVER: "Clover",
};

// ---------------------------------------------------------------------------
// Stake handling
// ---------------------------------------------------------------------------

/**
 * The stake is split across ten paylines, so it is quantised down to a whole
 * number of line bets. This is what keeps every payout an exact integer of
 * cents — there is no rounding step anywhere in the payout path.
 */
export function quantiseStake(betCents: number): { stakeCents: number; lineBetCents: number } {
  const lineBetCents = Math.floor(betCents / LINE_COUNT);
  return { stakeCents: lineBetCents * LINE_COUNT, lineBetCents };
}

// ---------------------------------------------------------------------------
// Evaluation (pure — no randomness, directly testable)
// ---------------------------------------------------------------------------

export type LineWin = {
  /** Index into PAYLINES. */
  line: number;
  symbol: PaySym;
  count: 3 | 4 | 5;
  /** Multiple of the line bet. */
  multiplier: number;
  payCents: number;
  /** [reel, row] cells that formed the win, for highlighting. */
  cells: [number, number][];
};

/** Grid is indexed [reel][row]. */
export type Grid = Sym[][];

/**
 * Evaluates one payline. Wilds substitute for any paying symbol; the run must
 * start on reel 1 and be unbroken. Returns null when the line does not pay.
 */
export function evaluateLine(symbols: readonly Sym[], line: number, lineBetCents: number): LineWin | null {
  const lead = symbols[0];
  if (lead === "SCATTER" || lead === "WILD") return null;

  const sym = lead as PaySym;
  let count = 1;
  for (let r = 1; r < REELS; r++) {
    if (symbols[r] === sym || symbols[r] === "WILD") count += 1;
    else break;
  }
  if (count < 3) return null;

  const n = count as 3 | 4 | 5;
  const multiplier = LINE_PAYS[sym][n];
  return {
    line,
    symbol: sym,
    count: n,
    multiplier,
    payCents: multiplier * lineBetCents,
    cells: Array.from({ length: n }, (_, r) => [r, PAYLINES[line][r]] as [number, number]),
  };
}

export function countScatters(grid: Grid): number {
  let n = 0;
  for (let r = 0; r < REELS; r++) for (let row = 0; row < ROWS; row++) if (grid[r][row] === "SCATTER") n += 1;
  return n;
}

export function scatterPayMultiplier(count: number): number {
  if (count < 3) return 0;
  return SCATTER_PAYS[Math.min(count, 5)];
}

export function scatterSpinAward(count: number): number {
  if (count < 3) return 0;
  return SCATTER_SPINS[Math.min(count, 5)];
}

export type SpinView = {
  kind: "BASE" | "FREE";
  grid: Grid;
  lineWins: LineWin[];
  scatterCount: number;
  scatterCells: [number, number][];
  scatterPayCents: number;
  /** Global multiplier in force for this spin (1 in the base game). */
  multiplier: number;
  /** Total paid by this spin, after the global multiplier. */
  payCents: number;
  /** Free spins awarded by this spin (trigger or retrigger). */
  awardedSpins: number;
  /** 1-based index within the free-spins round, 0 for the base spin. */
  index: number;
  spinsRemaining: number;
};

/** Evaluates one already-drawn grid. Pure. */
export function evaluateGrid(
  grid: Grid,
  lineBetCents: number,
  stakeCents: number,
  multiplier: number,
): Omit<SpinView, "kind" | "index" | "spinsRemaining" | "awardedSpins"> {
  const lineWins: LineWin[] = [];
  for (let l = 0; l < LINE_COUNT; l++) {
    const symbols = PAYLINES[l].map((row, reel) => grid[reel][row]);
    const win = evaluateLine(symbols, l, lineBetCents);
    if (win) lineWins.push({ ...win, payCents: win.payCents * multiplier });
  }

  const scatterCells: [number, number][] = [];
  for (let r = 0; r < REELS; r++)
    for (let row = 0; row < ROWS; row++)
      if (grid[r][row] === "SCATTER") scatterCells.push([r, row]);

  const scatterCount = scatterCells.length;
  const scatterPayCents = scatterPayMultiplier(scatterCount) * stakeCents * multiplier;
  const payCents = lineWins.reduce((s, w) => s + w.payCents, 0) + scatterPayCents;

  return { grid, lineWins, scatterCount, scatterCells, scatterPayCents, multiplier, payCents };
}

// ---------------------------------------------------------------------------
// Round shape (shared with the client)
// ---------------------------------------------------------------------------

export type SlotsMode = "SPIN" | "BUY_FREE" | "BUY_SUPER";

export type SlotsRound = {
  mode: SlotsMode;
  /** What the player is actually charged (stake, or the bonus-buy price). */
  chargeCents: number;
  /** The per-spin stake the pays are computed against. */
  stakeCents: number;
  lineBetCents: number;
  spins: SpinView[];
  freeSpinsPlayed: number;
  freeSpinMultiplier: number;
  payoutCents: number;
  outcome: "WIN" | "LOSS";
  summary: string;
  /** payout / charge, for the "xN" headline. */
  roundMultiplier: number;
};

// ===========================================================================
// EXACT MATHS
// ===========================================================================

/** Per-cell symbol probabilities for one reel. */
export function symbolProbs(reel: number): Record<Sym, number> {
  const w = REEL_WEIGHTS[reel];
  const n = STRIP_LENGTHS[reel];
  return Object.fromEntries(SYMBOLS.map((s) => [s, w[s] / n])) as Record<Sym, number>;
}

/**
 * Exact expected pay of ONE payline, in units of the line bet, by enumerating
 * all 9^5 = 59,049 symbol-class tuples weighted by their true probabilities.
 * A line's pay depends only on the classes, so this is exhaustive, not sampled.
 */
export function exactLineMultiplier(): number {
  const probs = [0, 1, 2, 3, 4].map(symbolProbs);
  let expected = 0;

  const walk = (reel: number, prob: number, symbols: Sym[]) => {
    if (prob === 0) return;
    if (reel === REELS) {
      const win = evaluateLine(symbols, 0, 1);
      if (win) expected += prob * win.multiplier;
      return;
    }
    for (const s of SYMBOLS) {
      const p = probs[reel][s];
      if (p > 0) walk(reel + 1, prob * p, [...symbols, s]);
    }
  };

  walk(0, 1, []);
  return expected;
}

/**
 * Exact distribution of the scatter count over the whole grid. Each reel
 * contributes Binomial(3, q_reel); the reels are convolved together.
 */
export function scatterCountDistribution(): number[] {
  let dist = [1];
  for (let r = 0; r < REELS; r++) {
    const q = symbolProbs(r).SCATTER;
    const reelDist = [0, 1, 2, 3].map(
      (k) => binomial(ROWS, k) * q ** k * (1 - q) ** (ROWS - k),
    );
    const next = new Array(dist.length + ROWS).fill(0);
    for (let i = 0; i < dist.length; i++)
      for (let k = 0; k <= ROWS; k++) next[i + k] += dist[i] * reelDist[k];
    dist = next;
  }
  return dist;
}

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

export type SpinMaths = {
  /** Expected line pay per unit staked. */
  lineRtp: number;
  /** Expected scatter pay per unit staked. */
  scatterRtp: number;
  /** lineRtp + scatterRtp — one spin's return, before any free spins. */
  spinRtp: number;
  /** P(3+ scatters) — the trigger / retrigger rate. */
  triggerProbability: number;
  /** Expected free spins awarded by one spin (used for the retrigger series). */
  expectedAward: number;
};

export function spinMaths(): SpinMaths {
  const dist = scatterCountDistribution();
  let scatterRtp = 0;
  let triggerProbability = 0;
  let expectedAward = 0;

  for (let n = 3; n < dist.length; n++) {
    scatterRtp += dist[n] * scatterPayMultiplier(n);
    triggerProbability += dist[n];
    expectedAward += dist[n] * scatterSpinAward(n);
  }

  const lineRtp = exactLineMultiplier();
  return {
    lineRtp,
    scatterRtp,
    spinRtp: lineRtp + scatterRtp,
    triggerProbability,
    expectedAward,
  };
}

/**
 * Expected total free spins played from an award of `initial`, accounting for
 * retriggers. Each free spin independently awards RETRIGGER_SPINS extra spins
 * with probability p, so the expected total is the geometric series
 * initial / (1 - RETRIGGER_SPINS * p).
 */
export function expectedFreeSpins(initial: number, m: SpinMaths = spinMaths()): number {
  const e = RETRIGGER_SPINS * m.triggerProbability;
  if (e >= 1) throw new Error("Retrigger rate is not convergent — the paytable is broken.");
  return initial / (1 - e);
}

/** Exact RTP of one free-spins round at `multiplier`, per unit STAKED. */
export function exactFreeRoundRtp(initialSpins: number, multiplier: number): number {
  const m = spinMaths();
  return expectedFreeSpins(initialSpins, m) * m.spinRtp * multiplier;
}

/** Exact RTP of the base game, including the free spins it triggers. */
export function exactRtp(): number {
  const m = spinMaths();
  const dist = scatterCountDistribution();

  let freeContribution = 0;
  for (let n = 3; n < dist.length; n++) {
    const award = scatterSpinAward(n);
    if (award === 0) continue;
    freeContribution += dist[n] * exactFreeRoundRtp(award, FREE_SPIN_MULTIPLIER);
  }

  return m.spinRtp + freeContribution;
}

// ---------------------------------------------------------------------------
// Bonus buys
// ---------------------------------------------------------------------------

export type BonusBuy = {
  key: "BUY_FREE" | "BUY_SUPER";
  label: string;
  blurb: string;
  spins: number;
  multiplier: number;
  /** Price as a whole multiple of the stake. */
  priceMultiplier: number;
  /** The buy's own exact RTP at that price. */
  rtp: number;
};

/**
 * Bonus buys are priced from their own exact expected value, divided by the
 * base game's RTP, then rounded to a whole multiple of the stake. That makes a
 * buy neither a trap nor a shortcut to an edge: it returns essentially the same
 * percentage as spinning normally. The residual difference from rounding the
 * price to an integer is published on the buy, not hidden.
 */
function priceBuy(key: BonusBuy["key"], label: string, blurb: string, spins: number, multiplier: number): BonusBuy {
  const ev = exactFreeRoundRtp(spins, multiplier);
  const priceMultiplier = Math.round(ev / exactRtp());
  return { key, label, blurb, spins, multiplier, priceMultiplier, rtp: ev / priceMultiplier };
}

export const BUY_FREE: BonusBuy = priceBuy(
  "BUY_FREE",
  "Free Spins",
  `${SCATTER_SPINS[3]} spins at ×${FREE_SPIN_MULTIPLIER}, retriggers included.`,
  SCATTER_SPINS[3],
  FREE_SPIN_MULTIPLIER,
);

export const BUY_SUPER: BonusBuy = priceBuy(
  "BUY_SUPER",
  "Super Free Spins",
  `${SUPER_SPIN_COUNT} spins at ×${SUPER_SPIN_MULTIPLIER}, retriggers included.`,
  SUPER_SPIN_COUNT,
  SUPER_SPIN_MULTIPLIER,
);

export const BONUS_BUYS: BonusBuy[] = [BUY_FREE, BUY_SUPER];

export function buyFor(mode: SlotsMode): BonusBuy | null {
  if (mode === "BUY_FREE") return BUY_FREE;
  if (mode === "BUY_SUPER") return BUY_SUPER;
  return null;
}

/** What a round in this mode will cost, given a stake. */
export function chargeForMode(mode: SlotsMode, stakeCents: number): number {
  const buy = buyFor(mode);
  return buy ? buy.priceMultiplier * stakeCents : stakeCents;
}

// ---------------------------------------------------------------------------
// Paytable for the UI
// ---------------------------------------------------------------------------

export type PaytableRow = { symbol: PaySym; pays: { count: 3 | 4 | 5; multiplier: number }[] };

export function paytableRows(): PaytableRow[] {
  return PAYING_SYMBOLS.map((s) => ({
    symbol: s,
    pays: ([5, 4, 3] as const).map((c) => ({ count: c, multiplier: LINE_PAYS[s][c] })),
  }));
}

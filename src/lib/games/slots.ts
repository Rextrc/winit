import { randomInt } from "@/lib/rng";

/**
 * WINIT SLOTS — "Volt Reels"
 * -------------------------------------------------------------------------
 * 3 reels, 1 payline, 3 identical weighted reel strips.
 *
 * Every reel stop is drawn independently from the same 48-slot virtual strip
 * using crypto.randomInt, so the outcome distribution below is exact — not an
 * approximation, and not tuned by a hidden "must-hit" mechanic.
 *
 * RTP is therefore closed-form and is asserted by `computeExactRtp()` (see
 * `npm run rtp`, which also Monte-Carlos it). Current paytable: 94.98%.
 * -------------------------------------------------------------------------
 */

export const SYMBOLS = ["SEVEN", "DIAMOND", "BELL", "BAR", "CHERRY", "LEMON", "CLOVER"] as const;
export type Symbol = (typeof SYMBOLS)[number];

/** Slots occupied on each 48-position virtual reel strip. */
export const REEL_WEIGHTS: Record<Symbol, number> = {
  SEVEN: 1,
  DIAMOND: 2,
  BELL: 4,
  BAR: 6,
  CHERRY: 8,
  LEMON: 12,
  CLOVER: 15,
};

export const STRIP_LENGTH = Object.values(REEL_WEIGHTS).reduce((a, b) => a + b, 0); // 48

/** Payout multiplier (× bet) for three of a kind on the payline. */
export const THREE_OF_A_KIND: Record<Symbol, number> = {
  SEVEN: 2500,
  DIAMOND: 450,
  BELL: 150,
  BAR: 54,
  CHERRY: 25,
  LEMON: 10,
  CLOVER: 5,
};

/** Consolation pay for landing exactly two cherries anywhere on the line. */
export const TWO_CHERRY_PAY = 4;

export const SYMBOL_GLYPHS: Record<Symbol, string> = {
  SEVEN: "7",
  DIAMOND: "◆",
  BELL: "▲",
  BAR: "▬",
  CHERRY: "●",
  LEMON: "◐",
  CLOVER: "✦",
};

/** The expanded strip: 48 entries, one per virtual stop. */
export const REEL_STRIP: Symbol[] = SYMBOLS.flatMap((s) =>
  Array.from({ length: REEL_WEIGHTS[s] }, () => s),
);

export type SlotsResult = {
  reels: [Symbol, Symbol, Symbol];
  /** Payout multiplier applied to the bet (0 on a loss). */
  multiplier: number;
  payoutCents: number;
  outcome: "WIN" | "LOSS";
  /** Human-readable line, e.g. "BAR · BAR · BAR ×54". */
  summary: string;
  /** Which reel indexes formed the win, for highlighting in the UI. */
  winningIndexes: number[];
};

/** Pure paytable evaluation — no randomness, so it is directly testable. */
export function evaluateLine(reels: readonly Symbol[]): {
  multiplier: number;
  winningIndexes: number[];
  label: string;
} {
  const [a, b, c] = reels;

  if (a === b && b === c) {
    return {
      multiplier: THREE_OF_A_KIND[a],
      winningIndexes: [0, 1, 2],
      label: `${a} · ${a} · ${a}`,
    };
  }

  const cherryIndexes = reels.flatMap((s, i) => (s === "CHERRY" ? [i] : []));
  if (cherryIndexes.length === 2) {
    return { multiplier: TWO_CHERRY_PAY, winningIndexes: cherryIndexes, label: "Two cherries" };
  }

  return { multiplier: 0, winningIndexes: [], label: `${a} · ${b} · ${c}` };
}

export function spin(betCents: number): SlotsResult {
  const reels = [0, 1, 2].map(() => REEL_STRIP[randomInt(STRIP_LENGTH)]) as [Symbol, Symbol, Symbol];
  const { multiplier, winningIndexes, label } = evaluateLine(reels);

  // Integer maths only: the multipliers are whole numbers so this is exact.
  const payoutCents = multiplier * betCents;

  return {
    reels,
    multiplier,
    payoutCents,
    outcome: payoutCents > 0 ? "WIN" : "LOSS",
    summary: multiplier > 0 ? `${label} ×${multiplier}` : `${label} — no pay`,
    winningIndexes,
  };
}

/**
 * Exhaustively enumerates all 48³ = 110,592 equally-likely reel combinations
 * and returns the exact return-to-player as a fraction of the bet.
 */
export function computeExactRtp(): number {
  let payouts = 0;
  const n = REEL_STRIP.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        payouts += evaluateLine([REEL_STRIP[i], REEL_STRIP[j], REEL_STRIP[k]]).multiplier;
      }
    }
  }
  return payouts / n ** 3;
}

export type PaytableRow = {
  key: string;
  label: string;
  name: string;
  multiplier: number;
  probability: number;
};

/**
 * Exact variance of the payout multiplier per unit staked. Used by the RTP
 * harness to size its tolerance from the real standard error rather than a
 * guessed percentage — this paytable is dominated by a 1-in-110,592 jackpot,
 * so a naive ±1% band on a million spins is barely one standard deviation.
 */
export function computeExactVariance(): number {
  let sumSquares = 0;
  const n = REEL_STRIP.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      for (let k = 0; k < n; k++) {
        const m = evaluateLine([REEL_STRIP[i], REEL_STRIP[j], REEL_STRIP[k]]).multiplier;
        sumSquares += m * m;
      }
    }
  }
  const mean = computeExactRtp();
  return sumSquares / n ** 3 - mean * mean;
}

/** Paytable rows for the UI, richest first, with exact hit probabilities. */
export function paytableRows(): PaytableRow[] {
  const total = STRIP_LENGTH ** 3;
  const rows: PaytableRow[] = SYMBOLS.map((s) => {
    const combos = REEL_WEIGHTS[s] ** 3;
    return {
      key: s,
      label: `${SYMBOL_GLYPHS[s]} ${SYMBOL_GLYPHS[s]} ${SYMBOL_GLYPHS[s]}`,
      name: s,
      multiplier: THREE_OF_A_KIND[s],
      probability: combos / total,
    };
  });

  const cherryW = REEL_WEIGHTS.CHERRY;
  const twoCherryCombos = 3 * cherryW ** 2 * (STRIP_LENGTH - cherryW);
  rows.push({
    key: "TWO_CHERRY",
    label: `${SYMBOL_GLYPHS.CHERRY} ${SYMBOL_GLYPHS.CHERRY} —`,
    name: "ANY TWO CHERRIES",
    multiplier: TWO_CHERRY_PAY,
    probability: twoCherryCombos / total,
  });

  return rows.sort((a, b) => b.multiplier - a.multiplier);
}

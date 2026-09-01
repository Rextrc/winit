import { randomInt } from "@/lib/rng";
import { TARGET_RTP, roundMultiplier } from "@/lib/games/originals";

/**
 * WINIT TOWERS — climb a floor at a time, cash out whenever
 * ---------------------------------------------------------------------------
 * Every floor has the same shape: `cols` tiles, of which `safe` are safe. Pick
 * a safe one and you climb; pick wrong and the run ends with nothing.
 *
 * The price of standing on floor r is derived, never tabulated:
 *
 *     P(survive r floors) = (safe / cols)^r
 *     multiplier(r)       = TARGET_RTP / P(survive r floors)
 *
 * That makes cashing out on ANY floor worth exactly TARGET_RTP, which is what
 * lets the cash-out button be genuinely free of a "right" answer. Because the
 * price is recomputed from the true remaining probability at every step, the
 * return stays exactly TARGET_RTP under any stopping rule at all — including
 * one that reacts to how the climb has gone so far.
 * ---------------------------------------------------------------------------
 */

export type Difficulty = "easy" | "medium" | "hard";

export type Shape = { cols: number; safe: number; floors: number };

export const SHAPES: Record<Difficulty, Shape> = {
  easy: { cols: 4, safe: 3, floors: 9 },
  medium: { cols: 3, safe: 2, floors: 9 },
  hard: { cols: 3, safe: 1, floors: 9 },
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy — 3 of 4 safe",
  medium: "Medium — 2 of 3 safe",
  hard: "Hard — 1 of 3 safe",
};

export function isDifficulty(value: string): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

/** P(a single floor is survived). */
export function floorChance(difficulty: Difficulty): number {
  const { cols, safe } = SHAPES[difficulty];
  return safe / cols;
}

/** P(the first `floors` floors are all survived). */
export function survivalProbability(difficulty: Difficulty, floors: number): number {
  return floorChance(difficulty) ** floors;
}

/** The fair price of standing on floor `floors`. Floor 0 is always 1x. */
export function multiplierAt(difficulty: Difficulty, floors: number): number {
  if (floors <= 0) return 1;
  return roundMultiplier(TARGET_RTP / survivalProbability(difficulty, floors));
}

/** Exact RTP of cashing out on floor `floors` — TARGET_RTP at every one. */
export function exactRtpAt(difficulty: Difficulty, floors: number): number {
  return survivalProbability(difficulty, floors) * multiplierAt(difficulty, floors);
}

export type TowersState = {
  betCents: number;
  difficulty: Difficulty;
  /** Which column is safe on each floor. Never sent to the client while live. */
  safeTiles: number[][];
  /** The column picked on each floor climbed so far. */
  picks: number[];
  status: "CLIMBING" | "CASHED_OUT" | "FELL";
};

export type TowersView = {
  status: TowersState["status"];
  betCents: number;
  difficulty: Difficulty;
  shape: Shape;
  picks: number[];
  floorsClimbed: number;
  currentMultiplier: number;
  nextMultiplier: number | null;
  /** Revealed only once the run is over. */
  safeTiles: number[][] | null;
};

export function newRound(betCents: number, difficulty: Difficulty): TowersState {
  const { cols, safe, floors } = SHAPES[difficulty];

  const safeTiles: number[][] = [];
  for (let f = 0; f < floors; f++) {
    // Partial Fisher-Yates: pick `safe` distinct columns without building the
    // full permutation.
    const pool = Array.from({ length: cols }, (_, i) => i);
    for (let i = 0; i < safe; i++) {
      const j = i + randomInt(cols - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    safeTiles.push(pool.slice(0, safe).sort((a, b) => a - b));
  }

  return { betCents, difficulty, safeTiles, picks: [], status: "CLIMBING" };
}

export function toView(state: TowersState): TowersView {
  const shape = SHAPES[state.difficulty];
  const climbed = state.status === "FELL" ? state.picks.length - 1 : state.picks.length;
  const over = state.status !== "CLIMBING";

  return {
    status: state.status,
    betCents: state.betCents,
    difficulty: state.difficulty,
    shape,
    picks: state.picks,
    floorsClimbed: Math.max(0, climbed),
    currentMultiplier: multiplierAt(state.difficulty, Math.max(0, climbed)),
    nextMultiplier:
      climbed >= shape.floors ? null : multiplierAt(state.difficulty, Math.max(0, climbed) + 1),
    safeTiles: over ? state.safeTiles : null,
  };
}

export function isSafe(state: TowersState, floor: number, column: number): boolean {
  return state.safeTiles[floor].includes(column);
}

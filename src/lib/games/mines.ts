import { randomInt } from "@/lib/rng";

/**
 * WINIT MINES — press-your-luck on a hidden grid
 * ===========================================================================
 * A 5×5 grid hides `minesCount` mines among 25 cells, placed uniformly at
 * random and unknown to the player. Reveal cells one at a time; hit a mine
 * and the round ends with nothing; reveal a safe cell and the payout for
 * cashing out right now goes up. Cash out any time.
 *
 * THE EXACT MATHS
 * ---------------------------------------------------------------------------
 * Because mines are placed uniformly at random and independently of the
 * order cells get revealed in, the event "the first r reveals are all safe"
 * has the same probability as "r uniformly random cells are all safe":
 *
 *     P(first r reveals safe) = C(N-K, r) / C(N, r)
 *
 * where N = 25 cells and K = minesCount. Paying exactly
 *
 *     multiplier(r) = TARGET_RTP / P(first r reveals safe)
 *
 * on cashing out after r safe reveals makes the return exactly TARGET_RTP
 * for that decision — and by the same optional-stopping argument used for
 * Limbo, that holds whichever r a player decides to stop at, including a
 * decision made reactively while watching cells flip. There is no
 * cumulative-probability shortcut being taken here: each multiplier is
 * computed fresh from the exact hypergeometric survival probability, not
 * estimated or approximated.
 * ===========================================================================
 */

export const GRID_SIZE = 25;
export const MIN_MINES = 1;
export const MAX_MINES = 24;

const TARGET_RTP = 0.99;

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Roundtrips through 4dp so the displayed number is the number that pays. */
function roundMultiplier(m: number): number {
  return Math.round(m * 10_000) / 10_000;
}

/** P(the first `r` reveals are all safe), given `mines` mines on the grid. */
export function survivalProbability(mines: number, r: number): number {
  if (r < 0 || r > GRID_SIZE - mines) return 0;
  return choose(GRID_SIZE - mines, r) / choose(GRID_SIZE, r);
}

/** Fair cash-out multiplier after `r` safe reveals with `mines` mines live. */
export function multiplierAt(mines: number, r: number): number {
  if (r === 0) return 1;
  const p = survivalProbability(mines, r);
  if (p <= 0) return 0;
  return roundMultiplier(TARGET_RTP / p);
}

export function validMinesCount(mines: number): boolean {
  return Number.isInteger(mines) && mines >= MIN_MINES && mines <= MAX_MINES;
}

export type MinesState = {
  mines: number;
  minePositions: number[]; // secret — never sent to the client until reveal/loss
  revealed: number[];
  betCents: number;
  status: "ACTIVE" | "WON" | "LOST" | "CASHED_OUT";
};

/** Places `count` mines uniformly at random among the 25 cells. */
export function placeMines(count: number): number[] {
  const positions = Array.from({ length: GRID_SIZE }, (_, i) => i);
  // Fisher-Yates, but we only need the first `count` — a partial shuffle.
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(GRID_SIZE - i);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions.slice(0, count).sort((a, b) => a - b);
}

export function newRound(betCents: number, mines: number): MinesState {
  return { mines, minePositions: placeMines(mines), revealed: [], betCents, status: "ACTIVE" };
}

/** The client-safe view: never leaks mine positions while the round is live. */
export type MinesView = {
  mines: number;
  revealed: number[];
  betCents: number;
  status: MinesState["status"];
  currentMultiplier: number;
  nextMultiplier: number | null;
  /** Only present once the round is over (loss or cash-out). */
  minePositions?: number[];
};

export function toView(state: MinesState): MinesView {
  const r = state.revealed.length;
  const safeLeft = GRID_SIZE - state.mines - r;
  return {
    mines: state.mines,
    revealed: state.revealed,
    betCents: state.betCents,
    status: state.status,
    currentMultiplier: multiplierAt(state.mines, r),
    nextMultiplier: safeLeft > 0 ? multiplierAt(state.mines, r + 1) : null,
    ...(state.status !== "ACTIVE" ? { minePositions: state.minePositions } : {}),
  };
}

export function maxSafeReveals(mines: number): number {
  return GRID_SIZE - mines;
}

/** Exact RTP for cashing out after exactly `r` reveals — used by the harness. */
export function exactRtpAt(mines: number, r: number): number {
  return survivalProbability(mines, r) * multiplierAt(mines, r);
}

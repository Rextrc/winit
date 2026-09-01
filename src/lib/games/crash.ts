import { randomFloat } from "@/lib/rng";
import { TARGET_RTP, roundMultiplier } from "@/lib/games/originals";

/**
 * WINIT CRASH — ride the curve, get out before it breaks
 * ---------------------------------------------------------------------------
 * The crash point is drawn ONCE, when the round starts, and stored server-side
 * before the client is told anything. Nothing the browser does can move it.
 *
 * The draw is the same one Limbo uses: with u uniform on (0,1], the crash
 * point is TARGET_RTP / u, so P(crash point >= M) = TARGET_RTP / M. Cash out
 * at M and you are paid M for an event of probability TARGET_RTP / M — a
 * return of exactly TARGET_RTP at every multiplier on the curve. There is no
 * "safe" or "greedy" target; they are all priced identically.
 *
 * TWO WAYS TO PLAY, AND WHY BOTH ARE HONEST
 * ---------------------------------------------------------------------------
 * AUTO: you name your multiplier up front and the round is settled at once,
 * server-side, by comparing it to the drawn crash point. Reaction time cannot
 * enter into it, so the 99% is exact.
 *
 * MANUAL: you cash out live, and the multiplier is computed from the SERVER's
 * own clock (`startedAt`), never from a number the client sends. This is
 * honest but not exactly 99% for you personally: your reaction time and the
 * network round trip can only ever land you at a lower multiplier than the one
 * you were aiming at, never a higher one. Auto is the mode with no such drag.
 * ---------------------------------------------------------------------------
 */

/** The curve doubles every four seconds. */
export const DOUBLE_EVERY_MS = 4_000;
export const MIN_TARGET = 1.01;
export const MAX_TARGET = 10_000;
/** Nothing above this is reachable, and no target can be set above it either. */
export const CRASH_CAP = 1_000_000;

/** Draws the crash point. Identical in distribution to a Limbo result. */
export function drawCrashPoint(): number {
  const u = randomFloat() || Number.MIN_VALUE;
  return Math.min(CRASH_CAP, Math.max(1, roundMultiplier(TARGET_RTP / u)));
}

/** Where the curve has reached after `elapsedMs`. */
export function multiplierAt(elapsedMs: number): number {
  if (elapsedMs <= 0) return 1;
  return 2 ** (elapsedMs / DOUBLE_EVERY_MS);
}

/** When the curve reaches `multiplier`, in ms from the start. */
export function timeToReach(multiplier: number): number {
  return DOUBLE_EVERY_MS * Math.log2(Math.max(1, multiplier));
}

/**
 * The multiplier a live cash-out is paid at. Floored to 2dp so a cash-out can
 * never be rounded UP past the curve the player actually reached.
 */
export function cashoutMultiplier(elapsedMs: number): number {
  return Math.floor(multiplierAt(elapsedMs) * 100) / 100;
}

export function validTarget(target: number): boolean {
  return Number.isFinite(target) && target >= MIN_TARGET && target <= MAX_TARGET;
}

/** P(the curve reaches `target`) — the whole model in one line. */
export function chanceOfReaching(target: number): number {
  return Math.min(1, TARGET_RTP / target);
}

/** Exact RTP for an auto cash-out at `target`. */
export function exactRtp(target: number): number {
  return chanceOfReaching(target) * roundMultiplier(target);
}

export type CrashState = {
  betCents: number;
  crashPoint: number;
  /** Server clock, ms since epoch. The only clock that counts. */
  startedAt: number;
  /** Set when the player pre-committed to a multiplier. */
  autoTarget: number | null;
  status: "RUNNING" | "CASHED_OUT" | "BUSTED";
  cashedAt: number | null;
};

/** What the client is allowed to see while the round is still running. */
export type CrashView = {
  status: CrashState["status"];
  betCents: number;
  startedAt: number;
  autoTarget: number | null;
  cashedAt: number | null;
  /** Revealed only once the round is over — never while it is live. */
  crashPoint: number | null;
};

export function newRound(betCents: number, autoTarget: number | null): CrashState {
  return {
    betCents,
    crashPoint: drawCrashPoint(),
    startedAt: Date.now(),
    autoTarget,
    status: "RUNNING",
    cashedAt: null,
  };
}

export function toView(state: CrashState): CrashView {
  const over = state.status !== "RUNNING";
  return {
    status: state.status,
    betCents: state.betCents,
    startedAt: state.startedAt,
    autoTarget: state.autoTarget,
    cashedAt: state.cashedAt,
    crashPoint: over ? state.crashPoint : null,
  };
}

/** True once the curve has passed the drawn crash point. */
export function hasBusted(state: CrashState, now = Date.now()): boolean {
  return multiplierAt(now - state.startedAt) >= state.crashPoint;
}

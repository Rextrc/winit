import { randomBytes, randomInt as nodeRandomInt } from "crypto";

/**
 * Every random value in WinIt comes from Node's `crypto` CSPRNG.
 * `Math.random` is never used for any game outcome — see `npm run rtp`
 * for the Monte-Carlo harness that verifies the payout maths.
 */

/** Uniform integer in [0, maxExclusive). Rejection-sampled, so no modulo bias. */
export function randomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`randomInt: maxExclusive must be a positive integer`);
  }
  if (maxExclusive === 1) return 0;
  return nodeRandomInt(0, maxExclusive);
}

/** Uniform integer in [min, maxInclusive]. */
export function randomRange(min: number, maxInclusive: number): number {
  return min + randomInt(maxInclusive - min + 1);
}

/** Uniform float in [0, 1) built from 48 bits of crypto entropy. */
export function randomFloat(): number {
  const b = randomBytes(6);
  const value = b.readUIntBE(0, 6);
  return value / 2 ** 48;
}

/** Picks one element of `items` using the parallel `weights` array. */
export function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
  if (items.length !== weights.length || items.length === 0) {
    throw new Error("weightedPick: items and weights must be non-empty and same length");
  }
  let total = 0;
  for (const w of weights) {
    if (!Number.isInteger(w) || w < 0) throw new Error("weightedPick: weights must be non-negative integers");
    total += w;
  }
  if (total === 0) throw new Error("weightedPick: total weight is zero");

  let roll = randomInt(total);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  /* istanbul ignore next — unreachable, the loop above always returns */
  return items[items.length - 1];
}

/** In-place Fisher-Yates using crypto entropy. Returns the same array. */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/** Opaque per-round id used to tag results in the bet feed. */
export function roundId(): string {
  return randomBytes(8).toString("hex");
}

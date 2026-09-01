import { randomRange } from "@/lib/rng";
import { TARGET_RTP, fairMultiplier, roundMultiplier } from "@/lib/games/originals";

/**
 * WINIT SIC BO — three dice, one throw
 * ---------------------------------------------------------------------------
 * Every bet on this table is priced from the true probability of the outcome
 * it pays for, taken from a full enumeration of all 6^3 = 216 equally likely
 * throws. There is no hand-written paytable: `fairMultiplier(p)` turns each
 * enumerated probability into its own fair price, so every win/lose bet here
 * returns exactly TARGET_RTP by construction.
 *
 * The one bet that is not a simple win/lose — betting a single face, which
 * pays more the more times it shows — uses a derived table instead: a fixed
 * shape scaled so its exact expectation lands on TARGET_RTP, the same
 * technique Keno uses. `exactRtp()` recomputes the return from the ROUNDED
 * multipliers, so the number published is the number actually paid.
 * ---------------------------------------------------------------------------
 */

export const DICE = 3;
export const FACES = 6;
export const OUTCOMES = FACES ** DICE; // 216

export type Throw = [number, number, number];

export type SicBoBet =
  /** Total 4-10, losing on any triple. */
  | { type: "small" }
  /** Total 11-17, losing on any triple. */
  | { type: "big" }
  /** Any three-of-a-kind. */
  | { type: "anyTriple" }
  /** One specific three-of-a-kind. */
  | { type: "triple"; face: number }
  /** An exact total, 4 through 17. */
  | { type: "total"; total: number }
  /** A face, paying more the more of the three dice show it. */
  | { type: "single"; face: number };

export type SicBoBetType = SicBoBet["type"];

export function isTriple(t: Throw): boolean {
  return t[0] === t[1] && t[1] === t[2];
}

export function total(t: Throw): number {
  return t[0] + t[1] + t[2];
}

/** How many of the three dice show `face`. */
export function faceCount(t: Throw, face: number): number {
  return t.filter((d) => d === face).length;
}

/** Every one of the 216 throws, in order. */
export function allThrows(): Throw[] {
  const out: Throw[] = [];
  for (let a = 1; a <= FACES; a++) {
    for (let b = 1; b <= FACES; b++) {
      for (let c = 1; c <= FACES; c++) out.push([a, b, c]);
    }
  }
  return out;
}

/** True when a simple win/lose bet is paid by this throw. */
export function betWins(bet: SicBoBet, t: Throw): boolean {
  switch (bet.type) {
    case "small":
      return !isTriple(t) && total(t) >= 4 && total(t) <= 10;
    case "big":
      return !isTriple(t) && total(t) >= 11 && total(t) <= 17;
    case "anyTriple":
      return isTriple(t);
    case "triple":
      return isTriple(t) && t[0] === bet.face;
    case "total":
      return total(t) === bet.total;
    case "single":
      return faceCount(t, bet.face) > 0;
  }
}

/** Exact probability of a simple win/lose bet, by enumeration. */
export function probability(bet: SicBoBet): number {
  let wins = 0;
  for (const t of allThrows()) if (betWins(bet, t)) wins++;
  return wins / OUTCOMES;
}

/**
 * The single-face table: a face showing k times pays the k-th entry. The shape
 * rises linearly with k and is then scaled so the exact expectation is
 * TARGET_RTP; index 0 never pays.
 */
export function singleFaceTable(): number[] {
  const probs = [0, 1, 2, 3].map((k) => singleFaceProbability(k));
  const shape = [0, 1, 2, 3];
  const raw = shape.reduce((sum, w, k) => sum + w * probs[k], 0);
  const scale = TARGET_RTP / raw;
  return shape.map((w) => (w === 0 ? 0 : roundMultiplier(w * scale)));
}

/** Exact P(a given face shows exactly k times) — Binomial(3, 1/6). */
export function singleFaceProbability(k: number): number {
  const choose = [1, 3, 3, 1][k];
  return (choose * 5 ** (DICE - k)) / OUTCOMES;
}

/** What a bet pays, stake included, per unit staked. */
export function multiplierFor(bet: SicBoBet, t: Throw): number {
  if (bet.type === "single") {
    const k = faceCount(t, bet.face);
    return singleFaceTable()[k];
  }
  return betWins(bet, t) ? fairMultiplier(probability(bet)) : 0;
}

/** The quoted price of a bet before the throw — 0 for the variable single. */
export function quotedMultiplier(bet: SicBoBet): number {
  if (bet.type === "single") return singleFaceTable()[1];
  return fairMultiplier(probability(bet));
}

/** Exact RTP for one bet, recomputed from the rounded multipliers paid. */
export function exactRtp(bet: SicBoBet): number {
  if (bet.type === "single") {
    const table = singleFaceTable();
    return table.reduce((sum, m, k) => sum + m * singleFaceProbability(k), 0);
  }
  return probability(bet) * fairMultiplier(probability(bet));
}

export function validBet(bet: SicBoBet): boolean {
  switch (bet.type) {
    case "small":
    case "big":
    case "anyTriple":
      return true;
    case "triple":
    case "single":
      return Number.isInteger(bet.face) && bet.face >= 1 && bet.face <= FACES;
    case "total":
      return Number.isInteger(bet.total) && bet.total >= 4 && bet.total <= 17;
    default:
      return false;
  }
}

export function labelFor(bet: SicBoBet): string {
  switch (bet.type) {
    case "small":
      return "Small (4-10)";
    case "big":
      return "Big (11-17)";
    case "anyTriple":
      return "Any triple";
    case "triple":
      return `Triple ${bet.face}`;
    case "total":
      return `Total ${bet.total}`;
    case "single":
      return `Face ${bet.face}`;
  }
}

/** One throw of three dice from the CSPRNG. */
export function roll(): Throw {
  return [randomRange(1, FACES), randomRange(1, FACES), randomRange(1, FACES)];
}

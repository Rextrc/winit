import { randomInt } from "@/lib/rng";

/**
 * WINIT ROULETTE — "European Roulette"
 * -------------------------------------------------------------------------
 * European layout: 37 pockets (0 plus 1–36), single zero, no "en prison" and
 * no "la partage". The winning pocket is one crypto.randomInt(37) draw.
 *
 * Every payout below is the mathematically true odds for a 36-number wheel,
 * which is what creates the house edge and nothing else does:
 *
 *   RTP = 36/37 = 97.297...%  (house edge 2.703%) on EVERY bet type.
 *
 * e.g. a straight-up bet wins 1/37 of the time and pays 35:1 (36 back),
 *      so EV = 36/37. A red bet wins 18/37 and pays 1:1 (2 back) = 36/37.
 * There is no bet on this table with a worse — or better — edge.
 * -------------------------------------------------------------------------
 */

export const POCKETS = 37;

export const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

export type Color = "red" | "black" | "green";

export function colorOf(n: number): Color {
  if (n === 0) return "green";
  return RED_NUMBERS.has(n) ? "red" : "black";
}

export type BetType =
  | "straight"
  | "street"
  | "corner"
  | "red"
  | "black"
  | "odd"
  | "even"
  | "low"
  | "high"
  | "dozen1"
  | "dozen2"
  | "dozen3"
  | "col1"
  | "col2"
  | "col3";

export type RouletteBet = {
  type: BetType;
  /**
   * The reference number a bet needs beyond its type: the number itself for
   * `straight`, or the top-left anchor of the block for `street` / `corner`
   * (see `streetNumbers` / `cornerNumbers`).
   */
  number?: number;
  amountCents: number;
};

/** A street covers one full row of 3: {anchor, anchor+1, anchor+2}. */
export function streetNumbers(anchor: number): number[] {
  return [anchor, anchor + 1, anchor + 2];
}

/** A corner covers a 2x2 block: {anchor, anchor+1, anchor+3, anchor+4}. */
export function cornerNumbers(anchor: number): number[] {
  return [anchor, anchor + 1, anchor + 3, anchor + 4];
}

/** Valid street anchors are a row's first number: 1, 4, 7, ..., 34. */
export function validStreetAnchor(anchor: number): boolean {
  return Number.isInteger(anchor) && anchor >= 1 && anchor <= 34 && anchor % 3 === 1;
}

/**
 * Valid corner anchors are the top-left of a 2x2 block: any number in
 * column 1 or 2 (not 3, which has no column to its right) with a row below
 * it (so not 34-36, the last row).
 */
export function validCornerAnchor(anchor: number): boolean {
  return Number.isInteger(anchor) && anchor >= 1 && anchor <= 32 && anchor % 3 !== 0;
}

type Spec = {
  /** Pocket numbers this bet covers. */
  covers: (n: number) => boolean;
  /** "x to 1" payout — true odds for the coverage size. */
  oddsToOne: number;
  label: string;
};

const SPECS: Record<Exclude<BetType, "straight" | "street" | "corner">, Spec> = {
  red: { covers: (n) => colorOf(n) === "red", oddsToOne: 1, label: "Red" },
  black: { covers: (n) => colorOf(n) === "black", oddsToOne: 1, label: "Black" },
  odd: { covers: (n) => n !== 0 && n % 2 === 1, oddsToOne: 1, label: "Odd" },
  even: { covers: (n) => n !== 0 && n % 2 === 0, oddsToOne: 1, label: "Even" },
  low: { covers: (n) => n >= 1 && n <= 18, oddsToOne: 1, label: "1–18" },
  high: { covers: (n) => n >= 19 && n <= 36, oddsToOne: 1, label: "19–36" },
  dozen1: { covers: (n) => n >= 1 && n <= 12, oddsToOne: 2, label: "1st 12" },
  dozen2: { covers: (n) => n >= 13 && n <= 24, oddsToOne: 2, label: "2nd 12" },
  dozen3: { covers: (n) => n >= 25 && n <= 36, oddsToOne: 2, label: "3rd 12" },
  col1: { covers: (n) => n !== 0 && n % 3 === 1, oddsToOne: 2, label: "Column 1" },
  col2: { covers: (n) => n !== 0 && n % 3 === 2, oddsToOne: 2, label: "Column 2" },
  col3: { covers: (n) => n !== 0 && n % 3 === 0, oddsToOne: 2, label: "Column 3" },
};

export function betLabel(bet: RouletteBet): string {
  if (bet.type === "straight") return `Straight ${bet.number}`;
  if (bet.type === "street") return `Street ${bet.number}-${(bet.number ?? 0) + 2}`;
  if (bet.type === "corner") return `Corner ${bet.number}`;
  return SPECS[bet.type].label;
}

export function betOdds(bet: RouletteBet): number {
  if (bet.type === "straight") return 35;
  if (bet.type === "street") return 11;
  if (bet.type === "corner") return 8;
  return SPECS[bet.type].oddsToOne;
}

export function betCovers(bet: RouletteBet, pocket: number): boolean {
  if (bet.type === "straight") return bet.number === pocket;
  if (bet.type === "street") return bet.number !== undefined && streetNumbers(bet.number).includes(pocket);
  if (bet.type === "corner") return bet.number !== undefined && cornerNumbers(bet.number).includes(pocket);
  return SPECS[bet.type].covers(pocket);
}

/** How many of the 37 pockets a bet covers — used for the odds display. */
export function coverageCount(type: BetType): number {
  if (type === "straight") return 1;
  if (type === "street") return 3;
  if (type === "corner") return 4;
  let c = 0;
  for (let n = 0; n < POCKETS; n++) if (SPECS[type].covers(n)) c++;
  return c;
}

export type SettledBet = {
  type: BetType;
  number?: number;
  label: string;
  amountCents: number;
  won: boolean;
  /** Stake + winnings on a win, 0 on a loss. */
  returnedCents: number;
};

export type RouletteResult = {
  pocket: number;
  color: Color;
  bets: SettledBet[];
  totalStakeCents: number;
  payoutCents: number;
  outcome: "WIN" | "LOSS" | "PUSH";
  summary: string;
};

export function spin(bets: RouletteBet[]): RouletteResult {
  const pocket = randomInt(POCKETS);

  let payoutCents = 0;
  let totalStakeCents = 0;

  const settled: SettledBet[] = bets.map((bet) => {
    totalStakeCents += bet.amountCents;
    const won = betCovers(bet, pocket);
    // True odds: winnings = stake × odds, and the stake itself comes back.
    const returnedCents = won ? bet.amountCents * (betOdds(bet) + 1) : 0;
    payoutCents += returnedCents;
    return {
      type: bet.type,
      number: bet.number,
      label: betLabel(bet),
      amountCents: bet.amountCents,
      won,
      returnedCents,
    };
  });

  const outcome = payoutCents > totalStakeCents ? "WIN" : payoutCents === totalStakeCents ? "PUSH" : "LOSS";
  const winners = settled.filter((b) => b.won).map((b) => b.label);

  return {
    pocket,
    color: colorOf(pocket),
    bets: settled,
    totalStakeCents,
    payoutCents,
    outcome,
    summary:
      `${pocket} ${colorOf(pocket)}` + (winners.length ? ` — hit ${winners.join(", ")}` : " — no hits"),
  };
}

/** Exact RTP for any single bet type: 36/37 on a single-zero wheel. */
export function exactRtp(type: BetType): number {
  const covers = coverageCount(type);
  const odds = type === "straight" ? 35 : type === "street" ? 11 : type === "corner" ? 8 : SPECS[type].oddsToOne;
  return (covers * (odds + 1)) / POCKETS;
}

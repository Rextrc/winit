import { shuffle } from "@/lib/rng";
import { TARGET_RTP, roundMultiplier } from "@/lib/games/originals";

/**
 * WINIT THREE CARD — Pair Plus
 * ---------------------------------------------------------------------------
 * One three-card hand, paid on its own merit. There are only C(52,3) = 22,100
 * distinct hands, so nothing here is estimated: `handCounts()` enumerates the
 * entire space at startup and every probability below comes from that count.
 *
 * The paytable is derived rather than written down. A fixed shape gives the
 * relative worth of each hand class, and the whole row is then scaled so the
 * exact expectation over the enumerated space lands on TARGET_RTP.
 * `exactRtp()` recomputes the return from the ROUNDED multipliers, so the
 * published figure is what the code actually pays.
 * ---------------------------------------------------------------------------
 */

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = { r: Rank; s: Suit };

export type HandClass =
  | "straightFlush"
  | "trips"
  | "straight"
  | "flush"
  | "pair"
  | "highCard";

export const HAND_LABELS: Record<HandClass, string> = {
  straightFlush: "Straight flush",
  trips: "Three of a kind",
  straight: "Straight",
  flush: "Flush",
  pair: "Pair",
  highCard: "High card",
};

/** Relative worth of each class, before scaling. High card never pays. */
const SHAPE: Record<HandClass, number> = {
  straightFlush: 40,
  trips: 30,
  straight: 6,
  flush: 4,
  pair: 1,
  highCard: 0,
};

export function rankValue(r: Rank): number {
  return RANKS.indexOf(r) + 2; // 2..14
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  return deck;
}

/** Classifies a three-card hand. A-2-3 counts as a straight, as does Q-K-A. */
export function classify(cards: Card[]): HandClass {
  const values = cards.map((c) => rankValue(c.r)).sort((a, b) => a - b);
  const suited = cards.every((c) => c.s === cards[0].s);

  const [a, b, c] = values;
  const trips = a === b && b === c;
  const pair = !trips && (a === b || b === c || a === c);

  // The wheel: ace low, 2, 3.
  const wheel = a === 2 && b === 3 && c === 14;
  const run = b === a + 1 && c === b + 1;
  const straight = wheel || run;

  if (straight && suited) return "straightFlush";
  if (trips) return "trips";
  if (straight) return "straight";
  if (suited) return "flush";
  if (pair) return "pair";
  return "highCard";
}

/** Exhaustive count of every three-card hand by class. Memoised. */
let counts: Record<HandClass, number> | null = null;
export function handCounts(): Record<HandClass, number> {
  if (counts) return counts;

  const deck = buildDeck();
  const tally: Record<HandClass, number> = {
    straightFlush: 0,
    trips: 0,
    straight: 0,
    flush: 0,
    pair: 0,
    highCard: 0,
  };

  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      for (let k = j + 1; k < deck.length; k++) {
        tally[classify([deck[i], deck[j], deck[k]])]++;
      }
    }
  }

  counts = tally;
  return tally;
}

export const TOTAL_HANDS = 22_100;

export function probabilityOf(hand: HandClass): number {
  return handCounts()[hand] / TOTAL_HANDS;
}

/** The derived paytable: SHAPE scaled so the exact expectation is TARGET_RTP. */
let table: Record<HandClass, number> | null = null;
export function paytable(): Record<HandClass, number> {
  if (table) return table;

  const classes = Object.keys(SHAPE) as HandClass[];
  const raw = classes.reduce((sum, h) => sum + SHAPE[h] * probabilityOf(h), 0);
  const scale = TARGET_RTP / raw;

  const out = {} as Record<HandClass, number>;
  for (const h of classes) out[h] = SHAPE[h] === 0 ? 0 : roundMultiplier(SHAPE[h] * scale);

  table = out;
  return out;
}

export function exactRtp(): number {
  const pays = paytable();
  return (Object.keys(pays) as HandClass[]).reduce((sum, h) => sum + pays[h] * probabilityOf(h), 0);
}

export type ThreeCardResult = {
  cards: Card[];
  hand: HandClass;
  multiplier: number;
  payoutCents: number;
};

export function deal(betCents: number): ThreeCardResult {
  const cards = shuffle(buildDeck()).slice(0, 3);
  const hand = classify(cards);
  const multiplier = paytable()[hand];

  return { cards, hand, multiplier, payoutCents: Math.round(betCents * multiplier) };
}

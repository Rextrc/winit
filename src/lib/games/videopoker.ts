import { shuffle } from "@/lib/rng";

/**
 * WINIT DRAW POKER — Jacks or Better
 * ---------------------------------------------------------------------------
 * Five cards, hold what you want, the rest are replaced from the SAME deck the
 * deal came out of. The deck is shuffled once when the hand starts and the
 * replacement cards are simply the next ones off it, so the draw respects
 * every card you have already seen — holding four hearts really does leave
 * nine hearts in 47 cards, not "about nine".
 *
 * WHY THIS GAME HAS NO SINGLE RTP
 * ---------------------------------------------------------------------------
 * Every other game in the app publishes one number because the player cannot
 * change the odds. Here they can: the return is a function of which cards you
 * hold, and a hand played badly and the same hand played well are genuinely
 * different bets. So rather than assert a figure, the RTP harness MEASURES the
 * return under one specific, documented reference strategy (`referenceHolds`
 * below) and publishes that with a confidence interval derived from the run's
 * own variance. Play better than the reference and you will beat it; play
 * worse and you will not.
 *
 * What IS exact here is `exactHoldValue()`: the expected return of any given
 * hold, computed by enumerating every possible draw from the remaining deck
 * rather than sampling it. The harness checks the paytable and the evaluator
 * against that.
 * ---------------------------------------------------------------------------
 */

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = { r: Rank; s: Suit };

export type HandClass =
  | "royalFlush"
  | "straightFlush"
  | "fourOfAKind"
  | "fullHouse"
  | "flush"
  | "straight"
  | "threeOfAKind"
  | "twoPair"
  | "jacksOrBetter"
  | "nothing";

export const HAND_LABELS: Record<HandClass, string> = {
  royalFlush: "Royal flush",
  straightFlush: "Straight flush",
  fourOfAKind: "Four of a kind",
  fullHouse: "Full house",
  flush: "Flush",
  straight: "Straight",
  threeOfAKind: "Three of a kind",
  twoPair: "Two pair",
  jacksOrBetter: "Jacks or better",
  nothing: "No pay",
};

/**
 * Total returned per unit staked, stake included. A pair of jacks returning 1
 * is your money back, which is why it reads as the bottom of the table rather
 * than as a win.
 */
export const PAYTABLE: Record<HandClass, number> = {
  royalFlush: 800,
  straightFlush: 50,
  fourOfAKind: 25,
  fullHouse: 9,
  flush: 6,
  straight: 4,
  threeOfAKind: 3,
  twoPair: 2,
  jacksOrBetter: 1,
  nothing: 0,
};

/** The order the paytable is displayed in, richest first. */
export const HAND_ORDER: HandClass[] = [
  "royalFlush",
  "straightFlush",
  "fourOfAKind",
  "fullHouse",
  "flush",
  "straight",
  "threeOfAKind",
  "twoPair",
  "jacksOrBetter",
];

export function rankValue(r: Rank): number {
  return RANKS.indexOf(r) + 2; // 2..14, ace high
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  return deck;
}

/** Classifies a five-card hand. */
export function evaluate(cards: Card[]): HandClass {
  const values = cards.map((c) => rankValue(c.r)).sort((a, b) => a - b);
  const flush = cards.every((c) => c.s === cards[0].s);

  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);

  const distinct = [...counts.keys()].sort((a, b) => a - b);
  const runOfFive = distinct.length === 5 && distinct[4] - distinct[0] === 4;
  // The wheel: A-2-3-4-5, with the ace playing low.
  const wheel = distinct.length === 5 && distinct.join(",") === "2,3,4,5,14";
  const straight = runOfFive || wheel;
  const royal = runOfFive && distinct[0] === 10;

  if (straight && flush) return royal ? "royalFlush" : "straightFlush";
  if (groups[0] === 4) return "fourOfAKind";
  if (groups[0] === 3 && groups[1] === 2) return "fullHouse";
  if (flush) return "flush";
  if (straight) return "straight";
  if (groups[0] === 3) return "threeOfAKind";
  if (groups[0] === 2 && groups[1] === 2) return "twoPair";

  if (groups[0] === 2) {
    // Only a pair of jacks or better pays.
    for (const [value, count] of counts) if (count === 2 && value >= 11) return "jacksOrBetter";
  }
  return "nothing";
}

export function payoutMultiplier(hand: HandClass): number {
  return PAYTABLE[hand];
}

// --- exact hold valuation -------------------------------------------------

/** Every k-subset of `items`, as index arrays. */
function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const current: T[] = [];

  const walk = (start: number) => {
    if (current.length === k) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]);
      walk(i + 1);
      current.pop();
    }
  };

  walk(0);
  return out;
}

/**
 * The exact expected return of holding `heldIndexes` from `hand`, given the
 * cards left in `remaining`. Enumerates every possible draw rather than
 * sampling, so this is a true expectation, not an estimate.
 */
export function exactHoldValue(hand: Card[], heldIndexes: number[], remaining: Card[]): number {
  const held = heldIndexes.map((i) => hand[i]);
  const need = 5 - held.length;
  if (need === 0) return payoutMultiplier(evaluate(held));

  const draws = combinations(remaining, need);
  let total = 0;
  for (const draw of draws) total += payoutMultiplier(evaluate([...held, ...draw]));
  return total / draws.length;
}

/**
 * The reference strategy the RTP harness measures. Deliberately simple and
 * readable rather than optimal — it is a yardstick, not advice, and the
 * published figure is what THIS produces.
 */
export function referenceHolds(hand: Card[]): number[] {
  const values = hand.map((c) => rankValue(c.r));
  const byValue = new Map<number, number[]>();
  hand.forEach((c, i) => {
    const v = rankValue(c.r);
    byValue.set(v, [...(byValue.get(v) ?? []), i]);
  });
  const bySuit = new Map<Suit, number[]>();
  hand.forEach((c, i) => bySuit.set(c.s, [...(bySuit.get(c.s) ?? []), i]));

  const made = evaluate(hand);
  // Anything already paying a premium stands pat.
  if (
    made === "royalFlush" ||
    made === "straightFlush" ||
    made === "fullHouse" ||
    made === "flush" ||
    made === "straight"
  ) {
    return [0, 1, 2, 3, 4];
  }

  // Four of a kind: keep the quad, draw one (the kicker cannot help, but the
  // hand is already paid and this keeps the rule simple).
  for (const [, idx] of byValue) if (idx.length === 4) return idx;
  if (made === "threeOfAKind") for (const [, idx] of byValue) if (idx.length === 3) return idx;

  if (made === "twoPair") {
    const pairs: number[] = [];
    for (const [, idx] of byValue) if (idx.length === 2) pairs.push(...idx);
    return pairs;
  }

  // Four to a flush beats holding a low pair.
  for (const [, idx] of bySuit) if (idx.length === 4) return idx;

  if (made === "jacksOrBetter") {
    for (const [value, idx] of byValue) if (idx.length === 2 && value >= 11) return idx;
  }

  // Any low pair.
  for (const [, idx] of byValue) if (idx.length === 2) return idx;

  // Otherwise keep high cards, or throw the lot.
  const highs = hand.map((_, i) => i).filter((i) => values[i] >= 11);
  return highs;
}

export type VideoPokerState = {
  betCents: number;
  /** The shuffled deck for this hand; replacements come off the top. */
  deck: Card[];
  hand: Card[];
  held: number[];
  phase: "DEAL" | "DONE";
  finalHand: Card[] | null;
  result: HandClass | null;
};

export type VideoPokerView = {
  phase: VideoPokerState["phase"];
  betCents: number;
  hand: Card[];
  held: number[];
  result: HandClass | null;
  multiplier: number | null;
};

export function newRound(betCents: number): VideoPokerState {
  const deck = shuffle(buildDeck());
  const hand = deck.slice(0, 5);
  return { betCents, deck, hand, held: [], phase: "DEAL", finalHand: null, result: null };
}

/** Replaces everything not held with the next cards off the same deck. */
export function drawTo(state: VideoPokerState, held: number[]): VideoPokerState {
  const kept = new Set(held);
  let next = 5;
  const finalHand = state.hand.map((card, i) => (kept.has(i) ? card : state.deck[next++]));
  const result = evaluate(finalHand);

  return { ...state, held, phase: "DONE", finalHand, result };
}

export function toView(state: VideoPokerState): VideoPokerView {
  return {
    phase: state.phase,
    betCents: state.betCents,
    hand: state.phase === "DONE" && state.finalHand ? state.finalHand : state.hand,
    held: state.held,
    result: state.result,
    multiplier: state.result ? payoutMultiplier(state.result) : null,
  };
}

/** The 47 cards that could still come, given the five already dealt. */
export function remainingAfterDeal(state: VideoPokerState): Card[] {
  return state.deck.slice(5);
}

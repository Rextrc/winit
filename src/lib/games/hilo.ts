import { shuffle } from "@/lib/rng";
import { RANKS, SUITS, type Card, type Rank } from "@/lib/games/blackjack";

/**
 * WINIT HI-LO — card climb
 * ===========================================================================
 * One 52-card deck, freshly shuffled every round. A card is revealed; guess
 * whether the next one is higher or lower. Guess right and a fair multiplier
 * is added to the pot; guess wrong (or tie — see below) and the round ends
 * with nothing. Cash out any time.
 *
 * Rank order is A (low) through K (high) — 13 ranks, A=1 ... K=13. A tie
 * (the next card matches the current rank exactly) counts as a loss for
 * both directions, the standard convention, so every round has exactly two
 * outcomes at each step: you were right, or you weren't.
 *
 * THE EXACT MATHS
 * ---------------------------------------------------------------------------
 * Because the deck is a real 52 cards drawn without replacement, the exact
 * number of ranks higher/lower/equal to the current card is known precisely
 * from what has already been dealt this round — no shortcuts, no assumed
 * distribution. At each step:
 *
 *     P(next is higher) = (cards left ranked higher) / (cards left)
 *     multiplier         = 0.99 / P(next is higher)     [or lower, symmetrically]
 *
 * paid only on a correct guess. That is exactly fair for that single
 * decision, and — by the same optional-stopping argument used for Limbo and
 * Mines — stays exactly fair through any sequence of guesses and any point
 * you choose to cash out, because each step's probability is recomputed
 * fresh from the deck's true remaining composition.
 * ===========================================================================
 */

const TARGET_RTP = 0.99;
export const RANK_VALUE: Record<Rank, number> = Object.fromEntries(RANKS.map((r, i) => [r, i + 1])) as Record<
  Rank,
  number
>;

function roundMultiplier(m: number): number {
  return Math.round(m * 10_000) / 10_000;
}

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  return shuffle(deck);
}

/** Counts of remaining cards ranked higher/equal/lower than `value`. */
export function remainingSplit(remaining: Card[], value: number): { higher: number; equal: number; lower: number } {
  let higher = 0;
  let equal = 0;
  let lower = 0;
  for (const c of remaining) {
    const v = RANK_VALUE[c.r];
    if (v > value) higher++;
    else if (v < value) lower++;
    else equal++;
  }
  return { higher, equal, lower };
}

export type Direction = "higher" | "lower";

/** Fair multiplier for guessing `direction`, given what's left in the deck. */
export function multiplierFor(remaining: Card[], value: number, direction: Direction): number {
  const { higher, lower } = remainingSplit(remaining, value);
  const favourable = direction === "higher" ? higher : lower;
  if (favourable <= 0 || remaining.length === 0) return 0;
  return roundMultiplier(TARGET_RTP / (favourable / remaining.length));
}

export function directionAvailable(remaining: Card[], value: number, direction: Direction): boolean {
  const { higher, lower } = remainingSplit(remaining, value);
  return (direction === "higher" ? higher : lower) > 0;
}

export type HiloState = {
  deck: Card[]; // remaining, undealt cards — secret
  current: Card;
  streakMultiplier: number; // cumulative product of each correct step's multiplier
  steps: number;
  betCents: number;
  status: "ACTIVE" | "WON_OUT" | "LOST" | "CASHED_OUT";
};

export function newRound(betCents: number): HiloState {
  const deck = buildDeck();
  const current = deck.shift()!;
  return { deck, current, streakMultiplier: 1, steps: 0, betCents, status: "ACTIVE" };
}

export type HiloView = {
  current: Card;
  streakMultiplier: number;
  steps: number;
  betCents: number;
  status: HiloState["status"];
  cardsLeft: number;
  higherMultiplier: number | null;
  lowerMultiplier: number | null;
  /** Only present once the round is over. */
  revealed?: Card;
};

export function toView(state: HiloState, revealed?: Card): HiloView {
  const value = RANK_VALUE[state.current.r];
  const higherOk = directionAvailable(state.deck, value, "higher");
  const lowerOk = directionAvailable(state.deck, value, "lower");
  return {
    current: state.current,
    streakMultiplier: state.streakMultiplier,
    steps: state.steps,
    betCents: state.betCents,
    status: state.status,
    cardsLeft: state.deck.length,
    higherMultiplier: higherOk ? multiplierFor(state.deck, value, "higher") : null,
    lowerMultiplier: lowerOk ? multiplierFor(state.deck, value, "lower") : null,
    ...(revealed ? { revealed } : {}),
  };
}

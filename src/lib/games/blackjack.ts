import { shuffle } from "@/lib/rng";

/**
 * WINIT BLACKJACK
 * -------------------------------------------------------------------------
 * House rules (all of them, in full):
 *   • 6 decks, freshly shuffled with crypto Fisher-Yates before EVERY hand,
 *     so card counting gives no edge and the odds are identical every round.
 *   • Dealer stands on all 17, including soft 17 (S17).
 *   • Blackjack pays 3:2 (winnings rounded down to the whole cent).
 *   • Double down allowed on any first two cards, one card only.
 *   • Split allowed once, on two cards of the same rank (max 2 hands).
 *     Split aces receive exactly one card each and cannot make blackjack.
 *   • No surrender, no insurance, no even money, no dealer peek bonus.
 *
 * Under these rules optimal (basic-strategy) play returns ~99.4% of stake,
 * i.e. a house edge of roughly 0.6%. Unlike slots and roulette the return is
 * player-dependent: bad decisions cost more, and the figure above is the
 * ceiling, not an average over all players.
 *
 * The shoe lives server-side in the Round row — the client is only ever sent
 * the cards it is entitled to see.
 * -------------------------------------------------------------------------
 */

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["S", "H", "D", "C"] as const;
export const DECK_COUNT = 6;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = { r: Rank; s: Suit };

export type Hand = {
  cards: Card[];
  betCents: number;
  doubled: boolean;
  fromSplit: boolean;
  stood: boolean;
  busted: boolean;
};

export type Phase = "PLAYER" | "DEALER" | "DONE";

export type HandOutcome = "WIN" | "LOSS" | "PUSH" | "BLACKJACK" | "BUST";

export type HandResult = {
  outcome: HandOutcome;
  /** Stake + winnings returned to the player for this hand. */
  returnedCents: number;
  total: number;
};

export type BlackjackState = {
  /** Server-only. Never leaves the API boundary. */
  shoe: Card[];
  dealer: Card[];
  hands: Hand[];
  active: number;
  phase: Phase;
  results: HandResult[] | null;
};

/** What the client is allowed to see. */
export type BlackjackView = {
  dealer: Card[];
  /** True while the dealer's second card is still face down. */
  dealerHoleHidden: boolean;
  dealerTotal: number;
  hands: {
    cards: Card[];
    betCents: number;
    total: number;
    soft: boolean;
    doubled: boolean;
    fromSplit: boolean;
    busted: boolean;
    stood: boolean;
    isBlackjack: boolean;
    result: HandResult | null;
  }[];
  active: number;
  phase: Phase;
  actions: Action[];
  totalStakeCents: number;
  payoutCents: number;
};

export type Action = "hit" | "stand" | "double" | "split";

export function buildShoe(): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < DECK_COUNT; d++) {
    for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
  }
  return shuffle(shoe);
}

export function cardValue(r: Rank): number {
  if (r === "A") return 11;
  if (r === "K" || r === "Q" || r === "J" || r === "10") return 10;
  return Number(r);
}

/** Best total <= 21 if possible, plus whether an ace is still counted as 11. */
export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.r);
    if (c.r === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isBlackjack(hand: Hand): boolean {
  return !hand.fromSplit && hand.cards.length === 2 && handTotal(hand.cards).total === 21;
}

function draw(state: BlackjackState): Card {
  const card = state.shoe.pop();
  if (!card) throw new Error("blackjack: shoe exhausted");
  return card;
}

function newHand(betCents: number, fromSplit = false): Hand {
  return { cards: [], betCents, doubled: false, fromSplit, stood: false, busted: false };
}

/** Deals a fresh hand. `betCents` has already been debited by the caller. */
export function deal(betCents: number): BlackjackState {
  const state: BlackjackState = {
    shoe: buildShoe(),
    dealer: [],
    hands: [newHand(betCents)],
    active: 0,
    phase: "PLAYER",
    results: null,
  };

  state.hands[0].cards.push(draw(state));
  state.dealer.push(draw(state));
  state.hands[0].cards.push(draw(state));
  state.dealer.push(draw(state));

  // Naturals end the hand immediately — no player decisions to make.
  const playerBJ = isBlackjack(state.hands[0]);
  const dealerBJ = handTotal(state.dealer).total === 21;
  if (playerBJ || dealerBJ) {
    state.hands[0].stood = true;
    return settle(state);
  }

  return state;
}

export function availableActions(state: BlackjackState): Action[] {
  if (state.phase !== "PLAYER") return [];
  const hand = state.hands[state.active];
  if (!hand || hand.stood || hand.busted) return [];

  const actions: Action[] = ["hit", "stand"];
  const isFirstTwo = hand.cards.length === 2;
  if (isFirstTwo) {
    actions.push("double");
    const canSplit =
      state.hands.length === 1 &&
      !hand.fromSplit &&
      hand.cards[0].r === hand.cards[1].r;
    if (canSplit) actions.push("split");
  }
  return actions;
}

/** Advances to the next unfinished hand, or hands over to the dealer. */
function advance(state: BlackjackState): BlackjackState {
  while (state.active < state.hands.length) {
    const hand = state.hands[state.active];
    if (!hand.stood && !hand.busted) return state;
    state.active++;
  }
  state.phase = "DEALER";
  return playDealer(state);
}

function playDealer(state: BlackjackState): BlackjackState {
  const allGone = state.hands.every((h) => h.busted);
  // The dealer only draws if a live hand can still be beaten.
  if (!allGone) {
    while (handTotal(state.dealer).total < 17) {
      state.dealer.push(draw(state));
    }
  }
  return settle(state);
}

function settle(state: BlackjackState): BlackjackState {
  const dealerTotal = handTotal(state.dealer).total;
  const dealerBJ = state.dealer.length === 2 && dealerTotal === 21;
  const dealerBust = dealerTotal > 21;

  state.results = state.hands.map((hand) => {
    const total = handTotal(hand.cards).total;
    const bet = hand.betCents;

    if (hand.busted || total > 21) return { outcome: "BUST" as const, returnedCents: 0, total };

    if (isBlackjack(hand)) {
      if (dealerBJ) return { outcome: "PUSH" as const, returnedCents: bet, total };
      // 3:2, winnings rounded down to the whole cent.
      return { outcome: "BLACKJACK" as const, returnedCents: bet + Math.floor((bet * 3) / 2), total };
    }

    if (dealerBJ) return { outcome: "LOSS" as const, returnedCents: 0, total };
    if (dealerBust || total > dealerTotal) return { outcome: "WIN" as const, returnedCents: bet * 2, total };
    if (total === dealerTotal) return { outcome: "PUSH" as const, returnedCents: bet, total };
    return { outcome: "LOSS" as const, returnedCents: 0, total };
  });

  state.phase = "DONE";
  state.active = -1;
  return state;
}

/**
 * Applies a player action. Returns the new state plus any ADDITIONAL stake the
 * caller must debit (double and split each place a second bet).
 */
export function applyAction(
  state: BlackjackState,
  action: Action,
): { state: BlackjackState; extraStakeCents: number } {
  if (state.phase !== "PLAYER") throw new Error("blackjack: hand is not awaiting a player action");
  if (!availableActions(state).includes(action)) throw new Error(`blackjack: ${action} is not allowed here`);

  const hand = state.hands[state.active];

  switch (action) {
    case "hit": {
      hand.cards.push(draw(state));
      if (handTotal(hand.cards).total > 21) hand.busted = true;
      return { state: advance(state), extraStakeCents: 0 };
    }
    case "stand": {
      hand.stood = true;
      return { state: advance(state), extraStakeCents: 0 };
    }
    case "double": {
      const extra = hand.betCents;
      hand.betCents += extra;
      hand.doubled = true;
      hand.cards.push(draw(state));
      if (handTotal(hand.cards).total > 21) hand.busted = true;
      hand.stood = true;
      return { state: advance(state), extraStakeCents: extra };
    }
    case "split": {
      const extra = hand.betCents;
      const second = newHand(extra, true);
      second.cards.push(hand.cards.pop()!);
      hand.fromSplit = true;
      state.hands.push(second);

      // One card to each new hand.
      hand.cards.push(draw(state));
      second.cards.push(draw(state));

      // Split aces get exactly one card and are then finished.
      if (hand.cards[0].r === "A") {
        hand.stood = true;
        second.stood = true;
      }
      return { state: advance(state), extraStakeCents: extra };
    }
  }
}

export function totalStake(state: BlackjackState): number {
  return state.hands.reduce((sum, h) => sum + h.betCents, 0);
}

export function totalPayout(state: BlackjackState): number {
  return (state.results ?? []).reduce((sum, r) => sum + r.returnedCents, 0);
}

export function toView(state: BlackjackState): BlackjackView {
  const hideHole = state.phase === "PLAYER";
  const dealerCards = hideHole ? state.dealer.slice(0, 1) : state.dealer;

  return {
    dealer: dealerCards,
    dealerHoleHidden: hideHole,
    dealerTotal: handTotal(dealerCards).total,
    hands: state.hands.map((hand, i) => {
      const { total, soft } = handTotal(hand.cards);
      return {
        cards: hand.cards,
        betCents: hand.betCents,
        total,
        soft,
        doubled: hand.doubled,
        fromSplit: hand.fromSplit,
        busted: hand.busted,
        stood: hand.stood,
        isBlackjack: isBlackjack(hand),
        result: state.results ? state.results[i] : null,
      };
    }),
    active: state.active,
    phase: state.phase,
    actions: availableActions(state),
    totalStakeCents: totalStake(state),
    payoutCents: totalPayout(state),
  };
}

export function resultSummary(state: BlackjackState): string {
  const dealerTotal = handTotal(state.dealer).total;
  const parts = (state.results ?? []).map((r, i) => {
    const tag = state.hands.length > 1 ? `H${i + 1} ` : "";
    if (r.outcome === "BLACKJACK") return `${tag}Blackjack!`;
    if (r.outcome === "BUST") return `${tag}Bust on ${r.total}`;
    if (r.outcome === "PUSH") return `${tag}Push on ${r.total}`;
    return `${tag}${r.total} vs ${dealerTotal > 21 ? "bust" : dealerTotal}`;
  });
  return parts.join(" · ");
}

export function overallOutcome(state: BlackjackState): "WIN" | "LOSS" | "PUSH" {
  const stake = totalStake(state);
  const payout = totalPayout(state);
  if (payout > stake) return "WIN";
  if (payout === stake) return "PUSH";
  return "LOSS";
}

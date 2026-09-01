import { randomInt } from "@/lib/rng";

/**
 * WINIT WAR — highest card wins, ties go to war
 * ---------------------------------------------------------------------------
 * The shoe is modelled as continuously shuffled: every card dealt is an
 * independent uniform draw over the thirteen ranks. That is a deliberate
 * modelling choice, not a shortcut — it means the exact return computed below
 * by enumerating the 13x13 grid of (player, dealer) ranks is EXACTLY the
 * return the dealing code produces, with no deck-depletion drift between the
 * published figure and the game.
 *
 * Rules, and where the edge actually comes from:
 *   - Higher card wins even money. Lower card loses.
 *   - On a tie you go to war: the stake is doubled, both draw again, and
 *     the player wins even money on the RAISE while the original stake
 *     pushes. A tie in the war itself also pays the raise.
 *
 * The edge is entirely in that last rule — you must risk a second unit to
 * settle a tie, but you can only ever win one unit back on it. Nothing else
 * on this table is priced against you, which is why the return lands near
 * 97% rather than the 99% the originals pay.
 * ---------------------------------------------------------------------------
 */

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export type Card = { r: Rank; s: Suit };

/** 0 for the deuce up to 12 for the ace. */
export function rankValue(card: Card): number {
  return RANKS.indexOf(card.r);
}

export function drawCard(): Card {
  return { r: RANKS[randomInt(RANKS.length)], s: SUITS[randomInt(SUITS.length)] };
}

export type WarOutcome = "WIN" | "LOSS" | "WAR_WIN" | "WAR_LOSS";

export type WarResult = {
  player: Card;
  dealer: Card;
  /** Present only when the first two cards tied. */
  war: { player: Card; dealer: Card } | null;
  outcome: WarOutcome;
  /** Total staked, including the raise on a war. */
  stakeCents: number;
  payoutCents: number;
};

/**
 * Plays one hand to completion. `betCents` is the opening stake; a war doubles
 * the amount at risk, which is why `stakeCents` is returned separately and is
 * what gets debited.
 */
export function play(betCents: number): WarResult {
  const player = drawCard();
  const dealer = drawCard();
  const pv = rankValue(player);
  const dv = rankValue(dealer);

  if (pv > dv) {
    return { player, dealer, war: null, outcome: "WIN", stakeCents: betCents, payoutCents: betCents * 2 };
  }
  if (pv < dv) {
    return { player, dealer, war: null, outcome: "LOSS", stakeCents: betCents, payoutCents: 0 };
  }

  // Tie: the stake doubles, and the raise is what can be won.
  const warPlayer = drawCard();
  const warDealer = drawCard();
  const wp = rankValue(warPlayer);
  const wd = rankValue(warDealer);
  const stakeCents = betCents * 2;

  // A tie in the war goes the player's way, which is the only concession here.
  if (wp >= wd) {
    // Original stake pushes, the raise pays even money: 3 units back on 2 staked.
    return {
      player,
      dealer,
      war: { player: warPlayer, dealer: warDealer },
      outcome: "WAR_WIN",
      stakeCents,
      payoutCents: betCents * 3,
    };
  }
  return {
    player,
    dealer,
    war: { player: warPlayer, dealer: warDealer },
    outcome: "WAR_LOSS",
    stakeCents,
    payoutCents: 0,
  };
}

/**
 * Exact return, by enumerating every (player, dealer) rank pair and, on the
 * ties, every war pair too. Returned as total expected payout over total
 * expected stake, because a war changes the amount staked — quoting payout
 * against the opening bet alone would overstate the return.
 */
export function exactRtp(): { rtp: number; expectedStake: number; expectedPayout: number } {
  const n = RANKS.length;
  const pairs = n * n;

  let expectedStake = 0;
  let expectedPayout = 0;

  for (let p = 0; p < n; p++) {
    for (let d = 0; d < n; d++) {
      const weight = 1 / pairs;
      if (p > d) {
        expectedStake += weight * 1;
        expectedPayout += weight * 2;
      } else if (p < d) {
        expectedStake += weight * 1;
        expectedPayout += weight * 0;
      } else {
        // War: enumerate the second pair too.
        expectedStake += weight * 2;
        let warPayout = 0;
        for (let wp = 0; wp < n; wp++) {
          for (let wd = 0; wd < n; wd++) {
            if (wp >= wd) warPayout += (1 / pairs) * 3;
          }
        }
        expectedPayout += weight * warPayout;
      }
    }
  }

  return { rtp: expectedPayout / expectedStake, expectedStake, expectedPayout };
}

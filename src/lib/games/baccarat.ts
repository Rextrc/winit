import { randomInt } from "@/lib/rng";

/**
 * WINIT BACCARAT — "Punto Banco"
 * ===========================================================================
 * Eight-deck shoe, fully automatic third-card rules — Punto Banco has no
 * player decisions at all once a bet is placed, so unlike blackjack this
 * resolves in one request, like roulette.
 *
 * Cards are modeled by POINT VALUE, not suit, since baccarat pays never
 * depend on suit: values 1-9 (ace through nine) have 32 cards each in an
 * 8-deck shoe (4 suits × 8 decks); value 0 (ten, jack, queen, king) has 128.
 * The shoe is freshly reset every hand, matching the fully-automatic shufflers
 * real casinos use for this game.
 *
 * P(Player win) = 44.6247%, P(Banker win) = 45.8597%, P(Tie) = 9.5156% —
 * exact figures, not textbook citations: `exactOdds()` enumerates every
 * reachable value-tuple through the real drawing rules below and weights it
 * by its true multivariate-hypergeometric probability. `npm run rtp` checks
 * the published RTP against this enumeration and against a Monte-Carlo run
 * through the same `playHand()` the API calls.
 * ===========================================================================
 */

export const DECKS = 8;
const COUNT_ZERO = 4 * DECKS * 4; // 10, J, Q, K
const COUNT_OTHER = 4 * DECKS; // A..9
const SHOE_SIZE = COUNT_ZERO + 9 * COUNT_OTHER; // 416

function freshCounts(): number[] {
  const c = new Array(10).fill(COUNT_OTHER);
  c[0] = COUNT_ZERO;
  return c;
}

export type BetType = "player" | "banker" | "tie";

/** Pays as a multiple of the stake, INCLUDING the stake back on a win. */
export const PAYOUT: Record<BetType, number> = {
  player: 2, // 1:1
  banker: 1.95, // 1:1 less the standard 5% commission
  tie: 9, // 8:1
};

export type HandResult = {
  playerCards: number[];
  bankerCards: number[];
  playerTotal: number;
  bankerTotal: number;
  winner: "player" | "banker" | "tie";
};

function total(cards: number[]): number {
  return cards.reduce((s, c) => s + c, 0) % 10;
}

/**
 * Draws one card value from a live shoe (mutates `counts`/`remaining`), using
 * the same rejection-free weighted draw as everywhere else in the app — one
 * `crypto.randomInt` over the remaining card count, mapped to a value class.
 */
function drawValue(counts: number[], remaining: { n: number }): number {
  let r = randomInt(remaining.n);
  for (let v = 0; v < 10; v++) {
    if (r < counts[v]) {
      counts[v] -= 1;
      remaining.n -= 1;
      return v;
    }
    r -= counts[v];
  }
  throw new Error("drawValue: exhausted shoe — this should be unreachable");
}

/** Plays one hand to completion under the standard Punto Banco tableau. */
export function playHand(): HandResult {
  const counts = freshCounts();
  const remaining = { n: SHOE_SIZE };

  const player = [drawValue(counts, remaining)];
  const banker = [drawValue(counts, remaining)];
  player.push(drawValue(counts, remaining));
  banker.push(drawValue(counts, remaining));

  let pTotal = total(player);
  let bTotal = total(banker);

  // Natural: 8 or 9 on the first two cards ends the hand immediately.
  if (pTotal < 8 && bTotal < 8) {
    const playerDraws = pTotal <= 5;
    let playerThird: number | null = null;

    if (playerDraws) {
      playerThird = drawValue(counts, remaining);
      player.push(playerThird);
      pTotal = total(player);
    }

    let bankerDraws: boolean;
    if (!playerDraws) {
      bankerDraws = bTotal <= 5;
    } else {
      const p3 = playerThird!;
      if (bTotal <= 2) bankerDraws = true;
      else if (bTotal === 3) bankerDraws = p3 !== 8;
      else if (bTotal === 4) bankerDraws = p3 >= 2 && p3 <= 7;
      else if (bTotal === 5) bankerDraws = p3 >= 4 && p3 <= 7;
      else if (bTotal === 6) bankerDraws = p3 === 6 || p3 === 7;
      else bankerDraws = false; // banker total 7 always stands
    }

    if (bankerDraws) {
      banker.push(drawValue(counts, remaining));
      bTotal = total(banker);
    }
  }

  const winner = pTotal > bTotal ? "player" : bTotal > pTotal ? "banker" : "tie";

  return { playerCards: player, bankerCards: banker, playerTotal: pTotal, bankerTotal: bTotal, winner };
}

export function payoutFor(bet: BetType, stakeCents: number, winner: HandResult["winner"]): number {
  if (bet === winner) return Math.round(stakeCents * PAYOUT[bet]);
  // A tie pushes any Player or Banker bet — the stake is returned, not lost.
  if (winner === "tie" && bet !== "tie") return stakeCents;
  return 0;
}

// ===========================================================================
// EXACT ODDS — full enumeration through the real drawing rules
// ===========================================================================

export type Odds = { player: number; banker: number; tie: number };

/**
 * Enumerates every reachable sequence of card VALUES (not suits — suit never
 * affects the outcome) through the drawing rules above, weighting each by its
 * exact multivariate-hypergeometric probability given the shoe's true
 * composition and depletion order. This is exhaustive, not sampled: with only
 * 10 possible values per draw and at most 6 draws, the whole tree is small
 * enough to walk exactly.
 */
export function exactOdds(): Odds {
  let player = 0;
  let banker = 0;
  let tie = 0;

  const base = freshCounts();

  const record = (w: number, pT: number, bT: number) => {
    if (pT > bT) player += w;
    else if (bT > pT) banker += w;
    else tie += w;
  };

  for (let p1 = 0; p1 < 10; p1++) {
    const c0 = base.slice();
    const r0 = SHOE_SIZE;
    const w1 = c0[p1] / r0;
    if (w1 <= 0) continue;
    c0[p1] -= 1;
    const r1 = r0 - 1;

    for (let b1 = 0; b1 < 10; b1++) {
      const w2 = c0[b1] / r1;
      if (w2 <= 0) continue;
      const c1 = c0.slice();
      c1[b1] -= 1;
      const r2 = r1 - 1;

      for (let p2 = 0; p2 < 10; p2++) {
        const w3 = c1[p2] / r2;
        if (w3 <= 0) continue;
        const c2 = c1.slice();
        c2[p2] -= 1;
        const r3 = r2 - 1;

        for (let b2 = 0; b2 < 10; b2++) {
          const w4 = c2[b2] / r3;
          if (w4 <= 0) continue;
          const c3 = c2.slice();
          c3[b2] -= 1;
          const r4 = r3 - 1;

          const baseW = w1 * w2 * w3 * w4;
          const pTotal2 = (p1 + p2) % 10;
          const bTotal2 = (b1 + b2) % 10;

          if (pTotal2 >= 8 || bTotal2 >= 8) {
            record(baseW, pTotal2, bTotal2);
            continue;
          }

          const playerDraws = pTotal2 <= 5;

          if (!playerDraws) {
            const bankerDraws = bTotal2 <= 5;
            if (!bankerDraws) {
              record(baseW, pTotal2, bTotal2);
              continue;
            }
            for (let b3 = 0; b3 < 10; b3++) {
              const w5 = c3[b3] / r4;
              if (w5 <= 0) continue;
              record(baseW * w5, pTotal2, (bTotal2 + b3) % 10);
            }
            continue;
          }

          for (let p3 = 0; p3 < 10; p3++) {
            const w5 = c3[p3] / r4;
            if (w5 <= 0) continue;
            const c4 = c3.slice();
            c4[p3] -= 1;
            const r5 = r4 - 1;
            const pFinal = (pTotal2 + p3) % 10;

            let bankerDraws: boolean;
            if (bTotal2 <= 2) bankerDraws = true;
            else if (bTotal2 === 3) bankerDraws = p3 !== 8;
            else if (bTotal2 === 4) bankerDraws = p3 >= 2 && p3 <= 7;
            else if (bTotal2 === 5) bankerDraws = p3 >= 4 && p3 <= 7;
            else if (bTotal2 === 6) bankerDraws = p3 === 6 || p3 === 7;
            else bankerDraws = false;

            if (!bankerDraws) {
              record(baseW * w5, pFinal, bTotal2);
              continue;
            }

            for (let b3 = 0; b3 < 10; b3++) {
              const w6 = c4[b3] / r5;
              if (w6 <= 0) continue;
              record(baseW * w5 * w6, pFinal, (bTotal2 + b3) % 10);
            }
          }
        }
      }
    }
  }

  return { player, banker, tie };
}

export function exactRtp(bet: BetType): number {
  const odds = exactOdds();
  if (bet === "tie") return odds.tie * PAYOUT.tie;
  const winP = bet === "player" ? odds.player : odds.banker;
  return winP * PAYOUT[bet] + odds.tie * 1; // a tie pushes Player/Banker bets
}

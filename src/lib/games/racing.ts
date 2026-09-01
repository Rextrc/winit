import { randomInt } from "@/lib/rng";
import { fairMultiplier } from "@/lib/games/originals";

/**
 * WINIT SILKS — a fictional eight-horse card
 * ---------------------------------------------------------------------------
 * Every horse has a fixed, published chance of winning, and the price of
 * backing it is `fairMultiplier(chance)` — the true odds for that chance at a
 * 1% edge. So the favourite and the outsider return exactly the same
 * TARGET_RTP; the only thing that changes across the card is variance, which
 * is the honest version of a betting market.
 *
 * The winner is drawn first, from those weights. The running order shown
 * afterwards is a rendering of a result that already exists — no horse's
 * "form" or "stamina" is simulated anywhere, because anything of that kind
 * would be a second, hidden source of odds.
 * ---------------------------------------------------------------------------
 */

/** Weights out of WEIGHT_TOTAL, so every probability stays rational. */
export const WEIGHT_TOTAL = 100;

export type Horse = {
  id: number;
  name: string;
  silks: string;
  /** Chance of winning, out of WEIGHT_TOTAL. */
  weight: number;
};

export const FIELD: Horse[] = [
  { id: 1, name: "Ledger Line", silks: "#2e8bff", weight: 26 },
  { id: 2, name: "Paper Profit", silks: "#e2385a", weight: 20 },
  { id: 3, name: "Slow Fold", silks: "#2ee6b8", weight: 16 },
  { id: 4, name: "Marker Call", silks: "#f0c75e", weight: 13 },
  { id: 5, name: "Nightshift", silks: "#c98bff", weight: 10 },
  { id: 6, name: "Dead Money", silks: "#ff8ad4", weight: 7 },
  { id: 7, name: "Long Shot Larry", silks: "#7fd8ff", weight: 5 },
  { id: 8, name: "Rank Outsider", silks: "#94a3b8", weight: 3 },
];

export function horseById(id: number): Horse | undefined {
  return FIELD.find((h) => h.id === id);
}

export function chanceOf(horse: Horse): number {
  return horse.weight / WEIGHT_TOTAL;
}

/** The price of backing a horse: true odds for its chance, at a 1% edge. */
export function priceOf(horse: Horse): number {
  return fairMultiplier(chanceOf(horse));
}

/** Exact RTP for backing any horse — identical across the whole card. */
export function exactRtp(horse: Horse): number {
  return chanceOf(horse) * priceOf(horse);
}

export type RaceResult = {
  /** Finishing order, winner first. */
  order: number[];
  winner: number;
  backed: number;
  won: boolean;
  multiplier: number;
  payoutCents: number;
};

/**
 * Draws a full finishing order by repeatedly picking from the remaining field
 * in proportion to weight. Only the first pick affects any payout; the rest is
 * colour for the replay.
 */
export function race(backedId: number, betCents: number): RaceResult {
  const remaining = [...FIELD];
  const order: number[] = [];

  while (remaining.length > 0) {
    const total = remaining.reduce((s, h) => s + h.weight, 0);
    let roll = randomInt(total);
    let idx = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= remaining[i].weight;
      if (roll < 0) {
        idx = i;
        break;
      }
    }
    order.push(remaining[idx].id);
    remaining.splice(idx, 1);
  }

  const winner = order[0];
  const backed = horseById(backedId)!;
  const won = winner === backedId;
  const multiplier = won ? priceOf(backed) : 0;

  return {
    order,
    winner,
    backed: backedId,
    won,
    multiplier,
    payoutCents: won ? Math.round(betCents * multiplier) : 0,
  };
}

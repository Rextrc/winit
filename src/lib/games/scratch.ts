import { randomInt, shuffle } from "@/lib/rng";
import { roundMultiplier } from "@/lib/games/originals";

/**
 * WINIT SCRATCH CARDS — instant win, decided before you scratch
 * ---------------------------------------------------------------------------
 * The honest way to build a scratch card is to draw the PRIZE first and then
 * render a card consistent with it, which is exactly what happens here. The
 * nine panels are a rendering of a result that already exists, in the same way
 * the roulette wheel animation renders a pocket already drawn — scratching
 * cannot change the outcome, and nothing about the order you reveal in is read
 * by the engine.
 *
 * Because the prize comes from a fixed weighted table, the return is exact by
 * construction rather than measured: it is the weighted mean of the tier
 * multipliers, and the weights below are chosen so that mean is exactly 0.99.
 * ---------------------------------------------------------------------------
 */

export const PANELS = 9;
/** Every weight below is out of this, so the maths stays in integers. */
export const WEIGHT_TOTAL = 1_000_000;

export type Tier = { multiplier: number; weight: number; symbol: string; label: string };

/**
 * Prize tiers and their exact weights. Weighted payout numerator is
 * 300000*1 + 150000*2 + 40000*5 + 10000*10 + 1200*50 + 100*200 + 10*1000
 *   = 300000 + 300000 + 200000 + 100000 + 60000 + 20000 + 10000
 *   = 990000, over 1,000,000 — so RTP is exactly 0.99. `exactRtp()` recomputes
 * this from the table rather than trusting the comment.
 */
export const TIERS: Tier[] = [
  { multiplier: 1000, weight: 10, symbol: "★", label: "Star" },
  { multiplier: 200, weight: 100, symbol: "◆", label: "Diamond" },
  { multiplier: 50, weight: 1_200, symbol: "♣", label: "Club" },
  { multiplier: 10, weight: 10_000, symbol: "♠", label: "Spade" },
  { multiplier: 5, weight: 40_000, symbol: "♥", label: "Heart" },
  { multiplier: 2, weight: 150_000, symbol: "▲", label: "Wedge" },
  { multiplier: 1, weight: 300_000, symbol: "●", label: "Coin" },
];

/** Filler symbols that never form a winning line. */
export const BLANKS = ["■", "▬", "✖", "✿", "❖"];

export const LOSING_WEIGHT =
  WEIGHT_TOTAL - TIERS.reduce((sum, t) => sum + t.weight, 0);

/** Exact RTP: the weighted mean of the tier multipliers. */
export function exactRtp(): number {
  const paid = TIERS.reduce((sum, t) => sum + t.weight * t.multiplier, 0);
  return roundMultiplier(paid / WEIGHT_TOTAL);
}

export type ScratchResult = {
  /** The nine rendered panels, in reading order. */
  panels: string[];
  /** The symbol that appears three times on a winner, else null. */
  winningSymbol: string | null;
  multiplier: number;
  payoutCents: number;
};

/**
 * Draws a prize, then lays out a card that shows it. On a winner the tier's
 * symbol appears exactly three times; on a loser no symbol appears more than
 * twice, so a losing card can never look like a winning one.
 */
export function scratch(betCents: number): ScratchResult {
  const roll = randomInt(WEIGHT_TOTAL);

  let cursor = 0;
  let won: Tier | null = null;
  for (const tier of TIERS) {
    cursor += tier.weight;
    if (roll < cursor) {
      won = tier;
      break;
    }
  }

  const panels = won ? layoutWinner(won.symbol) : layoutLoser();
  const multiplier = won ? won.multiplier : 0;

  return {
    panels,
    winningSymbol: won ? won.symbol : null,
    multiplier,
    payoutCents: Math.round(betCents * multiplier),
  };
}

/** Three of the winning symbol, then fillers that never reach three of a kind. */
function layoutWinner(symbol: string): string[] {
  const others = pool().filter((s) => s !== symbol);
  const filler: string[] = [];
  const used = new Map<string, number>();
  while (filler.length < PANELS - 3) {
    const pick = others[randomInt(others.length)];
    const seen = used.get(pick) ?? 0;
    // Two of any other symbol is fine; a third would be a second winning line.
    if (seen >= 2) continue;
    used.set(pick, seen + 1);
    filler.push(pick);
  }
  return shuffle([symbol, symbol, symbol, ...filler]);
}

/** No symbol three times, so the card reads as a loser at a glance. */
function layoutLoser(): string[] {
  const symbols = pool();
  const out: string[] = [];
  const used = new Map<string, number>();
  while (out.length < PANELS) {
    const pick = symbols[randomInt(symbols.length)];
    const seen = used.get(pick) ?? 0;
    if (seen >= 2) continue;
    used.set(pick, seen + 1);
    out.push(pick);
  }
  return shuffle(out);
}

function pool(): string[] {
  return [...TIERS.map((t) => t.symbol), ...BLANKS];
}

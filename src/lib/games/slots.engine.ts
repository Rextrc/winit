import { randomInt } from "@/lib/rng";
import {
  BUY_FREE,
  BUY_SUPER,
  FREE_SPIN_MULTIPLIER,
  MAX_FREE_SPINS_PER_ROUND,
  REELS,
  REEL_STRIPS,
  RETRIGGER_SPINS,
  ROWS,
  STRIP_LENGTHS,
  SYMBOL_NAMES,
  buyFor,
  evaluateGrid,
  quantiseStake,
  scatterSpinAward,
  type Grid,
  type SlotsMode,
  type SlotsRound,
  type SpinView,
  type Sym,
} from "@/lib/games/slots";

/**
 * The randomness half of Volt Reels — server only.
 *
 * Kept apart from `slots.ts` so the paytable, the evaluator and the exact-RTP
 * maths can be imported by client components and by the game registry without
 * dragging Node's `crypto` into the browser bundle.
 */

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Draws all 15 cells independently from their reel strips. */
export function drawGrid(): Grid {
  return Array.from({ length: REELS }, (_, r) =>
    Array.from({ length: ROWS }, () => REEL_STRIPS[r][randomInt(STRIP_LENGTHS[r])]),
  );
}

function playFreeSpins(
  initialSpins: number,
  multiplier: number,
  lineBetCents: number,
  stakeCents: number,
): SpinView[] {
  const spins: SpinView[] = [];
  let remaining = initialSpins;
  let index = 0;

  while (remaining > 0 && index < MAX_FREE_SPINS_PER_ROUND) {
    remaining -= 1;
    index += 1;
    const grid = drawGrid();
    const evaluated = evaluateGrid(grid, lineBetCents, stakeCents, multiplier);
    const awardedSpins = evaluated.scatterCount >= 3 ? RETRIGGER_SPINS : 0;
    remaining += awardedSpins;
    spins.push({ ...evaluated, kind: "FREE", index, awardedSpins, spinsRemaining: remaining });
  }

  return spins;
}

function summarise(round: Omit<SlotsRound, "summary">): string {
  const { spins, payoutCents, chargeCents, freeSpinsPlayed, mode } = round;
  if (payoutCents === 0) return mode === "SPIN" ? "No win" : "Bonus bought — no win";

  const best = spins
    .flatMap((s) => s.lineWins)
    .sort((a, b) => b.payCents - a.payCents)[0];

  let what: string;
  if (freeSpinsPlayed > 0) what = `${freeSpinsPlayed} free spins`;
  else if (best) what = `${best.count} ${SYMBOL_NAMES[best.symbol]}`;
  else what = "Scatter pay";

  // The match count and the multiplier both want an "x", so only the
  // multiplier gets one and it is always labelled against the stake.
  return `${what} — ${(payoutCents / chargeCents).toFixed(2)}× stake`;
}

/**
 * Plays a whole round to completion server-side — the base spin plus every
 * free spin it triggers — and returns the full sequence for the client to
 * animate. The client is only ever told what already happened.
 */
export function playRound(mode: SlotsMode, betCents: number): SlotsRound {
  const { stakeCents, lineBetCents } = quantiseStake(betCents);
  if (stakeCents <= 0) throw new Error("Stake is below one line bet.");

  const spins: SpinView[] = [];
  let chargeCents = stakeCents;
  let freeSpinMultiplier = 0;

  if (mode === "SPIN") {
    const grid = drawGrid();
    const evaluated = evaluateGrid(grid, lineBetCents, stakeCents, 1);
    const awardedSpins = scatterSpinAward(evaluated.scatterCount);
    spins.push({ ...evaluated, kind: "BASE", index: 0, awardedSpins, spinsRemaining: awardedSpins });

    if (awardedSpins > 0) {
      freeSpinMultiplier = FREE_SPIN_MULTIPLIER;
      spins.push(...playFreeSpins(awardedSpins, FREE_SPIN_MULTIPLIER, lineBetCents, stakeCents));
    }
  } else {
    const buy = mode === "BUY_FREE" ? BUY_FREE : BUY_SUPER;
    chargeCents = buy.priceMultiplier * stakeCents;
    freeSpinMultiplier = buy.multiplier;
    spins.push(...playFreeSpins(buy.spins, buy.multiplier, lineBetCents, stakeCents));
  }

  const payoutCents = spins.reduce((s, sp) => s + sp.payCents, 0);
  const freeSpinsPlayed = spins.filter((s) => s.kind === "FREE").length;

  const base = {
    mode,
    chargeCents,
    stakeCents,
    lineBetCents,
    spins,
    freeSpinsPlayed,
    freeSpinMultiplier,
    payoutCents,
    outcome: (payoutCents > 0 ? "WIN" : "LOSS") as "WIN" | "LOSS",
    roundMultiplier: payoutCents / chargeCents,
  };

  return { ...base, summary: summarise(base) };
}

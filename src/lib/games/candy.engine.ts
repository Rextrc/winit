import { randomInt } from "@/lib/rng";
import {
  BUY_FEATURE_PRICE_MULTIPLIER,
  BUY_FEATURE_SPINS,
  COLS,
  MAX_BONUS_SPINS,
  MAX_CASCADES_PER_SPIN,
  ROWS,
  RETRIGGER_SCATTERS,
  RETRIGGER_SPINS,
  STRIP_LENGTH,
  SYMBOL_STRIP,
  clusterPayCents,
  countScatters,
  findClusters,
  freeSpinsAward,
  scatterPayCents,
  trailMultiplier,
  type CandyMode,
  type CandyRound,
  type CascadeStep,
  type Grid,
  type SpinBlock,
  type Sym,
} from "@/lib/games/candy";

/**
 * The randomness half of Candy Cascade — server only. Kept apart from
 * candy.ts so the paytable, cluster evaluator and pay maths stay importable
 * client-side without pulling Node's `crypto` into the browser bundle.
 */

function drawSymbol(): Sym {
  return SYMBOL_STRIP[randomInt(STRIP_LENGTH)];
}

export function drawGrid(): Grid {
  return Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => drawSymbol()));
}

/** Clears the winning cells, drops survivors down, and refills from the top. */
function tumble(grid: Grid, clusters: { cells: [number, number][] }[]): Grid {
  const cleared = new Set<string>();
  for (const cl of clusters) for (const [c, r] of cl.cells) cleared.add(`${c}-${r}`);

  return grid.map((col, c) => {
    const kept = col.filter((_, r) => !cleared.has(`${c}-${r}`));
    const missing = ROWS - kept.length;
    const fresh = Array.from({ length: missing }, drawSymbol);
    return [...fresh, ...kept];
  });
}

/**
 * Resolves one spin to completion — the initial grid plus every cascade it
 * triggers — and returns the full step-by-step sequence for the client to
 * animate. The cascade multiplier carries in from `startMultIndex` so a
 * bonus round can keep climbing across spins rather than resetting each one.
 */
function playSpin(betCents: number, startMultIndex: number): { steps: CascadeStep[]; endMultIndex: number } {
  let grid = drawGrid();
  let multIndex = startMultIndex;
  const steps: CascadeStep[] = [];

  for (let i = 0; i < MAX_CASCADES_PER_SPIN; i++) {
    const clusters = findClusters(grid);
    if (clusters.length === 0) {
      steps.push({ grid, clusters: [], payCents: 0, multiplier: trailMultiplier(multIndex), final: true });
      break;
    }
    const multiplier = trailMultiplier(multIndex);
    const payCents = clusterPayCents(clusters, betCents) * multiplier;
    steps.push({ grid, clusters, payCents, multiplier, final: false });

    grid = tumble(grid, clusters);
    multIndex += 1;
  }

  return { steps, endMultIndex: multIndex };
}

function summariseBlock(steps: CascadeStep[]): { scatterCount: number; payoutCents: number } {
  const finalGrid = steps[steps.length - 1].grid;
  // Scatters are never cleared by a cluster, so they persist on the board for
  // the rest of the spin — the final grid alone holds every distinct scatter
  // that landed at any point during it.
  const scatterCount = countScatters(finalGrid);
  const payoutCents = steps.reduce((s, st) => s + st.payCents, 0);
  return { scatterCount, payoutCents };
}

function playBonusRound(betCents: number, initialSpins: number, startMultIndex: number): SpinBlock[] {
  const blocks: SpinBlock[] = [];
  let remaining = initialSpins;
  let index = 0;
  let multIndex = startMultIndex;

  while (remaining > 0 && index < MAX_BONUS_SPINS) {
    remaining -= 1;
    index += 1;
    const { steps, endMultIndex } = playSpin(betCents, multIndex);
    multIndex = endMultIndex;
    const { scatterCount, payoutCents } = summariseBlock(steps);
    const awardedSpins = scatterCount >= RETRIGGER_SCATTERS ? RETRIGGER_SPINS : 0;
    remaining += awardedSpins;

    const scatterPay = scatterPayCents(scatterCount, betCents);
    blocks.push({
      kind: "BONUS",
      index,
      steps,
      scatterCount,
      scatterPayCents: scatterPay,
      awardedSpins,
      spinsRemaining: remaining,
    });
  }

  return blocks;
}

function summarise(round: Omit<CandyRound, "summary">): string {
  const { blocks, payoutCents, chargeCents, bonusTriggered } = round;
  if (payoutCents === 0) return round.mode === "SPIN" ? "No win" : "Feature bought — no win";

  const bonusSpins = blocks.filter((b) => b.kind === "BONUS").length;
  const x = (payoutCents / chargeCents).toFixed(2);

  if (bonusSpins > 0) return `${bonusSpins} bonus spins — ${x}× stake`;

  const biggest = blocks[0].steps
    .flatMap((s) => s.clusters)
    .sort((a, b) => b.size - a.size)[0];
  if (biggest) return `${biggest.size}-candy cluster — ${x}× stake`;
  return `${x}× stake`;
}

export function playRound(mode: CandyMode, betCents: number): CandyRound {
  const blocks: SpinBlock[] = [];
  let chargeCents = betCents;
  let bonusTriggered = false;

  if (mode === "SPIN") {
    const { steps, endMultIndex } = playSpin(betCents, 0);
    const { scatterCount, payoutCents } = summariseBlock(steps);
    const scatterPay = scatterPayCents(scatterCount, betCents);
    const awardedSpins = freeSpinsAward(scatterCount);

    blocks.push({
      kind: "BASE",
      index: 0,
      steps,
      scatterCount,
      scatterPayCents: scatterPay,
      awardedSpins,
      spinsRemaining: awardedSpins,
    });

    if (awardedSpins > 0) {
      bonusTriggered = true;
      blocks.push(...playBonusRound(betCents, awardedSpins, endMultIndex));
    }
  } else {
    chargeCents = BUY_FEATURE_PRICE_MULTIPLIER * betCents;
    bonusTriggered = true;
    blocks.push(...playBonusRound(betCents, BUY_FEATURE_SPINS, 0));
  }

  const payoutCents = blocks.reduce(
    (s, b) => s + b.steps.reduce((s2, st) => s2 + st.payCents, 0) + b.scatterPayCents,
    0,
  );

  const base: Omit<CandyRound, "summary"> = {
    mode,
    chargeCents,
    betCents,
    blocks,
    bonusTriggered,
    payoutCents,
    outcome: payoutCents > 0 ? "WIN" : "LOSS",
    roundMultiplier: payoutCents / chargeCents,
  };

  return { ...base, summary: summarise(base) };
}

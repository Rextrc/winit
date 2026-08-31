/**
 * RTP verification harness — `npm run rtp`.
 *
 * Proves the published return-to-player figures are the ones the code actually
 * implements, two independent ways:
 *   1. closed-form enumeration / algebra, and
 *   2. a Monte-Carlo run through the same functions the API calls.
 *
 * If a paytable is edited without updating the published number, this fails.
 */

import {
  BONUS_BUYS,
  LINE_COUNT,
  LINE_PAYS,
  PAYING_SYMBOLS,
  PAYLINES,
  REELS,
  ROWS,
  SYMBOLS,
  evaluateLine,
  exactRtp as slotsExactRtp,
  quantiseStake,
  scatterCountDistribution,
  spinMaths,
  type SlotsMode,
} from "../src/lib/games/slots";
import { playRound } from "../src/lib/games/slots.engine";
import { exactRtp as rouletteRtp, spin as spinRoulette, coverageCount, type BetType } from "../src/lib/games/roulette";
import {
  applyAction,
  availableActions,
  deal,
  handTotal,
  totalPayout,
  totalStake,
  type BlackjackState,
} from "../src/lib/games/blackjack";
import { GAMES } from "../src/lib/games/registry";
import * as Orig from "../src/lib/games/originals";

const SPINS = 1_000_000;
const HANDS = 200_000;
const BET = 100; // 1.00 in cents

function pct(x: number) {
  return `${(x * 100).toFixed(4)}%`;
}

let failures = 0;

function check(label: string, actual: number, expected: number, tolerance: number) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (!ok) failures++;
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(38)} ${pct(actual).padStart(10)}  (expected ${pct(expected)} ±${pct(tolerance)})`,
  );
}

/**
 * Tolerance for a simulated mean: five standard errors. Derived from the game's
 * true variance, so a high-variance paytable gets a wide band and a low-variance
 * one gets a tight band — a fixed percentage would either false-alarm on slots
 * or wave through a broken roulette table.
 */
function sigmaBand(variance: number, samples: number, sigmas = 5): number {
  return sigmas * Math.sqrt(variance / samples);
}

// ---------------------------------------------------------------- slots
console.log("\nFRUIT MACHINE (slots)");

const m = spinMaths();
const slotsExact = slotsExactRtp();

console.log(`  Line pay      ${pct(m.lineRtp)}   (exhaustive over ${SYMBOLS.length}^${REELS} = ${(SYMBOLS.length ** REELS).toLocaleString()} symbol tuples)`);
console.log(`  Scatter pay   ${pct(m.scatterRtp)}   (convolution of ${REELS} Binomial(${ROWS}, q) reels)`);
console.log(`  Free spins    trigger 1 in ${(1 / m.triggerProbability).toFixed(1)}, retrigger rate ${(5 * m.triggerProbability).toFixed(4)} < 1 so the series converges`);
console.log(`  TOTAL         ${pct(slotsExact)}`);

// The registry publishes exactRtp() itself rather than a copied constant, so
// the advertised figure cannot drift from the paytable. What is worth asserting
// is that the paytable still lands where the docs claim it does.
const published = GAMES.find((g) => g.slug === "fruit-machine")!.rtp!;
check("registry figure is the enumerated one", published, slotsExact, 1e-12);
if (slotsExact < 0.94 || slotsExact > 0.96) {
  failures++;
  console.log(`  FAIL  RTP ${pct(slotsExact)} has drifted outside the documented 94-96% band`);
}

// The scatter distribution must be a distribution.
const dist = scatterCountDistribution();
check("scatter count distribution sums to 1", dist.reduce((a, b) => a + b, 0), 1, 1e-12);

// Paylines must be well formed: one cell per reel, every row in range.
for (const [i, line] of PAYLINES.entries()) {
  if (line.length !== REELS || line.some((r) => r < 0 || r >= ROWS)) {
    failures++;
    console.log(`  FAIL  payline ${i} is malformed`);
  }
}
if (PAYLINES.length !== LINE_COUNT) {
  failures++;
  console.log("  FAIL  payline count does not match LINE_COUNT");
}

// Evaluator sanity: no pay on a broken line, wilds substitute, 5oak pays top.
if (evaluateLine(["LEMON", "CHERRY", "GRAPES", "PLUM", "SEVEN"], 0, 1) !== null) {
  failures++;
  console.log("  FAIL  a non-paying line returned a win");
}
if (evaluateLine(["SEVEN", "WILD", "SEVEN", "CHERRY", "PLUM"], 0, 1)?.count !== 3) {
  failures++;
  console.log("  FAIL  wild substitution did not extend a run");
}
if (evaluateLine(["SEVEN", "SEVEN", "SEVEN", "SEVEN", "SEVEN"], 0, 1)?.multiplier !== LINE_PAYS.SEVEN[5]) {
  failures++;
  console.log("  FAIL  five of a kind did not pay the paytable's five-of-a-kind prize");
}
// Pays must be monotonic in run length, and the top symbol must be the richest.
for (const sym of PAYING_SYMBOLS) {
  const row = LINE_PAYS[sym];
  if (!(row[3] <= row[4] && row[4] <= row[5])) {
    failures++;
    console.log(`  FAIL  ${sym} pays are not monotonic in run length`);
  }
  if (sym !== "SEVEN" && row[5] > LINE_PAYS.SEVEN[5]) {
    failures++;
    console.log(`  FAIL  ${sym} out-pays the top symbol`);
  }
}
// A scatter can never start a paying line.
if (evaluateLine(["SCATTER", "SCATTER", "SCATTER", "SCATTER", "SCATTER"], 0, 1) !== null) {
  failures++;
  console.log("  FAIL  scatters paid as a payline");
}

/**
 * Monte-Carlo the whole round — base spin, triggered free spins, retriggers —
 * through the exact function the API calls. The tolerance is derived from the
 * variance measured in the same sample: free-spin rounds make the payout
 * distribution far too heavy-tailed for a fixed percentage band to be
 * meaningful.
 */
function simulate(mode: SlotsMode, rounds: number, stakeCents: number) {
  let sum = 0;
  let sumSquares = 0;
  let biggest = 0;
  let freeSpins = 0;
  for (let i = 0; i < rounds; i++) {
    const r = playRound(mode, stakeCents);
    const x = r.payoutCents / r.chargeCents;
    sum += x;
    sumSquares += x * x;
    freeSpins += r.freeSpinsPlayed;
    if (x > biggest) biggest = x;
  }
  const mean = sum / rounds;
  const variance = sumSquares / rounds - mean * mean;
  return { mean, variance, biggest, freeSpinsPerRound: freeSpins / rounds };
}

const STAKE = 1_000; // 10.00 — 100 cents a line, so every pay stays an integer
const sim = simulate("SPIN", SPINS, STAKE);

console.log(
  `  Payout SD per round ${Math.sqrt(sim.variance).toFixed(2)}x stake -> standard error over ${SPINS.toLocaleString()} rounds is ${pct(Math.sqrt(sim.variance / SPINS))}`,
);
check(
  `${SPINS.toLocaleString()} simulated rounds`,
  sim.mean,
  slotsExact,
  sigmaBand(sim.variance, SPINS),
);

// The retrigger series is the easiest thing here to get wrong, so check the
// realised free-spin count against the closed-form expectation directly.
const expectedFreePerRound = m.expectedAward / (1 - 5 * m.triggerProbability);
check(
  "free spins per round vs geometric series",
  sim.freeSpinsPerRound,
  expectedFreePerRound,
  5 * Math.sqrt(expectedFreePerRound / SPINS) + 0.002,
);
console.log(`  Biggest round seen ${sim.biggest.toFixed(1)}x stake`);

// Stake quantisation must never invent or destroy money.
for (const raw of [10, 15, 99, 1_000, 12_345]) {
  const q = quantiseStake(raw);
  if (q.lineBetCents * LINE_COUNT !== q.stakeCents || q.stakeCents > raw) {
    failures++;
    console.log(`  FAIL  quantiseStake(${raw}) produced an inconsistent stake`);
  }
}

// Bonus buys: each must return its own published RTP, and be priced honestly
// against the base game rather than being a trap or a free edge.
const BUY_ROUNDS = 300_000;
for (const buy of BONUS_BUYS) {
  const s = simulate(buy.key, BUY_ROUNDS, STAKE);
  check(
    `${buy.label} (${buy.priceMultiplier}x stake)`,
    s.mean,
    buy.rtp,
    sigmaBand(s.variance, BUY_ROUNDS),
  );
  const gap = Math.abs(buy.rtp - slotsExact);
  if (gap > 0.01) {
    failures++;
    console.log(`  FAIL  ${buy.label} RTP is ${pct(gap)} away from the base game`);
  }
}

// -------------------------------------------------------------- roulette
console.log("\nEUROPEAN ROULETTE (roulette)");

const TYPES: BetType[] = ["straight", "red", "black", "odd", "even", "low", "high", "dozen1", "col1"];
for (const type of TYPES) {
  check(`${type} exact (covers ${coverageCount(type)}/37)`, rouletteRtp(type), 36 / 37, 1e-12);
}

let rouletteReturned = 0;
const ROULETTE_SPINS = 500_000;
for (let i = 0; i < ROULETTE_SPINS; i++) {
  rouletteReturned += spinRoulette([{ type: "red", amountCents: BET }]).payoutCents;
}
// An even-money bet returns 2 with p = 18/37 and 0 otherwise.
const p = 18 / 37;
const rouletteVariance = 4 * p - (2 * p) ** 2;
check(
  `${ROULETTE_SPINS.toLocaleString()} simulated red bets`,
  rouletteReturned / (ROULETTE_SPINS * BET),
  36 / 37,
  sigmaBand(rouletteVariance, ROULETTE_SPINS),
);

// ------------------------------------------------------------- blackjack
console.log("\nBLACKJACK");

/**
 * A compact basic strategy for these exact rules (6D, S17, DAS n/a, no
 * surrender). Good enough to land inside the published band; it is the same
 * engine the API drives, so any rule bug shows up as a wrong return here.
 */
function basicStrategy(state: BlackjackState): "hit" | "stand" | "double" | "split" {
  const hand = state.hands[state.active];
  const allowed = availableActions(state);
  const upValue = (() => {
    const r = state.dealer[0].r;
    if (r === "A") return 11;
    if (r === "K" || r === "Q" || r === "J" || r === "10") return 10;
    return Number(r);
  })();

  const { total, soft } = handTotal(hand.cards);

  if (allowed.includes("split")) {
    const r = hand.cards[0].r;
    if (r === "A" || r === "8") return "split";
    if ((r === "2" || r === "3" || r === "7") && upValue <= 7) return "split";
    if (r === "6" && upValue <= 6) return "split";
    if (r === "9" && upValue !== 7 && upValue <= 9) return "split";
  }

  if (soft) {
    if (total >= 19) return "stand";
    if (total === 18) {
      if (allowed.includes("double") && upValue >= 3 && upValue <= 6) return "double";
      return upValue >= 9 ? "hit" : "stand";
    }
    if (allowed.includes("double")) {
      if (total === 17 && upValue >= 3 && upValue <= 6) return "double";
      if ((total === 15 || total === 16) && upValue >= 4 && upValue <= 6) return "double";
      if ((total === 13 || total === 14) && upValue >= 5 && upValue <= 6) return "double";
    }
    return "hit";
  }

  if (allowed.includes("double")) {
    if (total === 11) return "double";
    if (total === 10 && upValue <= 9) return "double";
    if (total === 9 && upValue >= 3 && upValue <= 6) return "double";
  }

  if (total >= 17) return "stand";
  if (total >= 13 && upValue <= 6) return "stand";
  if (total === 12 && upValue >= 4 && upValue <= 6) return "stand";
  return "hit";
}

let bjStaked = 0;
let bjReturned = 0;

for (let i = 0; i < HANDS; i++) {
  let state = deal(BET);
  let guard = 0;
  while (state.phase === "PLAYER" && guard++ < 40) {
    const action = basicStrategy(state);
    state = applyAction(state, action).state;
  }
  bjStaked += totalStake(state);
  bjReturned += totalPayout(state);
}

const bjRtp = bjReturned / bjStaked;
console.log(`  ${HANDS.toLocaleString()} hands played to basic strategy -> ${pct(bjRtp)}`);
// Sampling noise here is only ~0.26% (1 SE over 200k hands); the band is wide
// because the strategy above is a compact approximation of basic strategy and
// carries its own bias. It is sized to catch a real rules bug — a mispaid
// blackjack, a dealer that hits 17, a broken push — not to certify the third
// decimal place.
check("basic-strategy return", bjRtp, 0.994, 0.012);


// ---------------------------------------------------------------- originals
console.log("\nORIGINALS (dice, limbo, coinflip, wheel, plinko, keno)");

// Dice: sweep a wide range of targets in both directions and check the exact
// formula lands on 99% for every one, not just a couple of hand-picked spots.
// Multipliers are rounded to 4dp before they are paid (see roundMultiplier),
// so the exact RTP is TARGET_RTP plus a small rounding residual, not exactly
// TARGET_RTP. The tolerance here is that residual's true ceiling: rounding a
// multiplier to the nearest 1e-4 moves it by at most 5e-5, and the RTP moves
// by at most P(win) times that, which is under 5e-5 for every target.
const DICE_ROUNDING_TOLERANCE = 5e-5;
for (const [direction, target] of [
  ["over", 200], ["over", 5000], ["over", 9700],
  ["under", 300], ["under", 5000], ["under", 9800],
] as const) {
  check(`dice ${direction} ${(target / 100).toFixed(2)}`, Orig.diceExactRtp(direction, target), Orig.TARGET_RTP, DICE_ROUNDING_TOLERANCE);
}
if (Orig.diceValidTarget("over", 9990) || Orig.diceValidTarget("under", 50)) {
  failures++;
  console.log("  FAIL  dice accepted a target outside the 2%-98% chance band");
}

// Limbo: same sweep, using the closed-form P(result >= M) = TARGET_RTP / M.
for (const target of [1.01, 1.5, 2, 10, 100, 5000, 10000]) {
  check(`limbo target ${target}x`, Orig.limboExactRtp(target), Orig.TARGET_RTP, 1e-9);
}
// The uniform-to-multiplier map must actually realise that law empirically.
{
  const N = 300_000;
  let sum = 0, sum2 = 0;
  for (let i = 0; i < N; i++) {
    const u = 1 - Math.random(); // Math.random is fine here: this is a maths
                                  // self-check of the formula, not a paid bet.
    const r = Orig.limboResultFromUniform(u);
    sum += r; sum2 += r * r;
  }
  // E[1/u] for u ~ U(0,1] diverges, so instead check the win-rate law directly:
  // P(result >= target) should match TARGET_RTP / target for a few targets.
  for (const target of [2, 10, 100]) {
    let wins = 0;
    for (let i = 0; i < N; i++) {
      const u = 1 - Math.random();
      if (Orig.limboResultFromUniform(u) >= target) wins++;
    }
    const p = wins / N;
    const expected = Orig.limboChance(target);
    const se = Math.sqrt(expected * (1 - expected) / N);
    check(`limbo P(result >= ${target}x) empirically`, p, expected, 5 * se);
  }
  void sum; void sum2;
}

// Coinflip: trivially exact, but assert the multiplier is the fair price.
check("coinflip", Orig.coinflipExactRtp(), Orig.TARGET_RTP, 1e-9);
if (Orig.COINFLIP_MULTIPLIER !== Orig.fairMultiplier(0.5)) {
  failures++;
  console.log("  FAIL  coinflip multiplier is not the fair price for 50%");
}

// Wheel: every risk level must average to TARGET_RTP over its equally-likely
// segments, and every table needs exactly 10 segments (the model's assumption
// baked into the code above).
for (const risk of ["low", "medium", "high"] as const) {
  check(`wheel ${risk}`, Orig.wheelExactRtp(risk), Orig.TARGET_RTP, 1e-9);
  if (Orig.WHEEL_SEGMENTS[risk].length !== 10) {
    failures++;
    console.log(`  FAIL  wheel ${risk} does not have 10 segments`);
  }
}

// Plinko: the bucket distribution must be a real distribution, and the exact
// RTP (weighted by the true binomial, not assumed) is what gets published —
// verify it against a Monte-Carlo of the same binomial process.
for (const risk of ["low", "medium", "high"] as const) {
  for (const rows of Orig.PLINKO_ROWS) {
    const probs = Orig.plinkoBucketProbabilities(rows);
    check(`plinko ${risk} ${rows} bucket probabilities sum to 1`, probs.reduce((a, b) => a + b, 0), 1, 1e-9);
    if (Orig.PLINKO_TABLES[risk][rows].length !== rows + 1) {
      failures++;
      console.log(`  FAIL  plinko ${risk} ${rows} table has the wrong bucket count`);
    }
    const exact = Orig.plinkoExactRtp(risk, rows);
    if (exact < 0.9 || exact > 1.15) {
      failures++;
      console.log(`  FAIL  plinko ${risk} ${rows} RTP ${pct(exact)} is out of a sane 90-115% band`);
    }
  }
}
const PLINKO_SIM = 400_000;
{
  const risk = "medium" as const, rows = 12 as const;
  const probs = Orig.plinkoBucketProbabilities(rows);
  const table = Orig.PLINKO_TABLES[risk][rows];
  let sum = 0, sum2 = 0;
  for (let i = 0; i < PLINKO_SIM; i++) {
    let bucket = 0;
    for (let r = 0; r < rows; r++) if (Math.random() < 0.5) bucket++;
    const m = table[bucket];
    sum += m; sum2 += m * m;
  }
  const mean = sum / PLINKO_SIM;
  const variance = sum2 / PLINKO_SIM - mean * mean;
  check(
    `plinko ${risk} ${rows} simulated bounce process`,
    mean,
    table.reduce((s, m, k) => s + m * probs[k], 0),
    sigmaBand(variance, PLINKO_SIM),
  );
}

// Keno: the paytable must be derived to hit 99% for every pick count, and the
// hypergeometric probabilities themselves must sum to 1.
// Same rounding residual as dice: the paytable is scaled to hit exactly
// TARGET_RTP and then every entry is rounded to 4dp, so the realised RTP sits
// within a few multiplier-rounding-widths of TARGET_RTP, not exactly on it.
const KENO_ROUNDING_TOLERANCE = 5e-5;
for (const picks of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  check(`keno ${picks} picks`, Orig.kenoExactRtp(picks), Orig.TARGET_RTP, KENO_ROUNDING_TOLERANCE);
  let sum = 0;
  for (let h = 0; h <= picks; h++) sum += Orig.kenoHitProbability(picks, h);
  check(`keno ${picks} picks hit-probabilities sum to 1`, sum, 1, 1e-9);
}

// ----------------------------------------------------------------- done
console.log(
  failures === 0
    ? "\nAll RTP checks passed.\n"
    : `\n${failures} RTP check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

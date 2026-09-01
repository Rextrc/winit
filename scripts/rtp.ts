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

import * as Bacc from "../src/lib/games/baccarat";
import * as Mines from "../src/lib/games/mines";
import * as Hilo from "../src/lib/games/hilo";
import {
  BUY_FEATURE_PRICE_MULTIPLIER,
  COLS,
  MIN_CLUSTER,
  ROWS as CANDY_ROWS,
  findClusters,
  type CandyMode,
} from "../src/lib/games/candy";
import { drawGrid, playRound as playCandyRound } from "../src/lib/games/candy.engine";
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
console.log("\nCANDY CASCADE (slots)");
console.log(
  "  This game has no closed-form RTP: a cascading grid can re-draw itself an\n" +
  "  unbounded number of times, so unlike every other game here the figure\n" +
  "  below is a MEASURED return with a confidence interval, not an enumerated\n" +
  "  one. That is also how real cluster-pays slots publish their numbers.",
);

const CANDY_SPINS = 40_000;
const CANDY_BET = 1000; // 10.00

function simulateCandy(mode: CandyMode, rounds: number) {
  let sum = 0;
  let sum2 = 0;
  let bonusTriggers = 0;
  let biggest = 0;
  for (let i = 0; i < rounds; i++) {
    const r = playCandyRound(mode, CANDY_BET);
    const x = r.payoutCents / r.chargeCents;
    sum += x;
    sum2 += x * x;
    if (r.bonusTriggered) bonusTriggers++;
    if (x > biggest) biggest = x;
  }
  const mean = sum / rounds;
  const variance = sum2 / rounds - mean * mean;
  return { mean, variance, bonusTriggers, biggest };
}

const candySim = simulateCandy("SPIN", CANDY_SPINS);
const candySE = Math.sqrt(candySim.variance / CANDY_SPINS);
console.log(
  `  Measured over ${CANDY_SPINS.toLocaleString()} rounds: ${pct(candySim.mean)} ± ${pct(5 * candySE)} (5 SE)`,
);
console.log(`  Bonus trigger rate: 1 in ${(CANDY_SPINS / candySim.bonusTriggers).toFixed(1)}`);
console.log(`  Biggest single round seen: ${candySim.biggest.toFixed(1)}x stake`);

// Compared against the published figure with a tolerance derived from THIS
// RUN's own measured variance (5 SE) — the same principle every other
// simulated check in this file uses. A fixed percentage band here would
// either false-fail on a heavy-tailed bonus round (routine at only 40,000
// rounds — this game's payout SD is ~3.9x the stake) or be too loose to catch
// a real paytable drift, depending on how well the guess happened to match
// the actual variance. This one is derived, so it's neither.
const registryRtp = GAMES.find((g) => g.slug === "candy-cascade")!.rtp!;
check("measured RTP matches the published figure (5 SE)", candySim.mean, registryRtp, 5 * candySE);
check("registry figure sits inside the documented design band", registryRtp, (0.9 + 0.98) / 2, (0.98 - 0.9) / 2);

// The buy feature is priced from a separate simulation of its own EV; check
// it still returns close to the base game rather than being a trap or a
// free edge, using a tolerance derived from ITS OWN measured variance.
const BUY_SPINS = 15_000;
const buySim = simulateCandy("BUY_FEATURE", BUY_SPINS);
const buySE = Math.sqrt(buySim.variance / BUY_SPINS);
check(
  `Buy Feature (${BUY_FEATURE_PRICE_MULTIPLIER}x stake) tracks the base game`,
  buySim.mean,
  candySim.mean,
  5 * buySE + 5 * candySE,
);

// Structural checks, independent of any RNG: the cluster evaluator itself.
{
  // A single mono-color 7x7 grid must resolve to exactly one cluster
  // covering the whole board.
  const mono = Array.from({ length: COLS }, () => Array(CANDY_ROWS).fill("STAR"));
  const clusters = findClusters(mono as never);
  if (clusters.length !== 1 || clusters[0].size !== COLS * CANDY_ROWS) {
    failures++;
    console.log("  FAIL  a fully-matching grid did not resolve to one whole-board cluster");
  }

  // A checkerboard of two symbols must never cluster (no two same-symbol
  // cells are ever orthogonally adjacent).
  const checker = Array.from({ length: COLS }, (_, c) =>
    Array.from({ length: CANDY_ROWS }, (_, r) => ((c + r) % 2 === 0 ? "STAR" : "GEM")),
  );
  if (findClusters(checker as never).length !== 0) {
    failures++;
    console.log("  FAIL  a checkerboard grid produced a cluster");
  }

  // Below MIN_CLUSTER, a small isolated group must not pay.
  const sparse = Array.from({ length: COLS }, () => Array(CANDY_ROWS).fill("GEM"));
  sparse[0][0] = "STAR";
  sparse[1][0] = "STAR";
  sparse[0][1] = "STAR"; // an isolated 3-cell L-shape, below MIN_CLUSTER
  const rest = findClusters(sparse as never).find((c) => c.symbol === "STAR");
  if (rest) {
    failures++;
    console.log(`  FAIL  a ${MIN_CLUSTER - 1 < 3 ? "" : "3-cell"} cluster below MIN_CLUSTER still paid`);
  }
}

// The draw itself must actually be able to produce every symbol — a weight
// typo that zeroes one out would silently break the paytable and the
// "every symbol is reachable" assumption everywhere else in the game.
{
  const seen = new Set<string>();
  for (let i = 0; i < 2000 && seen.size < 7; i++) {
    const g = drawGrid();
    for (const col of g) for (const s of col) seen.add(s);
  }
  if (seen.size < 7) {
    failures++;
    console.log(`  FAIL  only ${seen.size}/7 symbols appeared in 2000 draws — a weight is likely zero`);
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

// ---------------------------------------------------------------- baccarat
console.log("\nBACCARAT (Punto Banco)");

const baccOdds = Bacc.exactOdds();
check("baccarat exact odds sum to 1", baccOdds.player + baccOdds.banker + baccOdds.tie, 1, 1e-9);
console.log(
  `  Exact win odds: player ${pct(baccOdds.player)}, banker ${pct(baccOdds.banker)}, tie ${pct(baccOdds.tie)}`,
);
check("player bet RTP (exact)", Bacc.exactRtp("player"), 0.98765, 1e-4);
check("banker bet RTP (exact)", Bacc.exactRtp("banker"), 0.98942, 1e-4);
check("tie bet RTP (exact)", Bacc.exactRtp("tie"), 0.85640, 1e-4);

// Monte-Carlo the actual dealing function through the same rules, as a check
// on the enumeration independent of it.
const BACC_HANDS = 300_000;
let bp = 0, bb = 0, bt = 0;
for (let i = 0; i < BACC_HANDS; i++) {
  const h = Bacc.playHand();
  if (h.winner === "player") bp++;
  else if (h.winner === "banker") bb++;
  else bt++;
}
// Multinomial variance per outcome ~ p(1-p); 5 SE over 300k hands.
const baccSE = (p: number) => 5 * Math.sqrt((p * (1 - p)) / BACC_HANDS);
check(`${BACC_HANDS.toLocaleString()} simulated hands — player win rate`, bp / BACC_HANDS, baccOdds.player, baccSE(baccOdds.player));
check(`${BACC_HANDS.toLocaleString()} simulated hands — banker win rate`, bb / BACC_HANDS, baccOdds.banker, baccSE(baccOdds.banker));
check(`${BACC_HANDS.toLocaleString()} simulated hands — tie rate`, bt / BACC_HANDS, baccOdds.tie, baccSE(baccOdds.tie));

// ------------------------------------------------------------------- mines
console.log("\nMINES");

// The survival-probability formula must itself be a valid probability, and
// the fair multiplier at r=0 must always be 1 (nothing has been risked yet).
for (const mines of [1, 3, 5, 10, 24]) {
  check(`mines=${mines}: multiplier at 0 reveals is 1x`, Mines.multiplierAt(mines, 0), 1, 0);
  const maxR = Mines.maxSafeReveals(mines);
  for (const r of [1, Math.ceil(maxR / 2), maxR]) {
    check(`mines=${mines} r=${r}: exact RTP at that cash-out`, Mines.exactRtpAt(mines, r), 0.99, 1e-4);
  }
  // Revealing more cells than exist can't happen and must read as impossible,
  // not silently clamp to some other probability.
  check(`mines=${mines}: P(survive more reveals than safe cells exist) = 0`, Mines.survivalProbability(mines, maxR + 1), 0, 1e-12);
}

// Monte-Carlo the actual mine placement: with `mines` mines placed uniformly,
// the empirical rate of a specific cell being a mine should match mines/25.
const MINES_TRIALS = 200_000;
let mineHits = 0;
for (let i = 0; i < MINES_TRIALS; i++) {
  if (Mines.placeMines(5).includes(0)) mineHits++;
}
const expectedCellRate = 5 / Mines.GRID_SIZE;
check(
  "placeMines: empirical P(cell 0 is a mine)",
  mineHits / MINES_TRIALS,
  expectedCellRate,
  5 * Math.sqrt((expectedCellRate * (1 - expectedCellRate)) / MINES_TRIALS),
);

// --------------------------------------------------------------------- hilo
console.log("\nHI-LO");

// With a freshly built full deck and a mid-value current card, the exact
// higher/lower counts must add up (plus ties) to the rest of the deck.
{
  const deck = Hilo.buildDeck();
  const current = deck.pop()!; // hold one card out as "current", rest is "remaining"
  const value = Hilo.RANK_VALUE[current.r];
  const { higher, equal, lower } = Hilo.remainingSplit(deck, value);
  check("hilo: higher+equal+lower accounts for the whole remaining deck", higher + equal + lower, deck.length, 0);
}

// Exact RTP of a single guess, for every possible current-card value, using a
// freshly built deck (52 cards, so the counts are exactly the textbook 4 per
// rank) — every guess should be exactly 99% except where a whole direction
// is impossible (guessing "lower" than the lowest card, etc).
for (let value = 1; value <= 13; value++) {
  // A fresh 52-card deck with exactly one card of `value` removed — as if
  // that single card had just been drawn as "current". 51 cards remain,
  // with 3 (not 0) still left of the current rank, matching a real round.
  const full = Hilo.buildDeck();
  const drawnIdx = full.findIndex((c) => Hilo.RANK_VALUE[c.r] === value);
  const remaining = [...full.slice(0, drawnIdx), ...full.slice(drawnIdx + 1)];
  for (const dir of ["higher", "lower"] as const) {
    if (!Hilo.directionAvailable(remaining, value, dir)) continue;
    const { higher, lower } = Hilo.remainingSplit(remaining, value);
    const favourable = dir === "higher" ? higher : lower;
    const p = favourable / remaining.length;
    const rtp = p * Hilo.multiplierFor(remaining, value, dir);
    check(`hilo value=${value} guess=${dir}: exact RTP`, rtp, 0.99, 1e-3);
  }
}

// Monte-Carlo the whole round-start function: a fresh 52-card deck must have
// exactly 4 of each rank once the first card is drawn as "current".
const HILO_ROUNDS = 20_000;
const rankTally: Record<string, number> = {};
for (let i = 0; i < HILO_ROUNDS; i++) {
  const state = Hilo.newRound(1000);
  rankTally[state.current.r] = (rankTally[state.current.r] ?? 0) + 1;
}
const hiloRanks = Object.keys(rankTally).length;
if (hiloRanks !== 13) {
  failures++;
  console.log(`  FAIL  only ${hiloRanks}/13 ranks appeared as the opening card over ${HILO_ROUNDS} rounds`);
} else {
  console.log(`  PASS  all 13 ranks appeared as the opening card over ${HILO_ROUNDS.toLocaleString()} rounds`);
}

// ----------------------------------------------------------------- done
console.log(
  failures === 0
    ? "\nAll RTP checks passed.\n"
    : `\n${failures} RTP check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

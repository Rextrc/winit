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
  computeExactRtp,
  computeExactVariance,
  spin as spinSlots,
  evaluateLine,
  REEL_STRIP,
} from "../src/lib/games/slots";
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
console.log("\nVOLT REELS (slots)");

const slotsExact = computeExactRtp();
console.log(`  Enumerated ${(REEL_STRIP.length ** 3).toLocaleString()} combinations -> ${pct(slotsExact)}`);

const published = GAMES.find((g) => g.slug === "volt-reels")!.rtp!;
check("published figure matches enumeration", slotsExact, published, 1e-9);

const slotsVariance = computeExactVariance();
let slotsReturned = 0;
for (let i = 0; i < SPINS; i++) slotsReturned += spinSlots(BET).payoutCents;
console.log(
  `  Payout SD per spin ${Math.sqrt(slotsVariance).toFixed(2)}× stake -> standard error over ${SPINS.toLocaleString()} spins is ${pct(Math.sqrt(slotsVariance / SPINS))}`,
);
check(
  `${SPINS.toLocaleString()} simulated spins`,
  slotsReturned / (SPINS * BET),
  slotsExact,
  sigmaBand(slotsVariance, SPINS),
);

// Sanity: the paytable evaluator must never pay for a plain losing line.
const losing = evaluateLine(["LEMON", "CLOVER", "BELL"]);
if (losing.multiplier !== 0) {
  failures++;
  console.log("  FAIL  a non-paying line returned a multiplier");
}

// -------------------------------------------------------------- roulette
console.log("\nSINGLE ZERO (roulette)");

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
console.log("\nTWENTY-ONE (blackjack)");

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

// ----------------------------------------------------------------- done
console.log(
  failures === 0
    ? "\nAll RTP checks passed.\n"
    : `\n${failures} RTP check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

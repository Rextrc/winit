import { scaledBonusCents } from "@/lib/money";

/**
 * WINIT — DAILY AND WEEKLY CHALLENGES
 * ---------------------------------------------------------------------------
 * A rotating set of objectives, picked deterministically from the period key
 * so every player on a given day gets the same board and it can be reasoned
 * about rather than being a per-user surprise.
 *
 * THE EXPLOIT THIS IS BUILT AROUND
 * ---------------------------------------------------------------------------
 * The project already learned this lesson once, with level-up rewards: XP is
 * earned on AMOUNT STAKED, so anything that pays currency for volume is free
 * money bought by betting enough, and it beats the house edge by simply
 * playing more. Level-ups pay nothing for exactly that reason.
 *
 * Challenges would reintroduce it, so they are split:
 *
 *   VOLUME objectives  (place N bets, stake X, try N games)
 *       -> pay XP and reputation ONLY. Never a cent.
 *
 *   OUTCOME objectives (win N times, land a big multiplier)
 *       -> may pay currency, because they cannot be completed to order.
 *
 * And on top of that, the currency is capped by construction: there are a
 * fixed number of challenges per period and each pays a bounded, bonus-scaled
 * amount, so the most a player can extract in a day is a known number in the
 * same order as the daily bonus itself — far less than the expected loss of
 * the volume needed to finish them.
 * ---------------------------------------------------------------------------
 */

export type ChallengeKind = "VOLUME" | "OUTCOME";

export type ChallengeDef = {
  key: string;
  name: string;
  description: (target: number) => string;
  kind: ChallengeKind;
  /** How progress is measured against a settled bet. */
  metric:
    | { type: "BETS" }
    | { type: "WAGERED" }
    | { type: "WINS" }
    | { type: "GAME_BETS"; game: string }
    | { type: "DISTINCT_GAMES" }
    | { type: "MULTIPLIER_AT_LEAST"; multiplier: number };
  /** Target for a daily board, and for a weekly one. */
  dailyTarget: number;
  weeklyTarget: number;
  xp: number;
  reputation: number;
  /**
   * Base currency reward before the rebirth scaling the daily bonus uses.
   * Must be 0 for every VOLUME challenge — the constructor below enforces it.
   */
  baseCents: number;
};

const DEFS: ChallengeDef[] = [
  {
    key: "place-bets",
    name: "Clock In",
    description: (n) => `Place ${n.toLocaleString()} bets.`,
    kind: "VOLUME",
    metric: { type: "BETS" },
    dailyTarget: 25,
    weeklyTarget: 150,
    xp: 400,
    reputation: 60,
    baseCents: 0,
  },
  {
    key: "stake-volume",
    name: "Money Through",
    description: (n) => `Stake ${(n / 100).toLocaleString()} in total.`,
    kind: "VOLUME",
    metric: { type: "WAGERED" },
    dailyTarget: 500_000,
    weeklyTarget: 4_000_000,
    xp: 600,
    reputation: 90,
    baseCents: 0,
  },
  {
    key: "spread-out",
    name: "Shop Around",
    description: (n) => `Play ${n} different games.`,
    kind: "VOLUME",
    metric: { type: "DISTINCT_GAMES" },
    dailyTarget: 4,
    weeklyTarget: 10,
    xp: 350,
    reputation: 70,
    baseCents: 0,
  },
  {
    key: "win-hands",
    name: "On the Right Side",
    description: (n) => `Win ${n} bets.`,
    kind: "OUTCOME",
    metric: { type: "WINS" },
    dailyTarget: 12,
    weeklyTarget: 80,
    xp: 300,
    reputation: 80,
    baseCents: 120_000,
  },
  {
    key: "hit-5x",
    name: "Worth Watching",
    description: (n) => `Land ${n} win${n === 1 ? "" : "s"} paying 5x or better.`,
    kind: "OUTCOME",
    metric: { type: "MULTIPLIER_AT_LEAST", multiplier: 5 },
    dailyTarget: 2,
    weeklyTarget: 12,
    xp: 350,
    reputation: 110,
    baseCents: 150_000,
  },
  {
    key: "hit-25x",
    name: "Story for the Bar",
    description: (n) => `Land ${n} win${n === 1 ? "" : "s"} paying 25x or better.`,
    kind: "OUTCOME",
    metric: { type: "MULTIPLIER_AT_LEAST", multiplier: 25 },
    dailyTarget: 1,
    weeklyTarget: 5,
    xp: 500,
    reputation: 180,
    baseCents: 250_000,
  },
  {
    key: "roulette-regular",
    name: "At the Wheel",
    description: (n) => `Spin roulette ${n} times.`,
    kind: "VOLUME",
    metric: { type: "GAME_BETS", game: "roulette" },
    dailyTarget: 15,
    weeklyTarget: 90,
    xp: 300,
    reputation: 55,
    baseCents: 0,
  },
  {
    key: "cards-regular",
    name: "Card Sharp",
    description: (n) => `Play ${n} hands of blackjack.`,
    kind: "VOLUME",
    metric: { type: "GAME_BETS", game: "blackjack" },
    dailyTarget: 15,
    weeklyTarget: 90,
    xp: 300,
    reputation: 55,
    baseCents: 0,
  },
  {
    key: "crash-runs",
    name: "Hold Your Nerve",
    description: (n) => `Ride the crash curve ${n} times.`,
    kind: "VOLUME",
    metric: { type: "GAME_BETS", game: "crash" },
    dailyTarget: 12,
    weeklyTarget: 70,
    xp: 300,
    reputation: 65,
    baseCents: 0,
  },
  {
    key: "slots-spins",
    name: "One More Spin",
    description: (n) => `Spin the slots ${n} times.`,
    kind: "VOLUME",
    metric: { type: "GAME_BETS", game: "slots" },
    dailyTarget: 30,
    weeklyTarget: 180,
    xp: 300,
    reputation: 50,
    baseCents: 0,
  },
];

// A VOLUME challenge paying currency is the exploit this module exists to
// prevent, so it is a startup error rather than a code review note.
for (const d of DEFS) {
  if (d.kind === "VOLUME" && d.baseCents !== 0) {
    throw new Error(`challenge ${d.key}: VOLUME challenges must never pay currency`);
  }
}

export const CHALLENGE_DEFS = DEFS;

export function challengeByKey(key: string): ChallengeDef | undefined {
  return DEFS.find((d) => d.key === key);
}

export type Period = "daily" | "weekly";

export const DAILY_SLOTS = 3;
export const WEEKLY_SLOTS = 2;

/** UTC day key, e.g. "2026-09-01". */
export function dailyKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** UTC ISO-week key, e.g. "2026-W36". */
export function weeklyKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // ISO weeks run Monday-Sunday and are numbered from the week containing Jan 4.
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function periodKey(period: Period, now = new Date()): string {
  return period === "daily" ? dailyKey(now) : weeklyKey(now);
}

/** Small deterministic hash, so a period key always picks the same board. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The board for a period. Deterministic in the period key, so it is the same
 * for everyone and the same on every request — no stored randomness needed.
 */
export function boardFor(period: Period, key: string): ChallengeDef[] {
  const slots = period === "daily" ? DAILY_SLOTS : WEEKLY_SLOTS;
  const pool = [...DEFS];
  const picked: ChallengeDef[] = [];
  let h = hash(`${period}:${key}`);

  while (picked.length < slots && pool.length > 0) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const idx = h % pool.length;
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }

  // A board should always have at least one thing that pays, or the day reads
  // as pointless; if the draw came out all-volume, swap the last slot.
  if (!picked.some((d) => d.kind === "OUTCOME")) {
    const outcome = DEFS.filter((d) => d.kind === "OUTCOME");
    h = Math.imul(h ^ (h >>> 13), 2246822507) >>> 0;
    picked[picked.length - 1] = outcome[h % outcome.length];
  }

  return picked;
}

export function targetFor(def: ChallengeDef, period: Period): number {
  return period === "daily" ? def.dailyTarget : def.weeklyTarget;
}

/** Weekly rewards are worth more, in proportion to the bigger target. */
export function rewardFor(def: ChallengeDef, period: Period, rebirths: number) {
  const scale = period === "daily" ? 1 : 3;
  return {
    xp: def.xp * scale,
    reputation: def.reputation * scale,
    cents: def.baseCents === 0 ? 0 : scaledBonusCents(def.baseCents * scale, rebirths),
  };
}

/**
 * The most currency a player can claim in one day, before rebirth scaling —
 * used by the harness to prove the faucet is bounded.
 */
export function maxDailyCents(): number {
  const outcomes = DEFS.filter((d) => d.kind === "OUTCOME")
    .map((d) => d.baseCents)
    .sort((a, b) => b - a);
  return outcomes.slice(0, DAILY_SLOTS).reduce((a, b) => a + b, 0);
}

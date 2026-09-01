import { PLAYABLE } from "@/lib/games/registry";

/**
 * WINIT — ACHIEVEMENTS
 * ---------------------------------------------------------------------------
 * A catalogue of things that are true or not true about an account, and a pure
 * predicate for each. Nothing here is awarded by a route saying so: the whole
 * list is re-evaluated against a real statistics snapshot after every settled
 * bet, and an achievement unlocks the first time its own predicate returns
 * true. That means they can never drift out of sync with the data, and it also
 * means one cannot be granted by a client asking nicely.
 *
 * Achievements pay no currency. They are a record, not a faucet — see the
 * challenges module for the one bounded exception and why it is bounded.
 * ---------------------------------------------------------------------------
 */

export type AchievementTier = "bronze" | "silver" | "gold" | "secret";

export type StatSnapshot = {
  level: number;
  rebirths: number;
  livesLived: number;
  reputation: number;
  repTierIndex: number;
  vipLevel: number;
  lifetimeWageredCents: number;
  lifetimeWonCents: number;
  biggestWinCents: number;
  bestMultiplier: number;
  betsThisLife: number;
  careerDays: number;
  age: number;
  balanceCents: number;
  peakBalanceCents: number;
  comebacksUsed: number;
  venueId: string;
  venuesVisited: string[];
  /** Per-engine counters, keyed by the engine key used in the ledger. */
  games: Record<string, { bets: number; wins: number; wageredCents: number; biggestWinCents: number }>;
  distinctGamesPlayed: number;
  distinctGamesWon: number;
};

export type Achievement = {
  key: string;
  name: string;
  description: string;
  tier: AchievementTier;
  category: "Career" | "Money" | "Games" | "Risk" | "Reputation" | "Endgame";
  /** Hidden from the list until unlocked. */
  secret?: boolean;
  earned: (s: StatSnapshot) => boolean;
  /** Optional 0..1 progress, for the ones worth showing a bar for. */
  progress?: (s: StatSnapshot) => number;
};

const ratio = (a: number, b: number) => Math.max(0, Math.min(1, b <= 0 ? 0 : a / b));

export const ACHIEVEMENTS: Achievement[] = [
  // --- Career -------------------------------------------------------------
  {
    key: "first-bet",
    name: "Sat Down",
    description: "Place your first bet.",
    tier: "bronze",
    category: "Career",
    earned: (s) => s.betsThisLife >= 1 || s.lifetimeWageredCents > 0,
  },
  {
    key: "level-10",
    name: "Desk Jockey",
    description: "Reach level 10.",
    tier: "bronze",
    category: "Career",
    earned: (s) => s.level >= 10,
    progress: (s) => ratio(s.level, 10),
  },
  {
    key: "level-25",
    name: "High Roller",
    description: "Reach level 25.",
    tier: "silver",
    category: "Career",
    earned: (s) => s.level >= 25,
    progress: (s) => ratio(s.level, 25),
  },
  {
    key: "level-50",
    name: "Top of the Ladder",
    description: "Reach level 50.",
    tier: "gold",
    category: "Career",
    earned: (s) => s.level >= 50,
    progress: (s) => ratio(s.level, 50),
  },
  {
    key: "first-rebirth",
    name: "Second Wind",
    description: "Take a rebirth and give up the bankroll.",
    tier: "silver",
    category: "Career",
    earned: (s) => s.rebirths >= 1,
  },
  {
    key: "rebirth-5",
    name: "Serial Restarter",
    description: "Take five rebirths in one life.",
    tier: "gold",
    category: "Career",
    earned: (s) => s.rebirths >= 5,
    progress: (s) => ratio(s.rebirths, 5),
  },
  {
    key: "thousand-bets",
    name: "Grinder",
    description: "Place 1,000 bets in a single life.",
    tier: "silver",
    category: "Career",
    earned: (s) => s.betsThisLife >= 1000,
    progress: (s) => ratio(s.betsThisLife, 1000),
  },
  {
    key: "midlife",
    name: "Halfway There",
    description: "Reach 49 with a career still running.",
    tier: "bronze",
    category: "Career",
    earned: (s) => s.age >= 49,
    progress: (s) => ratio(s.age - 18, 31),
  },

  // --- Money --------------------------------------------------------------
  {
    key: "win-1k",
    name: "First Real Win",
    description: "Win 1,000.00 on a single bet.",
    tier: "bronze",
    category: "Money",
    earned: (s) => s.biggestWinCents >= 100_000,
    progress: (s) => ratio(s.biggestWinCents, 100_000),
  },
  {
    key: "win-100k",
    name: "Proper Score",
    description: "Win 100,000.00 on a single bet.",
    tier: "silver",
    category: "Money",
    earned: (s) => s.biggestWinCents >= 10_000_000,
    progress: (s) => ratio(s.biggestWinCents, 10_000_000),
  },
  {
    key: "win-1m",
    name: "Seven Figures",
    description: "Win 1,000,000.00 on a single bet.",
    tier: "gold",
    category: "Money",
    earned: (s) => s.biggestWinCents >= 100_000_000,
    progress: (s) => ratio(s.biggestWinCents, 100_000_000),
  },
  {
    key: "bank-1m",
    name: "Millionaire",
    description: "Hold 1,000,000.00 at once.",
    tier: "silver",
    category: "Money",
    earned: (s) => s.peakBalanceCents >= 100_000_000,
    progress: (s) => ratio(s.peakBalanceCents, 100_000_000),
  },
  {
    key: "bank-100m",
    name: "Obscene",
    description: "Hold 100,000,000.00 at once.",
    tier: "gold",
    category: "Money",
    earned: (s) => s.peakBalanceCents >= 10_000_000_000,
    progress: (s) => ratio(s.peakBalanceCents, 10_000_000_000),
  },
  {
    key: "wagered-1m",
    name: "Volume Player",
    description: "Stake 1,000,000.00 across your whole account.",
    tier: "bronze",
    category: "Money",
    earned: (s) => s.lifetimeWageredCents >= 100_000_000,
    progress: (s) => ratio(s.lifetimeWageredCents, 100_000_000),
  },
  {
    key: "wagered-1b",
    name: "Through the House",
    description: "Stake 1,000,000,000.00 across your whole account.",
    tier: "gold",
    category: "Money",
    earned: (s) => s.lifetimeWageredCents >= 100_000_000_000,
    progress: (s) => ratio(s.lifetimeWageredCents, 100_000_000_000),
  },

  // --- Risk ---------------------------------------------------------------
  {
    key: "mult-10",
    name: "Double Digits",
    description: "Land a 10x return on one bet.",
    tier: "bronze",
    category: "Risk",
    earned: (s) => s.bestMultiplier >= 10,
    progress: (s) => ratio(s.bestMultiplier, 10),
  },
  {
    key: "mult-100",
    name: "Three Zeroes",
    description: "Land a 100x return on one bet.",
    tier: "silver",
    category: "Risk",
    earned: (s) => s.bestMultiplier >= 100,
    progress: (s) => ratio(s.bestMultiplier, 100),
  },
  {
    key: "mult-1000",
    name: "Ridiculous",
    description: "Land a 1,000x return on one bet.",
    tier: "gold",
    category: "Risk",
    earned: (s) => s.bestMultiplier >= 1000,
    progress: (s) => ratio(s.bestMultiplier, 1000),
  },
  {
    key: "comeback-1",
    name: "Borrowed Time",
    description: "Go broke and come back from it.",
    tier: "bronze",
    category: "Risk",
    earned: (s) => s.comebacksUsed >= 1,
  },
  {
    key: "comeback-all",
    name: "Out of Chances",
    description: "Burn all three comebacks in one life.",
    tier: "silver",
    category: "Risk",
    earned: (s) => s.comebacksUsed >= 3,
    progress: (s) => ratio(s.comebacksUsed, 3),
  },

  // --- Games --------------------------------------------------------------
  {
    key: "tried-5",
    name: "Browsing",
    description: "Play five different games.",
    tier: "bronze",
    category: "Games",
    earned: (s) => s.distinctGamesPlayed >= 5,
    progress: (s) => ratio(s.distinctGamesPlayed, 5),
  },
  {
    key: "tried-all",
    name: "Completionist",
    description: `Play all ${PLAYABLE.length} games at least once.`,
    tier: "gold",
    category: "Games",
    earned: (s) => s.distinctGamesPlayed >= PLAYABLE.length,
    progress: (s) => ratio(s.distinctGamesPlayed, PLAYABLE.length),
  },
  {
    key: "won-10-games",
    name: "Spread Around",
    description: "Win at ten different games.",
    tier: "silver",
    category: "Games",
    earned: (s) => s.distinctGamesWon >= 10,
    progress: (s) => ratio(s.distinctGamesWon, 10),
  },
  {
    key: "roulette-100",
    name: "Wheel Watcher",
    description: "Spin the roulette wheel 100 times.",
    tier: "bronze",
    category: "Games",
    earned: (s) => (s.games.roulette?.bets ?? 0) >= 100,
    progress: (s) => ratio(s.games.roulette?.bets ?? 0, 100),
  },
  {
    key: "blackjack-100",
    name: "Card Counter",
    description: "Play 100 hands of blackjack.",
    tier: "bronze",
    category: "Games",
    earned: (s) => (s.games.blackjack?.bets ?? 0) >= 100,
    progress: (s) => ratio(s.games.blackjack?.bets ?? 0, 100),
  },
  {
    key: "slots-500",
    name: "One More Spin",
    description: "Spin the slots 500 times.",
    tier: "silver",
    category: "Games",
    earned: (s) => (s.games.slots?.bets ?? 0) >= 500,
    progress: (s) => ratio(s.games.slots?.bets ?? 0, 500),
  },
  {
    key: "crash-50",
    name: "Nerve",
    description: "Ride the crash curve 50 times.",
    tier: "bronze",
    category: "Games",
    earned: (s) => (s.games.crash?.bets ?? 0) >= 50,
    progress: (s) => ratio(s.games.crash?.bets ?? 0, 50),
  },
  {
    key: "towers-top",
    name: "Vertigo",
    description: "Win at Towers 25 times.",
    tier: "silver",
    category: "Games",
    earned: (s) => (s.games.towers?.wins ?? 0) >= 25,
    progress: (s) => ratio(s.games.towers?.wins ?? 0, 25),
  },
  {
    key: "lottery-win",
    name: "Someone Has To",
    description: "Win anything on the lottery.",
    tier: "bronze",
    category: "Games",
    earned: (s) => (s.games.lottery?.wins ?? 0) >= 1,
  },

  // --- Reputation & venues ------------------------------------------------
  {
    key: "rep-regular",
    name: "The Usual",
    description: "Reach the Regular reputation tier.",
    tier: "bronze",
    category: "Reputation",
    earned: (s) => s.repTierIndex >= 2,
  },
  {
    key: "rep-respected",
    name: "Respected",
    description: "Reach the Respected reputation tier.",
    tier: "silver",
    category: "Reputation",
    earned: (s) => s.repTierIndex >= 4,
  },
  {
    key: "rep-legend",
    name: "Legend of the Floor",
    description: "Reach the top reputation tier.",
    tier: "gold",
    category: "Reputation",
    earned: (s) => s.repTierIndex >= 6,
  },
  {
    key: "travelled-3",
    name: "On the Circuit",
    description: "Play in three different rooms.",
    tier: "bronze",
    category: "Reputation",
    earned: (s) => s.venuesVisited.length >= 3,
    progress: (s) => ratio(s.venuesVisited.length, 3),
  },
  {
    key: "travelled-all",
    name: "Every Room",
    description: "Play in all seven rooms on the circuit.",
    tier: "gold",
    category: "Reputation",
    earned: (s) => s.venuesVisited.length >= 7,
    progress: (s) => ratio(s.venuesVisited.length, 7),
  },
  {
    key: "vip-gold",
    name: "Comped",
    description: "Reach Gold VIP.",
    tier: "silver",
    category: "Reputation",
    earned: (s) => s.vipLevel >= 3,
    progress: (s) => ratio(s.vipLevel, 3),
  },
  {
    key: "vip-black",
    name: "No Tier Above",
    description: "Reach Black VIP.",
    tier: "gold",
    category: "Reputation",
    earned: (s) => s.vipLevel >= 6,
    progress: (s) => ratio(s.vipLevel, 6),
  },

  // --- Endgame ------------------------------------------------------------
  {
    key: "second-life",
    name: "Someone Else's Turn",
    description: "Finish a career and start another.",
    tier: "silver",
    category: "Endgame",
    earned: (s) => s.livesLived >= 1,
  },
  {
    key: "five-lives",
    name: "Dynasty",
    description: "Finish five careers on one account.",
    tier: "gold",
    category: "Endgame",
    earned: (s) => s.livesLived >= 5,
    progress: (s) => ratio(s.livesLived, 5),
  },
  {
    key: "the-vault",
    name: "Invited",
    description: "Get through the door at The Vault.",
    tier: "gold",
    category: "Endgame",
    earned: (s) => s.venuesVisited.includes("the-vault"),
  },

  // --- Secret -------------------------------------------------------------
  {
    key: "secret-broke-rich",
    name: "Round Trip",
    description: "Go broke after having held over 1,000,000.00.",
    tier: "secret",
    category: "Risk",
    secret: true,
    earned: (s) => s.peakBalanceCents >= 100_000_000 && s.comebacksUsed >= 1,
  },
  {
    key: "secret-minimalist",
    name: "Minimalist",
    description: "Reach level 20 without ever holding more than 200,000.00.",
    tier: "secret",
    category: "Money",
    secret: true,
    earned: (s) => s.level >= 20 && s.peakBalanceCents <= 20_000_000,
  },
  {
    key: "secret-old-money",
    name: "Old Money",
    description: "Still be playing at 75 with a seven-figure bankroll.",
    tier: "secret",
    category: "Endgame",
    secret: true,
    earned: (s) => s.age >= 75 && s.balanceCents >= 100_000_000,
  },
  {
    key: "secret-purist",
    name: "Purist",
    description: "Place 200 bets without ever touching the slots.",
    tier: "secret",
    category: "Games",
    secret: true,
    earned: (s) => s.betsThisLife >= 200 && (s.games.slots?.bets ?? 0) === 0,
  },
];

export const ACHIEVEMENT_KEYS = new Set(ACHIEVEMENTS.map((a) => a.key));

export function achievementByKey(key: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key);
}

/**
 * Which achievements are true right now but not yet in `alreadyUnlocked`.
 * Pure — the caller decides what to do about them.
 */
export function newlyEarned(snapshot: StatSnapshot, alreadyUnlocked: Set<string>): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !alreadyUnlocked.has(a.key) && a.earned(snapshot));
}

export const TIER_ORDER: AchievementTier[] = ["bronze", "silver", "gold", "secret"];

export const TIER_LABELS: Record<AchievementTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  secret: "Secret",
};

export const TIER_COLOURS: Record<AchievementTier, string> = {
  bronze: "#c98b52",
  silver: "#cbd5e1",
  gold: "#f0c75e",
  secret: "#c98bff",
};

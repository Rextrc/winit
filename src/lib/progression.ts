/**
 * WINIT — LIFE PROGRESSION
 * ---------------------------------------------------------------------------
 * A career ladder layered over the casino. Staking fake money earns XP, XP
 * earns levels, levels raise the table limit and unlock features, and at the
 * top of the ladder you can REBIRTH: hand back your level for a permanent
 * multiplier on every future table limit.
 *
 * Two deliberate design rules:
 *
 *  1. XP is earned on AMOUNT STAKED, never on amount won. Progression tracks
 *     how much you played, not how lucky you got, so it can't be farmed by a
 *     hot streak and isn't stalled by a cold one.
 *
 *  2. Nothing here is a top-up path. Levelling grants fake chips exactly the
 *     way the daily bonus does; there is still no way to put real value in or
 *     take real value out of an account.
 * ---------------------------------------------------------------------------
 */

export const MAX_LEVEL = 50;
export const MAX_REBIRTHS = 10;

/** Table limit for a brand-new level 1, rebirth 0 account: 1,000.00. */
export const BASE_TABLE_LIMIT_CENTS = 100_000;

/** Each level adds 30% of the base limit; each rebirth triples the whole thing. */
const LEVEL_LIMIT_STEP = 0.3;
const REBIRTH_LIMIT_FACTOR = 3;

/** Fake chips granted at sign-up and re-granted as a floor on rebirth. */
export const STARTING_BALANCE_CENTS = 10_000_000; // 100,000.00

export type Unlock = "TURBO" | "BUY_FREE" | "BUY_SUPER" | "REBIRTH";

export const UNLOCK_LEVELS: Record<Unlock, number> = {
  TURBO: 3,
  BUY_FREE: 6,
  BUY_SUPER: 15,
  REBIRTH: MAX_LEVEL,
};

export const UNLOCK_LABELS: Record<Unlock, string> = {
  TURBO: "Turbo spins",
  BUY_FREE: "Bonus buy — Free Spins",
  BUY_SUPER: "Bonus buy — Super Free Spins",
  REBIRTH: "Rebirth",
};

export const UNLOCK_BLURBS: Record<Unlock, string> = {
  TURBO: "Skip the reel animation and resolve spins instantly.",
  BUY_FREE: "Pay a fixed price to jump straight into the free spins round.",
  BUY_SUPER: "Buy the 5-scatter entry: more spins at a ×3 multiplier.",
  REBIRTH: "Trade your level for a permanent ×3 on every future table limit.",
};

/** The career track. Each band renames your account and reads as a life stage. */
export type Stage = { from: number; title: string; blurb: string };

export const STAGES: Stage[] = [
  { from: 1, title: "Broke Student", blurb: "Playing the minimum and hoping." },
  { from: 5, title: "Night Shift", blurb: "Grinding hours for a bankroll." },
  { from: 10, title: "Desk Jockey", blurb: "Steady money, steadier stakes." },
  { from: 15, title: "Floor Manager", blurb: "You know where the good tables are." },
  { from: 20, title: "Small-Time Shark", blurb: "The pit boss knows your face." },
  { from: 25, title: "High Roller", blurb: "Comped, watched, and betting big." },
  { from: 30, title: "Whale Watcher", blurb: "You are the reason for the limits." },
  { from: 35, title: "Syndicate Boss", blurb: "Other people play on your money now." },
  { from: 40, title: "Casino Magnate", blurb: "You own a piece of the floor." },
  { from: 45, title: "Living Legend", blurb: "They tell stories about your worst night." },
  { from: MAX_LEVEL, title: "Ready to Rebirth", blurb: "There is nothing left to climb. Start again, richer." },
];

export function stageFor(level: number): Stage {
  let found = STAGES[0];
  for (const s of STAGES) if (level >= s.from) found = s;
  return found;
}

/**
 * XP needed to advance FROM `level` to `level + 1`.
 * Quadratic, so early levels arrive quickly and the last ten are a real climb.
 * Cumulative cost of the full 1 -> 50 ladder is 1,316,875 XP.
 */
export function xpToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return 250 * level + 25 * level * level;
}

/** Total XP the whole ladder costs, from level 1 to MAX_LEVEL. */
export function totalLadderXp(): number {
  let sum = 0;
  for (let l = 1; l < MAX_LEVEL; l++) sum += xpToNext(l);
  return sum;
}

/** Rebirths make re-levelling faster: +50% XP each. */
export function xpMultiplier(rebirths: number): number {
  return 1 + 0.5 * rebirths;
}

/**
 * XP awarded for staking `betCents`. One XP per 1.00 staked, before the
 * rebirth multiplier. Always at least 1 so a minimum bet still counts.
 */
export function xpForWager(betCents: number, rebirths: number): number {
  const base = Math.floor(betCents / 100);
  return Math.max(1, Math.floor(base * xpMultiplier(rebirths)));
}

/** Permanent multiplier on table limits from rebirths alone. */
export function rebirthMultiplier(rebirths: number): number {
  return REBIRTH_LIMIT_FACTOR ** Math.min(rebirths, MAX_REBIRTHS);
}

/** The player's personal table limit — the maximum stake on any single bet. */
export function maxBetCents(level: number, rebirths: number): number {
  const lvl = Math.min(Math.max(level, 1), MAX_LEVEL);
  const levelFactor = 1 + LEVEL_LIMIT_STEP * (lvl - 1);
  return Math.round(BASE_TABLE_LIMIT_CENTS * levelFactor * rebirthMultiplier(rebirths));
}

/** Daily bonus scales with rebirth so it stays meaningful at high limits. */
export function bonusScale(rebirths: number): number {
  return rebirthMultiplier(rebirths);
}

export function isUnlocked(unlock: Unlock, level: number, rebirths: number): boolean {
  // Anything earned in a past life stays unlocked — rebirth resets the ladder,
  // not your know-how.
  if (rebirths > 0 && unlock !== "REBIRTH") return true;
  return level >= UNLOCK_LEVELS[unlock];
}

export function unlocksAt(level: number): Unlock[] {
  return (Object.keys(UNLOCK_LEVELS) as Unlock[]).filter((u) => UNLOCK_LEVELS[u] === level);
}

export type Progression = {
  level: number;
  xp: number;
  xpToNext: number;
  /** 0..1 progress through the current level. 1 at max level. */
  progress: number;
  rebirths: number;
  stage: Stage;
  nextStage: Stage | null;
  maxBetCents: number;
  rebirthMultiplier: number;
  xpMultiplier: number;
  canRebirth: boolean;
  unlocked: Record<Unlock, boolean>;
  lifetimeWageredCents: number;
  lifetimeWonCents: number;
  biggestWinCents: number;
  bestMultiplier: number;
};

export type ProgressionSource = {
  level: number;
  xp: number;
  rebirths: number;
  lifetimeWageredCents: number;
  lifetimeWonCents: number;
  biggestWinCents: number;
  bestMultiplierX100: number;
};

export function describeProgression(u: ProgressionSource): Progression {
  const need = xpToNext(u.level);
  const stage = stageFor(u.level);
  const nextStage = STAGES.find((s) => s.from > u.level) ?? null;

  return {
    level: u.level,
    xp: u.xp,
    xpToNext: need,
    progress: need === 0 ? 1 : Math.min(1, u.xp / need),
    rebirths: u.rebirths,
    stage,
    nextStage,
    maxBetCents: maxBetCents(u.level, u.rebirths),
    rebirthMultiplier: rebirthMultiplier(u.rebirths),
    xpMultiplier: xpMultiplier(u.rebirths),
    canRebirth: u.level >= MAX_LEVEL && u.rebirths < MAX_REBIRTHS,
    unlocked: {
      TURBO: isUnlocked("TURBO", u.level, u.rebirths),
      BUY_FREE: isUnlocked("BUY_FREE", u.level, u.rebirths),
      BUY_SUPER: isUnlocked("BUY_SUPER", u.level, u.rebirths),
      REBIRTH: isUnlocked("REBIRTH", u.level, u.rebirths),
    },
    lifetimeWageredCents: u.lifetimeWageredCents,
    lifetimeWonCents: u.lifetimeWonCents,
    biggestWinCents: u.biggestWinCents,
    bestMultiplier: u.bestMultiplierX100 / 100,
  };
}

export type LevelUpEvent = {
  level: number;
  stage: Stage;
  unlocked: Unlock[];
  maxBetCents: number;
};

/**
 * Applies an XP award, rolling the player up through as many levels as it
 * covers. Pure.
 *
 * Deliberately pays out no currency: XP is earned on amount staked regardless
 * of win or loss, so any cash reward here would be free money bought with
 * volume rather than luck — bet the table limit enough times at even the
 * lowest house edge in the app and the reward would outrun the guaranteed
 * losses many times over. Leveling raises the table limit and unlocks
 * features; the daily bonus remains the only balance top-up.
 */
export function applyXp(
  current: { level: number; xp: number; rebirths: number },
  gainedXp: number,
): { level: number; xp: number; levelUps: LevelUpEvent[] } {
  let { level, xp } = current;
  const levelUps: LevelUpEvent[] = [];

  xp += gainedXp;

  while (level < MAX_LEVEL) {
    const need = xpToNext(level);
    if (xp < need) break;
    xp -= need;
    level += 1;
    levelUps.push({
      level,
      stage: stageFor(level),
      unlocked: unlocksAt(level),
      maxBetCents: maxBetCents(level, current.rebirths),
    });
  }

  // At the ceiling XP stops accruing — the ladder is finished until rebirth.
  if (level >= MAX_LEVEL) xp = 0;

  return { level, xp, levelUps };
}

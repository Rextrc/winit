/**
 * WINIT — THE CAREER
 * ---------------------------------------------------------------------------
 * The layer above the ladder. A WinIt account is not one gambler, it is a
 * succession of them: you start at 18 with a stake, you play, you age, and one
 * day you either run out of money or you run out of years. Then someone else
 * picks up where you left off.
 *
 * Three clocks run at once:
 *
 *   LEVEL     rises with volume staked and raises your table limit.
 *   REBIRTH   trades a finished ladder for a permanent multiplier on it.
 *   LIFE      counts down whatever you do, and cannot be bought back.
 *
 * The last one is the point. Every settled bet costs the same fixed slice of
 * your remaining life, so the career is a budget of roughly 1,500 bets no
 * matter how you spend it — chase a big score at one table or grind small ones
 * at another, the clock does not care.
 *
 * WHAT THIS LAYER DOES NOT DO
 * ---------------------------------------------------------------------------
 * It never touches the odds. Every venue deals exactly the same games at
 * exactly the same published RTP; what a venue changes is the size of the
 * table and the price of the ticket to get in. There is no "luckier" room and
 * no way to buy one, because a career layer that quietly moved the house edge
 * would make every RTP figure in this project a lie.
 *
 * It is also not a way in for real money. Dying and starting again re-grants
 * the same fake sign-up stake the daily bonus already hands out, and getting
 * there costs you a whole career first — it is strictly a worse deal than
 * simply claiming the bonus, which is the point.
 * ---------------------------------------------------------------------------
 */

import { STARTING_BALANCE_CENTS } from "@/lib/progression";
import { tableMinCents, venueById } from "@/lib/life/venues";

export const START_AGE = 18;
export const END_AGE = 80;
export const DAYS_PER_YEAR = 365;

/** The whole budget of a life, in days. */
export const LIFE_DAYS = (END_AGE - START_AGE) * DAYS_PER_YEAR;

/**
 * What one settled bet costs you. 15 days a bet spends the 22,630-day budget
 * over roughly 1,509 bets — long enough to be a career, short enough that the
 * end is always in view.
 */
export const DAYS_PER_BET = 15;

/** Total bets a life lasts if nothing goes wrong. */
export const BETS_PER_LIFE = Math.floor(LIFE_DAYS / DAYS_PER_BET);

/**
 * Going broke is survivable, three times. Each recovery costs three years of
 * the clock — the time it took to find the money — so a career spent busting
 * is a career that ends early even if the last stake holds.
 */
export const COMEBACKS_PER_LIFE = 3;
export const COMEBACK_DAYS = 3 * DAYS_PER_YEAR;

/** The stake a comeback puts back in your hand. Same grant as sign-up. */
export const COMEBACK_STAKE_CENTS = STARTING_BALANCE_CENTS;

export type DeathCause = "RUIN" | "OLD_AGE";

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

export function ageFromDays(days: number): number {
  return START_AGE + Math.floor(days / DAYS_PER_YEAR);
}

/** 0..1 through the whole life. Clamped, so a finished life reads exactly 1. */
export function lifeProgress(days: number): number {
  return Math.min(1, Math.max(0, days / LIFE_DAYS));
}

export function daysRemaining(days: number): number {
  return Math.max(0, LIFE_DAYS - days);
}

export function betsRemaining(days: number): number {
  return Math.floor(daysRemaining(days) / DAYS_PER_BET);
}

export function isOverTheHill(days: number): boolean {
  return days >= LIFE_DAYS;
}

// ---------------------------------------------------------------------------
// Legacy — what survives a death
// ---------------------------------------------------------------------------

/**
 * Each completed life makes the next one quicker to build. Nothing else
 * carries over: no balance, no level, no rebirths.
 */
export function legacyXpMultiplier(livesLived: number): number {
  return 1 + 0.25 * livesLived;
}

/** The level an heir starts at, capped so the ladder is never skipped. */
export function startingLevel(livesLived: number): number {
  return Math.min(1 + 2 * livesLived, 10);
}

// ---------------------------------------------------------------------------
// The live view of a career
// ---------------------------------------------------------------------------

export type CareerState = {
  livesLived: number;
  careerDays: number;
  age: number;
  /** 0..1 through the whole life. */
  progress: number;
  daysRemaining: number;
  betsRemaining: number;
  comebacksUsed: number;
  comebacksLeft: number;
  betsThisLife: number;
  peakBalanceCents: number;
  legacyXpMultiplier: number;
  venueId: string;
  venueName: string;
  venueCity: string;
  /** Smallest stake the current room will take. */
  tableMinCents: number;
  /** True once the career has ended and betting is closed. */
  over: boolean;
  deathCause: DeathCause | null;
};

export type CareerSource = {
  livesLived: number;
  careerDays: number;
  comebacksUsed: number;
  betsThisLife: number;
  peakBalanceCents: number;
  venueId: string;
  deathCause: string | null;
};

export function describeCareer(c: CareerSource, maxBetCents: number, floorCents: number): CareerState {
  const venue = venueById(c.venueId);
  return {
    livesLived: c.livesLived,
    careerDays: c.careerDays,
    age: ageFromDays(c.careerDays),
    progress: lifeProgress(c.careerDays),
    daysRemaining: daysRemaining(c.careerDays),
    betsRemaining: betsRemaining(c.careerDays),
    comebacksUsed: c.comebacksUsed,
    comebacksLeft: Math.max(0, COMEBACKS_PER_LIFE - c.comebacksUsed),
    betsThisLife: c.betsThisLife,
    peakBalanceCents: c.peakBalanceCents,
    legacyXpMultiplier: legacyXpMultiplier(c.livesLived),
    venueId: venue.id,
    venueName: venue.name,
    venueCity: venue.city,
    tableMinCents: tableMinCents(venue, maxBetCents, floorCents),
    over: c.deathCause !== null,
    deathCause: (c.deathCause as DeathCause | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// The obituary
// ---------------------------------------------------------------------------

export type LifeSummary = {
  cause: DeathCause;
  ageAtEnd: number;
  level: number;
  rebirths: number;
  peakBalanceCents: number;
  lifetimeWageredCents: number;
  biggestWinCents: number;
  venueId: string;
};

/** One line for the headstone. Deliberately unglamorous about losing. */
export function epitaphFor(s: LifeSummary): string {
  if (s.cause === "OLD_AGE") {
    if (s.peakBalanceCents >= 1_000_000_000) return "Retired enormous. Never worked out when to stop.";
    if (s.rebirths > 0) return "Played out the whole ladder, twice over, and then some.";
    if (s.level >= 40) return "Made it to the top rooms and ran out of years, not nerve.";
    return "Played it out to the end of the clock.";
  }
  if (s.rebirths > 0) return "Had it all, gave it back, and could not find it a second time.";
  if (s.peakBalanceCents >= 100_000_000) return "Was up an obscene amount once. Kept playing.";
  if (s.level >= 25) return "Climbed a long way and fell the whole distance.";
  return "Went broke young and stayed broke.";
}

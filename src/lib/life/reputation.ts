/**
 * WINIT — REPUTATION
 * ---------------------------------------------------------------------------
 * What the floor thinks of you, this life only. Level says how long you have
 * been at it; reputation says whether anyone noticed.
 *
 * It is earned on the SIZE of a bet relative to your own table limit, not on
 * the raw amount — so a level 3 player pushing their limit builds a name just
 * as fast as a level 40 one, and a whale betting the minimum builds none. That
 * is deliberate: reputation is about nerve, and pricing it in absolute money
 * would just make it a second, slower copy of the XP ladder.
 *
 * Unlike XP, reputation can be LOST — random events take it, and losing it
 * can drop you back a tier and close a door you had already walked through.
 * Nothing else in the app moves backwards, which is what makes it worth
 * watching.
 * ---------------------------------------------------------------------------
 */

export type RepTier = {
  from: number;
  name: string;
  blurb: string;
};

export const REP_TIERS: RepTier[] = [
  { from: 0, name: "Nobody", blurb: "Nobody working here could pick you out of a queue." },
  { from: 250, name: "Face in the Crowd", blurb: "The evening staff have started nodding." },
  { from: 1_000, name: "Regular", blurb: "Your drink arrives before you order it." },
  { from: 3_000, name: "Known Quantity", blurb: "The pit knows your name and your usual stake." },
  { from: 8_000, name: "Respected", blurb: "Tables go quiet for a second when you sit down." },
  { from: 20_000, name: "Notorious", blurb: "Two floors up, someone is watching you on a monitor." },
  { from: 50_000, name: "Legend of the Floor", blurb: "People play here because you play here." },
];

export const MAX_REP = REP_TIERS[REP_TIERS.length - 1].from;

export function tierFor(reputation: number): RepTier {
  let found = REP_TIERS[0];
  for (const t of REP_TIERS) if (reputation >= t.from) found = t;
  return found;
}

export function tierIndex(reputation: number): number {
  return REP_TIERS.indexOf(tierFor(reputation));
}

export function nextTier(reputation: number): RepTier | null {
  return REP_TIERS.find((t) => t.from > reputation) ?? null;
}

/**
 * Reputation earned by staking `betCents` against a personal limit of
 * `maxBetCents`, in a room worth `venueWeight`.
 *
 * Capped at the full-limit value so a table limit that has not caught up with
 * a bankroll cannot be farmed by any single enormous bet.
 */
export function repForWager(betCents: number, maxBetCents: number, venueWeight: number): number {
  if (maxBetCents <= 0) return 1;
  const fraction = Math.min(1, betCents / maxBetCents);
  return Math.max(1, Math.round(12 * fraction * venueWeight));
}

/** 0..1 progress through the current tier. 1 at the top. */
export function tierProgress(reputation: number): number {
  const current = tierFor(reputation);
  const next = nextTier(reputation);
  if (!next) return 1;
  return (reputation - current.from) / (next.from - current.from);
}

/**
 * Shared reveal timing for every card and number game.
 *
 * The complaint this exists to fix: a hand used to resolve in one React
 * commit — every card, the outcome badge and the balance change all painted
 * on the same frame — so a "deal" read as a single instantaneous jump no
 * matter how many cards were involved. The fix isn't a different animation,
 * it's sequencing: render the cards (or drawn numbers) immediately so they
 * fly in one by one via the existing `animate-card-deal` CSS stagger, but
 * hold back anything that would spoil the hand — the win/loss badge, the
 * settle banner, the balance tick, the bet-feed entry — until that stagger
 * has actually finished on screen.
 *
 * CARD_DEAL_MS must match the `card-deal` animation duration in
 * tailwind.config.ts (currently 0.55s) — it is the time a single card takes
 * to finish flying in once its delay elapses.
 */
export const CARD_STAGGER_MS = 480;
export const CARD_DEAL_MS = 550;

/**
 * How long an n-card reveal takes end to end: the last card doesn't start
 * until (n-1) staggers in, and then still takes CARD_DEAL_MS to land.
 * Zero or negative counts return 0 — there is nothing to wait for.
 */
export function dealDurationMs(cardCount: number, staggerMs: number = CARD_STAGGER_MS): number {
  if (cardCount <= 0) return 0;
  return (cardCount - 1) * staggerMs + CARD_DEAL_MS;
}

/** Promise-based sleep, for `await`-sequencing a reveal after a fetch resolves. */
export function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

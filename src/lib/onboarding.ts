import { MIN_BET_CENTS, STARTING_BALANCE_CENTS, formatCents } from "@/lib/money";
import { BETS_PER_LIFE, DAYS_PER_BET, END_AGE, LIFE_DAYS, START_AGE } from "@/lib/life/career";
import { BASE_TABLE_LIMIT_CENTS, MAX_LEVEL } from "@/lib/progression";
import { VENUES } from "@/lib/life/venues";

/**
 * THE FIRST SIXTY SECONDS
 * ---------------------------------------------------------------------------
 * A new player lands in a lobby holding 22 games, seven venues, five parallel
 * progression tracks and a life that is quietly running down — and no reason
 * to believe any of it matters. This is the only place in the app that gets to
 * explain the premise, so it is deliberately four screens and no more.
 *
 * Every number below is imported rather than written out. The explainer that
 * tells a player their life is 22,630 days long has to keep being right when
 * someone changes END_AGE, or it becomes the most visible lie in the product.
 * ---------------------------------------------------------------------------
 */

/**
 * The game the flow finishes on.
 *
 * Coinflip on purpose: one decision, no rules to read, and a payout that
 * resolves instantly — so the player's attention is on what a bet *costs and
 * earns* rather than on how the game works. It is also exactly 99% RTP, which
 * makes the fairness claim demonstrable on the very first screen they see.
 */
export const STARTER_GAME_SLUG = "coinflip";

export type OnboardingStep = {
  /** Short label for the progress dots. */
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  /** Two or three concrete facts, shown as a small stat row. */
  facts?: { label: string; value: string }[];
  cta: string;
};

const firstVenue = VENUES[0];

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "welcome",
    eyebrow: "Welcome to WinIt",
    title: "You are 18, and you have one life to gamble with.",
    body:
      `Every credit here is play money — there is no deposit, no withdrawal and no way to turn a ` +
      `balance into anything outside this site. What you do have is a bankroll and a clock, and ` +
      `both of them are finite.`,
    facts: [
      { label: "Starting bankroll", value: formatCents(STARTING_BALANCE_CENTS) },
      { label: "Starting age", value: `${START_AGE}` },
      { label: "Days to live", value: LIFE_DAYS.toLocaleString() },
    ],
    cta: "So what does a bet cost?",
  },
  {
    key: "bet",
    eyebrow: "Step 1",
    title: "Every bet spends days as well as money.",
    body:
      `Settling a bet ages you ${DAYS_PER_BET} days. That is roughly ${BETS_PER_LIFE.toLocaleString()} bets ` +
      `in a career before you reach ${END_AGE} and die of old age. Go broke too many times and it ends ` +
      `sooner. The clock is the real stake — the money is just how you spend it.`,
    facts: [
      { label: "Per settled bet", value: `${DAYS_PER_BET} days` },
      { label: "Bets in a life", value: `~${BETS_PER_LIFE.toLocaleString()}` },
      { label: "Comebacks if you bust", value: "3" },
    ],
    cta: "What am I playing for?",
  },
  {
    key: "progress",
    eyebrow: "Step 2",
    title: "Almost everything is locked. Playing unlocks it.",
    body:
      `You start in ${firstVenue.name} with the lowest table limit in the game. Betting earns XP and ` +
      `reputation, which raise your level, your limit and your VIP tier — and open the ${VENUES.length} venues ` +
      `above this one. At level ${MAX_LEVEL} you can rebirth: lose everything, keep a permanently higher ceiling.`,
    facts: [
      { label: "Levels", value: `1 – ${MAX_LEVEL}` },
      { label: "Venues", value: `${VENUES.length}` },
      { label: "Where you are", value: firstVenue.name },
    ],
    cta: "Show me a real bet",
  },
  {
    key: "play",
    eyebrow: "Step 3",
    title: "Start with a coin flip.",
    body:
      `Heads or tails, a true 50/50 paying 1.98× — which is a 99% return to player, published on the ` +
      `page like every other game here. Pick a side, pick a stake, and watch what one settled bet does ` +
      `to your balance, your XP and your age.`,
    facts: [
      { label: "Return to player", value: "99%" },
      { label: "Minimum stake", value: formatCents(MIN_BET_CENTS) },
      { label: "Your table limit", value: formatCents(BASE_TABLE_LIMIT_CENTS) },
    ],
    cta: "Place my first bet",
  },
];

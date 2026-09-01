/**
 * WINIT — RANDOM EVENTS
 * ---------------------------------------------------------------------------
 * The part that makes a career a story rather than a scoreboard. After a
 * settled bet an event can fire: sometimes something simply happens to you,
 * sometimes you are asked to decide, and the decision has consequences that
 * can move money, reputation and the clock.
 *
 * HOW MONEY HERE STAYS HONEST
 * ---------------------------------------------------------------------------
 * Events move real balance, so three rules hold them down:
 *
 *  1. EVERY cent goes through the same ledger as a bet. An event writes a
 *     Transaction row whose netCents explains the balance change exactly, so
 *     the running-balance reconciliation that proves the books still passes.
 *
 *  2. Effects are a fraction of the player's own TABLE LIMIT, not of their
 *     balance and not a flat sum. A flat sum is life-changing at level 1 and
 *     invisible at level 50; a fraction of the balance would wipe out a
 *     fortune built over hours. The limit already scales with level, rebirth
 *     and VIP, so it is the natural unit.
 *
 *  3. An effect is ALSO capped at a multiple of the stake that triggered it.
 *     This is the rule that closes the real hole, and the RTP harness found
 *     it: events fire per settled bet regardless of size, so without this a
 *     player could bet the 0.10 minimum two hundred times — losing almost
 *     nothing — and still draw eight events priced against a seven-figure
 *     table limit. Tying the magnitude to the stake means farming at the
 *     minimum pays minimum-sized events, while a player actually risking
 *     their limit gets the full effect.
 *
 *  4. On top of that the rate is capped by MAX_EVENTS_PER_DAY. What matters
 *     for the faucet is not the best event in the catalogue — a player cannot
 *     choose which one fires — but the WEIGHTED MEAN of the best choice in
 *     each, over the pool they are eligible for. The harness asserts that,
 *     for a new player and a veteran alike, and asserts the stake cap.
 * ---------------------------------------------------------------------------
 */

export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Once in a lifetime",
};

export const RARITY_COLOURS: Record<Rarity, string> = {
  common: "#94a3b8",
  uncommon: "#2ee6b8",
  rare: "#2e8bff",
  legendary: "#c98bff",
};

/** Roughly one event every 25 settled bets. */
export const EVENT_CHANCE_PER_BET = 0.04;
/** The hard ceiling on the faucet. See rule 3 above. */
export const MAX_EVENTS_PER_DAY = 8;
/** No single outcome may be worth more than this multiple of the table limit. */
export const MAX_EFFECT_FRACTION = 3;
/**
 * And no outcome may be worth more than this multiple of the stake that
 * triggered it. See rule 3 — this is what stops minimum-bet event farming.
 */
export const EFFECT_STAKE_MULTIPLE = 10;

export type EventContext = {
  level: number;
  reputation: number;
  repTierIndex: number;
  vipLevel: number;
  balanceCents: number;
  /** The player's own table limit — the unit every money effect is measured in. */
  limitCents: number;
  venueId: string;
  age: number;
  betsThisLife: number;
  comebacksUsed: number;
  livesLived: number;
  rebirths: number;
};

export type Effect = {
  /** Signed multiple of the table limit. Negative takes money. */
  limitFraction?: number;
  reputation?: number;
  /** Days added to the career clock — always a cost, never a refund. */
  days?: number;
  /** What the player is told happened. */
  text: string;
};

export type Choice = {
  key: string;
  label: string;
  /** Weighted outcomes. Weights must sum to 1 — the harness checks it. */
  outcomes: { weight: number; effect: Effect }[];
};

export type EventDef = {
  key: string;
  title: string;
  body: string;
  rarity: Rarity;
  weight: number;
  /** Only offered when this returns true. */
  when?: (c: EventContext) => boolean;
  /** Omit for an event that simply happens to you. */
  choices?: Choice[];
  instant?: Effect;
};

const always = () => true;

export const EVENTS: EventDef[] = [
  // ---------------------------------------------------------------- common
  {
    key: "found-chip",
    title: "Under the table",
    body: "There is a chip on the carpet by your foot. Nobody is looking for it.",
    rarity: "common",
    weight: 100,
    when: always,
    choices: [
      {
        key: "pocket",
        label: "Pocket it",
        outcomes: [
          { weight: 0.85, effect: { limitFraction: 0.15, text: "You pocket it. Nobody says a word." } },
          {
            weight: 0.15,
            effect: {
              limitFraction: 0.15,
              reputation: -40,
              text: "You pocket it, and the floor supervisor watches you do it.",
            },
          },
        ],
      },
      {
        key: "hand-in",
        label: "Hand it to the pit",
        outcomes: [
          {
            weight: 1,
            effect: { reputation: 70, text: "The pit boss makes a note of who you are. The good kind." },
          },
        ],
      },
    ],
  },
  {
    key: "free-drink",
    title: "On the house",
    body: "A server sets down a drink you did not order.",
    rarity: "common",
    weight: 90,
    when: always,
    instant: { reputation: 15, text: "Someone upstairs decided you were worth a free drink." },
  },
  {
    key: "cold-streak",
    title: "A word from the pit",
    body: "The pit boss suggests, kindly, that you take a walk.",
    rarity: "common",
    weight: 70,
    when: (c) => c.betsThisLife > 20,
    choices: [
      {
        key: "walk",
        label: "Take the walk",
        outcomes: [
          { weight: 1, effect: { days: 30, reputation: 25, text: "You get some air. It costs you a month and buys some goodwill." } },
        ],
      },
      {
        key: "stay",
        label: "Stay exactly where you are",
        outcomes: [
          { weight: 0.5, effect: { reputation: 45, text: "You hold your ground. The table respects it." } },
          { weight: 0.5, effect: { reputation: -55, text: "You hold your ground and make an idiot of yourself." } },
        ],
      },
    ],
  },
  {
    key: "lost-ticket",
    title: "Crumpled in a pocket",
    body: "An old cash-out ticket you forgot about.",
    rarity: "common",
    weight: 60,
    when: always,
    instant: { limitFraction: 0.2, text: "It is still good. Small, but still good." },
  },
  {
    key: "parking",
    title: "A ticket of a different kind",
    body: "You left the car somewhere you should not have.",
    rarity: "common",
    weight: 55,
    when: always,
    instant: { limitFraction: -0.2, text: "The fine is not negotiable." },
  },
  {
    key: "tourist-question",
    title: "Mistaken for staff",
    body: "A tourist asks you how the game works. You could be helpful, or you could be quick.",
    rarity: "common",
    weight: 55,
    when: always,
    choices: [
      {
        key: "explain",
        label: "Explain it properly",
        outcomes: [
          { weight: 0.7, effect: { reputation: 50, days: 5, text: "They thank you. So does the dealer." } },
          { weight: 0.3, effect: { limitFraction: 0.25, reputation: 30, days: 5, text: "They tip you for the trouble." } },
        ],
      },
      {
        key: "shrug",
        label: "Point at the sign",
        outcomes: [{ weight: 1, effect: { reputation: -20, text: "They find someone friendlier." } }],
      },
    ],
  },

  // -------------------------------------------------------------- uncommon
  {
    key: "side-bet",
    title: "A stranger with a proposition",
    body: "Someone at the rail wants to bet you, directly, on the next hand at the next table over.",
    rarity: "uncommon",
    weight: 45,
    when: (c) => c.balanceCents > c.limitCents,
    choices: [
      {
        key: "take",
        label: "Take the side bet",
        outcomes: [
          { weight: 0.48, effect: { limitFraction: 1, reputation: 60, text: "You call it right. They pay up in front of everyone." } },
          { weight: 0.52, effect: { limitFraction: -1, reputation: -25, text: "You call it wrong, and they enjoy it far too much." } },
        ],
      },
      {
        key: "decline",
        label: "Not interested",
        outcomes: [{ weight: 1, effect: { text: "They shrug and find someone else." } }],
      },
    ],
  },
  {
    key: "comped-room",
    title: "The host finds you",
    body: "A host you have never met offers you a room upstairs for the night.",
    rarity: "uncommon",
    weight: 40,
    when: (c) => c.repTierIndex >= 2,
    choices: [
      {
        key: "accept",
        label: "Take the room",
        outcomes: [
          { weight: 1, effect: { limitFraction: 0.6, reputation: 40, days: 15, text: "You sleep somewhere with a view and save the fare." } },
        ],
      },
      {
        key: "decline",
        label: "Sleep at home",
        outcomes: [{ weight: 1, effect: { reputation: -10, text: "The host looks faintly insulted." } }],
      },
    ],
  },
  {
    key: "old-debt",
    title: "Someone remembers you",
    body: "A face from an earlier room says you owe them from a night you do not remember.",
    rarity: "uncommon",
    weight: 38,
    when: (c) => c.betsThisLife > 60,
    choices: [
      {
        key: "pay",
        label: "Pay it and move on",
        outcomes: [{ weight: 1, effect: { limitFraction: -0.8, reputation: 35, text: "You pay. It buys quiet." } }],
      },
      {
        key: "deny",
        label: "Tell them they are mistaken",
        outcomes: [
          { weight: 0.55, effect: { reputation: -70, text: "Word gets around that you are hard to collect from." } },
          { weight: 0.45, effect: { text: "They stare at you, then decide they had the wrong person." } },
        ],
      },
    ],
  },
  {
    key: "dealer-tip",
    title: "The dealer is having a night",
    body: "Your dealer has been on the wrong end of every shoe for six hours.",
    rarity: "uncommon",
    weight: 42,
    when: always,
    choices: [
      {
        key: "tip",
        label: "Tip them properly",
        outcomes: [{ weight: 1, effect: { limitFraction: -0.3, reputation: 110, text: "The whole pit sees you do it." } }],
      },
      {
        key: "nothing",
        label: "Say nothing",
        outcomes: [{ weight: 1, effect: { text: "The shoe carries on." } }],
      },
    ],
  },
  {
    key: "counting-accusation",
    title: "Two men in bad suits",
    body: "Security would like a quiet word about your play.",
    rarity: "uncommon",
    weight: 30,
    when: (c) => c.repTierIndex >= 3,
    choices: [
      {
        key: "cooperate",
        label: "Go quietly",
        outcomes: [{ weight: 1, effect: { days: 60, reputation: -30, text: "Two months of not being welcome anywhere good." } }],
      },
      {
        key: "argue",
        label: "Argue the point",
        outcomes: [
          { weight: 0.35, effect: { reputation: 120, text: "You are right, they are wrong, and everyone hears it." } },
          { weight: 0.65, effect: { limitFraction: -1.2, days: 90, reputation: -80, text: "It goes exactly as badly as you would expect." } },
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ rare
  {
    key: "whale-stakes-you",
    title: "Backed",
    body: "A whale at the big table wants to stake you for a session. Their money, split winnings.",
    rarity: "rare",
    weight: 16,
    when: (c) => c.repTierIndex >= 3,
    choices: [
      {
        key: "accept",
        label: "Play on their money",
        outcomes: [
          { weight: 0.4, effect: { limitFraction: 2.5, reputation: 150, text: "You run it up and they hand you your half without blinking." } },
          { weight: 0.6, effect: { reputation: -60, text: "You lose their money. They are gracious, which is worse." } },
        ],
      },
      {
        key: "decline",
        label: "Play your own money",
        outcomes: [{ weight: 1, effect: { reputation: 20, text: "They respect a player who does not need a backer." } }],
      },
    ],
  },
  {
    key: "insurance-payout",
    title: "A letter that is not a bill",
    body: "An old insurance policy has matured and nobody is more surprised than you.",
    rarity: "rare",
    weight: 14,
    when: (c) => c.age >= 40,
    instant: { limitFraction: 2, text: "It is real money and it is already in the account." },
  },
  {
    key: "tax-audit",
    title: "A letter that is a bill",
    body: "Somebody has been reading your very unusual income.",
    rarity: "rare",
    weight: 15,
    when: (c) => c.balanceCents > c.limitCents * 5,
    instant: { limitFraction: -2, days: 45, text: "It takes money and it takes six weeks of your life." },
  },
  {
    key: "invited-upstairs",
    title: "The room without a sign",
    body: "Someone slides a card across the felt. No name on it, just an address.",
    rarity: "rare",
    weight: 12,
    when: (c) => c.repTierIndex >= 4,
    choices: [
      {
        key: "go",
        label: "Go and see",
        outcomes: [
          { weight: 0.55, effect: { limitFraction: 1.8, reputation: 220, days: 20, text: "The game upstairs is bigger and you hold your own." } },
          { weight: 0.45, effect: { limitFraction: -1.5, reputation: 90, days: 20, text: "The game upstairs is bigger and you do not." } },
        ],
      },
      {
        key: "pass",
        label: "Keep the card, do nothing",
        outcomes: [{ weight: 1, effect: { text: "It sits in your wallet for years." } }],
      },
    ],
  },
  {
    key: "rival-appears",
    title: "Somebody has been asking about you",
    body: "A player you have never met has been telling people they can beat you.",
    rarity: "rare",
    weight: 13,
    when: (c) => c.repTierIndex >= 2,
    choices: [
      {
        key: "face",
        label: "Sit down opposite them",
        outcomes: [
          { weight: 0.5, effect: { limitFraction: 1.4, reputation: 200, text: "You take their money and their audience." } },
          { weight: 0.5, effect: { limitFraction: -1.4, reputation: -110, text: "They were not bluffing. The room noticed." } },
        ],
      },
      {
        key: "ignore",
        label: "Let them talk",
        outcomes: [{ weight: 1, effect: { reputation: -35, text: "They keep talking. It does not help you." } }],
      },
    ],
  },
  {
    key: "bad-beat-story",
    title: "The worst hand of your life",
    body: "It happens at the next table, to someone else, and you were the only witness.",
    rarity: "rare",
    weight: 11,
    when: always,
    instant: { reputation: 60, text: "You will be dining out on this one for years." },
  },

  // ------------------------------------------------------------ legendary
  {
    key: "lifetime-ban",
    title: "Barred",
    body: "You are, effective immediately, not welcome in this room again.",
    rarity: "legendary",
    weight: 4,
    when: (c) => c.repTierIndex >= 5 && c.venueId !== "back-room",
    instant: {
      days: 180,
      reputation: -200,
      text: "Six months in the wilderness and a name that follows you.",
    },
  },
  {
    key: "the-offer",
    title: "They want to buy your name",
    body: "A room you have never played wants to pay you simply to be seen there.",
    rarity: "legendary",
    weight: 3,
    when: (c) => c.repTierIndex >= 5,
    choices: [
      {
        key: "sign",
        label: "Sign the thing",
        outcomes: [
          { weight: 1, effect: { limitFraction: 3, reputation: -150, days: 30, text: "The money is extraordinary. Your name is not quite yours now." } },
        ],
      },
      {
        key: "refuse",
        label: "Your name is not for sale",
        outcomes: [{ weight: 1, effect: { reputation: 300, text: "Word of the refusal travels further than the offer ever did." } }],
      },
    ],
  },
  {
    key: "one-last-thing",
    title: "An old man at the bar",
    body: "He says he watched you play thirty years ago. You are not thirty years old.",
    rarity: "legendary",
    weight: 2,
    when: (c) => c.livesLived >= 1,
    instant: { reputation: 250, text: "You do not ask him what he means. You think about it for a long time." },
  },
];

export function eventByKey(key: string): EventDef | undefined {
  return EVENTS.find((e) => e.key === key);
}

/** Events whose gate passes for this player. */
export function eligible(ctx: EventContext): EventDef[] {
  return EVENTS.filter((e) => (e.when ? e.when(ctx) : true));
}

export function choiceByKey(def: EventDef, key: string): Choice | undefined {
  return def.choices?.find((c) => c.key === key);
}

/** Expected value of a choice, as a multiple of the table limit. */
export function choiceEv(choice: Choice): number {
  return choice.outcomes.reduce((sum, o) => sum + o.weight * (o.effect.limitFraction ?? 0), 0);
}

/** The best EV available from an event, i.e. what a perfect player gets. */
export function bestEv(def: EventDef): number {
  if (def.instant) return def.instant.limitFraction ?? 0;
  if (!def.choices) return 0;
  return Math.max(...def.choices.map(choiceEv));
}

/**
 * Turns an effect's limit fraction into real cents.
 *
 * Two ceilings apply and the tighter one wins: the fraction of the table
 * limit, and EFFECT_STAKE_MULTIPLE times the stake that triggered the event.
 * The second is what makes farming events at the minimum stake pointless.
 */
export function centsFor(effect: Effect, limitCents: number, stakeCents: number): number {
  if (!effect.limitFraction) return 0;
  const byLimit = Math.abs(limitCents * effect.limitFraction);
  const byStake = Math.abs(stakeCents) * EFFECT_STAKE_MULTIPLE;
  const magnitude = Math.round(Math.min(byLimit, byStake));
  return effect.limitFraction < 0 ? -magnitude : magnitude;
}

/**
 * The expected value of one event draw under PERFECT play, as a multiple of
 * the table limit — the weighted mean of the best choice in each eligible
 * event. This, not the single best event, is the number that bounds the
 * faucet, because the player does not get to choose which event appears.
 */
export function expectedDrawValue(pool: EventDef[]): number {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  if (total === 0) return 0;
  return pool.reduce((s, e) => s + (e.weight / total) * bestEv(e), 0);
}

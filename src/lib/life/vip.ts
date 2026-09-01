import { formatCents } from "@/lib/money";

/**
 * WINIT — VIP
 * ---------------------------------------------------------------------------
 * The one track that outlives everything else. Level resets on rebirth,
 * reputation resets on death, but VIP is banked against LIFETIME amount
 * staked, which no reset ever clears — so it is the account's permanent
 * record rather than the current gambler's.
 *
 * WHY THE PERKS ARE THE SHAPE THEY ARE
 * ---------------------------------------------------------------------------
 * A VIP tier raises your table limit and your daily bonus. It does NOT touch
 * the odds of a single game, and it never will: every published RTP in this
 * project would become a lie the moment a tier quietly paid better, and a
 * loyalty ladder that improves the house edge is exactly the thing real
 * casinos do not do either.
 *
 * The bonus multiplier is a currency faucet, so it is deliberately modest and
 * bounded: even at the top tier the daily grant is far smaller than the
 * guaranteed expected loss of the volume needed to reach it. Getting there
 * costs multiples of what it pays.
 * ---------------------------------------------------------------------------
 */

export type VipTier = {
  level: number;
  name: string;
  /** Lifetime staked, in cents, needed to reach this tier. */
  from: number;
  /** Multiplier on the player's table limit. */
  limitMultiplier: number;
  /** Multiplier on the daily bonus. */
  bonusMultiplier: number;
  blurb: string;
  colour: string;
};

export const VIP_TIERS: VipTier[] = [
  {
    level: 0,
    name: "Unranked",
    from: 0,
    limitMultiplier: 1,
    bonusMultiplier: 1,
    blurb: "No card, no host, no comps.",
    colour: "#94a3b8",
  },
  {
    level: 1,
    name: "Bronze",
    from: 1_000_000, // 10,000.00 staked
    limitMultiplier: 1.1,
    bonusMultiplier: 1.1,
    blurb: "A card with your name spelled almost right.",
    colour: "#c98b52",
  },
  {
    level: 2,
    name: "Silver",
    from: 10_000_000, // 100,000.00
    limitMultiplier: 1.25,
    bonusMultiplier: 1.25,
    blurb: "Free coffee and a shorter queue.",
    colour: "#cbd5e1",
  },
  {
    level: 3,
    name: "Gold",
    from: 100_000_000, // 1,000,000.00
    limitMultiplier: 1.5,
    bonusMultiplier: 1.5,
    blurb: "A host who remembers your birthday.",
    colour: "#f0c75e",
  },
  {
    level: 4,
    name: "Platinum",
    from: 1_000_000_000, // 10,000,000.00
    limitMultiplier: 2,
    bonusMultiplier: 1.8,
    blurb: "They hold the good table until you arrive.",
    colour: "#a3ceff",
  },
  {
    level: 5,
    name: "Diamond",
    from: 10_000_000_000, // 100,000,000.00
    limitMultiplier: 3,
    bonusMultiplier: 2.2,
    blurb: "Limits are a conversation, not a sign.",
    colour: "#6fb1ff",
  },
  {
    level: 6,
    name: "Black",
    from: 100_000_000_000, // 1,000,000,000.00
    limitMultiplier: 5,
    bonusMultiplier: 3,
    blurb: "There is no tier above this one. They checked.",
    colour: "#c98bff",
  },
];

export function vipFor(lifetimeWageredCents: number): VipTier {
  let found = VIP_TIERS[0];
  for (const t of VIP_TIERS) if (lifetimeWageredCents >= t.from) found = t;
  return found;
}

export function nextVip(lifetimeWageredCents: number): VipTier | null {
  return VIP_TIERS.find((t) => t.from > lifetimeWageredCents) ?? null;
}

/** 0..1 progress toward the next tier. 1 at the top. */
export function vipProgress(lifetimeWageredCents: number): number {
  const current = vipFor(lifetimeWageredCents);
  const next = nextVip(lifetimeWageredCents);
  if (!next) return 1;
  return (lifetimeWageredCents - current.from) / (next.from - current.from);
}

export function describeVipRequirement(tier: VipTier): string {
  return `${formatCents(tier.from)} staked in total`;
}

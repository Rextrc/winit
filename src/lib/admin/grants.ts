/**
 * The grant choices offered by the promo-code form.
 *
 * These are presentation presets, not a security boundary — the bounds that
 * actually matter (a non-negative integer inside a sane ceiling, and a code
 * that grants *something*) are enforced by the API, which is what any request
 * has to go through whatever the form rendered.
 */
export const GRANT_KINDS = [
  { value: "money", label: "Credits only" },
  { value: "xp", label: "XP only" },
  { value: "both", label: "Credits + XP" },
] as const;

export type GrantKind = (typeof GRANT_KINDS)[number]["value"];

/** Money presets, in whole credits. */
export const MONEY_GRANTS = [100, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000] as const;

/** XP presets. The curve in progression.ts is what makes these meaningful. */
export const XP_GRANTS = [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000] as const;

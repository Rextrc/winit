/**
 * WINIT — STAFF ROLES AND CAPABILITIES
 * ---------------------------------------------------------------------------
 * The dashboard is authorised by CAPABILITY, never by role name and never by
 * what the browser happens to render. Every admin route names the single
 * capability it needs and the guard resolves that against the caller's role
 * server-side; hiding a button is a courtesy to the user, not a control.
 *
 * Capabilities are deliberately fine-grained around the two things that can
 * actually damage an account — its money and its progression — so a SUPPORT
 * user can answer questions and read history without being able to mint a
 * balance, and a MODERATOR can suspend an abusive account without being able
 * to touch the economy at all.
 *
 * There is no self-serve path to any of this. Roles are set by the seed script
 * (from an environment variable, at deploy time) or by an existing OWNER, and
 * `roles.manage` is the only capability OWNER holds alone.
 * ---------------------------------------------------------------------------
 */

export const ROLES = ["OWNER", "ADMIN", "MODERATOR", "DEVELOPER", "SUPPORT", "TESTER"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string | null | undefined): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export type Capability =
  /** Search accounts and read one in full, including history. */
  | "accounts.view"
  /** Create an account, including a pre-loaded test account. */
  | "accounts.create"
  /** Suspend and unsuspend. */
  | "accounts.suspend"
  /** Soft-delete and restore. */
  | "accounts.delete"
  /** Grant, remove or set a balance. The money capability. */
  | "accounts.economy"
  /** XP, level, reputation, VIP, prestige, and full progression resets. */
  | "accounts.progression"
  /** Grant or revoke achievements and venue unlocks. */
  | "accounts.unlocks"
  /** Enable/disable games, bet overrides, unlock requirements. */
  | "games.config"
  /** Maintenance mode and feature flags. */
  | "site.config"
  /** Global announcements and direct messages to a player. */
  | "site.announce"
  /** Create and revoke promo codes. */
  | "promo.manage"
  /** The analytics dashboard. */
  | "analytics.view"
  /** The audit trail. */
  | "audit.view"
  /** Assign roles to other accounts. OWNER only. */
  | "roles.manage";

export const CAPABILITY_LABELS: Record<Capability, string> = {
  "accounts.view": "View accounts and history",
  "accounts.create": "Create accounts",
  "accounts.suspend": "Suspend and unsuspend",
  "accounts.delete": "Delete and restore",
  "accounts.economy": "Change balances",
  "accounts.progression": "Change XP, level, reputation, VIP, prestige",
  "accounts.unlocks": "Grant achievements and venues",
  "games.config": "Configure games",
  "site.config": "Maintenance mode and feature flags",
  "site.announce": "Announcements and player messages",
  "promo.manage": "Promo codes",
  "analytics.view": "Analytics",
  "audit.view": "Audit log",
  "roles.manage": "Assign staff roles",
};

const ALL: Capability[] = Object.keys(CAPABILITY_LABELS) as Capability[];

/**
 * What each role may do.
 *
 * The shape of this table is the whole authorisation policy, so it is written
 * out per role rather than derived from a hierarchy — a hierarchy makes it
 * easy to widen a role by accident, and this is the one place where that would
 * be expensive.
 */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  // Everything, including handing out roles.
  OWNER: ALL,

  // Everything operational. Cannot create or demote staff.
  ADMIN: ALL.filter((c) => c !== "roles.manage"),

  // Player conduct only: read accounts, suspend, message. No economy, no
  // progression, no configuration.
  MODERATOR: ["accounts.view", "accounts.suspend", "site.announce", "audit.view"],

  // Builds and tests the game itself: configuration, flags, test accounts and
  // the analytics behind them. Deliberately NOT able to suspend or delete a
  // real player's account.
  DEVELOPER: [
    "accounts.view",
    "accounts.create",
    "accounts.economy",
    "accounts.progression",
    "accounts.unlocks",
    "games.config",
    "site.config",
    "promo.manage",
    "analytics.view",
    "audit.view",
  ],

  // Answers questions. Can see everything about an account and nothing that
  // changes it.
  SUPPORT: ["accounts.view", "analytics.view", "audit.view"],

  // Can only set up and load its own kind of account, for testing.
  TESTER: ["accounts.view", "accounts.create"],
};

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function capabilitiesOf(role: Role): Capability[] {
  return ROLE_CAPABILITIES[role];
}

/**
 * Rank, used only to stop staff acting on staff at or above their own level.
 * A higher number outranks a lower one; equal ranks cannot touch each other,
 * which is what stops two ADMINs from demoting one another in a loop.
 */
const RANK: Record<Role, number> = {
  OWNER: 100,
  ADMIN: 80,
  DEVELOPER: 60,
  MODERATOR: 50,
  SUPPORT: 30,
  TESTER: 10,
};

export function outranks(actor: Role, target: Role): boolean {
  return RANK[actor] > RANK[target];
}

/**
 * Whether `actor` may act on an account whose role is `targetRole` (null for a
 * normal player). Anyone with the capability may act on a player; acting on
 * another staff account additionally requires outranking them.
 */
export function mayActOn(actor: Role, targetRole: string | null | undefined): boolean {
  if (!isRole(targetRole)) return true;
  return outranks(actor, targetRole);
}

/** Actions that require an explicit confirmation flag as well as a reason. */
export const DANGEROUS_ACTIONS = [
  "account.delete",
  "account.progression.reset",
  "account.balance.set",
  "account.role.set",
  "site.maintenance",
] as const;
export type DangerousAction = (typeof DANGEROUS_ACTIONS)[number];

export function isDangerous(action: string): action is DangerousAction {
  return (DANGEROUS_ACTIONS as readonly string[]).includes(action);
}

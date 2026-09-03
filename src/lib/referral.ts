/**
 * Referrals.
 *
 * Every account owns one shareable code. When a new account signs up with
 * someone's code, both sides are paid — and both payments go through the ledger
 * as ordinary rows, so a referred account's running balance still reconciles
 * from zero exactly like any other.
 *
 * The rules that make a referral legitimate are all checked at sign-up, inside
 * the same transaction that creates the account:
 *
 *   - the code must belong to a real account that is neither suspended nor
 *     deleted, so a banned account cannot keep earning;
 *   - an account can be referred once, at creation, and never again — there is
 *     no route that sets `referredById` on an existing account;
 *   - a code cannot be its own owner's, which sign-up gets for free since the
 *     account does not exist yet.
 */

/** Paid to the account whose code was used. */
export const REFERRER_BONUS_CENTS = 10_000_000; // 100,000.00

/** Paid to the new account, on top of the ordinary welcome grant. */
export const REFEREE_BONUS_CENTS = 5_000_000; // 50,000.00

/** Codes are compared case- and space-insensitively. */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

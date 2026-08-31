/**
 * All money in WinIt is fake and stored as integer cents so arithmetic is
 * exact. Nothing here converts to, from, or references real currency.
 *
 * The maximum stake is NOT a constant any more: it is the player's personal
 * table limit, which rises with their level and is multiplied permanently by
 * every rebirth. See src/lib/progression.ts.
 */

import { BASE_TABLE_LIMIT_CENTS, STARTING_BALANCE_CENTS, bonusScale } from "@/lib/progression";

export { BASE_TABLE_LIMIT_CENTS, STARTING_BALANCE_CENTS };

export const MIN_BET_CENTS = 10; // 0.10

/** The limit a signed-out or still-loading client assumes. */
export const DEFAULT_MAX_BET_CENTS = BASE_TABLE_LIMIT_CENTS;

export const DAILY_BONUS_CENTS = 500_000; // 5,000.00
export const BONUS_STREAK_BONUS_CENTS = 100_000; // +1,000.00 per consecutive day
export const MAX_BONUS_STREAK = 7;
export const BONUS_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h
export const BONUS_STREAK_WINDOW_MS = 48 * 60 * 60 * 1000; // streak breaks after 48h

const fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** "1,234.50" — no currency symbol, this money is not real. */
export function formatCents(cents: number): string {
  return fmt.format(cents / 100);
}

/** "1.2M" — for headline figures that would otherwise wrap. */
export function formatCompactCents(cents: number): string {
  if (Math.abs(cents) < 1_000_000) return formatCents(cents);
  return compact.format(cents / 100);
}

/** "+1,234.50" / "-1,234.50" / "0.00" */
export function formatSignedCents(cents: number): string {
  if (cents === 0) return formatCents(0);
  return `${cents > 0 ? "+" : "-"}${formatCents(Math.abs(cents))}`;
}

/** Parses a user-typed amount ("1,000.5") into cents, or null if unusable. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isFinite(cents) ? cents : null;
}

/** Clamps a proposed bet to the player's table limit and balance. */
export function clampBet(cents: number, balanceCents: number, maxBetCents: number): number {
  const ceiling = Math.min(maxBetCents, balanceCents);
  if (ceiling < MIN_BET_CENTS) return 0;
  return Math.min(Math.max(Math.round(cents), MIN_BET_CENTS), ceiling);
}

export type BetValidation = { ok: true; cents: number } | { ok: false; error: string };

/**
 * Server-side bet gate. The client's number is never trusted, and neither is
 * the client's idea of what its own table limit is — `maxBetCents` is always
 * derived from the persisted level and rebirth count.
 */
export function validateBet(cents: unknown, balanceCents: number, maxBetCents: number): BetValidation {
  if (typeof cents !== "number" || !Number.isInteger(cents)) {
    return { ok: false, error: "Bet must be a whole number of cents." };
  }
  if (cents < MIN_BET_CENTS) {
    return { ok: false, error: `Minimum bet is ${formatCents(MIN_BET_CENTS)}.` };
  }
  if (cents > maxBetCents) {
    return { ok: false, error: `Your table limit is ${formatCents(maxBetCents)} per bet. Level up to raise it.` };
  }
  if (cents > balanceCents) {
    return { ok: false, error: "Not enough balance for that bet." };
  }
  return { ok: true, cents };
}

/** Daily bonus grows with the rebirth ladder so it stays worth claiming. */
export function scaledBonusCents(baseCents: number, rebirths: number): number {
  return baseCents * bonusScale(rebirths);
}

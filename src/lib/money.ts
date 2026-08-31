/**
 * All money in WinIt is fake and stored as integer cents so arithmetic is
 * exact. Nothing here converts to, from, or references real currency.
 */

export const STARTING_BALANCE_CENTS = 10_000_000; // 100,000.00
export const MIN_BET_CENTS = 10; // 0.10
export const MAX_BET_CENTS = 100_000; // 1,000.00 — house table limit
export const DAILY_BONUS_CENTS = 500_000; // 5,000.00
export const BONUS_STREAK_BONUS_CENTS = 100_000; // +1,000.00 per consecutive day
export const MAX_BONUS_STREAK = 7;
export const BONUS_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h
export const BONUS_STREAK_WINDOW_MS = 48 * 60 * 60 * 1000; // streak breaks after 48h

const fmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "1,234.50" — no currency symbol, this money is not real. */
export function formatCents(cents: number): string {
  return fmt.format(cents / 100);
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

/** Clamps a proposed bet to the table limits and the player's balance. */
export function clampBet(cents: number, balanceCents: number): number {
  const ceiling = Math.min(MAX_BET_CENTS, balanceCents);
  if (ceiling < MIN_BET_CENTS) return 0;
  return Math.min(Math.max(Math.round(cents), MIN_BET_CENTS), ceiling);
}

export type BetValidation = { ok: true; cents: number } | { ok: false; error: string };

/** Server-side bet gate. The client's number is never trusted. */
export function validateBet(cents: unknown, balanceCents: number): BetValidation {
  if (typeof cents !== "number" || !Number.isInteger(cents)) {
    return { ok: false, error: "Bet must be a whole number of cents." };
  }
  if (cents < MIN_BET_CENTS) {
    return { ok: false, error: `Minimum bet is ${formatCents(MIN_BET_CENTS)}.` };
  }
  if (cents > MAX_BET_CENTS) {
    return { ok: false, error: `Table limit is ${formatCents(MAX_BET_CENTS)} per bet.` };
  }
  if (cents > balanceCents) {
    return { ok: false, error: "Not enough balance for that bet." };
  }
  return { ok: true, cents };
}

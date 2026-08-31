import {
  BONUS_COOLDOWN_MS,
  BONUS_STREAK_BONUS_CENTS,
  BONUS_STREAK_WINDOW_MS,
  DAILY_BONUS_CENTS,
  MAX_BONUS_STREAK,
  scaledBonusCents,
} from "@/lib/money";

/**
 * The daily bonus is the ONLY way balance enters an account after sign-up.
 * It is a fixed grant of fake credits on a cooldown — there is no purchase,
 * no top-up, no conversion and no payment provider anywhere in this app.
 */

export type BonusStatus = {
  claimable: boolean;
  /** ms until the next claim, 0 when claimable. */
  msRemaining: number;
  nextStreak: number;
  amountCents: number;
  streak: number;
};

/**
 * The grant scales with the rebirth ladder, because table limits do too — a
 * flat bonus would stop being worth claiming after the first rebirth.
 */
export function bonusAmountForStreak(streak: number, rebirths = 0): number {
  const capped = Math.min(Math.max(streak, 1), MAX_BONUS_STREAK);
  const base = DAILY_BONUS_CENTS + (capped - 1) * BONUS_STREAK_BONUS_CENTS;
  return scaledBonusCents(base, rebirths);
}

export function nextStreak(lastBonusAt: Date | null, streak: number, now: Date): number {
  if (!lastBonusAt) return 1;
  const elapsed = now.getTime() - lastBonusAt.getTime();
  // Claiming again inside the streak window keeps the run going.
  if (elapsed > BONUS_STREAK_WINDOW_MS) return 1;
  return Math.min(streak + 1, MAX_BONUS_STREAK);
}

export function bonusStatus(
  lastBonusAt: Date | null,
  streak: number,
  now: Date = new Date(),
  rebirths = 0,
): BonusStatus {
  const elapsed = lastBonusAt ? now.getTime() - lastBonusAt.getTime() : Infinity;
  const claimable = elapsed >= BONUS_COOLDOWN_MS;
  const upcoming = nextStreak(lastBonusAt, streak, now);

  return {
    claimable,
    msRemaining: claimable ? 0 : Math.max(0, BONUS_COOLDOWN_MS - elapsed),
    nextStreak: upcoming,
    amountCents: bonusAmountForStreak(upcoming, rebirths),
    streak,
  };
}

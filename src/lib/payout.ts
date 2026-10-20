import { randomFloat } from "@/lib/rng";

/**
 * A payout in whole cents, rounded so the long-run return is EXACTLY the
 * multiplier's — at every stake.
 *
 * Rounding to nearest looks unbiased but isn't: the fractional part of
 * `stake × multiplier` is not random, it is fixed by the stake. 10¢ × 1.98 is
 * always 19.8, which always rounds UP to 20, so a 10¢ bettor is paid 101% on a
 * "99%" game, every time. Flooring fixes the sign but skims up to a cent off
 * every win, which at small stakes is a large fraction of it.
 *
 * Stochastic rounding does neither: round up with probability equal to the
 * fractional part, down otherwise. 19.8 becomes 20 eight times in ten and 19
 * twice, and averages 19.8. Server-only (it draws from the CSPRNG), so
 * client code that previews a payout keeps using the pure `payoutFor` in
 * games/originals.
 */
export function settlePayout(betCents: number, multiplier: number): number {
  const exact = betCents * multiplier;
  const floor = Math.floor(exact);
  const frac = exact - floor;
  // Guard float dust: 19.999999999999996 is 20, not "nearly 20, so 99.99999% likely 20".
  if (frac < 1e-9) return floor;
  if (frac > 1 - 1e-9) return floor + 1;
  return randomFloat() < frac ? floor + 1 : floor;
}

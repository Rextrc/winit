/**
 * The Prisma <-> application boundary for money.
 *
 * Money columns are BigInt in SQLite (the rebirth ladder scales table limits
 * geometrically and would overflow a 32-bit Int), but the whole application —
 * game engines, RTP maths, React state, JSON responses — works in plain JS
 * `number` cents. That is exact up to 2^53 cents, roughly 90 trillion, which
 * is far beyond anything the capped rebirth ladder can produce.
 *
 * Everything crossing into or out of Prisma goes through these two functions
 * so the conversion is never done ad hoc.
 */

/** Largest cent value we allow to round-trip, keeping integer maths exact. */
export const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

/** Prisma BigInt -> app number. Throws rather than silently losing precision. */
export function fromDb(value: bigint): number {
  if (value > BigInt(MAX_SAFE_CENTS) || value < -BigInt(MAX_SAFE_CENTS)) {
    throw new Error(`Money value ${value} is outside the exact-integer range.`);
  }
  return Number(value);
}

/** App number -> Prisma BigInt. */
export function toDb(value: number): bigint {
  if (!Number.isFinite(value)) throw new Error("Money value must be finite.");
  if (!Number.isInteger(value)) throw new Error(`Money value ${value} must be whole cents.`);
  if (Math.abs(value) > MAX_SAFE_CENTS) throw new Error(`Money value ${value} is out of range.`);
  return BigInt(value);
}

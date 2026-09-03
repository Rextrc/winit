import { randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * The code alphabet leaves out the characters people misread when a code is
 * copied off a screen or read aloud: 0/O, 1/I/L, and the digit 8 against B.
 */
const ALPHABET = "ACDEFGHJKMNPQRTUVWXY2345679";
const CODE_LENGTH = 7;

export function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Returns the account's code, minting one the first time it is asked for.
 *
 * Accounts created before referrals existed have no code, so this is how they
 * get one; the retry loop covers the vanishingly unlikely case of two accounts
 * generating the same string at the same moment, where the unique index — not
 * this function — is what actually keeps them distinct.
 */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateCode();
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
        select: { referralCode: true },
      });
      return updated.referralCode!;
    } catch {
      // Unique collision, or another request minted one first. Re-read: if the
      // account now has a code, that one is authoritative.
      const now = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (now?.referralCode) return now.referralCode;
    }
  }
  throw new Error("Could not allocate a referral code.");
}

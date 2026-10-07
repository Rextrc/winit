import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { writeTransaction } from "@/lib/ledger";
import { clientIp } from "@/lib/ip";
import { issueSignupGrant } from "@/lib/turnstile";

export const runtime = "nodejs";

/** A guest's whole bankroll — short on purpose, so the trial ends and the
 * "save your progress" prompt has something to offer. */
const GUEST_BALANCE_CENTS = 100_000;
/** Guests one connection may spin up per day, so this can't be farmed. */
const GUESTS_PER_IP_PER_DAY = 3;

/**
 * Creates a throwaway account and hands back credentials for the client to
 * sign straight into. No username, password or CAPTCHA asked of the player.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (ip) {
    const recent = await prisma.user.count({
      where: { isGuest: true, signupIp: ip, createdAt: { gt: new Date(Date.now() - 86_400_000) } },
    });
    if (recent >= GUESTS_PER_IP_PER_DAY) {
      return jsonError("You've used today's guest sessions — create a free account to keep playing.", 429);
    }
  }

  const username = `guest_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await hash(password, 10);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { username, passwordHash, balanceCents: GUEST_BALANCE_CENTS, signupIp: ip, isGuest: true },
    });
    await writeTransaction(tx, {
      userId: user.id,
      game: "signup",
      kind: "SIGNUP",
      betCents: 0,
      payoutCents: GUEST_BALANCE_CENTS,
      outcome: "CREDIT",
      summary: "Guest trial — 1,000.00 play credits",
      balanceAfterCents: GUEST_BALANCE_CENTS,
    });
  });

  return NextResponse.json({ ok: true, username, password, signupGrant: issueSignupGrant(username) });
}

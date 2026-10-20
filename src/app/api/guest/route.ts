import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { writeTransaction } from "@/lib/ledger";
import { clientIp, connectionKey } from "@/lib/ip";
import { issueSignupGrant } from "@/lib/turnstile";

export const runtime = "nodejs";

/** A guest's whole bankroll — short on purpose, so the trial ends and the
 * "save your progress" prompt has something to offer. */
const GUEST_BALANCE_CENTS = 100_000;

const TAKEN =
  "A guest session was already started on this connection — log in, or sign up free to keep playing.";

/**
 * Creates a throwaway account and hands back credentials for the client to
 * sign straight into. One per connection, enforced by a UNIQUE column rather
 * than a check-then-insert, so concurrent requests can't each get one.
 *
 * Deliberately NOT resumable: an address is a weak signal and may be forged or
 * shared, so it is only ever used to say "no more of these", never to hand an
 * existing guest's balance to whoever asks from the same place.
 */
export async function POST(req: Request) {
  const key = connectionKey(clientIp(req));
  // Without a usable address there's nothing to hold the one-guest rule to.
  if (!key) return jsonError("Guest play isn't available on this connection — sign up free instead.", 403);

  const username = `guest_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { username, passwordHash, balanceCents: GUEST_BALANCE_CENTS, signupIp: key, guestKey: key, isGuest: true },
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
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return jsonError(TAKEN, 403);
    throw err;
  }

  return NextResponse.json({ ok: true, username, password, signupGrant: issueSignupGrant(username) });
}

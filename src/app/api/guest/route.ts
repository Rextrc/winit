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
/**
 * The identity a guest is pinned to. IPv6 clients rotate through a whole /64
 * on their own, so that prefix — not the full address — is the "connection".
 */
function guestKey(ip: string | null): string | null {
  if (!ip) return null;
  if (!ip.includes(":")) return ip;
  return ip.split(":").slice(0, 4).join(":") + "::/64";
}

/**
 * Creates a throwaway account and hands back credentials for the client to
 * sign straight into. No username, password or CAPTCHA asked of the player.
 */
export async function POST(req: Request) {
  const ip = guestKey(clientIp(req));
  // Without an address there's nothing to hold the one-guest rule to.
  if (!ip) return jsonError("Guest play isn't available on this connection — sign up free instead.", 403);

  // One guest per connection, ever. A second tab, incognito window or browser
  // resumes that same guest (same balance) rather than minting a fresh 1,000;
  // once it has gone broke, the only way on is a real account.
  const existing = await prisma.user.findFirst({
    where: { isGuest: true, signupIp: ip, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, username: true, deathCause: true, balanceCents: true },
  });
  if (existing) {
    if (existing.deathCause || existing.balanceCents < BigInt(10)) {
      return jsonError("Your guest run is over on this connection — sign up free to keep playing.", 403);
    }
    const password = randomBytes(18).toString("base64url");
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await hash(password, 10) } });
    return NextResponse.json({ ok: true, resumed: true, username: existing.username, password, signupGrant: issueSignupGrant(existing.username) });
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

import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/api";
import { STARTING_BALANCE_CENTS } from "@/lib/money";
import { credit, writeTransaction } from "@/lib/ledger";
import { generateCode } from "@/lib/referral-server";
import { issueSignupGrant } from "@/lib/turnstile";

export const runtime = "nodejs";

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be 20 characters or fewer.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

/**
 * Turns the signed-in guest into a real account: keeps everything they've
 * earned, lifts the guest caps, and tops them up with the normal welcome grant.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  if (!user.progression.isGuest) return jsonError("This account is already saved.", 409);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "Invalid details.");

  const username = parsed.data.username.toLowerCase();
  if (username.startsWith("guest_")) return jsonError("Pick a username that isn't a guest name.");
  if (await prisma.user.findUnique({ where: { username }, select: { id: true } })) {
    return jsonError("That username is taken.", 409);
  }

  const passwordHash = await hash(parsed.data.password, 10);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { username, passwordHash, isGuest: false, referralCode: generateCode() },
    });
    const balance = await credit(tx, user.id, STARTING_BALANCE_CENTS);
    await writeTransaction(tx, {
      userId: user.id,
      game: "signup",
      kind: "SIGNUP",
      betCents: 0,
      payoutCents: STARTING_BALANCE_CENTS,
      outcome: "CREDIT",
      summary: "Account saved — welcome grant",
      balanceAfterCents: balance,
    });
  });

  return NextResponse.json({ ok: true, username, signupGrant: issueSignupGrant(username) });
}

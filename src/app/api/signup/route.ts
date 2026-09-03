import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { STARTING_BALANCE_CENTS, formatCents } from "@/lib/money";
import { credit, writeTransaction } from "@/lib/ledger";
import { REFEREE_BONUS_CENTS, REFERRER_BONUS_CENTS, normaliseCode } from "@/lib/referral";
import { generateCode } from "@/lib/referral-server";

export const runtime = "nodejs";

const schema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be 20 characters or fewer.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
  email: z.string().trim().email("That email doesn't look right.").optional().or(z.literal("")),
  referralCode: z.string().trim().max(32).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.errors[0]?.message ?? "Invalid details.");
  }

  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email ? parsed.data.email.toLowerCase() : null;

  const clash = await prisma.user.findFirst({
    where: email ? { OR: [{ username }, { email }] } : { username },
    select: { username: true, email: true },
  });
  if (clash) {
    return jsonError(clash.username === username ? "That username is taken." : "That email is already in use.", 409);
  }

  // A code is resolved before the account exists, so "you cannot use your own
  // code" needs no check. A suspended or deleted referrer earns nothing: the
  // code simply stops working rather than paying a banned account.
  const wanted = parsed.data.referralCode ? normaliseCode(parsed.data.referralCode) : "";
  let referrer: { id: string; username: string } | null = null;
  if (wanted) {
    const found = await prisma.user.findUnique({
      where: { referralCode: wanted },
      select: { id: true, username: true, suspendedAt: true, deletedAt: true },
    });
    if (!found || found.suspendedAt || found.deletedAt) {
      return jsonError("That referral code isn't valid.", 409);
    }
    referrer = { id: found.id, username: found.username };
  }

  const passwordHash = await hash(parsed.data.password, 10);
  const welcomeCents = STARTING_BALANCE_CENTS + (referrer ? REFEREE_BONUS_CENTS : 0);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        email,
        passwordHash,
        balanceCents: STARTING_BALANCE_CENTS,
        referralCode: generateCode(),
        referredById: referrer?.id ?? null,
        referredAt: referrer ? new Date() : null,
      },
    });
    // The sign-up grant is logged so the ledger reconciles from zero.
    await writeTransaction(tx, {
      userId: user.id,
      game: "signup",
      kind: "SIGNUP",
      betCents: 0,
      payoutCents: STARTING_BALANCE_CENTS,
      outcome: "CREDIT",
      summary: "Welcome grant — 100,000.00 play credits",
      balanceAfterCents: STARTING_BALANCE_CENTS,
    });

    if (referrer) {
      // Both sides are paid as ordinary ledger rows, so each account's running
      // balance still reconciles from zero.
      const refereeBalance = await credit(tx, user.id, REFEREE_BONUS_CENTS);
      await writeTransaction(tx, {
        userId: user.id,
        game: "referral",
        kind: "REFERRAL",
        betCents: 0,
        payoutCents: REFEREE_BONUS_CENTS,
        outcome: "CREDIT",
        summary: `Referral bonus — joined with ${referrer.username}'s code`,
        balanceAfterCents: refereeBalance,
        detail: { role: "referee", referrer: referrer.username },
      });

      const referrerBalance = await credit(tx, referrer.id, REFERRER_BONUS_CENTS);
      await writeTransaction(tx, {
        userId: referrer.id,
        game: "referral",
        kind: "REFERRAL",
        betCents: 0,
        payoutCents: REFERRER_BONUS_CENTS,
        outcome: "CREDIT",
        summary: `Referral bonus — ${username} joined with your code`,
        balanceAfterCents: referrerBalance,
        detail: { role: "referrer", referee: username },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    username,
    referredBy: referrer?.username ?? null,
    welcomeCents,
    bonusCents: referrer ? REFEREE_BONUS_CENTS : 0,
    message: referrer
      ? `You started with ${formatCents(welcomeCents)} — ${formatCents(REFEREE_BONUS_CENTS)} of it from ${referrer.username}'s code.`
      : null,
  });
}

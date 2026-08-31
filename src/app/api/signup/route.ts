import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { STARTING_BALANCE_CENTS } from "@/lib/money";
import { writeTransaction } from "@/lib/ledger";

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

  const passwordHash = await hash(parsed.data.password, 10);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { username, email, passwordHash, balanceCents: STARTING_BALANCE_CENTS },
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
  });

  return NextResponse.json({ ok: true, username });
}

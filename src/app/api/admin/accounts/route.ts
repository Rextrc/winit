import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { fromDb, toDb } from "@/lib/bigmoney";
import { requireReason, requireStaff } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { vipFor } from "@/lib/life/vip";
import { tierFor } from "@/lib/life/reputation";
import { maxBetCents } from "@/lib/progression";
import { STARTING_BALANCE_CENTS } from "@/lib/money";
import { writeTransaction } from "@/lib/ledger";
import { PLAYABLE } from "@/lib/games/registry";
import { VENUES } from "@/lib/life/venues";
import { ACHIEVEMENTS } from "@/lib/life/achievements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Search accounts. Read-only, so `accounts.view` is enough. */
export async function GET(req: Request) {
  const { staff, response } = await requireStaff("accounts.view");
  if (!staff) return response;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const includeDeleted = url.searchParams.get("deleted") === "1";
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 25), 1), 100);

  const rows = await prisma.user.findMany({
    where: {
      ...(includeDeleted ? {} : { deletedAt: null }),
      ...(q
        ? { OR: [{ username: { contains: q } }, { email: { contains: q } }, { id: q }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      username: true,
      email: true,
      balanceCents: true,
      level: true,
      rebirths: true,
      reputation: true,
      lifetimeWageredCents: true,
      adminRole: true,
      suspendedAt: true,
      deletedAt: true,
      lastSeenAt: true,
      createdAt: true,
      betsThisLife: true,
      deathCause: true,
    },
  });

  return NextResponse.json({
    accounts: rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      balanceCents: fromDb(r.balanceCents),
      level: r.level,
      rebirths: r.rebirths,
      reputation: r.reputation,
      repTier: tierFor(r.reputation).name,
      vip: vipFor(fromDb(r.lifetimeWageredCents)).name,
      adminRole: r.adminRole,
      suspended: r.suspendedAt !== null,
      deleted: r.deletedAt !== null,
      lastSeenAt: r.lastSeenAt,
      createdAt: r.createdAt,
      betsThisLife: r.betsThisLife,
      careerOver: r.deathCause !== null,
    })),
    // The catalogues the dashboard needs to offer grant/unlock pickers.
    catalogue: {
      games: PLAYABLE.map((g) => ({ slug: g.slug, name: g.name })),
      venues: VENUES.map((v) => ({ id: v.id, name: v.name })),
      achievements: ACHIEVEMENTS.map((a) => ({ key: a.key, name: a.name })),
    },
  });
}

const createSchema = z.object({
  username: z.string().regex(/^[a-zA-Z0-9_]{3,20}$/, "3-20 letters, numbers or underscore."),
  password: z.string().min(8),
  reason: z.string().optional(),
  /** A loaded account for testing: balance, level, VIP and every venue seen. */
  testAccount: z.boolean().optional(),
});

/**
 * Creates an account. With `testAccount` it is pre-loaded so a tester can
 * exercise late-game content without grinding to it — the grant is written
 * through the ledger like every other credit, so a test account's books
 * reconcile exactly the same way a real one's do.
 */
export async function POST(req: Request) {
  const { staff, response } = await requireStaff("accounts.create");
  if (!staff) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid account." },
      { status: 400 },
    );
  }

  const reasonCheck = requireReason(parsed.data.reason, staff);
  if ("error" in reasonCheck) return reasonCheck.error;

  const existing = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (existing) return NextResponse.json({ error: "That username is taken." }, { status: 409 });

  const isTest = parsed.data.testAccount === true;
  // 1,000,000.00 and level 50: enough to reach the top rooms immediately.
  const TEST_BALANCE = 100_000_000;
  const TEST_LEVEL = 50;
  const TEST_WAGERED = 100_000_000_000; // Black VIP

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username: parsed.data.username,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        ...(isTest
          ? {
              balanceCents: toDb(TEST_BALANCE),
              peakBalanceCents: toDb(TEST_BALANCE),
              level: TEST_LEVEL,
              reputation: 50_000,
              lifetimeWageredCents: toDb(TEST_WAGERED),
              visitedVenuesJson: JSON.stringify(VENUES.map((v) => v.id)),
            }
          : {}),
      },
    });

    // The sign-up grant, logged exactly as the normal path logs it.
    await writeTransaction(tx, {
      userId: user.id,
      game: "signup",
      kind: "SIGNUP",
      betCents: 0,
      payoutCents: isTest ? TEST_BALANCE : STARTING_BALANCE_CENTS,
      outcome: "CREDIT",
      summary: isTest
        ? `Test account created by ${staff.username} — loaded`
        : `Account created by ${staff.username}`,
      balanceAfterCents: isTest ? TEST_BALANCE : STARTING_BALANCE_CENTS,
      detail: { createdBy: staff.username, testAccount: isTest },
    });

    await writeAudit(
      {
        actor: staff,
        action: "account.create",
        target: { id: user.id, username: user.username },
        field: isTest ? "testAccount" : "account",
        oldValue: null,
        newValue: isTest ? "loaded" : "standard",
        reason: reasonCheck.reason,
        metadata: isTest
          ? { balanceCents: TEST_BALANCE, level: TEST_LEVEL, vip: "Black" }
          : undefined,
      },
      tx,
    );

    return user;
  });

  return NextResponse.json({
    ok: true,
    account: {
      id: created.id,
      username: created.username,
      testAccount: isTest,
      balanceCents: isTest ? TEST_BALANCE : STARTING_BALANCE_CENTS,
      level: isTest ? TEST_LEVEL : 1,
      maxBetCents: maxBetCents(isTest ? TEST_LEVEL : 1, 0),
    },
  });
}

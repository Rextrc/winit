import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fromDb, toDb } from "@/lib/bigmoney";
import { requireReason, requireStaff } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { staff, response } = await requireStaff("promo.manage");
  if (!staff) return response;

  const codes = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      grantCents: fromDb(c.grantCents),
      grantXp: c.grantXp,
      maxRedemptions: c.maxRedemptions,
      redeemedCount: c.redeemedCount,
      active: c.active,
      expiresAt: c.expiresAt,
      createdBy: c.createdBy,
      createdAt: c.createdAt,
    })),
  });
}

const schema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    code: z.string().regex(/^[A-Z0-9_-]{4,24}$/, "4-24 characters: A-Z, 0-9, _ or -"),
    grantCents: z.number().int().min(0).max(1_000_000_000),
    grantXp: z.number().int().min(0).max(1_000_000),
    /** 0 means unlimited. */
    maxRedemptions: z.number().int().min(0).max(1_000_000),
    expiresAt: z.string().nullable().optional(),
    reason: z.string(),
  }),
  z.object({ op: z.literal("revoke"), id: z.string().min(1), reason: z.string() }),
]);

export async function POST(req: Request) {
  const { staff, response } = await requireStaff("promo.manage");
  if (!staff) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid code." }, { status: 400 });
  }
  const input = parsed.data;

  const reasonCheck = requireReason(input.reason);
  if ("error" in reasonCheck) return reasonCheck.error;

  if (input.op === "revoke") {
    const existing = await prisma.promoCode.findUnique({ where: { id: input.id } });
    if (!existing) return NextResponse.json({ error: "No such code." }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.promoCode.update({ where: { id: existing.id }, data: { active: false } });
      await writeAudit(
        { actor: staff, action: "promo.revoke", field: "promoCode", oldValue: existing.code, newValue: "revoked", reason: reasonCheck.reason },
        tx,
      );
    });
    return NextResponse.json({ ok: true });
  }

  // A code that grants nothing is a dead code — it would redeem successfully,
  // record a redemption and hand the player nothing at all.
  if (input.grantCents === 0 && input.grantXp === 0) {
    return NextResponse.json(
      { error: "Choose something to grant — credits, XP or both." },
      { status: 400 },
    );
  }

  const clash = await prisma.promoCode.findUnique({ where: { code: input.code } });
  if (clash) return NextResponse.json({ error: "That code already exists." }, { status: 409 });

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.promoCode.create({
      data: {
        code: input.code,
        grantCents: toDb(input.grantCents),
        grantXp: input.grantXp,
        maxRedemptions: input.maxRedemptions,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdById: staff.id,
        createdBy: staff.username,
      },
    });
    await writeAudit(
      {
        actor: staff,
        action: "promo.create",
        field: "promoCode",
        oldValue: null,
        newValue: input.code,
        reason: reasonCheck.reason,
        metadata: { grantCents: input.grantCents, grantXp: input.grantXp, maxRedemptions: input.maxRedemptions },
      },
      tx,
    );
    return row;
  });

  return NextResponse.json({ ok: true, code: { id: created.id, code: created.code } });
}

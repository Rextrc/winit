import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireConfirmation, requireReason, requireStaff } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { FLAG_MAINTENANCE, allFlags } from "@/lib/admin/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { staff, response } = await requireStaff("site.config");
  if (!staff) return response;
  return NextResponse.json({ flags: await allFlags() });
}

const schema = z.object({
  key: z.string().min(1).max(64),
  value: z.string().max(500),
  reason: z.string().optional(),
  confirm: z.boolean().optional(),
});

/**
 * Sets a site flag. Maintenance mode is treated as a dangerous action — it
 * closes the floor to every player at once — so it needs the confirmation flag
 * on top of the reason.
 */
export async function POST(req: Request) {
  const { staff, response } = await requireStaff("site.config");
  if (!staff) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid flag." }, { status: 400 });

  const reasonCheck = requireReason(parsed.data.reason, staff);
  if ("error" in reasonCheck) return reasonCheck.error;

  if (parsed.data.key === FLAG_MAINTENANCE) {
    const bad = requireConfirmation(parsed.data.confirm);
    if (bad) return bad;
  }

  const before = await prisma.siteFlag.findUnique({ where: { key: parsed.data.key } });

  await prisma.$transaction(async (tx) => {
    await tx.siteFlag.upsert({
      where: { key: parsed.data.key },
      create: { key: parsed.data.key, value: parsed.data.value, updatedById: staff.id },
      update: { value: parsed.data.value, updatedById: staff.id },
    });
    await writeAudit(
      {
        actor: staff,
        action: parsed.data.key === FLAG_MAINTENANCE ? "site.maintenance" : "site.flag",
        field: parsed.data.key,
        oldValue: before?.value ?? null,
        newValue: parsed.data.value,
        reason: reasonCheck.reason,
      },
      tx,
    );
  });

  return NextResponse.json({ ok: true, flags: await allFlags() });
}

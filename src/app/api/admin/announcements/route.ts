import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireReason, requireStaff } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { staff, response } = await requireStaff("site.announce");
  if (!staff) return response;

  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ announcements });
}

const schema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    title: z.string().min(1).max(120),
    body: z.string().min(1).max(1000),
    level: z.enum(["INFO", "WARNING", "CELEBRATION"]).default("INFO"),
    /** Null or absent broadcasts to everyone; a username targets one account. */
    targetUsername: z.string().nullable().optional(),
    reason: z.string(),
  }),
  z.object({ op: z.literal("retire"), id: z.string().min(1), reason: z.string() }),
]);

export async function POST(req: Request) {
  const { staff, response } = await requireStaff("site.announce");
  if (!staff) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid announcement." }, { status: 400 });

  // A stable reference, so the discriminated union narrows across the awaits.
  const input = parsed.data;

  const reasonCheck = requireReason(input.reason);
  if ("error" in reasonCheck) return reasonCheck.error;

  if (input.op === "retire") {
    const existing = await prisma.announcement.findUnique({ where: { id: input.id } });
    if (!existing) return NextResponse.json({ error: "No such announcement." }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.announcement.update({ where: { id: existing.id }, data: { active: false } });
      await writeAudit(
        { actor: staff, action: "site.announce.retire", field: "announcement", oldValue: existing.title, newValue: "retired", reason: reasonCheck.reason },
        tx,
      );
    });
    return NextResponse.json({ ok: true });
  }

  let targetId: string | null = null;
  if (input.targetUsername) {
    const target = await prisma.user.findUnique({
      where: { username: input.targetUsername },
      select: { id: true },
    });
    if (!target) return NextResponse.json({ error: "No such account." }, { status: 404 });
    targetId = target.id;
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.announcement.create({
      data: {
        title: input.title,
        body: input.body,
        level: input.level,
        targetId,
        createdById: staff.id,
        createdBy: staff.username,
      },
    });
    await writeAudit(
      {
        actor: staff,
        action: targetId ? "site.message" : "site.announce",
        target: targetId ? { id: targetId, username: input.targetUsername! } : null,
        field: "announcement",
        oldValue: null,
        newValue: input.title,
        reason: reasonCheck.reason,
      },
      tx,
    );
    return row;
  });

  return NextResponse.json({ ok: true, announcement: created });
}

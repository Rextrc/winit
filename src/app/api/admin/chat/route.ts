import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireReason, requireStaff } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ id: z.string().min(1), reason: z.string().optional() });

/** Soft-deletes one lobby chat message. The row stays for the audit trail. */
export async function POST(req: Request) {
  const { staff, response } = await requireStaff("chat.moderate");
  if (!staff) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const reasonCheck = requireReason(parsed.data.reason, staff);
  if ("error" in reasonCheck) return reasonCheck.error;

  const existing = await prisma.chatMessage.findUnique({ where: { id: parsed.data.id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "No such message." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedBy: staff.username },
    });
    await writeAudit(
      {
        actor: staff,
        action: "chat.delete",
        target: { id: existing.userId, username: existing.username },
        field: "chatMessage",
        oldValue: existing.body.slice(0, 200),
        newValue: "deleted",
        reason: reasonCheck.reason,
      },
      tx,
    );
  });

  return NextResponse.json({ ok: true });
}

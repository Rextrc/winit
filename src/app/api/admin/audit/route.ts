import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/admin/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The audit trail, newest first, filterable by actor, target or action. */
export async function GET(req: Request) {
  const { staff, response } = await requireStaff("audit.view");
  if (!staff) return response;

  const url = new URL(req.url);
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 50), 1), 200);
  const actor = url.searchParams.get("actor")?.trim();
  const target = url.searchParams.get("target")?.trim();
  const action = url.searchParams.get("action")?.trim();

  const entries = await prisma.auditLog.findMany({
    where: {
      ...(actor ? { actorUsername: { contains: actor } } : {}),
      ...(target ? { targetUsername: { contains: target } } : {}),
      ...(action ? { action: { contains: action } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  const actions = await prisma.auditLog.groupBy({ by: ["action"], _count: { action: true } });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      actorUsername: e.actorUsername,
      actorRole: e.actorRole,
      action: e.action,
      targetUsername: e.targetUsername,
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      reason: e.reason,
      createdAt: e.createdAt,
    })),
    actions: actions.map((a) => ({ action: a.action, count: a._count.action })).sort((x, y) => y.count - x.count),
  });
}

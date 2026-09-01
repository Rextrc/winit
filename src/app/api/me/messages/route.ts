import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The player's inbox: the announcements staff have posted that apply to this
 * account — the site-wide ones plus anything addressed to them by name.
 *
 * Retired and expired messages fall out here rather than being deleted, so the
 * audit trail keeps pointing at a row that still exists.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      active: true,
      OR: [{ targetId: null }, { targetId: user.id }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { reads: { where: { userId: user.id }, select: { id: true } } },
  });

  const messages = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    level: r.level,
    personal: r.targetId != null,
    createdAt: r.createdAt,
    read: r.reads.length > 0,
  }));

  return NextResponse.json({
    messages,
    unread: messages.filter((m) => !m.read).length,
  });
}

const schema = z.object({ id: z.string().min(1).optional(), all: z.boolean().optional() });

/** Marks one message read, or all of them. */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request.");

  const now = new Date();
  const targets = parsed.data.all
    ? await prisma.announcement.findMany({
        where: {
          active: true,
          OR: [{ targetId: null }, { targetId: user.id }],
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        select: { id: true },
      })
    : parsed.data.id
      ? [{ id: parsed.data.id }]
      : [];

  if (targets.length === 0) return NextResponse.json({ ok: true });

  // Upsert rather than create: the compound unique index makes each one
  // atomic, so two tabs marking the same message read cannot collide.
  await Promise.all(
    targets.map((t) =>
      prisma.announcementRead.upsert({
        where: { announcementId_userId: { announcementId: t.id, userId: user.id } },
        create: { announcementId: t.id, userId: user.id },
        update: {},
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}

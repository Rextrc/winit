import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { jsonError, requireUser } from "@/lib/api";
import { currentUserId } from "@/lib/auth";
import { can, isRole } from "@/lib/admin/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEN = 240;
/** The floor between two messages from the same account. */
const MIN_INTERVAL_MS = 2000;

/**
 * The public lobby chat. Reading it needs no account — it's the same room
 * whether you're logged in or just browsing the lobby — but only a signed-in,
 * non-suspended account can post into it.
 */
export async function GET() {
  const rows = await prisma.chatMessage.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, userId: true, username: true, body: true, createdAt: true },
  });

  // Staff with the moderation capability get a flag telling the client to
  // show a delete control — a courtesy only; the delete route re-checks the
  // same capability itself regardless of what this said.
  let canModerate = false;
  const viewerId = await currentUserId();
  if (viewerId) {
    const viewer = await prisma.user.findUnique({ where: { id: viewerId }, select: { adminRole: true } });
    if (viewer && isRole(viewer.adminRole)) canModerate = can(viewer.adminRole, "chat.moderate");
  }

  return NextResponse.json({ messages: rows.reverse(), canModerate });
}

const schema = z.object({ text: z.string().min(1).max(MAX_LEN) });

export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  if (user.suspended) {
    return jsonError(
      user.suspendedReason ? `This account is suspended: ${user.suspendedReason}` : "This account is suspended.",
      403,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(`Keep it under ${MAX_LEN} characters.`);

  const text = parsed.data.text.trim();
  if (!text) return jsonError("Say something first.");

  // Rate-limited server-side, not just by disabling the client's send button —
  // the same reasoning as every bet: a client-side check is a courtesy, the
  // server is the actual control.
  const lastOwn = await prisma.chatMessage.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (lastOwn && Date.now() - lastOwn.createdAt.getTime() < MIN_INTERVAL_MS) {
    return jsonError("You're sending messages too quickly.", 429);
  }

  const row = await prisma.chatMessage.create({
    data: { userId: user.id, username: user.username, body: text },
    select: { id: true, userId: true, username: true, body: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, message: row });
}

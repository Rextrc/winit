import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { isRole, type Role } from "@/lib/admin/roles";

/**
 * The signed-in staff member, for server components that need to shape the UI
 * around a role — which fields to show, whether to insist on a reason.
 *
 * This is presentation only. Nothing here is trusted by an API route: each one
 * re-reads the caller's role from the database and re-checks it, so a viewer
 * whose page was rendered generously still gets a 403 from the route.
 */
export async function staffViewer(): Promise<{ id: string; username: string; role: Role } | null> {
  const id = await currentUserId();
  if (!id) return null;

  const row = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, adminRole: true, suspendedAt: true, deletedAt: true },
  });
  if (!row || row.deletedAt || row.suspendedAt || !isRole(row.adminRole)) return null;

  return { id: row.id, username: row.username, role: row.adminRole };
}

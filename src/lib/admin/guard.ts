import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth";
import { isRole, can, mayActOn, type Capability, type Role } from "@/lib/admin/roles";

/**
 * The server-side gate for every admin route.
 *
 * This is the whole authorisation boundary: no admin route reads a role from
 * the request, trusts a header, or assumes the dashboard only rendered buttons
 * the caller was allowed to press. Each route names the capability it needs and
 * calls `requireStaff` with it; a caller without that capability gets a 403 and
 * the handler never runs.
 *
 * A suspended or soft-deleted staff account is rejected too, so revoking access
 * takes effect on the next request rather than at the next sign-in.
 */

export type Staff = {
  id: string;
  username: string;
  role: Role;
};

export function adminError(message: string, status = 403) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireStaff(
  capability: Capability,
): Promise<{ staff: Staff; response: null } | { staff: null; response: NextResponse }> {
  const id = await currentUserId();
  if (!id) return { staff: null, response: adminError("Not signed in.", 401) };

  const row = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      adminRole: true,
      suspendedAt: true,
      deletedAt: true,
    },
  });

  // Deliberately the same 403 for "not staff" and "wrong capability": the
  // dashboard's existence is not a secret, but which roles exist on which
  // account is not something an unauthorised caller needs to learn.
  if (!row || row.deletedAt || row.suspendedAt) {
    return { staff: null, response: adminError("Not authorised.", 403) };
  }
  if (!isRole(row.adminRole)) {
    return { staff: null, response: adminError("Not authorised.", 403) };
  }
  if (!can(row.adminRole, capability)) {
    return { staff: null, response: adminError("Your role does not allow that.", 403) };
  }

  return { staff: { id: row.id, username: row.username, role: row.adminRole }, response: null };
}

/**
 * Additionally checks the target account may be acted on. Staff can always act
 * on ordinary players; acting on another staff account requires outranking
 * them, which is what stops two peers demoting each other.
 *
 * Acting on your OWN account is allowed here — the rank rule exists to stop
 * peers overriding each other, and you are not your own peer. The handful of
 * actions that could lock you out of the dashboard are refused separately, by
 * the route, so the exception cannot be used to strand an owner.
 */
export async function requireTarget(
  staff: Staff,
  targetId: string,
): Promise<{ target: TargetRow; response: null } | { target: null; response: NextResponse }> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      username: true,
      adminRole: true,
      deletedAt: true,
      suspendedAt: true,
    },
  });
  if (!target) return { target: null, response: adminError("No such account.", 404) };

  if (target.id !== staff.id && !mayActOn(staff.role, target.adminRole)) {
    return {
      target: null,
      response: adminError("That account holds a role at or above your own.", 403),
    };
  }
  return { target, response: null };
}

export type TargetRow = {
  id: string;
  username: string;
  adminRole: string | null;
  deletedAt: Date | null;
  suspendedAt: Date | null;
};

/**
 * Dangerous actions need an explicit confirmation flag on top of the reason.
 * The flag is not security — a scripted caller can set it — it is there so a
 * mis-click in the dashboard cannot wipe an account, and so the intent is
 * recorded alongside the audit entry.
 */
export function requireConfirmation(confirm: unknown): NextResponse | null {
  if (confirm !== true) {
    return NextResponse.json(
      { error: "This action needs an explicit confirmation." },
      { status: 400 },
    );
  }
  return null;
}

/** What the audit log records when an owner changes something without saying why. */
export const UNSTATED_REASON = "No reason given (owner).";

/**
 * Every mutating admin route requires a non-trivial reason — except from an
 * OWNER, who may leave it blank.
 *
 * The exemption is about who has to justify themselves to whom: an owner
 * answers to nobody inside the app, so a mandatory text box is friction rather
 * than accountability. It is deliberately *not* an exemption from the audit
 * log — the entry is still written, with the reason field spelling out that
 * none was given, so the trail never has a silent gap in it. Any other role
 * still has to state one.
 */
export function requireReason(
  reason: unknown,
  staff?: Staff | null,
): { reason: string } | { error: NextResponse } {
  const given = typeof reason === "string" ? reason.trim() : "";

  if (given.length < 3) {
    if (staff?.role === "OWNER") return { reason: given.length > 0 ? given : UNSTATED_REASON };
    return {
      error: NextResponse.json(
        { error: "A reason of at least 3 characters is required." },
        { status: 400 },
      ),
    };
  }
  return { reason: given.slice(0, 500) };
}

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Staff } from "@/lib/admin/guard";

/**
 * The audit trail. Append-only by convention and by the absence of any update
 * or delete path in the app: nothing here is ever rewritten, so the record of
 * what staff did survives the account it was done to being deleted.
 *
 * Every mutating admin route writes exactly one entry, inside the same
 * transaction as the change itself where there is one — so an action either
 * happens and is recorded, or neither.
 */

export type AuditInput = {
  actor: Staff;
  action: string;
  target?: { id: string; username: string } | null;
  field?: string;
  oldValue?: string | number | boolean | null;
  newValue?: string | number | boolean | null;
  reason: string;
  metadata?: unknown;
};

function str(value: string | number | boolean | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return String(value);
}

export async function writeAudit(
  input: AuditInput,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
) {
  return tx.auditLog.create({
    data: {
      actorId: input.actor.id,
      actorUsername: input.actor.username,
      actorRole: input.actor.role,
      action: input.action,
      targetId: input.target?.id ?? null,
      targetUsername: input.target?.username ?? null,
      field: input.field ?? null,
      oldValue: str(input.oldValue),
      newValue: str(input.newValue),
      reason: input.reason,
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
    },
  });
}

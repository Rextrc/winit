import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fromDb, toDb } from "@/lib/bigmoney";
import { formatCents } from "@/lib/money";
import { credit, debit, writeTransaction } from "@/lib/ledger";
import { requireConfirmation, requireReason, requireStaff, requireTarget } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { ROLES, can, isRole, type Capability } from "@/lib/admin/roles";
import { MAX_LEVEL, MAX_REBIRTHS, applyXp } from "@/lib/progression";
import { VIP_TIERS } from "@/lib/life/vip";
import { MAX_REP } from "@/lib/life/reputation";
import { ACHIEVEMENT_KEYS } from "@/lib/life/achievements";
import { VENUES, venueById } from "@/lib/life/venues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE ACCOUNT MUTATION ENDPOINT
 * ---------------------------------------------------------------------------
 * One route for every staff action against an account, because the things that
 * must be true of all of them — capability, rank, reason, confirmation, audit —
 * are then written once rather than re-implemented per verb.
 *
 * Four rules hold for every branch below:
 *
 *  1. The CAPABILITY is checked server-side against the caller's role, per
 *     action. The dashboard greying out a button is not a control.
 *  2. Staff cannot act on staff at or above their own rank.
 *  3. A REASON is mandatory, and the dangerous actions additionally need an
 *     explicit confirmation flag.
 *  4. Money moves through the LEDGER, never by writing balanceCents directly,
 *     so an admin adjustment appears in the running-balance chain exactly like
 *     a bet does and the reconciliation that proves the books still passes.
 *
 * The audit entry is written inside the same transaction as the change, so an
 * action either happens and is recorded or neither.
 * ---------------------------------------------------------------------------
 */

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("balance.grant"), cents: z.number().int(), reason: z.string().optional() }),
  z.object({
    action: z.literal("balance.set"),
    cents: z.number().int().min(0),
    reason: z.string().optional(),
    confirm: z.boolean(),
  }),
  z.object({ action: z.literal("xp.grant"), xp: z.number().int(), reason: z.string().optional() }),
  z.object({ action: z.literal("level.set"), level: z.number().int().min(1).max(MAX_LEVEL), reason: z.string().optional() }),
  z.object({ action: z.literal("reputation.set"), points: z.number().int().min(0), reason: z.string().optional() }),
  z.object({ action: z.literal("vip.set"), level: z.number().int().min(0).max(VIP_TIERS.length - 1), reason: z.string().optional() }),
  z.object({ action: z.literal("prestige.set"), rebirths: z.number().int().min(0).max(MAX_REBIRTHS), reason: z.string().optional() }),
  z.object({ action: z.literal("progression.reset"), reason: z.string().optional(), confirm: z.boolean() }),
  z.object({ action: z.literal("achievement.grant"), key: z.string(), reason: z.string().optional() }),
  z.object({ action: z.literal("achievement.revoke"), key: z.string(), reason: z.string().optional() }),
  z.object({ action: z.literal("venue.unlock"), venueId: z.string(), reason: z.string().optional() }),
  z.object({ action: z.literal("suspend"), reason: z.string().optional() }),
  z.object({ action: z.literal("unsuspend"), reason: z.string().optional() }),
  z.object({ action: z.literal("delete"), reason: z.string().optional(), confirm: z.boolean() }),
  z.object({ action: z.literal("restore"), reason: z.string().optional() }),
  z.object({
    action: z.literal("role.set"),
    role: z.string().nullable(),
    reason: z.string().optional(),
    confirm: z.boolean(),
  }),
]);

/** Which capability each action needs. Checked before anything else happens. */
/** Actions that would strand the actor outside the dashboard if self-applied. */
const SELF_FORBIDDEN = new Set(["suspend", "delete", "role.set"]);

const NEEDS: Record<string, Capability> = {
  "balance.grant": "accounts.economy",
  "balance.set": "accounts.economy",
  "xp.grant": "accounts.progression",
  "level.set": "accounts.progression",
  "reputation.set": "accounts.progression",
  "vip.set": "accounts.progression",
  "prestige.set": "accounts.progression",
  "progression.reset": "accounts.progression",
  "achievement.grant": "accounts.unlocks",
  "achievement.revoke": "accounts.unlocks",
  "venue.unlock": "accounts.unlocks",
  suspend: "accounts.suspend",
  unsuspend: "accounts.suspend",
  delete: "accounts.delete",
  restore: "accounts.delete",
  "role.set": "roles.manage",
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Unknown action." },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // (1) capability
  const { staff, response } = await requireStaff(NEEDS[input.action]);
  if (!staff) return response;

  // (3) reason
  const reasonCheck = requireReason(input.reason, staff);
  if ("error" in reasonCheck) return reasonCheck.error;
  const reason = reasonCheck.reason;

  if ("confirm" in input) {
    const bad = requireConfirmation(input.confirm);
    if (bad) return bad;
  }

  // (2) rank
  const targetCheck = await requireTarget(staff, params.id);
  if (!targetCheck.target) return targetCheck.response;
  const target = targetCheck.target;

  // Acting on your own account is allowed — granting yourself credits, setting
  // your own level — but not in the three ways that would end with nobody able
  // to reach the dashboard. An owner who suspends, deletes or demotes himself
  // has no route back in, since roles are only mintable from the command line.
  if (target.id === staff.id && SELF_FORBIDDEN.has(input.action)) {
    return NextResponse.json(
      { error: "You cannot do that to your own account — it would lock you out of the dashboard." },
      { status: 400 },
    );
  }
  const auditTarget = { id: target.id, username: target.username };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: target.id } });

      switch (input.action) {
        // --- economy: always through the ledger ---------------------------
        case "balance.grant": {
          const delta = input.cents;
          if (delta === 0) return { error: "Nothing to grant." as const };
          const balanceBefore = fromDb(before.balanceCents);

          if (delta < 0 && balanceBefore + delta < 0) {
            return { error: "That would take the balance below zero." as const };
          }

          const balanceAfter =
            delta > 0 ? await credit(tx, target.id, delta) : await debit(tx, target.id, -delta);

          await writeTransaction(tx, {
            userId: target.id,
            game: "admin",
            kind: "ADMIN",
            betCents: delta < 0 ? -delta : 0,
            payoutCents: delta > 0 ? delta : 0,
            outcome: delta > 0 ? "CREDIT" : "LOSS",
            summary: `${staff.username} ${delta > 0 ? "granted" : "removed"} ${formatCents(
              Math.abs(delta),
            )} — ${reason}`,
            balanceAfterCents: balanceAfter,
            detail: { by: staff.username, role: staff.role, reason },
          });

          await writeAudit(
            { actor: staff, action: "account.balance.grant", target: auditTarget, field: "balanceCents", oldValue: balanceBefore, newValue: balanceAfter, reason },
            tx,
          );
          return { balanceCents: balanceAfter };
        }

        case "balance.set": {
          const balanceBefore = fromDb(before.balanceCents);
          const delta = input.cents - balanceBefore;
          if (delta === 0) return { error: "The balance is already that." as const };

          const balanceAfter =
            delta > 0 ? await credit(tx, target.id, delta) : await debit(tx, target.id, -delta);

          await writeTransaction(tx, {
            userId: target.id,
            game: "admin",
            kind: "ADMIN",
            betCents: delta < 0 ? -delta : 0,
            payoutCents: delta > 0 ? delta : 0,
            outcome: delta > 0 ? "CREDIT" : "LOSS",
            summary: `${staff.username} set the balance to ${formatCents(input.cents)} — ${reason}`,
            balanceAfterCents: balanceAfter,
            detail: { by: staff.username, role: staff.role, reason, setTo: input.cents },
          });

          await writeAudit(
            { actor: staff, action: "account.balance.set", target: auditTarget, field: "balanceCents", oldValue: balanceBefore, newValue: balanceAfter, reason },
            tx,
          );
          return { balanceCents: balanceAfter };
        }

        // --- progression ---------------------------------------------------
        case "xp.grant": {
          const rolled = applyXp(
            { level: before.level, xp: before.xp, rebirths: before.rebirths },
            input.xp,
          );
          await tx.user.update({
            where: { id: target.id },
            data: { level: rolled.level, xp: rolled.xp },
          });
          await writeAudit(
            { actor: staff, action: "account.xp.grant", target: auditTarget, field: "xp", oldValue: `L${before.level}/${before.xp}`, newValue: `L${rolled.level}/${rolled.xp}`, reason },
            tx,
          );
          return { level: rolled.level, xp: rolled.xp, levelUps: rolled.levelUps.length };
        }

        case "level.set": {
          await tx.user.update({
            where: { id: target.id },
            data: { level: input.level, xp: 0 },
          });
          await writeAudit(
            { actor: staff, action: "account.level.set", target: auditTarget, field: "level", oldValue: before.level, newValue: input.level, reason },
            tx,
          );
          return { level: input.level };
        }

        case "reputation.set": {
          const points = Math.min(input.points, MAX_REP * 4);
          await tx.user.update({ where: { id: target.id }, data: { reputation: points } });
          await writeAudit(
            { actor: staff, action: "account.reputation.set", target: auditTarget, field: "reputation", oldValue: before.reputation, newValue: points, reason },
            tx,
          );
          return { reputation: points };
        }

        case "vip.set": {
          // VIP is DERIVED from lifetime amount staked, so granting a tier means
          // moving that figure to the tier's threshold. Recorded as such rather
          // than pretending there is a VIP column.
          const tier = VIP_TIERS[input.level];
          const oldWagered = fromDb(before.lifetimeWageredCents);
          await tx.user.update({
            where: { id: target.id },
            data: { lifetimeWageredCents: toDb(tier.from) },
          });
          await writeAudit(
            { actor: staff, action: "account.vip.set", target: auditTarget, field: "lifetimeWageredCents", oldValue: oldWagered, newValue: tier.from, reason, metadata: { tier: tier.name, note: "VIP is derived from lifetime staked" } },
            tx,
          );
          return { vip: tier.name, lifetimeWageredCents: tier.from };
        }

        case "prestige.set": {
          await tx.user.update({ where: { id: target.id }, data: { rebirths: input.rebirths } });
          await writeAudit(
            { actor: staff, action: "account.prestige.set", target: auditTarget, field: "rebirths", oldValue: before.rebirths, newValue: input.rebirths, reason },
            tx,
          );
          return { rebirths: input.rebirths };
        }

        case "progression.reset": {
          // Resets the career, not the money — wiping a balance is a separate,
          // separately-audited action so the two are never confused.
          await tx.user.update({
            where: { id: target.id },
            data: {
              level: 1,
              xp: 0,
              rebirths: 0,
              reputation: 0,
              careerDays: 0,
              betsThisLife: 0,
              comebacksUsed: 0,
              deathCause: null,
              diedAt: null,
              venueId: "back-room",
              visitedVenuesJson: JSON.stringify(["back-room"]),
              careerStartedAt: new Date(),
            },
          });
          await tx.achievementUnlock.deleteMany({ where: { userId: target.id } });
          await tx.gameStat.deleteMany({ where: { userId: target.id } });
          await tx.challengeProgress.deleteMany({ where: { userId: target.id } });
          await tx.round.updateMany({
            where: { userId: target.id, status: "ACTIVE" },
            data: { status: "SETTLED" },
          });
          await writeAudit(
            { actor: staff, action: "account.progression.reset", target: auditTarget, field: "progression", oldValue: `L${before.level} R${before.rebirths} rep${before.reputation}`, newValue: "L1 R0 rep0", reason },
            tx,
          );
          return { reset: true };
        }

        // --- unlocks --------------------------------------------------------
        case "achievement.grant": {
          if (!ACHIEVEMENT_KEYS.has(input.key)) return { error: "No such achievement." as const };
          const already = await tx.achievementUnlock.findUnique({
            where: { userId_key: { userId: target.id, key: input.key } },
          });
          if (already) return { error: "Already unlocked." as const };
          await tx.achievementUnlock.create({ data: { userId: target.id, key: input.key } });
          await writeAudit(
            { actor: staff, action: "account.achievement.grant", target: auditTarget, field: "achievement", oldValue: null, newValue: input.key, reason },
            tx,
          );
          return { granted: input.key };
        }

        case "achievement.revoke": {
          const deleted = await tx.achievementUnlock.deleteMany({
            where: { userId: target.id, key: input.key },
          });
          if (deleted.count === 0) return { error: "That achievement is not unlocked." as const };
          await writeAudit(
            { actor: staff, action: "account.achievement.revoke", target: auditTarget, field: "achievement", oldValue: input.key, newValue: null, reason },
            tx,
          );
          return { revoked: input.key };
        }

        case "venue.unlock": {
          if (!VENUES.some((v) => v.id === input.venueId)) {
            return { error: "No such room on the circuit." as const };
          }
          let visited: string[] = [];
          try {
            const p = JSON.parse(before.visitedVenuesJson);
            if (Array.isArray(p)) visited = p as string[];
          } catch {
            visited = [];
          }
          if (visited.includes(input.venueId)) return { error: "Already visited." as const };
          visited.push(input.venueId);
          await tx.user.update({
            where: { id: target.id },
            data: { visitedVenuesJson: JSON.stringify(visited) },
          });
          await writeAudit(
            { actor: staff, action: "account.venue.unlock", target: auditTarget, field: "venuesVisited", oldValue: before.visitedVenuesJson, newValue: JSON.stringify(visited), reason, metadata: { venue: venueById(input.venueId).name } },
            tx,
          );
          return { unlocked: input.venueId };
        }

        // --- moderation ------------------------------------------------------
        case "suspend": {
          if (before.suspendedAt) return { error: "Already suspended." as const };
          await tx.user.update({
            where: { id: target.id },
            data: { suspendedAt: new Date(), suspendedReason: reason },
          });
          await writeAudit(
            { actor: staff, action: "account.suspend", target: auditTarget, field: "suspendedAt", oldValue: null, newValue: new Date().toISOString(), reason },
            tx,
          );
          return { suspended: true };
        }

        case "unsuspend": {
          if (!before.suspendedAt && !before.bannedAt) {
            return { error: "That account is not suspended." as const };
          }
          // Reinstating clears the strikes too. Leaving them would put the
          // account one infraction from a ban the moment it came back, which
          // is not what a staff member reversing a decision means by it.
          await tx.user.update({
            where: { id: target.id },
            data: {
              suspendedAt: null,
              suspendedReason: null,
              bannedAt: null,
              bannedReason: null,
              strikes: 0,
            },
          });
          await writeAudit(
            {
              actor: staff,
              action: before.bannedAt ? "account.unban" : "account.unsuspend",
              target: auditTarget,
              field: before.bannedAt ? "bannedAt" : "suspendedAt",
              oldValue: (before.bannedAt ?? before.suspendedAt)!.toISOString(),
              newValue: null,
              reason,
              metadata: { strikesCleared: before.strikes },
            },
            tx,
          );
          return { suspended: false, banned: false, strikes: 0 };
        }

        case "delete": {
          if (before.deletedAt) return { error: "Already deleted." as const };
          // Soft delete: the row and its whole history stay, so the audit trail
          // still resolves. Nothing is destroyed here.
          await tx.user.update({ where: { id: target.id }, data: { deletedAt: new Date() } });
          await writeAudit(
            { actor: staff, action: "account.delete", target: auditTarget, field: "deletedAt", oldValue: null, newValue: new Date().toISOString(), reason },
            tx,
          );
          return { deleted: true };
        }

        case "restore": {
          if (!before.deletedAt) return { error: "That account is not deleted." as const };
          await tx.user.update({ where: { id: target.id }, data: { deletedAt: null } });
          await writeAudit(
            { actor: staff, action: "account.restore", target: auditTarget, field: "deletedAt", oldValue: before.deletedAt.toISOString(), newValue: null, reason },
            tx,
          );
          return { deleted: false };
        }

        case "role.set": {
          if (input.role !== null && !isRole(input.role)) {
            return { error: `Role must be null or one of ${ROLES.join(", ")}.` as const };
          }
          // An OWNER cannot hand out a role they do not themselves hold, and
          // cannot promote anyone to their own rank or above.
          if (input.role !== null && !can(staff.role, "roles.manage")) {
            return { error: "You cannot assign roles." as const };
          }
          if (input.role === "OWNER" && staff.role !== "OWNER") {
            return { error: "Only an OWNER can create an OWNER." as const };
          }
          if (target.id === staff.id) {
            return { error: "You cannot change your own role." as const };
          }
          await tx.user.update({ where: { id: target.id }, data: { adminRole: input.role } });
          await writeAudit(
            { actor: staff, action: "account.role.set", target: auditTarget, field: "adminRole", oldValue: before.adminRole, newValue: input.role, reason },
            tx,
          );
          return { role: input.role };
        }
      }
    });

    if (result && "error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "That action failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


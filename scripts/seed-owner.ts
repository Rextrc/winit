/**
 * Creates or promotes the first OWNER, from environment variables.
 *
 *   OWNER_USERNAME=... OWNER_PASSWORD=... npx tsx scripts/seed-owner.ts
 *
 * This is the ONLY way a role can come into existence on a fresh deployment.
 * There is deliberately no route, no sign-up flag and no "first user becomes
 * owner" rule anywhere in the app: the dashboard can set balances and wipe
 * progression, so the ability to mint one has to live outside anything an HTTP
 * request can reach.
 *
 * Idempotent — running it again on an existing username promotes that account
 * rather than failing, and never changes a password that is already set.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const username = process.env.OWNER_USERNAME?.trim();
  const password = process.env.OWNER_PASSWORD;

  if (!username) throw new Error("OWNER_USERNAME is required.");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error("OWNER_USERNAME must be 3-20 characters, letters/numbers/underscore.");
  }

  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    if (existing.adminRole === "OWNER") {
      console.log(`${username} is already an OWNER — nothing to do.`);
      return;
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { adminRole: "OWNER", deletedAt: null, suspendedAt: null, suspendedReason: null },
    });
    await prisma.auditLog.create({
      data: {
        actorId: existing.id,
        actorUsername: username,
        actorRole: "OWNER",
        action: "account.role.set",
        targetId: existing.id,
        targetUsername: username,
        field: "adminRole",
        oldValue: existing.adminRole ?? null,
        newValue: "OWNER",
        reason: "Promoted by scripts/seed-owner.ts",
      },
    });
    console.log(`Promoted existing account ${username} to OWNER.`);
    return;
  }

  if (!password || password.length < 12) {
    throw new Error("OWNER_PASSWORD is required and must be at least 12 characters for a new owner.");
  }

  const created = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 12),
      adminRole: "OWNER",
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: created.id,
      actorUsername: username,
      actorRole: "OWNER",
      action: "account.create",
      targetId: created.id,
      targetUsername: username,
      field: "adminRole",
      oldValue: null,
      newValue: "OWNER",
      reason: "Bootstrapped by scripts/seed-owner.ts",
    },
  });
  console.log(`Created OWNER account ${username}.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

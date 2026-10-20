/**
 * One-time copy of an old SQLite database (the file that lived on the
 * Railway volume) into the current Postgres database.
 *
 *   MIGRATE_SQLITE_FROM=/data/dev.db pnpm tsx scripts/migrate-sqlite.ts
 *
 * It runs from `pnpm start` too: if MIGRATE_SQLITE_FROM is set it copies, if
 * not it does nothing, so leaving it wired in is harmless.
 *
 * Safety:
 *  - Read-only on the SQLite file; never modifies or deletes it.
 *  - Refuses to run if the Postgres User table already has any rows, so a
 *    second boot (or a redeploy with the variable still set) can't duplicate
 *    or overwrite anything.
 *  - All-or-nothing: one transaction, rolled back on any error.
 *  - Reads table and column types from the Prisma schema, so columns added
 *    since the SQLite file was written (e.g. guestKey) simply take defaults.
 *
 * Needs Node 22+ (built-in node:sqlite).
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";

type Row = Record<string, unknown>;

const from = process.env.MIGRATE_SQLITE_FROM?.trim();

async function main() {
  if (!from) {
    console.log("[migrate-sqlite] MIGRATE_SQLITE_FROM not set — nothing to do.");
    return;
  }
  if (!existsSync(from)) {
    console.log(`[migrate-sqlite] ${from} not found — nothing to copy.`);
    return;
  }

  // node:sqlite arrived in Node 22.5; import lazily so older Nodes get a clear message.
  let DatabaseSync: typeof import("node:sqlite").DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch {
    throw new Error(`Node ${process.version} has no node:sqlite. Use Node 22 or newer to run this migration.`);
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.count();
    if (existing > 0) {
      console.log(`[migrate-sqlite] Postgres already has ${existing} users — skipping so nothing is overwritten.`);
      return;
    }

    const db = new DatabaseSync(from, { readOnly: true });
    const tables = new Set(
      (db.prepare("select name from sqlite_master where type='table'").all() as Row[]).map((r) => String(r.name)),
    );

    // Parents before children, from the schema's own foreign keys.
    const models = Prisma.dmmf.datamodel.models;
    const byName = new Map(models.map((m) => [m.name, m]));
    const ordered: typeof models = [];
    const seen = new Set<string>();
    const visit = (name: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      const m = byName.get(name)!;
      for (const f of m.fields) {
        if (f.relationFromFields && f.relationFromFields.length > 0 && f.type !== name) visit(f.type);
      }
      ordered.push(m);
    };
    models.forEach((m) => visit(m.name));

    const convert = (type: string, v: unknown): unknown => {
      if (v === null || v === undefined) return null;
      switch (type) {
        case "BigInt":
          return BigInt(v as number | bigint | string);
        case "Boolean":
          return v === true || v === 1 || v === 1n || v === "1" || v === "true";
        case "DateTime":
          return typeof v === "number" || typeof v === "bigint" ? new Date(Number(v)) : new Date(String(v));
        case "Int":
        case "Float":
          return Number(v);
        default:
          return v;
      }
    };

    const counts: Array<[string, number, number]> = [];
    await prisma.$transaction(
      async (tx) => {
        for (const m of ordered) {
          if (!tables.has(m.dbName ?? m.name)) continue;
          const sqliteCols = new Set(
            (db.prepare(`pragma table_info("${m.dbName ?? m.name}")`).all() as Row[]).map((r) => String(r.name)),
          );
          const scalars = m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum");
          const rows = db.prepare(`select * from "${m.dbName ?? m.name}"`).all() as Row[];
          const data = rows.map((r) => {
            const out: Record<string, unknown> = {};
            for (const f of scalars) {
              if (!sqliteCols.has(f.name)) continue; // new column: let the default apply
              out[f.name] = convert(f.type, r[f.name]);
            }
            return out;
          });
          const delegate = (tx as unknown as Record<string, { createMany: (a: unknown) => Promise<{ count: number }> }>)[
            m.name[0].toLowerCase() + m.name.slice(1)
          ];
          let copied = 0;
          for (let i = 0; i < data.length; i += 500) {
            copied += (await delegate.createMany({ data: data.slice(i, i + 500) })).count;
          }
          counts.push([m.name, rows.length, copied]);
        }
      },
      { timeout: 10 * 60_000, maxWait: 30_000 },
    );

    console.log("[migrate-sqlite] Copied:");
    for (const [name, found, copied] of counts) {
      if (found > 0 || copied > 0) console.log(`  ${name.padEnd(18)} ${String(copied).padStart(7)} / ${found}`);
      if (found !== copied) throw new Error(`${name}: found ${found} rows but copied ${copied}`);
    }
    console.log("[migrate-sqlite] Done. You can remove MIGRATE_SQLITE_FROM now.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // Never block the site from starting over a failed one-off copy — the
  // transaction rolled back, the old file is untouched, and the log says why.
  console.error("[migrate-sqlite] FAILED, nothing was copied:", err instanceof Error ? err.message : err);
});

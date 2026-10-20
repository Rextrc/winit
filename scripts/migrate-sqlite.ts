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
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

type Row = Record<string, unknown>;

const configured = process.env.MIGRATE_SQLITE_FROM?.trim();

const isDbFile = (n: string) => /\.(db|sqlite|sqlite3)$/i.test(n);

/**
 * Resolves what the variable points at. A file is used as is. A directory
 * (e.g. the volume's mount path, /data) is searched for a single database
 * file. Anything else logs what IS there, so a wrong guess is one deploy
 * away from fixed instead of a dead end.
 */
function resolveSource(p: string): string | null {
  const list = (dir: string) => {
    try {
      return readdirSync(dir).map((n) => `${n} (${statSync(join(dir, n)).size} bytes)`);
    } catch {
      return [];
    }
  };
  if (existsSync(p) && statSync(p).isFile()) return p;
  if (existsSync(p) && statSync(p).isDirectory()) {
    const files = readdirSync(p).filter(isDbFile);
    if (files.length === 1) return join(p, files[0]);
    console.log(
      files.length === 0
        ? `[migrate-sqlite] No .db file in ${p}. It contains: ${list(p).join(", ") || "(empty)"}`
        : `[migrate-sqlite] Several database files in ${p}: ${files.join(", ")}. Set MIGRATE_SQLITE_FROM to the exact one.`,
    );
    return null;
  }
  console.log(`[migrate-sqlite] ${p} not found. ${dirname(p)} contains: ${list(dirname(p)).join(", ") || "(empty or missing)"}`);
  return null;
}

async function main() {
  if (!configured) {
    console.log("[migrate-sqlite] MIGRATE_SQLITE_FROM not set — nothing to do.");
    return;
  }
  const from = resolveSource(configured);
  if (!from) return;
  console.log(`[migrate-sqlite] Reading ${from}`);

  // node:sqlite arrived in Node 22.5. It's loaded by a computed name so neither
  // the type checker (older @types/node lack it) nor the bundler tries to
  // resolve it, and older Nodes get a clear message instead of a stack trace.
  type Stmt = { all: () => unknown[] };
  type Sqlite = { prepare: (sql: string) => Stmt };
  let openDb: (path: string) => Sqlite;
  try {
    const mod = (await import(/* webpackIgnore: true */ ["node", "sqlite"].join(":"))) as {
      DatabaseSync: new (path: string, opts: { readOnly: boolean }) => Sqlite;
    };
    openDb = (path) => new mod.DatabaseSync(path, { readOnly: true });
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

    const db = openDb(from);
    const tables = new Set(
      (db.prepare("select name from sqlite_master where type='table'").all() as Row[]).map((r) => String(r.name)),
    );

    // Parents before children, from the schema's own foreign keys.
    const models = Prisma.dmmf.datamodel.models;
    const byName = new Map(models.map((m) => [m.name, m]));
    const ordered: Array<(typeof models)[number]> = [];
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

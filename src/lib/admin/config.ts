import { prisma } from "@/lib/prisma";
import { fromDb } from "@/lib/bigmoney";
import { PLAYABLE, SLUG_FOR_ENGINE } from "@/lib/games/registry";

/**
 * WINIT — OPERATIONAL CONFIGURATION
 * ---------------------------------------------------------------------------
 * Switches the dashboard can throw without a redeploy: whether a game is
 * dealing, whether the whole site is in maintenance, per-game bet overrides,
 * and arbitrary feature flags.
 *
 * Absence is the default. A game with no GameConfig row behaves exactly as the
 * registry says, so this table only ever holds DELIBERATE overrides and an
 * empty table means "everything normal" rather than "everything off".
 *
 * None of this can change a game's odds. The overrides are bet-size bounds and
 * an on/off switch; there is deliberately no knob here that reaches a paytable,
 * because a dashboard that could quietly re-price a game would make every
 * published RTP in the project unverifiable.
 * ---------------------------------------------------------------------------
 */

export const FLAG_MAINTENANCE = "site.maintenance";
export const FLAG_MAINTENANCE_NOTE = "site.maintenanceNote";
export const FLAG_SIGNUPS_OPEN = "site.signupsOpen";

export type GameConfigView = {
  slug: string;
  name: string;
  enabled: boolean;
  minBetCentsOverride: number | null;
  maxBetCentsOverride: number | null;
  disabledNote: string | null;
};

export async function readFlag(key: string): Promise<string | null> {
  const row = await prisma.siteFlag.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function readBoolFlag(key: string, fallback: boolean): Promise<boolean> {
  const raw = await readFlag(key);
  if (raw === null) return fallback;
  return raw === "true" || raw === "1";
}

export async function allFlags(): Promise<{ key: string; value: string; updatedAt: Date }[]> {
  return prisma.siteFlag.findMany({ orderBy: { key: "asc" } });
}

/** Every game with its effective configuration, defaults filled in. */
export async function gameConfigs(): Promise<GameConfigView[]> {
  const rows = await prisma.gameConfig.findMany();
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  return PLAYABLE.map((g) => {
    const row = bySlug.get(g.slug);
    return {
      slug: g.slug,
      name: g.name,
      enabled: row?.enabled ?? true,
      minBetCentsOverride: row?.minBetCentsOverride ? fromDb(row.minBetCentsOverride) : null,
      maxBetCentsOverride: row?.maxBetCentsOverride ? fromDb(row.maxBetCentsOverride) : null,
      disabledNote: row?.disabledNote ?? null,
    };
  });
}

export type GameGate =
  | { ok: true; minBetCents: number | null; maxBetCents: number | null }
  | { ok: false; reason: string };

/**
 * Whether a game may be dealt right now, given the engine key the ledger uses.
 * Called on every bet, so it is one indexed lookup by primary key.
 */
export async function gateForEngine(engineKey: string): Promise<GameGate> {
  const slug = SLUG_FOR_ENGINE[engineKey];
  if (!slug) return { ok: true, minBetCents: null, maxBetCents: null };

  const row = await prisma.gameConfig.findUnique({ where: { slug } });
  if (!row) return { ok: true, minBetCents: null, maxBetCents: null };

  if (!row.enabled) {
    return {
      ok: false,
      reason: row.disabledNote?.trim()
        ? row.disabledNote
        : "This table is closed at the moment. Try another game.",
    };
  }

  return {
    ok: true,
    minBetCents: row.minBetCentsOverride ? fromDb(row.minBetCentsOverride) : null,
    maxBetCents: row.maxBetCentsOverride ? fromDb(row.maxBetCentsOverride) : null,
  };
}

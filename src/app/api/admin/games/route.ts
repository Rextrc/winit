import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toDb } from "@/lib/bigmoney";
import { requireReason, requireStaff } from "@/lib/admin/guard";
import { writeAudit } from "@/lib/admin/audit";
import { gameConfigs } from "@/lib/admin/config";
import { PLAYABLE } from "@/lib/games/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { staff, response } = await requireStaff("games.config");
  if (!staff) return response;
  return NextResponse.json({ games: await gameConfigs() });
}

const schema = z.object({
  slug: z.string(),
  enabled: z.boolean().optional(),
  minBetCentsOverride: z.number().int().min(0).nullable().optional(),
  maxBetCentsOverride: z.number().int().min(0).nullable().optional(),
  disabledNote: z.string().max(200).nullable().optional(),
  reason: z.string(),
});

/**
 * Updates one game's operational configuration. Note what is NOT here: there
 * is no field that reaches a paytable, a house edge or an RNG. The dashboard
 * can close a table and bound its stakes; it cannot re-price it, because a
 * dashboard that could would make every published RTP unverifiable.
 */
export async function POST(req: Request) {
  const { staff, response } = await requireStaff("games.config");
  if (!staff) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid configuration." }, { status: 400 });

  const reasonCheck = requireReason(parsed.data.reason);
  if ("error" in reasonCheck) return reasonCheck.error;

  const game = PLAYABLE.find((g) => g.slug === parsed.data.slug);
  if (!game) return NextResponse.json({ error: "No such game." }, { status: 404 });

  const { minBetCentsOverride: min, maxBetCentsOverride: max } = parsed.data;
  if (min != null && max != null && min > max) {
    return NextResponse.json({ error: "The minimum cannot exceed the maximum." }, { status: 400 });
  }

  const before = await prisma.gameConfig.findUnique({ where: { slug: game.slug } });

  const data = {
    enabled: parsed.data.enabled ?? before?.enabled ?? true,
    minBetCentsOverride: min === undefined ? (before?.minBetCentsOverride ?? null) : min === null ? null : toDb(min),
    maxBetCentsOverride: max === undefined ? (before?.maxBetCentsOverride ?? null) : max === null ? null : toDb(max),
    disabledNote:
      parsed.data.disabledNote === undefined ? (before?.disabledNote ?? null) : parsed.data.disabledNote,
    updatedById: staff.id,
  };

  await prisma.$transaction(async (tx) => {
    await tx.gameConfig.upsert({
      where: { slug: game.slug },
      create: { ...data, slug: game.slug },
      update: data,
    });
    await writeAudit(
      {
        actor: staff,
        action: parsed.data.enabled === false ? "game.disable" : "game.config",
        field: game.slug,
        oldValue: before ? `enabled=${before.enabled}` : "default",
        newValue: `enabled=${data.enabled}`,
        reason: reasonCheck.reason,
        metadata: { ...parsed.data, name: game.name },
      },
      tx,
    );
  });

  return NextResponse.json({ ok: true, games: await gameConfigs() });
}

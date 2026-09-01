import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ACHIEVEMENTS } from "@/lib/life/achievements";
import { buildSnapshot } from "@/lib/life/snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The whole catalogue with live unlock state and progress. Progress is
 * recomputed from the same snapshot the unlock predicates use, so a bar can
 * never sit at 99% on something already unlocked.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { snapshot, unlocked } = await buildSnapshot(user.id);
  const rows = await prisma.achievementUnlock.findMany({
    where: { userId: user.id },
    select: { key: true, unlockedAt: true },
  });
  const when = new Map(rows.map((r) => [r.key, r.unlockedAt]));

  const list = ACHIEVEMENTS.map((a) => {
    const isUnlocked = unlocked.has(a.key);
    return {
      key: a.key,
      name: a.name,
      description: a.description,
      tier: a.tier,
      category: a.category,
      secret: a.secret ?? false,
      unlocked: isUnlocked,
      unlockedAt: when.get(a.key) ?? null,
      progress: isUnlocked ? 1 : a.progress ? Math.min(1, Math.max(0, a.progress(snapshot))) : null,
    };
  });

  return NextResponse.json({
    achievements: list,
    unlockedCount: list.filter((a) => a.unlocked).length,
    total: list.length,
  });
}

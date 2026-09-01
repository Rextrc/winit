import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { bonusStatus } from "@/lib/bonus";
import { tierFor, tierProgress } from "@/lib/life/reputation";
import { vipFor } from "@/lib/life/vip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll target for the header balance, bonus timer and career bar. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json({
    username: user.username,
    balanceCents: user.balanceCents,
    bonus: bonusStatus(user.lastBonusAt, user.bonusStreak, undefined, user.rebirths),
    progression: user.progression,
    career: user.career,
    reputation: {
      points: user.reputation,
      tier: tierFor(user.reputation),
      progress: tierProgress(user.reputation),
    },
    vip: vipFor(user.lifetimeWageredCents),
  });
}

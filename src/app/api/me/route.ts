import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { bonusStatus } from "@/lib/bonus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight poll target for the header balance and bonus timer. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  return NextResponse.json({
    username: user.username,
    balanceCents: user.balanceCents,
    bonus: bonusStatus(user.lastBonusAt, user.bonusStreak),
  });
}

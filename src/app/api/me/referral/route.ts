import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { REFERRER_BONUS_CENTS, REFEREE_BONUS_CENTS } from "@/lib/referral";
import { ensureReferralCode } from "@/lib/referral-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The player's own code, who they were referred by, and what it has earned. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const code = await ensureReferralCode(user.id);

  const [invited, me] = await Promise.all([
    prisma.user.findMany({
      where: { referredById: user.id, deletedAt: null },
      select: { username: true, referredAt: true },
      orderBy: { referredAt: "desc" },
      take: 50,
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { referredById: true },
    }),
  ]);

  const referrer = me?.referredById
    ? await prisma.user.findUnique({
        where: { id: me.referredById },
        select: { username: true },
      })
    : null;

  return NextResponse.json({
    code,
    invited: invited.map((i) => ({ username: i.username, at: i.referredAt })),
    count: invited.length,
    earnedCents: invited.length * REFERRER_BONUS_CENTS,
    referrerBonusCents: REFERRER_BONUS_CENTS,
    refereeBonusCents: REFEREE_BONUS_CENTS,
    referredBy: referrer?.username ?? null,
  });
}

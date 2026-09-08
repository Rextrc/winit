import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api";
import { bonusStatus } from "@/lib/bonus";
import { tierFor, tierProgress } from "@/lib/life/reputation";
import { vipFor } from "@/lib/life/vip";
import { buildSnapshot } from "@/lib/life/snapshot";
import { nextGoals } from "@/lib/life/goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll target for the header balance, bonus timer, career bar and goal strip. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  // The nearest open goal, from the same nextGoals() the career page uses, so
  // the strip in the header and the list on /life can never disagree. It rides
  // this response rather than a second endpoint because both refresh at the
  // same moment: when a bet settles.
  const { snapshot, xp, unlocked } = await buildSnapshot(user.id);
  const [goal = null] = nextGoals({ snapshot, xp, unlocked }, 1);

  return NextResponse.json({
    goal,
    onboarded: user.onboardedAt !== null,
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

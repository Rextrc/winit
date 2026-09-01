import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { credit, writeTransaction } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { applyXp, describeProgression } from "@/lib/progression";
import {
  boardFor,
  challengeByKey,
  periodKey,
  rewardFor,
  targetFor,
  type Period,
} from "@/lib/life/challenges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  key: z.string().min(1),
  period: z.enum(["daily", "weekly"]),
});

const PERIODS: Period[] = ["daily", "weekly"];

/** The current boards, with this player's progress against each. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const boards = [];

  for (const period of PERIODS) {
    const pKey = periodKey(period);
    const defs = boardFor(period, pKey);
    const rows = await prisma.challengeProgress.findMany({
      where: { userId: user.id, period, periodKey: pKey },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));

    boards.push({
      period,
      periodKey: pKey,
      challenges: defs.map((def) => {
        const target = targetFor(def, period);
        const row = byKey.get(def.key);
        const progress = Math.min(target, row?.progress ?? 0);
        const reward = rewardFor(def, period, user.rebirths);
        return {
          key: def.key,
          name: def.name,
          description: def.description(target),
          kind: def.kind,
          target,
          progress,
          complete: progress >= target,
          claimed: row?.claimed ?? false,
          reward,
        };
      }),
    });
  }

  return NextResponse.json({ boards });
}

/**
 * CLAIM A COMPLETED CHALLENGE
 *
 * The reward is recomputed here from the catalogue rather than taken from the
 * request, the completion is re-checked against the stored progress, and the
 * claimed flag is set with a conditional update so a double-submit cannot pay
 * twice.
 *
 * Currency only ever comes from OUTCOME challenges — a VOLUME challenge paying
 * cash would be free money bought by betting enough, which is the exact
 * exploit the level-up rewards were removed for. The challenges module
 * enforces that at startup; this route re-checks it at the point of payment.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid claim.");

  const def = challengeByKey(parsed.data.key);
  if (!def) return jsonError("No such challenge.");

  const period = parsed.data.period as Period;
  const pKey = periodKey(period);

  // It has to be on the CURRENT board — an old row cannot be claimed later.
  if (!boardFor(period, pKey).some((d) => d.key === def.key)) {
    return jsonError("That challenge isn't on the current board.", 409);
  }

  const target = targetFor(def, period);
  const reward = rewardFor(def, period, user.rebirths);

  if (def.kind === "VOLUME" && reward.cents !== 0) {
    // Unreachable unless the catalogue is edited wrongly; refuse rather than pay.
    return jsonError("That reward is misconfigured and will not be paid.", 500);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const row = await tx.challengeProgress.findFirst({
        where: { userId: user.id, key: def.key, period, periodKey: pKey },
      });
      if (!row) return { error: "You haven't started that one yet." as const };
      if (row.progress < target) return { error: "That challenge isn't finished." as const };

      // The conditional update is the lock against a double claim.
      const claimed = await tx.challengeProgress.updateMany({
        where: { id: row.id, claimed: false },
        data: { claimed: true },
      });
      if (claimed.count === 0) return { error: "Already claimed." as const };

      const before = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          level: true,
          xp: true,
          rebirths: true,
          reputation: true,
          balanceCents: true,
          lifetimeWageredCents: true,
          lifetimeWonCents: true,
          biggestWinCents: true,
          bestMultiplierX100: true,
          livesLived: true,
        },
      });

      const rolled = applyXp(
        { level: before.level, xp: before.xp, rebirths: before.rebirths },
        reward.xp,
      );
      const reputation = Math.max(0, before.reputation + reward.reputation);

      await tx.user.update({
        where: { id: user.id },
        data: { level: rolled.level, xp: rolled.xp, reputation },
      });

      let balanceCents = Number(before.balanceCents);
      if (reward.cents > 0) {
        balanceCents = await credit(tx, user.id, reward.cents);
        await writeTransaction(tx, {
          userId: user.id,
          game: "life",
          kind: "CHALLENGE",
          betCents: 0,
          payoutCents: reward.cents,
          outcome: "CREDIT",
          summary: `${def.name} (${period}) — ${formatCents(reward.cents)}, ${reward.xp.toLocaleString()} XP`,
          balanceAfterCents: balanceCents,
          detail: { challenge: def.key, period, periodKey: pKey, reward },
        });
      }

      const after = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          level: true,
          xp: true,
          rebirths: true,
          balanceCents: true,
          lifetimeWageredCents: true,
          lifetimeWonCents: true,
          biggestWinCents: true,
          bestMultiplierX100: true,
        },
      });

      return {
        reward,
        levelUps: rolled.levelUps,
        reputation,
        balanceCents: Number(after.balanceCents),
        progression: describeProgression({
          level: after.level,
          xp: after.xp,
          rebirths: after.rebirths,
          lifetimeWageredCents: Number(after.lifetimeWageredCents),
          lifetimeWonCents: Number(after.lifetimeWonCents),
          biggestWinCents: Number(after.biggestWinCents),
          bestMultiplierX100: after.bestMultiplierX100,
        }),
      };
    });

    if ("error" in result && result.error) return jsonError(result.error, 409);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

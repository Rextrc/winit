import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api";
import { credit, writeTransaction, awardProgress } from "@/lib/ledger";
import { fromDb } from "@/lib/bigmoney";
import { listScores, type ScoreEvent } from "@/lib/oddsApi";
import type { SportsBet } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finalScore(event: ScoreEvent, team: string): number | null {
  const row = event.scores?.find((s) => s.name === team);
  if (!row) return null;
  const n = Number(row.score);
  return Number.isFinite(n) ? n : null;
}

/** WON/LOST/PUSHED for one bet against a completed event's final score. */
function grade(bet: SportsBet, event: ScoreEvent): "WON" | "LOST" | "PUSHED" | null {
  const home = finalScore(event, bet.homeTeam);
  const away = finalScore(event, bet.awayTeam);
  if (home === null || away === null) return null;

  if (bet.market === "h2h") {
    const winner = home === away ? "Draw" : home > away ? bet.homeTeam : bet.awayTeam;
    return bet.selection === winner ? "WON" : "LOST";
  }

  if (bet.market === "spreads") {
    const line = bet.line ?? 0;
    const isHome = bet.selection === bet.homeTeam;
    const margin = isHome ? home - away + line : away - home + line;
    if (margin === 0) return "PUSHED";
    return margin > 0 ? "WON" : "LOST";
  }

  // totals
  const total = home + away;
  const line = bet.line ?? 0;
  if (total === line) return "PUSHED";
  const wantsOver = bet.selection === "Over";
  return (total > line) === wantsOver ? "WON" : "LOST";
}

/**
 * Settles every PENDING sports bet whose event has finished. Pulls fresh
 * scores per distinct sport among pending bets, so it costs at most one
 * request per sport regardless of how many bets are waiting.
 *
 * Runs on a Vercel Cron every 5 minutes (see vercel.json). Vercel signs cron
 * requests with CRON_SECRET as a bearer token — if that env var is set,
 * every other caller is refused so the settlement job can't be triggered
 * from outside.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError("Not authorized.", 401);
  }

  const pending = await prisma.sportsBet.findMany({ where: { status: "PENDING" } });
  if (pending.length === 0) return NextResponse.json({ settled: 0 });

  const sportKeys = [...new Set(pending.map((b) => b.sportKey))];
  const scoresBySport = new Map<string, ScoreEvent[]>();
  for (const key of sportKeys) {
    try {
      scoresBySport.set(key, await listScores(key, 3));
    } catch {
      // Skip this sport this pass — it'll be retried next call.
    }
  }

  let settled = 0;
  for (const bet of pending) {
    const events = scoresBySport.get(bet.sportKey);
    if (!events) continue;
    const event = events.find((e) => e.id === bet.eventId);
    if (!event || !event.completed) continue;

    const outcome = grade(bet, event);
    if (!outcome) continue;

    const stakeCents = fromDb(bet.stakeCents);
    const payoutCents = outcome === "WON" ? Math.round(stakeCents * bet.priceDecimal) : outcome === "PUSHED" ? stakeCents : 0;

    await prisma.$transaction(async (tx) => {
      const balanceCents = payoutCents > 0 ? await credit(tx, bet.userId, payoutCents) : fromDb((await tx.user.findUniqueOrThrow({ where: { id: bet.userId }, select: { balanceCents: true } })).balanceCents);
      await tx.sportsBet.update({
        where: { id: bet.id },
        data: { status: outcome, payoutCents: payoutCents, settledAt: new Date() },
      });
      await writeTransaction(tx, {
        userId: bet.userId,
        game: "sports",
        kind: "BET",
        betCents: stakeCents,
        payoutCents,
        outcome: outcome === "WON" ? "WIN" : outcome === "PUSHED" ? "PUSH" : "LOSS",
        summary: `${bet.selection}${bet.line ? ` ${bet.line}` : ""} — ${bet.awayTeam} @ ${bet.homeTeam} settled ${outcome.toLowerCase()}`,
        balanceAfterCents: balanceCents,
        detail: { eventId: bet.eventId, market: bet.market, selection: bet.selection },
      });
      await awardProgress(tx, bet.userId, "sports", stakeCents, payoutCents);
    });
    settled += 1;
  }

  return NextResponse.json({ settled });
}

export async function GET() {
  return jsonError("Use POST to run settlement.", 405);
}

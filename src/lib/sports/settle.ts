import type { SportsBet, SportsBetLeg } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { awardProgress, credit, writeTransaction } from "@/lib/ledger";
import { fromDb, toDb } from "@/lib/bigmoney";
import { fetchScores, feedConfigured, type RawScore } from "@/lib/sports/provider";
import { selectionLabel } from "@/lib/sports/meta";
import type { MarketKey } from "@/lib/sports/types";

/**
 * Settles sports bets against real final scores.
 *
 * Scores cost quota, so a league is only asked about once one of its pending
 * games should plausibly be over, and at most once every ten minutes. A game
 * the provider never reports as completed within its three-day scores window
 * is voided and the stake returned.
 */

const MIN = 60 * 1000;
const SCORES_INTERVAL_MS = 10 * MIN;
const VOID_AFTER_MS = 3 * 24 * 60 * MIN + 12 * 60 * MIN;

/** Roughly how long after kick-off a result can be expected. */
function expectedDurationMs(sportKey: string): number {
  if (sportKey.startsWith("soccer")) return 115 * MIN;
  if (sportKey.startsWith("americanfootball")) return 200 * MIN;
  if (sportKey.startsWith("basketball")) return 150 * MIN;
  if (sportKey.startsWith("icehockey")) return 160 * MIN;
  if (sportKey.startsWith("baseball")) return 190 * MIN;
  if (sportKey.startsWith("tennis")) return 100 * MIN;
  if (sportKey.startsWith("mma") || sportKey.startsWith("boxing")) return 60 * MIN;
  if (sportKey.startsWith("cricket")) return 240 * MIN;
  return 150 * MIN;
}

function threeWay(sportKey: string): boolean {
  return /^(soccer|cricket|rugby)/.test(sportKey);
}

type Grade = "WON" | "LOST" | "PUSHED";

export function gradeLeg(
  leg: Pick<SportsBetLeg, "sportKey" | "market" | "selection" | "point" | "homeTeam" | "awayTeam">,
  home: number,
  away: number,
): Grade {
  if (leg.market === "h2h") {
    if (home === away) {
      if (leg.selection === "Draw") return "WON";
      // A tie in a two-way market is a push at every book.
      return threeWay(leg.sportKey) ? "LOST" : "PUSHED";
    }
    const winner = home > away ? leg.homeTeam : leg.awayTeam;
    return leg.selection === winner ? "WON" : "LOST";
  }

  const point = leg.point ?? 0;
  if (leg.market === "spreads") {
    const margin = (leg.selection === leg.homeTeam ? home - away : away - home) + point;
    return margin > 0 ? "WON" : margin < 0 ? "LOST" : "PUSHED";
  }

  const total = home + away;
  if (total === point) return "PUSHED";
  return (total > point) === (leg.selection === "Over") ? "WON" : "LOST";
}

function scoreFor(event: RawScore, team: string): number | null {
  const row = event.scores?.find((s) => s.name === team);
  if (!row) return null;
  const n = Number(row.score);
  return Number.isFinite(n) ? n : null;
}

const lastScoresAt = new Map<string, number>();

async function gradeDueLegs(now: number): Promise<number> {
  const pending = await prisma.sportsBetLeg.findMany({ where: { status: "PENDING" } });
  let graded = 0;

  // Too old for the scores window: nothing will ever settle it.
  for (const leg of pending) {
    if (now - leg.commenceTime.getTime() > VOID_AFTER_MS) {
      const r = await prisma.sportsBetLeg.updateMany({
        where: { id: leg.id, status: "PENDING" },
        data: { status: "VOID", settledAt: new Date() },
      });
      graded += r.count;
    }
  }

  const due = pending.filter((l) => {
    const t = l.commenceTime.getTime();
    return now - t > expectedDurationMs(l.sportKey) && now - t <= VOID_AFTER_MS;
  });

  const bySport = new Map<string, SportsBetLeg[]>();
  for (const l of due) bySport.set(l.sportKey, [...(bySport.get(l.sportKey) ?? []), l]);

  for (const [sportKey, legs] of Array.from(bySport.entries())) {
    if (now - (lastScoresAt.get(sportKey) ?? 0) < SCORES_INTERVAL_MS) continue;
    lastScoresAt.set(sportKey, now);

    const oldest = Math.min(...legs.map((l) => l.commenceTime.getTime()));
    const daysFrom = Math.ceil((now - oldest) / (24 * 60 * MIN)) + 1;

    let scores: RawScore[];
    try {
      scores = await fetchScores(sportKey, daysFrom);
    } catch (err) {
      console.warn(`[sports] scores for ${sportKey} failed:`, err instanceof Error ? err.message : err);
      continue;
    }
    const byId = new Map(scores.map((s) => [s.id, s]));

    for (const leg of legs) {
      const event = byId.get(leg.eventId);
      if (!event?.completed) continue;
      const home = scoreFor(event, leg.homeTeam);
      const away = scoreFor(event, leg.awayTeam);
      if (home === null || away === null) continue;

      const r = await prisma.sportsBetLeg.updateMany({
        where: { id: leg.id, status: "PENDING" },
        data: { status: gradeLeg(leg, home, away), homeScore: home, awayScore: away, settledAt: new Date() },
      });
      graded += r.count;
    }
  }
  return graded;
}

type BetWithLegs = SportsBet & { legs: SportsBetLeg[] };

function outcomeOf(bet: BetWithLegs): { status: "WON" | "LOST" | "PUSHED" | "VOID"; price: number } | null {
  if (bet.legs.some((l) => l.status === "LOST")) return { status: "LOST", price: 0 };
  if (bet.legs.some((l) => l.status === "PENDING")) return null;

  const won = bet.legs.filter((l) => l.status === "WON");
  if (won.length === 0) {
    return { status: bet.legs.some((l) => l.status === "PUSHED") ? "PUSHED" : "VOID", price: 1 };
  }
  // Pushed and void legs drop out of a multi at 1.00. Never pay above the
  // price locked in at placement (which carries the multi cap).
  const product = won.reduce((p, l) => p * l.priceDecimal, 1);
  return { status: "WON", price: Math.min(product, bet.priceDecimal) };
}

function summaryOf(bet: BetWithLegs, status: string): string {
  const verdict = status === "WON" ? "won" : status === "LOST" ? "lost" : status === "PUSHED" ? "push" : "void";
  if (bet.kind === "SINGLE" && bet.legs[0]) {
    const l = bet.legs[0];
    const pick = selectionLabel(l.market as MarketKey, l.selection, l.point);
    return `${pick} @ ${l.priceDecimal.toFixed(2)} — ${l.homeTeam} v ${l.awayTeam} · ${verdict}`;
  }
  return `${bet.legs.length}-leg multi @ ${bet.priceDecimal.toFixed(2)} · ${verdict}`;
}

async function settleBet(bet: BetWithLegs): Promise<boolean> {
  const result = outcomeOf(bet);
  if (!result) return false;

  const stakeCents = fromDb(bet.stakeCents);
  const payoutCents =
    result.status === "LOST" ? 0 : result.status === "WON" ? Math.round(stakeCents * result.price) : stakeCents;

  return prisma.$transaction(async (tx) => {
    // The status flip is the lock: a second settler finds nothing to update.
    const flipped = await tx.sportsBet.updateMany({
      where: { id: bet.id, status: "PENDING" },
      data: { status: result.status, payoutCents: toDb(payoutCents), settledAt: new Date() },
    });
    if (flipped.count === 0) return false;

    const balanceCents =
      payoutCents > 0
        ? await credit(tx, bet.userId, payoutCents)
        : fromDb((await tx.user.findUniqueOrThrow({ where: { id: bet.userId }, select: { balanceCents: true } })).balanceCents);

    await writeTransaction(tx, {
      userId: bet.userId,
      game: "sports",
      kind: "BET",
      betCents: stakeCents,
      payoutCents,
      outcome: result.status === "WON" ? "WIN" : result.status === "LOST" ? "LOSS" : "PUSH",
      summary: summaryOf(bet, result.status),
      balanceAfterCents: balanceCents,
      detail: {
        betId: bet.id,
        kind: bet.kind,
        price: bet.priceDecimal,
        legs: bet.legs.map((l) => ({
          eventId: l.eventId,
          match: `${l.homeTeam} v ${l.awayTeam}`,
          market: l.market,
          selection: l.selection,
          point: l.point,
          price: l.priceDecimal,
          status: l.status,
          score: l.homeScore === null ? null : `${l.homeScore}-${l.awayScore}`,
        })),
      },
    });

    // A voided slip is a refund, not a bet — it earns no career progress.
    if (result.status !== "VOID") await awardProgress(tx, bet.userId, "sports", stakeCents, payoutCents);
    return true;
  });
}

let running = false;

/** One settlement pass. Safe to call concurrently and as often as you like. */
export async function settlePending(): Promise<{ legsGraded: number; betsSettled: number }> {
  if (running || !feedConfigured()) return { legsGraded: 0, betsSettled: 0 };
  running = true;
  try {
    const legsGraded = await gradeDueLegs(Date.now());

    const ready = await prisma.sportsBet.findMany({
      where: {
        status: "PENDING",
        OR: [{ legs: { none: { status: "PENDING" } } }, { legs: { some: { status: "LOST" } } }],
      },
      include: { legs: true },
    });

    let betsSettled = 0;
    for (const bet of ready) {
      try {
        if (await settleBet(bet)) betsSettled += 1;
      } catch (err) {
        console.error(`[sports] settling ${bet.id} failed:`, err);
      }
    }
    if (legsGraded || betsSettled) console.log(`[sports] graded ${legsGraded} legs, settled ${betsSettled} slips`);
    return { legsGraded, betsSettled };
  } finally {
    running = false;
  }
}

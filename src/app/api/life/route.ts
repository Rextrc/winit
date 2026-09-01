import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { fromDb } from "@/lib/bigmoney";
import { MIN_BET_CENTS } from "@/lib/money";
import { VENUES, doorCheck, tableMinCents, travelCostCents } from "@/lib/life/venues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The career screen's data: where you are on the clock, the whole circuit with
 * every door checked against your level and bankroll, and the graveyard of
 * careers you have already finished.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const limit = user.progression.maxBetCents;

  const venues = VENUES.map((v) => {
    const door = doorCheck(v, user.level, user.balanceCents);
    const cost = travelCostCents(v, limit);
    return {
      id: v.id,
      name: v.name,
      city: v.city,
      blurb: v.blurb,
      art: v.art,
      minLevel: v.minLevel,
      minBankrollCents: v.minBankrollCents,
      tableMinCents: tableMinCents(v, limit, MIN_BET_CENTS),
      travelCostCents: cost,
      here: v.id === user.career.venueId,
      open: door.open,
      closedReason: door.open ? null : door.reason,
      // The door can be open and the ticket still unaffordable.
      affordable: user.balanceCents >= cost,
    };
  });

  const lives = await prisma.life.findMany({
    where: { userId: user.id },
    orderBy: { ordinal: "desc" },
    take: 25,
  });

  return NextResponse.json({
    career: user.career,
    progression: user.progression,
    balanceCents: user.balanceCents,
    venues,
    lives: lives.map((l) => ({
      id: l.id,
      ordinal: l.ordinal,
      cause: l.cause,
      ageAtEnd: l.ageAtEnd,
      level: l.level,
      rebirths: l.rebirths,
      venueId: l.venueId,
      epitaph: l.epitaph,
      betsPlaced: l.betsPlaced,
      peakBalanceCents: fromDb(l.peakBalanceCents),
      lifetimeWageredCents: fromDb(l.lifetimeWageredCents),
      biggestWinCents: fromDb(l.biggestWinCents),
      startedAt: l.startedAt,
      endedAt: l.endedAt,
    })),
  });
}

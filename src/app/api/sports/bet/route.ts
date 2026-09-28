import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet } from "@/lib/money";
import { debit } from "@/lib/ledger";
import { fromDb, toDb } from "@/lib/bigmoney";
import { getLeague, isStarted } from "@/lib/sports/feed";
import { findOutcome } from "@/lib/sports/normalize";
import { feedErrorResponse } from "@/lib/sports/http";
import type { LeagueEvents, MyBet, SportEvent } from "@/lib/sports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LEGS = 12;
/** A multi never pays more than this many times the stake. */
const MAX_MULTI_PRICE = 1000;

const legSchema = z.object({
  eventId: z.string().min(1).max(128),
  sportKey: z.string().min(1).max(128),
  market: z.enum(["h2h", "spreads", "totals"]),
  name: z.string().min(1).max(200),
  point: z.number().nullable(),
  price: z.number().positive(),
});

const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("single"), legs: z.array(legSchema).min(1).max(MAX_LEGS), stakes: z.array(z.number().int()) }),
  z.object({ mode: z.literal("multi"), legs: z.array(legSchema).min(2).max(MAX_LEGS), stakeCents: z.number().int() }),
]);

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const filter = new URL(req.url).searchParams.get("status");
  const bets = await prisma.sportsBet.findMany({
    where: {
      userId: user.id,
      ...(filter === "active" ? { status: "PENDING" } : filter === "settled" ? { status: { not: "PENDING" } } : {}),
    },
    include: { legs: { orderBy: { commenceTime: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const out: MyBet[] = bets.map((b) => ({
    id: b.id,
    kind: b.kind as MyBet["kind"],
    stakeCents: fromDb(b.stakeCents),
    priceDecimal: b.priceDecimal,
    payoutCents: b.payoutCents === null ? null : fromDb(b.payoutCents),
    status: b.status,
    createdAt: b.createdAt.toISOString(),
    settledAt: b.settledAt?.toISOString() ?? null,
    legs: b.legs.map((l) => ({
      id: l.id,
      eventId: l.eventId,
      sportKey: l.sportKey,
      leagueTitle: l.leagueTitle,
      homeTeam: l.homeTeam,
      awayTeam: l.awayTeam,
      commenceTime: l.commenceTime.toISOString(),
      market: l.market as MyBet["legs"][number]["market"],
      selection: l.selection,
      point: l.point,
      priceDecimal: l.priceDecimal,
      status: l.status,
      homeScore: l.homeScore,
      awayScore: l.awayScore,
    })),
  }));

  const pendingCount = await prisma.sportsBet.count({ where: { userId: user.id, status: "PENDING" } });
  return NextResponse.json({ bets: out, pendingCount });
}

/**
 * Places one multi, or one single per leg. Every leg is re-priced from the
 * server's own copy of the board — the client's price is only used to spot
 * that the odds moved, in which case nothing is placed and the new prices
 * go back for the player to accept.
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
  if (!parsed.success) return jsonError("That bet slip isn't valid.");
  const slip = parsed.data;

  // --- Re-price every leg --------------------------------------------------
  const boards = new Map<string, LeagueEvents>();
  const priced: { leg: (typeof slip.legs)[number]; event: SportEvent; price: number }[] = [];
  const changed: { index: number; price: number }[] = [];
  const unavailable: number[] = [];

  try {
    for (const key of Array.from(new Set(slip.legs.map((l) => l.sportKey)))) boards.set(key, await getLeague(key));
  } catch (err) {
    return feedErrorResponse(err);
  }

  slip.legs.forEach((leg, index) => {
    const event = boards.get(leg.sportKey)?.events.find((e) => e.id === leg.eventId);
    const outcome = event && !isStarted(event) ? findOutcome(event, leg.market, leg.name, leg.point) : null;
    if (!event || !outcome) {
      unavailable.push(index);
      return;
    }
    if (Math.abs(outcome.price - leg.price) > 0.0001) changed.push({ index, price: outcome.price });
    priced.push({ leg, event, price: outcome.price });
  });

  if (unavailable.length > 0) {
    return NextResponse.json(
      { error: "A selection is no longer available — the match may have started.", code: "UNAVAILABLE", unavailable },
      { status: 409 },
    );
  }
  if (changed.length > 0) {
    return NextResponse.json(
      { error: "Odds have changed. Review the new prices and place again.", code: "ODDS_CHANGED", changed },
      { status: 409 },
    );
  }

  // --- Shape the slips -----------------------------------------------------
  type Slip = { kind: "SINGLE" | "MULTI"; stakeCents: number; price: number; legs: typeof priced };
  let slips: Slip[];

  if (slip.mode === "multi") {
    if (new Set(slip.legs.map((l) => l.eventId)).size !== slip.legs.length) {
      return jsonError("A multi can only take one selection per match.");
    }
    const product = priced.reduce((p, l) => p * l.price, 1);
    const price = Math.min(MAX_MULTI_PRICE, Math.round(product * 100) / 100);
    slips = [{ kind: "MULTI", stakeCents: slip.stakeCents, price, legs: priced }];
  } else {
    if (slip.stakes.length !== slip.legs.length) return jsonError("Every single needs a stake.");
    slips = priced.map((p, i) => ({ kind: "SINGLE", stakeCents: slip.stakes[i], price: p.price, legs: [p] }));
  }

  let committed = 0;
  for (const s of slips) {
    const check = validateBet(s.stakeCents, user.balanceCents - committed, user.progression.maxBetCents);
    if (!check.ok) return jsonError(check.error, 409);
    const gate = await assertBettable(user, s.stakeCents, "sports");
    if (gate) return gate;
    committed += s.stakeCents;
  }

  // --- Place ---------------------------------------------------------------
  try {
    const result = await prisma.$transaction(async (tx) => {
      let balanceCents = user.balanceCents;
      const ids: string[] = [];
      for (const s of slips) {
        balanceCents = await debit(tx, user.id, s.stakeCents);
        const row = await tx.sportsBet.create({
          data: {
            userId: user.id,
            kind: s.kind,
            stakeCents: toDb(s.stakeCents),
            priceDecimal: s.price,
            legs: {
              create: s.legs.map(({ leg, event, price }) => ({
                eventId: event.id,
                sportKey: event.sportKey,
                leagueTitle: event.leagueTitle,
                homeTeam: event.homeTeam,
                awayTeam: event.awayTeam,
                commenceTime: new Date(event.commenceTime),
                market: leg.market,
                selection: leg.name,
                point: leg.point,
                priceDecimal: price,
              })),
            },
          },
        });
        ids.push(row.id);
      }
      return { balanceCents, betIds: ids };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

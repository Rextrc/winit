import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertBettable, jsonError, requireUser } from "@/lib/api";
import { validateBet } from "@/lib/money";
import { debit, writeTransaction } from "@/lib/ledger";
import { fromDb, toDb } from "@/lib/bigmoney";
import { bestBookmaker, listOdds } from "@/lib/oddsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  betCents: z.number().int(),
  eventId: z.string().min(1),
  sportKey: z.string().min(1),
  market: z.enum(["h2h", "spreads", "totals"]),
  selection: z.string().min(1),
});

/** Lists the caller's sports bets, newest first. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const bets = await prisma.sportsBet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    bets: bets.map((b) => ({
      id: b.id,
      sportTitle: b.sportTitle,
      homeTeam: b.homeTeam,
      awayTeam: b.awayTeam,
      commenceTime: b.commenceTime,
      market: b.market,
      selection: b.selection,
      line: b.line,
      priceDecimal: b.priceDecimal,
      stakeCents: fromDb(b.stakeCents),
      payoutCents: b.payoutCents === null ? null : fromDb(b.payoutCents),
      status: b.status,
      createdAt: b.createdAt,
      settledAt: b.settledAt,
    })),
  });
}

/**
 * Places a sports bet. The price is re-fetched from the odds feed at bet
 * time and locked into the row — the client's quoted price is never trusted,
 * since odds move between when the lobby loaded and when Place was clicked.
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
  if (!parsed.success) return jsonError("Invalid bet.");
  const { betCents, eventId, sportKey, market, selection } = parsed.data;

  const bet = validateBet(betCents, user.balanceCents, user.progression.maxBetCents);
  if (!bet.ok) return jsonError(bet.error, 409);
  const gate = await assertBettable(user, bet.cents, "sports");
  if (gate) return gate;

  let events;
  try {
    events = await listOdds(sportKey);
  } catch {
    return jsonError("Couldn't reach the odds feed — try again shortly.", 503);
  }

  const event = events.find((e) => e.id === eventId);
  if (!event) return jsonError("That match is no longer listed — it may have started or been pulled.", 409);
  if (new Date(event.commence_time).getTime() <= Date.now()) {
    return jsonError("That match has already started.", 409);
  }

  const book = bestBookmaker(event);
  const marketData = book?.markets.find((m) => m.key === market);
  const outcome = marketData?.outcomes.find((o) => o.name === selection);
  if (!outcome) return jsonError("That selection isn't currently priced.", 409);

  const result = await prisma.$transaction(async (tx) => {
    const balanceCents = await debit(tx, user.id, bet.cents);
    const row = await tx.sportsBet.create({
      data: {
        userId: user.id,
        eventId: event.id,
        sportKey,
        sportTitle: event.sport_title,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        commenceTime: new Date(event.commence_time),
        market,
        selection,
        line: outcome.point ?? null,
        priceDecimal: outcome.price,
        stakeCents: toDb(bet.cents),
      },
    });
    await writeTransaction(tx, {
      userId: user.id,
      game: "sports",
      kind: "BET",
      betCents: bet.cents,
      payoutCents: 0,
      outcome: "CREDIT",
      summary: `${selection}${outcome.point ? ` ${outcome.point}` : ""} @ ${outcome.price.toFixed(2)} — ${event.away_team} @ ${event.home_team}`,
      balanceAfterCents: balanceCents,
      detail: { eventId: event.id, market, selection, price: outcome.price },
    });
    return { balanceCents, betId: row.id };
  });

  return NextResponse.json({ ok: true, ...result });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { awardProgress, credit, writeTransaction } from "@/lib/ledger";
import { fromDb, toDb } from "@/lib/bigmoney";
import { quoteCashout } from "@/lib/sports/cashout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadBet(userId: string, betId: string) {
  return prisma.sportsBet.findFirst({ where: { id: betId, userId }, include: { legs: true } });
}

export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const betId = new URL(req.url).searchParams.get("betId") ?? "";
  const bet = await loadBet(user.id, betId);
  if (!bet) return jsonError("Bet not found.", 404);
  return NextResponse.json(await quoteCashout(bet));
}

const schema = z.object({ betId: z.string().min(1), amountCents: z.number().int().positive() });

/** Cashes out at the quoted amount — or returns the new quote if it has moved. */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid request.");

  const bet = await loadBet(user.id, parsed.data.betId);
  if (!bet) return jsonError("Bet not found.", 404);
  const quote = await quoteCashout(bet);
  if (!quote.available) return jsonError(quote.reason, 409);
  if (quote.amountCents !== parsed.data.amountCents) {
    return NextResponse.json({ error: "The cash out value changed.", code: "QUOTE_CHANGED", quote }, { status: 409 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const flipped = await tx.sportsBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: "CASHED_OUT", payoutCents: toDb(quote.amountCents), settledAt: new Date() },
      });
      if (flipped.count === 0) throw new Error("This bet has just settled.");
      await tx.sportsBetLeg.updateMany({ where: { betId: bet.id, status: "PENDING" }, data: { status: "CASHED_OUT" } });

      const stake = fromDb(bet.stakeCents);
      const balanceCents = await credit(tx, user.id, quote.amountCents);
      await writeTransaction(tx, {
        userId: user.id,
        game: "sports",
        kind: "BET",
        betCents: stake,
        payoutCents: quote.amountCents,
        outcome: quote.amountCents > stake ? "WIN" : quote.amountCents < stake ? "LOSS" : "PUSH",
        summary: `${bet.legs.length}-leg multi @ ${bet.priceDecimal.toFixed(2)} · cashed out`,
        balanceAfterCents: balanceCents,
        detail: { betId: bet.id, cashout: true },
      });
      const progress = await awardProgress(tx, user.id, "sports", stake, quote.amountCents);
      return { balanceCents, progress };
    });
    return NextResponse.json({ ok: true, amountCents: quote.amountCents, ...result });
  } catch (err) {
    return handleError(err);
  }
}

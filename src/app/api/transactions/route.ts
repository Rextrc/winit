import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api";
import { fromDb } from "@/lib/bigmoney";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The bet feed / transaction log. `game` filters to one engine. */
export async function GET(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const url = new URL(req.url);
  const game = url.searchParams.get("game");
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 25), 1), 100);
  const cursor = url.searchParams.get("cursor");

  const rows = await prisma.transaction.findMany({
    where: { userId: user.id, ...(game ? { game } : {}) },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return NextResponse.json({
    transactions: page.map((t) => ({
      id: t.id,
      game: t.game,
      kind: t.kind,
      betCents: fromDb(t.betCents),
      payoutCents: fromDb(t.payoutCents),
      netCents: fromDb(t.netCents),
      outcome: t.outcome,
      summary: t.summary,
      balanceAfterCents: fromDb(t.balanceAfterCents),
      createdAt: t.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    balanceCents: user.balanceCents,
  });
}

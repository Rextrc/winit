import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { fromDb } from "@/lib/bigmoney";
import { debit, writeTransaction } from "@/lib/ledger";
import { MIN_BET_CENTS, formatCents } from "@/lib/money";
import { doorCheck, tableMinCents, travelCostCents, venueById, VENUES } from "@/lib/life/venues";

export const runtime = "nodejs";

const schema = z.object({ venueId: z.enum(VENUES.map((v) => v.id) as [string, ...string[]]) });

/**
 * TRAVEL — move to another room on the circuit.
 *
 * A pure sink: the ticket leaves the account and nothing comes back but a
 * different table minimum. It cannot create balance under any input, which is
 * why it needs no cap of its own beyond affording the fare.
 *
 * What it explicitly does NOT buy is better odds. Every room deals the same
 * engines at the same published RTP; the only thing that changes is the size
 * of the smallest bet the floor will accept.
 */
export async function POST(req: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  if (user.career.over) return jsonError("That career is over. Start a new life first.", 409);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request body.");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError("No such room on the circuit.");

  const venue = venueById(parsed.data.venueId);
  if (venue.id === user.career.venueId) return jsonError("You are already there.", 409);

  const door = doorCheck(venue, user.level, user.balanceCents);
  if (!door.open) return jsonError(door.reason, 409);

  const costCents = travelCostCents(venue, user.progression.maxBetCents);
  if (costCents > user.balanceCents) {
    return jsonError(`The trip costs ${formatCents(costCents)} and you cannot cover it.`, 409);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // debit() is the concurrency guard: two simultaneous trips cannot both
      // spend the same fare.
      const balanceCents = await debit(tx, user.id, costCents);
      await tx.user.update({ where: { id: user.id }, data: { venueId: venue.id } });

      await writeTransaction(tx, {
        userId: user.id,
        game: "life",
        kind: "TRAVEL",
        betCents: costCents,
        payoutCents: 0,
        outcome: costCents > 0 ? "LOSS" : "CREDIT",
        summary: `Travelled to ${venue.name}, ${venue.city}${
          costCents > 0 ? ` — fare ${formatCents(costCents)}` : ""
        }.`,
        balanceAfterCents: balanceCents,
        detail: { venueId: venue.id, costCents },
      });

      const row = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { balanceCents: true },
      });
      return { balanceCents: fromDb(row.balanceCents) };
    });

    return NextResponse.json({
      ok: true,
      venueId: venue.id,
      venueName: venue.name,
      costCents,
      balanceCents: result.balanceCents,
      tableMinCents: tableMinCents(venue, user.progression.maxBetCents, MIN_BET_CENTS),
    });
  } catch (err) {
    return handleError(err);
  }
}

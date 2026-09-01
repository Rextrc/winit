import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { fromDb, toDb } from "@/lib/bigmoney";
import { credit, debit, writeTransaction } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { randomFloat } from "@/lib/rng";
import { centsFor, choiceByKey, eventByKey } from "@/lib/life/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ eventId: z.string().min(1), choiceKey: z.string().min(1) });

/** The event currently waiting on a decision, if any. */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const row = await prisma.lifeEvent.findFirst({
    where: { userId: user.id, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return NextResponse.json({ event: null });

  const def = eventByKey(row.key);
  if (!def || !def.choices) return NextResponse.json({ event: null });

  return NextResponse.json({
    event: {
      id: row.id,
      key: def.key,
      title: def.title,
      body: def.body,
      rarity: def.rarity,
      choices: def.choices.map((c) => ({ key: c.key, label: c.label })),
    },
  });
}

/**
 * RESOLVE AN EVENT
 *
 * The outcome is drawn HERE, from the weights in the catalogue — the client
 * sends only which option was picked, never what happened. Money moves through
 * the ledger exactly like a bet, so the running-balance chain that proves the
 * books stays exact.
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
  if (!parsed.success) return jsonError("Invalid choice.");

  try {
    const result = await prisma.$transaction(async (tx) => {
      // The conditional status is the lock: a second call finds nothing PENDING.
      const row = await tx.lifeEvent.findFirst({
        where: { id: parsed.data.eventId, userId: user.id, status: "PENDING" },
      });
      if (!row) return { error: "That moment has passed." as const };

      const def = eventByKey(row.key);
      const choice = def ? choiceByKey(def, parsed.data.choiceKey) : undefined;
      if (!def || !choice) return { error: "That isn't one of the options." as const };

      // Draw the outcome server-side from the catalogue's own weights.
      let roll = randomFloat();
      let picked = choice.outcomes[choice.outcomes.length - 1];
      for (const o of choice.outcomes) {
        roll -= o.weight;
        if (roll < 0) {
          picked = o;
          break;
        }
      }
      const effect = picked.effect;

      const fresh = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { balanceCents: true, reputation: true },
      });
      const balanceBefore = fromDb(fresh.balanceCents);

      // Money first, through the ledger.
      // The same two ceilings the instant path uses: the table limit, and a
      // multiple of the stake that triggered this event in the first place.
      const wanted = centsFor(effect, user.progression.maxBetCents, fromDb(row.stakeCents));
      let netCents = 0;
      let balanceCents = balanceBefore;

      if (wanted > 0) {
        balanceCents = await credit(tx, user.id, wanted);
        netCents = wanted;
        await writeTransaction(tx, {
          userId: user.id,
          game: "life",
          kind: "EVENT",
          betCents: 0,
          payoutCents: wanted,
          outcome: "CREDIT",
          summary: `${def.title} — ${effect.text} (+${formatCents(wanted)})`,
          balanceAfterCents: balanceCents,
          detail: { event: def.key, choice: choice.key, rarity: def.rarity },
        });
      } else if (wanted < 0) {
        // Clamped to what they actually hold: an event must never be able to
        // drive a balance negative.
        const cost = Math.min(balanceBefore, -wanted);
        if (cost > 0) {
          balanceCents = await debit(tx, user.id, cost);
          netCents = -cost;
          await writeTransaction(tx, {
            userId: user.id,
            game: "life",
            kind: "EVENT",
            betCents: cost,
            payoutCents: 0,
            outcome: "LOSS",
            summary: `${def.title} — ${effect.text} (-${formatCents(cost)})`,
            balanceAfterCents: balanceCents,
            detail: { event: def.key, choice: choice.key, rarity: def.rarity },
          });
        }
      }

      const reputationDelta = effect.reputation ?? 0;
      const daysDelta = effect.days ?? 0;
      const reputation = Math.max(0, fresh.reputation + reputationDelta);

      if (reputationDelta !== 0 || daysDelta !== 0) {
        await tx.user.update({
          where: { id: user.id },
          data: { reputation, careerDays: { increment: daysDelta } },
        });
      }

      await tx.lifeEvent.update({
        where: { id: row.id },
        data: {
          status: "RESOLVED",
          choiceKey: choice.key,
          outcomeText: effect.text,
          netCents: toDb(netCents),
          reputationDelta,
          daysDelta,
          resolvedAt: new Date(),
        },
      });

      return {
        outcome: {
          id: row.id,
          key: def.key,
          title: def.title,
          rarity: def.rarity,
          choiceLabel: choice.label,
          outcomeText: effect.text,
          netCents,
          reputationDelta,
          daysDelta,
        },
        balanceCents,
        reputation,
      };
    });

    if ("error" in result && result.error) return jsonError(result.error, 409);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

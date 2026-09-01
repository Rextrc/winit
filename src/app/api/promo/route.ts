import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fromDb } from "@/lib/bigmoney";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { credit, writeTransaction } from "@/lib/ledger";
import { formatCents } from "@/lib/money";
import { applyXp } from "@/lib/progression";

export const runtime = "nodejs";

const schema = z.object({ code: z.string().min(1).max(32) });

/**
 * Player-facing redemption.
 *
 * Every guard here is server-side and re-checked inside the transaction: the
 * code must exist, be active, be unexpired, have redemptions left, and not
 * already have been used by this account. The one-per-account rule is enforced
 * by a unique index rather than by a read-then-write, so two simultaneous
 * submissions cannot both succeed.
 *
 * The grant goes through the ledger like every other credit.
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
  if (!parsed.success) return jsonError("Enter a code.");

  const code = parsed.data.code.trim().toUpperCase();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({ where: { code } });
      if (!promo || !promo.active) return { error: "That code is not valid." as const };
      if (promo.expiresAt && promo.expiresAt.getTime() < Date.now()) {
        return { error: "That code has expired." as const };
      }
      if (promo.maxRedemptions > 0 && promo.redeemedCount >= promo.maxRedemptions) {
        return { error: "That code has been fully redeemed." as const };
      }

      const already = await tx.promoRedemption.findUnique({
        where: { codeId_userId: { codeId: promo.id, userId: user.id } },
      });
      if (already) return { error: "You have already used that code." as const };

      // The unique index is the real guard against a double submit.
      await tx.promoRedemption.create({ data: { codeId: promo.id, userId: user.id } });
      await tx.promoCode.update({
        where: { id: promo.id },
        data: { redeemedCount: { increment: 1 } },
      });

      const grantCents = fromDb(promo.grantCents);
      let balanceCents = user.balanceCents;

      if (grantCents > 0) {
        balanceCents = await credit(tx, user.id, grantCents);
        await writeTransaction(tx, {
          userId: user.id,
          game: "promo",
          kind: "PROMO",
          betCents: 0,
          payoutCents: grantCents,
          outcome: "CREDIT",
          summary: `Promo code ${promo.code} — ${formatCents(grantCents)}`,
          balanceAfterCents: balanceCents,
          detail: { code: promo.code, grantXp: promo.grantXp },
        });
      }

      let level = user.level;
      if (promo.grantXp > 0) {
        const before = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { level: true, xp: true, rebirths: true },
        });
        const rolled = applyXp(before, promo.grantXp);
        await tx.user.update({
          where: { id: user.id },
          data: { level: rolled.level, xp: rolled.xp },
        });
        level = rolled.level;
      }

      return { grantCents, grantXp: promo.grantXp, balanceCents, level, code: promo.code };
    });

    if ("error" in result && result.error) return jsonError(result.error, 409);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleError(err);
  }
}

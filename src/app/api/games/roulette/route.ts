import { NextResponse } from "next/server";
import { z } from "zod";
import { handleError, jsonError, requireUser } from "@/lib/api";
import { MAX_BET_CENTS, MIN_BET_CENTS, formatCents } from "@/lib/money";
import { spin, type RouletteBet } from "@/lib/games/roulette";
import { settleOneShotBet } from "@/lib/ledger";

export const runtime = "nodejs";

const BET_TYPES = [
  "straight", "red", "black", "odd", "even", "low", "high",
  "dozen1", "dozen2", "dozen3", "col1", "col2", "col3",
] as const;

const schema = z.object({
  bets: z
    .array(
      z.object({
        type: z.enum(BET_TYPES),
        number: z.number().int().min(0).max(36).optional(),
        amountCents: z.number().int().min(MIN_BET_CENTS),
      }),
    )
    .min(1, "Place at least one chip.")
    .max(20, "That's too many separate bets for one spin."),
});

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
  if (!parsed.success) return jsonError(parsed.error.errors[0]?.message ?? "Invalid bets.");

  const bets = parsed.data.bets as RouletteBet[];
  for (const b of bets) {
    if (b.type === "straight" && typeof b.number !== "number") {
      return jsonError("A straight-up bet needs a number.");
    }
  }

  const totalStake = bets.reduce((sum, b) => sum + b.amountCents, 0);
  if (totalStake > MAX_BET_CENTS) {
    return jsonError(`Table limit is ${formatCents(MAX_BET_CENTS)} total per spin.`, 409);
  }
  if (totalStake > user.balanceCents) {
    return jsonError("Not enough balance for those chips.", 409);
  }

  try {
    const result = spin(bets);
    const settled = await settleOneShotBet({
      userId: user.id,
      game: "roulette",
      betCents: result.totalStakeCents,
      payoutCents: result.payoutCents,
      outcome: result.outcome,
      summary: result.summary,
      detail: { pocket: result.pocket, color: result.color, bets: result.bets },
    });

    return NextResponse.json({
      ok: true,
      result,
      betCents: result.totalStakeCents,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
    });
  } catch (err) {
    return handleError(err);
  }
}

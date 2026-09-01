import { NextResponse } from "next/server";
import { z } from "zod";
import { assertBettable, handleError, jsonError, requireUser } from "@/lib/api";
import { validateBet, formatCents } from "@/lib/money";
import { settleOneShotBet } from "@/lib/ledger";
import { bonusStatus } from "@/lib/bonus";
import { randomInt } from "@/lib/rng";
import { PLINKO_ROWS, PLINKO_TABLES, payoutFor, type PlinkoRisk, type PlinkoRows } from "@/lib/games/originals";

export const runtime = "nodejs";

const schema = z.object({
  betCents: z.number().int(),
  risk: z.enum(["low", "medium", "high"]),
  rows: z.union([z.literal(8), z.literal(12), z.literal(16)]),
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
  if (!parsed.success) return jsonError("Invalid bet.");
  if (!PLINKO_ROWS.includes(parsed.data.rows as PlinkoRows)) return jsonError("Invalid row count.");

  const bet = validateBet(parsed.data.betCents, user.balanceCents, user.progression.maxBetCents);
  if (!bet.ok) return jsonError(bet.error, 409);
  const gate = await assertBettable(user, bet.cents, "plinko");
  if (gate) return gate;

  try {
    const risk = parsed.data.risk as PlinkoRisk;
    const rows = parsed.data.rows as PlinkoRows;

    // Each of `rows` independent left/right bounces is one crypto coin flip,
    // so the bucket the ball lands in is Binomial(rows, 1/2) by construction.
    let bucket = 0;
    const path: ("L" | "R")[] = [];
    for (let i = 0; i < rows; i++) {
      const right = randomInt(2) === 1;
      if (right) bucket += 1;
      path.push(right ? "R" : "L");
    }

    const table = PLINKO_TABLES[risk][rows];
    const multiplier = table[bucket];
    const payoutCents = payoutFor(bet.cents, multiplier);

    const settled = await settleOneShotBet({
      userId: user.id,
      game: "plinko",
      betCents: bet.cents,
      payoutCents,
      outcome: payoutCents > bet.cents ? "WIN" : payoutCents === bet.cents ? "PUSH" : "LOSS",
      summary:
        payoutCents > 0
          ? `Landed bucket ${bucket} (${multiplier}x) — paid ${formatCents(payoutCents)}`
          : `Landed bucket ${bucket} (0x) — no pay`,
      detail: { risk, rows, bucket, multiplier, path },
    });

    return NextResponse.json({
      ok: true,
      risk,
      rows,
      bucket,
      path,
      multiplier,
      payoutCents,
      netCents: settled.netCents,
      balanceCents: settled.balanceCents,
      progress: settled.progress,
      bonus: bonusStatus(user.lastBonusAt, user.bonusStreak),
    });
  } catch (err) {
    return handleError(err);
  }
}

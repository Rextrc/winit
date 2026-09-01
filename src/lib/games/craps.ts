import { randomRange } from "@/lib/rng";

/**
 * WINIT CRAPS — pass, don't pass, field
 * ---------------------------------------------------------------------------
 * The whole sequence resolves inside one request: the come-out is rolled, and
 * if it sets a point the dice keep rolling until the point repeats or a seven
 * shows. The client is shown the full sequence afterwards, so nothing about
 * the result depends on anything the browser sends.
 *
 * Every return below is exact and derived here rather than quoted from
 * memory. The point phase is an infinite series, but it collapses: once a
 * point p is set, the only rolls that matter are p and 7, so the chance of
 * making the point is simply ways(p) / (ways(p) + ways(7)).
 *
 *   Pass line       P(win) = 244/495          RTP = 488/495 = 98.586%
 *   Don't pass      12 pushes on the come-out  RTP = 1953/1980 = 98.636%
 *   Field           one roll, 2 and 12 boosted RTP = 35/36 = 97.222%
 *
 * These are the real odds of the real game — this is the one family of bets in
 * the app that is not priced to a flat 99%, because the point mechanic is the
 * thing being modelled and re-pricing it would make it a different game.
 * ---------------------------------------------------------------------------
 */

export type CrapsBet = "pass" | "dontPass" | "field";

export const BET_LABELS: Record<CrapsBet, string> = {
  pass: "Pass line",
  dontPass: "Don't pass",
  field: "Field",
};

export const POINTS = [4, 5, 6, 8, 9, 10] as const;

/** Number of the 36 dice combinations that make each total. */
export function waysToRoll(total: number): number {
  return total < 2 || total > 12 ? 0 : 6 - Math.abs(total - 7);
}

export function rollDice(): [number, number] {
  return [randomRange(1, 6), randomRange(1, 6)];
}

/** Chance of making point `p` before a seven. */
export function pointChance(p: number): number {
  return waysToRoll(p) / (waysToRoll(p) + waysToRoll(7));
}

// --- exact returns -------------------------------------------------------

/** Exact P(pass line wins) = 244/495. */
export function passWinProbability(): number {
  let p = (waysToRoll(7) + waysToRoll(11)) / 36;
  for (const point of POINTS) p += (waysToRoll(point) / 36) * pointChance(point);
  return p;
}

/** Don't pass, barring the 12: returns win / lose / push probabilities. */
export function dontPassProbabilities(): { win: number; lose: number; push: number } {
  const push = waysToRoll(12) / 36;
  let win = (waysToRoll(2) + waysToRoll(3)) / 36;
  let lose = (waysToRoll(7) + waysToRoll(11)) / 36;
  for (const point of POINTS) {
    const setsPoint = waysToRoll(point) / 36;
    win += setsPoint * (1 - pointChance(point));
    lose += setsPoint * pointChance(point);
  }
  return { win, lose, push };
}

/** The field pays double on 2 and triple on 12; everything else is even. */
export function fieldPayout(total: number): number {
  if (total === 2) return 3;
  if (total === 12) return 4;
  if ([3, 4, 9, 10, 11].includes(total)) return 2;
  return 0;
}

export function exactRtp(bet: CrapsBet): number {
  if (bet === "pass") return passWinProbability() * 2;
  if (bet === "dontPass") {
    const { win, push } = dontPassProbabilities();
    return win * 2 + push * 1;
  }
  let ev = 0;
  for (let t = 2; t <= 12; t++) ev += (waysToRoll(t) / 36) * fieldPayout(t);
  return ev;
}

export type CrapsRoll = { dice: [number, number]; total: number };

export type CrapsResult = {
  bet: CrapsBet;
  rolls: CrapsRoll[];
  /** The point, when the come-out set one. */
  point: number | null;
  outcome: "WIN" | "LOSS" | "PUSH";
  multiplier: number;
  payoutCents: number;
  summary: string;
};

export function play(bet: CrapsBet, betCents: number): CrapsResult {
  const rolls: CrapsRoll[] = [];

  const roll = (): number => {
    const dice = rollDice();
    const total = dice[0] + dice[1];
    rolls.push({ dice, total });
    return total;
  };

  const settle = (outcome: "WIN" | "LOSS" | "PUSH", multiplier: number, point: number | null, summary: string): CrapsResult => ({
    bet,
    rolls,
    point,
    outcome,
    multiplier,
    payoutCents: Math.round(betCents * multiplier),
    summary,
  });

  if (bet === "field") {
    const total = roll();
    const multiplier = fieldPayout(total);
    return settle(
      multiplier > 0 ? "WIN" : "LOSS",
      multiplier,
      null,
      multiplier > 0 ? `Field ${total} — pays ${multiplier - 1}:1` : `${total} — off the field`,
    );
  }

  const comeOut = roll();

  if (bet === "pass") {
    if (comeOut === 7 || comeOut === 11) return settle("WIN", 2, null, `Natural ${comeOut}`);
    if (comeOut === 2 || comeOut === 3 || comeOut === 12) return settle("LOSS", 0, null, `Craps ${comeOut}`);
  } else {
    if (comeOut === 2 || comeOut === 3) return settle("WIN", 2, null, `Craps ${comeOut}`);
    if (comeOut === 7 || comeOut === 11) return settle("LOSS", 0, null, `Natural ${comeOut}`);
    if (comeOut === 12) return settle("PUSH", 1, null, "12 on the come-out — barred, stake returned");
  }

  const point = comeOut;
  for (;;) {
    const total = roll();
    if (total === point) {
      return bet === "pass"
        ? settle("WIN", 2, point, `Made the point of ${point}`)
        : settle("LOSS", 0, point, `Point ${point} repeated`);
    }
    if (total === 7) {
      return bet === "pass"
        ? settle("LOSS", 0, point, `Sevened out on the ${point}`)
        : settle("WIN", 2, point, `Seven out — don't pass wins on the ${point}`);
    }
  }
}

import { settlePending } from "@/lib/sports/settle";

/**
 * Runs settlement inside the long-lived `next start` process — on Railway
 * there's no platform cron to call it, and none is needed. Started once from
 * src/instrumentation.ts.
 */

const EVERY_MS = 5 * 60 * 1000;
const FIRST_RUN_MS = 45 * 1000;

const g = globalThis as unknown as { __sportsSettlement?: boolean };

export function startSettlementLoop(): void {
  if (g.__sportsSettlement || !process.env.ODDS_API_KEY) return;
  g.__sportsSettlement = true;

  const run = () =>
    settlePending().catch((err) => console.error("[sports] settlement pass failed:", err));

  setTimeout(run, FIRST_RUN_MS).unref?.();
  setInterval(run, EVERY_MS).unref?.();
}

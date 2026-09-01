"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents, formatSignedCents } from "@/lib/money";

export type TxRow = {
  id: string;
  game: string;
  kind: string;
  betCents: number;
  payoutCents: number;
  netCents: number;
  outcome: string;
  summary: string;
  balanceAfterCents: number;
  createdAt: string;
};

const GAME_LABELS: Record<string, string> = {
  slots: "Candy Cascade",
  blackjack: "Blackjack",
  roulette: "European Roulette",
  dice: "Dice",
  limbo: "Limbo",
  coinflip: "Coinflip",
  wheel: "Wheel",
  plinko: "Plinko",
  keno: "Keno",
  baccarat: "Baccarat",
  mines: "Mines",
  hilo: "Hi-Lo",
  bonus: "Daily bonus",
  signup: "Welcome grant",
  life: "Life",
};

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * The bet history feed. Every row in the transaction log: game, stake,
 * outcome, payout, net and the running balance it left behind.
 */
export default function BetFeed({
  game,
  version = 0,
  take = 12,
  title = "Bet history",
  showBalance = true,
}: {
  game?: string;
  /** Bump to force a refetch after a settled bet. */
  version?: number;
  take?: number;
  title?: string;
  showBalance?: boolean;
}) {
  const [rows, setRows] = useState<TxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ take: String(take) });
      if (game) params.set("game", game);
      const res = await fetch(`/api/transactions?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Couldn't load history.");
      const data = await res.json();
      setRows(data.transactions);
      setError(null);
    } catch {
      setError("Couldn't load history.");
    }
  }, [game, take]);

  useEffect(() => {
    void load();
  }, [load, version]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="text-[13px] font-black tracking-tight text-white">{title}</h3>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {game ? "This game" : "All games"}
        </span>
      </div>

      {error && <p className="px-4 py-4 text-sm text-loss">{error}</p>}

      {!error && rows === null && (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/5" />
          ))}
        </div>
      )}

      {!error && rows?.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          No bets yet. Your results will appear here.
        </p>
      )}

      {!error && rows && rows.length > 0 && (
        <ul className="divide-y divide-white/5">
          {rows.map((t) => {
            const isCredit = t.kind !== "BET";
            const win = t.netCents > 0;
            const push = t.netCents === 0 && t.kind === "BET";
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className={`h-8 w-1 shrink-0 rounded-full ${
                    isCredit ? "bg-volt" : win ? "bg-win" : push ? "bg-slate-500" : "bg-loss"
                  }`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-100">
                    {GAME_LABELS[t.game] ?? t.game}
                    <span className="ml-2 font-normal text-slate-500">{t.summary}</span>
                  </p>
                  <p className="num text-[11px] text-slate-500">
                    {timeOf(t.createdAt)}
                    {t.kind === "BET" && <> · stake {formatCents(t.betCents)} · paid {formatCents(t.payoutCents)}</>}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={win ? "num-win text-[13px]" : push ? "num text-[13px] text-slate-400" : "num-loss text-[13px]"}>
                    {push ? "PUSH" : formatSignedCents(t.netCents)}
                  </p>
                  {showBalance && (
                    <p className="num text-[10px] text-slate-500">bal {formatCents(t.balanceAfterCents)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

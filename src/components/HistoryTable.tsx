"use client";

import { useMemo, useState } from "react";
import type { TxRow } from "@/components/BetFeed";
import { formatCents, formatSignedCents } from "@/lib/money";

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

const FILTERS = [
  { key: "all", label: "All" },
  { key: "slots", label: "Candy Cascade" },
  { key: "blackjack", label: "Blackjack" },
  { key: "roulette", label: "European Roulette" },
  { key: "dice", label: "Dice" },
  { key: "limbo", label: "Limbo" },
  { key: "coinflip", label: "Coinflip" },
  { key: "wheel", label: "Wheel" },
  { key: "plinko", label: "Plinko" },
  { key: "keno", label: "Keno" },
  { key: "baccarat", label: "Baccarat" },
  { key: "mines", label: "Mines" },
  { key: "hilo", label: "Hi-Lo" },
  { key: "bonus", label: "Credits" },
  { key: "life", label: "Life" },
];

export default function HistoryTable({ rows }: { rows: TxRow[] }) {
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "bonus") return rows.filter((r) => r.kind !== "BET");
    return rows.filter((r) => r.game === filter);
  }, [rows, filter]);

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap gap-1.5 border-b border-white/5 p-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
              filter === f.key ? "bg-volt text-base-900" : "bg-white/5 text-slate-400 hover:text-slate-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-2.5 font-bold">Time</th>
              <th className="px-4 py-2.5 font-bold">Game</th>
              <th className="px-4 py-2.5 font-bold">Result</th>
              <th className="px-4 py-2.5 text-right font-bold">Stake</th>
              <th className="px-4 py-2.5 text-right font-bold">Payout</th>
              <th className="px-4 py-2.5 text-right font-bold">Net</th>
              <th className="px-4 py-2.5 text-right font-bold">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((t) => {
              const win = t.netCents > 0;
              const push = t.netCents === 0 && t.kind === "BET";
              return (
                <tr key={t.id} className="hover:bg-white/[0.03]">
                  <td className="num whitespace-nowrap px-4 py-2.5 text-[11px] text-slate-500">
                    {new Date(t.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-200">
                    {GAME_LABELS[t.game] ?? t.game}
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{t.summary}</td>
                  <td className="num px-4 py-2.5 text-right text-slate-300">
                    {t.kind === "BET" ? formatCents(t.betCents) : "—"}
                  </td>
                  <td className="num px-4 py-2.5 text-right text-slate-300">{formatCents(t.payoutCents)}</td>
                  <td className={`px-4 py-2.5 text-right ${win ? "num-win" : push ? "num text-slate-400" : "num-loss"}`}>
                    {push ? "PUSH" : formatSignedCents(t.netCents)}
                  </td>
                  <td className="num px-4 py-2.5 text-right font-bold text-white">
                    {formatCents(t.balanceAfterCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing logged under this filter yet.</p>
      )}
    </div>
  );
}

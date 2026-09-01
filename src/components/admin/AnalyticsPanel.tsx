"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

type Analytics = {
  generatedAt: string;
  users: {
    total: number; deleted: number; suspended: number; staff: number;
    onlineNow: number; activeToday: number; activeWeek: number; newToday: number; newWeek: number;
  };
  economy: {
    totalBalanceCents: number; averageBalanceCents: number; richestBalanceCents: number;
    totalWageredCents: number; totalWonCents: number; realisedRtp: number | null; betCount: number;
  };
  progression: { averageLevel: number; liveCareers: number; endedCareers: number; activeRounds: number };
  topGames: { game: string; name: string; bets: number; wageredCents: number; realisedRtp: number | null }[];
  biggestWins: { id: string; username: string; game: string; payoutCents: number; betCents: number; summary: string; createdAt: string }[];
  recentSignups: { id: string; username: string; level: number; deleted: boolean; createdAt: string }[];
  recentStaffActions: { id: string; actorUsername: string; action: string; targetUsername: string | null; reason: string; createdAt: string }[];
};

function Stat({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`num mt-1 text-xl font-black text-white ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPanel() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't load analytics.");
        return;
      }
      setData((await res.json()) as Analytics);
      setError(null);
    } catch {
      setError("Network error.");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const rtp = data.economy.realisedRtp;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Accounts" value={data.users.total.toLocaleString()} sub={`${data.users.staff} staff · ${data.users.suspended} suspended · ${data.users.deleted} deleted`} />
        <Stat label="Online now" value={data.users.onlineNow.toLocaleString()} sub={`${data.users.activeToday} today · ${data.users.activeWeek} this week`} tone="text-win" />
        <Stat label="New accounts" value={data.users.newToday.toLocaleString()} sub={`${data.users.newWeek} in the last 7 days`} />
        <Stat label="Rounds in play" value={data.progression.activeRounds.toLocaleString()} sub="Unsettled multi-step games" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Currency in circulation" value={formatCents(data.economy.totalBalanceCents)} sub={`avg ${formatCents(data.economy.averageBalanceCents)}`} />
        <Stat label="Richest account" value={formatCents(data.economy.richestBalanceCents)} />
        <Stat label="Total staked" value={formatCents(data.economy.totalWageredCents)} sub={`${data.economy.betCount.toLocaleString()} settled bets`} />
        <Stat
          label="Realised RTP"
          value={rtp === null ? "—" : `${(rtp * 100).toFixed(3)}%`}
          sub="Returned ÷ staked, all games"
          tone={rtp !== null && (rtp > 1.02 || rtp < 0.9) ? "text-loss" : "text-volt"}
        />
      </div>

      <div className="panel p-5">
        <h3 className="text-[13px] font-black text-white">Most played</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Realised RTP is what each game has actually returned in production. It should track the
          published figure — a game drifting well outside its band is the signal a paytable is wrong.
        </p>
        <table className="mt-3 w-full text-left text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="py-1.5 font-bold">Game</th>
              <th className="py-1.5 text-right font-bold">Bets</th>
              <th className="py-1.5 text-right font-bold">Staked</th>
              <th className="py-1.5 text-right font-bold">Realised RTP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.topGames.map((g) => (
              <tr key={g.game}>
                <td className="py-1.5 font-semibold text-slate-200">{g.name}</td>
                <td className="num py-1.5 text-right text-slate-300">{g.bets.toLocaleString()}</td>
                <td className="num py-1.5 text-right text-slate-300">{formatCents(g.wageredCents)}</td>
                <td className="num py-1.5 text-right font-bold text-volt">
                  {g.realisedRtp === null ? "—" : `${(g.realisedRtp * 100).toFixed(2)}%`}
                </td>
              </tr>
            ))}
            {data.topGames.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-slate-500">No bets settled yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="text-[13px] font-black text-white">Biggest wins</h3>
          <ul className="mt-3 space-y-1.5">
            {data.biggestWins.map((w) => (
              <li key={w.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="min-w-0 truncate text-slate-300">
                  <span className="font-bold text-slate-100">{w.username}</span>
                  <span className="ml-1.5 text-slate-500">{w.game}</span>
                </span>
                <span className="num shrink-0 font-black text-win">{formatCents(w.payoutCents)}</span>
              </li>
            ))}
            {data.biggestWins.length === 0 && <li className="text-[12px] text-slate-500">Nothing yet.</li>}
          </ul>
        </div>

        <div className="panel p-5">
          <h3 className="text-[13px] font-black text-white">Recent staff actions</h3>
          <ul className="mt-3 space-y-1.5">
            {data.recentStaffActions.map((a) => (
              <li key={a.id} className="text-[12px]">
                <span className="font-bold text-slate-100">{a.actorUsername}</span>
                <span className="mx-1 text-volt">{a.action}</span>
                {a.targetUsername && <span className="text-slate-300">{a.targetUsername}</span>}
                <span className="block truncate text-[11px] text-slate-500">{a.reason}</span>
              </li>
            ))}
            {data.recentStaffActions.length === 0 && (
              <li className="text-[12px] text-slate-500">No staff actions recorded.</li>
            )}
          </ul>
        </div>
      </div>

      <p className="text-center text-[10px] text-slate-600">
        Generated {new Date(data.generatedAt).toLocaleTimeString()} · refreshes every 20s
      </p>
    </div>
  );
}

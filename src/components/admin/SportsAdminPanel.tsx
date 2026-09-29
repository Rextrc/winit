"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

type Leg = {
  id: string;
  leagueTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: string;
  selection: string;
  point: number | null;
  status: string;
};

type Bet = {
  id: string;
  username: string;
  kind: string;
  status: string;
  stakeCents: number;
  priceDecimal: number;
  payoutCents: number | null;
  createdAt: string;
  settledAt: string | null;
  legs: Leg[];
};

type Data = {
  feed: { configured: boolean; quotaRemaining: number | null };
  counts: {
    pendingBets: number;
    pendingLegs: number;
    settledToday: number;
    stakedPendingCents: number;
    oldestPendingKickoff: string | null;
  };
  cache: { sportKey: string; fetchedAt: string }[];
  bets: Bet[];
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

const STATUS_TONE: Record<string, string> = {
  PENDING: "text-slate-300",
  WON: "text-win",
  LOST: "text-loss",
  PUSHED: "text-slate-300",
  VOID: "text-slate-500",
  CASHED_OUT: "text-volt",
};

function ageLabel(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export default function SportsAdminPanel({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sports", { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't load sports data.");
        return;
      }
      setData((await res.json()) as Data);
      setError(null);
    } catch {
      setError("Network error.");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const settleNow = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/sports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle" }),
      });
      const d = await res.json();
      setMessage(res.ok ? `Graded ${d.legsGraded} legs, settled ${d.betsSettled} bets.` : (d.error ?? "Failed."));
      if (res.ok) await load();
    } catch {
      setMessage("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const voidBet = async (betId: string) => {
    const reason = window.prompt("Reason for voiding this bet (the stake will be refunded):");
    if (reason === null) return;
    setVoiding(betId);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/sports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "void", betId, reason }),
      });
      const d = await res.json();
      setMessage(res.ok ? "Bet voided — stake refunded." : (d.error ?? "Failed."));
      if (res.ok) await load();
    } catch {
      setMessage("Network error.");
    } finally {
      setVoiding(null);
    }
  };

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const { feed, counts } = data;

  return (
    <div className="space-y-5">
      {!feed.configured && (
        <div className="panel border border-gold/30 bg-gold/[0.06] p-4">
          <p className="text-[13px] font-bold text-gold">The odds feed has no API key configured.</p>
          <p className="mt-1 text-[12px] text-slate-400">
            Sports is showing no live matches and nothing here will settle until ODDS_API_KEY is set.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Feed"
          value={feed.configured ? "Connected" : "Off"}
          sub={feed.quotaRemaining !== null ? `${feed.quotaRemaining.toLocaleString()} requests left` : "Quota unknown"}
          tone={feed.configured ? "text-win" : "text-loss"}
        />
        <Stat label="Pending bets" value={counts.pendingBets.toLocaleString()} sub={`${counts.pendingLegs} legs open`} />
        <Stat label="Staked, pending" value={formatCents(counts.stakedPendingCents)} sub="At risk if voided" />
        <Stat label="Settled today" value={counts.settledToday.toLocaleString()} tone="text-volt" />
        <Stat
          label="Next kickoff"
          value={counts.oldestPendingKickoff ? ageLabel(counts.oldestPendingKickoff) : "—"}
          sub={counts.oldestPendingKickoff ? "Oldest unsettled leg" : "Nothing pending"}
        />
      </div>

      {canManage && (
        <div className="panel flex flex-wrap items-center gap-3 p-4">
          <button type="button" onClick={settleNow} disabled={busy} className="btn-primary px-4 py-2 text-sm">
            {busy ? "Running…" : "Run settlement now"}
          </button>
          <p className="text-[12px] text-slate-500">
            Runs automatically every 5 minutes on its own — this just doesn&apos;t wait.
          </p>
          {message && <p className="text-[12px] font-semibold text-slate-200">{message}</p>}
        </div>
      )}

      <div className="panel p-5">
        <h3 className="text-[13px] font-black text-white">Odds cache freshness</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          When each league&apos;s odds were last fetched. Cached copies keep serving if the feed is down or the
          quota runs out.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.cache.map((c) => (
            <span key={c.sportKey} className="rounded-md bg-base-900 px-2 py-1 text-[11px] text-slate-300">
              <span className="font-semibold text-slate-100">{c.sportKey}</span>
              <span className="ml-1.5 text-slate-500">{ageLabel(c.fetchedAt)}</span>
            </span>
          ))}
          {data.cache.length === 0 && <p className="text-[12px] text-slate-500">Nothing cached yet.</p>}
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="text-[13px] font-black text-white">Recent bets</h3>
        <table className="mt-3 w-full text-left text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="py-1.5 font-bold">Player</th>
              <th className="py-1.5 font-bold">Bet</th>
              <th className="py-1.5 text-right font-bold">Stake</th>
              <th className="py-1.5 text-right font-bold">Odds</th>
              <th className="py-1.5 font-bold">Status</th>
              <th className="py-1.5 text-right font-bold">Payout</th>
              {canManage && <th className="py-1.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {data.bets.map((b) => (
              <tr key={b.id}>
                <td className="py-1.5 font-semibold text-slate-200">{b.username}</td>
                <td className="max-w-[320px] py-1.5 text-slate-400">
                  {b.legs.map((l) => (
                    <p key={l.id} className="truncate">
                      <span className={STATUS_TONE[l.status] ?? "text-slate-400"}>{l.selection}</span>
                      <span className="text-slate-600"> · {l.homeTeam} v {l.awayTeam}</span>
                    </p>
                  ))}
                </td>
                <td className="num py-1.5 text-right text-slate-300">{formatCents(b.stakeCents)}</td>
                <td className="num py-1.5 text-right text-volt">{b.priceDecimal.toFixed(2)}</td>
                <td className={`py-1.5 font-bold ${STATUS_TONE[b.status] ?? "text-slate-300"}`}>{b.status}</td>
                <td className="num py-1.5 text-right font-bold text-slate-200">
                  {b.payoutCents === null ? "—" : formatCents(b.payoutCents)}
                </td>
                {canManage && (
                  <td className="py-1.5 text-right">
                    {b.status === "PENDING" && (
                      <button
                        type="button"
                        onClick={() => voidBet(b.id)}
                        disabled={voiding === b.id}
                        className="btn-ghost px-2.5 py-1 text-[11px]"
                      >
                        {voiding === b.id ? "Voiding…" : "Void"}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {data.bets.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="py-4 text-center text-slate-500">
                  No sports bets placed yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-center text-[10px] text-slate-600">Refreshes every 15s</p>
    </div>
  );
}

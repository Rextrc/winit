"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, parseAmountToCents, MIN_BET_CENTS } from "@/lib/money";
import type { MatchView } from "@/app/api/sports/matches/route";

type Selection = {
  eventId: string;
  sportKey: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: "h2h" | "spreads" | "totals";
  selection: string;
  point?: number;
  price: number;
};

type MyBet = {
  id: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  market: string;
  selection: string;
  line: number | null;
  priceDecimal: number;
  stakeCents: number;
  payoutCents: number | null;
  status: string;
  createdAt: string;
};

const MARKET_LABEL: Record<Selection["market"], string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

export default function SportsBetting() {
  const { balanceCents, applyResult } = useWallet();
  const [matches, setMatches] = useState<MatchView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myBets, setMyBets] = useState<MyBet[] | null>(null);
  const [tab, setTab] = useState<"matches" | "my-bets">("matches");

  const [pick, setPick] = useState<Selection | null>(null);
  const [stake, setStake] = useState("10.00");
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const loadMatches = async () => {
    try {
      const res = await fetch("/api/sports/matches");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't load matches.");
        setMatches([]);
        return;
      }
      setMatches(data.matches);
      setError(null);
    } catch {
      setError("Network error loading matches.");
      setMatches([]);
    }
  };

  const loadMyBets = async () => {
    const res = await fetch("/api/sports/bet");
    if (res.ok) setMyBets((await res.json()).bets);
  };

  useEffect(() => {
    loadMatches();
    loadMyBets();
    const t = setInterval(loadMatches, 30_000);
    return () => clearInterval(t);
  }, []);

  const stakeCents = useMemo(() => parseAmountToCents(stake) ?? 0, [stake]);

  const place = async () => {
    if (!pick) return;
    if (stakeCents < MIN_BET_CENTS) {
      setPlaceError(`Minimum bet is ${formatCents(MIN_BET_CENTS)}.`);
      return;
    }
    setPlacing(true);
    setPlaceError(null);
    try {
      const res = await fetch("/api/sports/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          betCents: stakeCents,
          eventId: pick.eventId,
          sportKey: pick.sportKey,
          market: pick.market,
          selection: pick.selection,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlaceError(data.error ?? "Couldn't place that bet.");
        return;
      }
      applyResult(data.balanceCents);
      setPick(null);
      loadMyBets();
      setTab("my-bets");
    } catch {
      setPlaceError("Network error — the bet was not placed.");
    } finally {
      setPlacing(false);
    }
  };

  const grouped = useMemo(() => {
    if (!matches) return [];
    const bySport = new Map<string, MatchView[]>();
    for (const m of matches) {
      const list = bySport.get(m.sportTitle) ?? [];
      list.push(m);
      bySport.set(m.sportTitle, list);
    }
    return [...bySport.entries()];
  }, [matches]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight text-white">Sports</h1>
          <p className="mt-1 text-sm text-slate-400">Real matches, real bookmaker odds. Play money only.</p>
        </div>
        <div className="rounded-xl border border-transparent bg-base-900 p-1 text-sm font-bold">
          <button
            type="button"
            onClick={() => setTab("matches")}
            className={`rounded-lg px-4 py-2 transition ${tab === "matches" ? "bg-base-500 text-white" : "text-slate-400"}`}
          >
            Matches
          </button>
          <button
            type="button"
            onClick={() => setTab("my-bets")}
            className={`rounded-lg px-4 py-2 transition ${tab === "my-bets" ? "bg-base-500 text-white" : "text-slate-400"}`}
          >
            My Bets{myBets && myBets.filter((b) => b.status === "PENDING").length > 0 ? ` (${myBets.filter((b) => b.status === "PENDING").length})` : ""}
          </button>
        </div>
      </div>

      {tab === "matches" && (
        <>
          {error && (
            <div className="mb-4 rounded-xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss">{error}</div>
          )}
          {matches === null && !error && <p className="text-sm text-slate-500">Loading live odds…</p>}
          {matches && matches.length === 0 && !error && (
            <p className="text-sm text-slate-500">No upcoming matches right now — check back shortly.</p>
          )}

          <div className="space-y-6">
            {grouped.map(([sportTitle, list]) => (
              <div key={sportTitle}>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{sportTitle}</h2>
                <div className="space-y-2">
                  {list.map((m) => (
                    <MatchCard key={m.eventId} match={m} onPick={(sel) => setPick(sel)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "my-bets" && (
        <div className="space-y-2">
          {myBets === null && <p className="text-sm text-slate-500">Loading…</p>}
          {myBets && myBets.length === 0 && <p className="text-sm text-slate-500">No sports bets yet.</p>}
          {myBets?.map((b) => <MyBetRow key={b.id} bet={b} />)}
        </div>
      )}

      {pick && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-4 sm:place-items-center" onClick={() => setPick(null)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-base-800 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{pick.sportTitle}</p>
            <p className="mt-0.5 text-sm text-slate-300">
              {pick.awayTeam} @ {pick.homeTeam}
            </p>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-base-900 p-3">
              <div>
                <p className="text-[11px] text-slate-500">{MARKET_LABEL[pick.market]}</p>
                <p className="font-bold text-white">
                  {pick.selection}
                  {pick.point !== undefined ? ` ${pick.point > 0 ? "+" : ""}${pick.point}` : ""}
                </p>
              </div>
              <p className="num text-lg font-black text-volt">{pick.price.toFixed(2)}×</p>
            </div>

            <label className="mt-4 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Stake</label>
            <input
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              inputMode="decimal"
              className="num mt-1 w-full rounded-xl border border-white/10 bg-base-900 px-3 py-2.5 text-white outline-none focus:border-volt/50"
            />
            <p className="mt-1.5 text-[11px] text-slate-500">
              Balance {formatCents(balanceCents ?? 0)} · To win {formatCents(Math.round(stakeCents * (pick.price - 1)))}
            </p>

            {placeError && <p className="mt-2 text-xs font-semibold text-loss">{placeError}</p>}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setPick(null)} className="btn-ghost flex-1 py-2.5 text-sm">
                Cancel
              </button>
              <button type="button" onClick={place} disabled={placing} className="btn-primary flex-1 py-2.5 text-sm">
                {placing ? "Placing…" : `Place ${formatCents(stakeCents)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, onPick }: { match: MatchView; onPick: (s: Selection) => void }) {
  const base = {
    eventId: match.eventId,
    sportKey: match.sportKey,
    sportTitle: match.sportTitle,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    commenceTime: match.commenceTime,
  };

  return (
    <div className="rounded-xl border border-white/5 bg-base-800/60 p-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-sm font-bold text-white">
          {match.awayTeam} <span className="text-slate-500">@</span> {match.homeTeam}
        </p>
        <p className="text-[11px] text-slate-500">{fmtTime(match.commenceTime)}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <OddsRow
          label="Moneyline"
          outcomes={match.h2h.map((o) => ({ name: o.name, price: o.price }))}
          onPick={(name, price) => onPick({ ...base, market: "h2h", selection: name, price })}
        />
        <OddsRow
          label="Spread"
          outcomes={match.spreads.map((o) => ({ name: o.name, price: o.price, point: o.point }))}
          onPick={(name, price, point) => onPick({ ...base, market: "spreads", selection: name, price, point })}
        />
        <OddsRow
          label="Total"
          outcomes={match.totals.map((o) => ({ name: o.name, price: o.price, point: o.point }))}
          onPick={(name, price, point) => onPick({ ...base, market: "totals", selection: name, price, point })}
        />
      </div>
    </div>
  );
}

function OddsRow({
  label,
  outcomes,
  onPick,
}: {
  label: string;
  outcomes: { name: string; price: number; point?: number }[];
  onPick: (name: string, price: number, point?: number) => void;
}) {
  if (outcomes.length === 0) {
    return (
      <div className="rounded-lg bg-base-900/60 p-2 text-center text-[11px] text-slate-600">{label} unavailable</div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {outcomes.map((o) => (
        <button
          key={o.name + (o.point ?? "")}
          type="button"
          onClick={() => onPick(o.name, o.price, o.point)}
          className="rounded-lg bg-base-900 px-2 py-2 text-center transition hover:bg-base-700"
        >
          <p className="truncate text-[11px] font-semibold text-slate-300">
            {o.name}
            {o.point !== undefined ? ` ${o.point > 0 ? "+" : ""}${o.point}` : ""}
          </p>
          <p className="num text-sm font-black text-volt">{o.price.toFixed(2)}</p>
        </button>
      ))}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "text-slate-400",
  WON: "text-win",
  LOST: "text-loss",
  PUSHED: "text-slate-400",
  VOIDED: "text-slate-600",
};

function MyBetRow({ bet }: { bet: MyBet }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/5 bg-base-800/60 p-3.5">
      <div>
        <p className="text-sm font-bold text-white">
          {bet.selection}
          {bet.line ? ` ${bet.line > 0 ? "+" : ""}${bet.line}` : ""}
          <span className="ml-2 text-[11px] font-normal text-slate-500">
            {MARKET_LABEL[bet.market as Selection["market"]] ?? bet.market}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {bet.awayTeam} @ {bet.homeTeam} · {fmtTime(bet.commenceTime)}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-sm font-bold text-white">
          {formatCents(bet.stakeCents)} @ {bet.priceDecimal.toFixed(2)}
        </p>
        <p className={`text-[11px] font-bold uppercase ${STATUS_STYLE[bet.status] ?? "text-slate-400"}`}>
          {bet.status === "PENDING" ? "Pending" : bet.status.toLowerCase()}
          {bet.payoutCents !== null && bet.status === "WON" ? ` · ${formatCents(bet.payoutCents)}` : ""}
        </p>
      </div>
    </div>
  );
}

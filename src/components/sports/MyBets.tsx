"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatCents } from "@/lib/money";
import { selectionLabel } from "@/lib/sports/meta";
import type { MyBet, MyBetLeg } from "@/lib/sports/types";
import { formatKickoff } from "@/components/sports/StartTime";
import { eventHref } from "@/components/sports/LeaguePanel";

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-white/10 text-slate-200" },
  WON: { label: "Won", cls: "bg-win/15 text-win" },
  LOST: { label: "Lost", cls: "bg-loss/15 text-loss" },
  PUSHED: { label: "Push", cls: "bg-white/10 text-slate-300" },
  VOID: { label: "Void", cls: "bg-white/10 text-slate-400" },
};

function LegStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    WON: "bg-win text-[#062012]",
    LOST: "bg-loss text-white",
    PUSHED: "bg-slate-500 text-white",
    VOID: "bg-slate-600 text-white",
    PENDING: "border border-white/25 text-transparent",
  };
  const glyph = status === "WON" ? "✓" : status === "LOST" ? "✕" : status === "PENDING" ? "·" : "–";
  return (
    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-black ${map[status] ?? map.PENDING}`}>
      {glyph}
    </span>
  );
}

function Leg({ leg }: { leg: MyBetLeg }) {
  const scored = leg.homeScore !== null && leg.awayScore !== null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <LegStatus status={leg.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-white">{selectionLabel(leg.market, leg.selection, leg.point)}</p>
        <Link href={eventHref({ sportKey: leg.sportKey, id: leg.eventId })} className="block truncate text-[12px] text-slate-400 hover:text-white">
          {leg.homeTeam} vs {leg.awayTeam}
          {scored ? ` · ${leg.homeScore}–${leg.awayScore}` : ` · ${formatKickoff(leg.commenceTime)}`}
        </Link>
      </div>
      <span className="num shrink-0 text-[14px] font-bold text-[#9d7aff]">{leg.priceDecimal.toFixed(2)}</span>
    </div>
  );
}

export default function MyBets() {
  const { status } = useSession();
  const [filter, setFilter] = useState<"active" | "settled">("active");
  const [bets, setBets] = useState<MyBet[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    setBets(null);
    fetch(`/api/sports/bet?status=${filter}`)
      .then((r) => r.json())
      .then((d) => setBets(d.bets ?? []))
      .catch(() => setBets([]));
  }, [filter, status]);

  if (status === "unauthenticated") {
    return (
      <div className="rounded-2xl bg-[#1a1c23] px-6 py-14 text-center">
        <p className="text-[15px] font-bold text-white">Log in to see your bets</p>
        <Link href="/login?callbackUrl=/sports?tab=mybets" className="btn-primary mt-4 inline-flex px-6 py-2.5 text-sm">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl bg-[#1a1c23] p-1">
        {(["active", "settled"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg px-5 py-2 text-[14px] font-bold capitalize transition-colors ${
              filter === f ? "bg-[#2e323c] text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {bets === null && (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-[#1a1c23]" />
          ))}
        </div>
      )}

      {bets && bets.length === 0 && (
        <div className="rounded-2xl bg-[#1a1c23] px-6 py-14 text-center">
          <p className="text-[15px] font-bold text-white">{filter === "active" ? "No open bets" : "No settled bets yet"}</p>
          <p className="mt-1 text-[13px] text-slate-400">Pick some odds and your bets will show up here.</p>
        </div>
      )}

      {bets && bets.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {bets.map((b) => {
            const st = STATUS[b.status] ?? STATUS.PENDING;
            const potential = Math.round(b.stakeCents * b.priceDecimal);
            return (
              <article key={b.id} className="rounded-2xl bg-[#1a1c23] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-black text-white">
                    {b.kind === "MULTI" ? `${b.legs.length}-Leg Multi` : "Single"}
                  </span>
                  <span className="text-[12px] text-slate-500">
                    {new Date(b.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <span className={`ml-auto rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-2 divide-y divide-white/[0.06] rounded-xl bg-[#23262e] px-3">
                  {b.legs.map((l) => (
                    <Leg key={l.id} leg={l} />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                  <div>
                    <p className="text-slate-500">Stake</p>
                    <p className="num font-bold text-white">{formatCents(b.stakeCents)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Odds</p>
                    <p className="num font-bold text-[#9d7aff]">{b.priceDecimal.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-500">{b.status === "PENDING" ? "To return" : "Returned"}</p>
                    <p className={`num font-black ${b.status === "WON" ? "text-win" : b.status === "LOST" ? "text-slate-400" : "text-white"}`}>
                      {formatCents(b.status === "PENDING" ? potential : (b.payoutCents ?? 0))}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

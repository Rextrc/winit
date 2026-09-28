"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { useSlip } from "@/components/sports/SlipProvider";
import { IconClose } from "@/components/Icons";
import { formatCents, parseAmountToCents } from "@/lib/money";
import { marketLabel, selectionLabel } from "@/lib/sports/meta";
import { legId, type SlipLeg } from "@/lib/sports/types";

const MAX_MULTI_PRICE = 1000;
const QUICK = ["10", "50", "100", "500"];

type Placed = { count: number; stakeCents: number };

function StakeInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#0c0d10] px-3 py-2 focus-within:border-brand/60">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-win text-[11px] font-black text-[#062012]">$</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        autoFocus={autoFocus}
        aria-label="Stake"
        className="num w-full min-w-0 bg-transparent text-[14px] font-bold text-white outline-none"
      />
    </label>
  );
}

function LegCard({ leg, children }: { leg: SlipLeg; children?: React.ReactNode }) {
  const slip = useSlip();
  const id = legId(leg);
  const moved = slip.moved[id];
  const started = new Date(leg.commenceTime).getTime() <= Date.now();

  return (
    <div className={`rounded-xl bg-[#23262e] p-3 ${started ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {marketLabel(leg.market, leg.group)}
          </p>
          <p className="mt-0.5 truncate text-[14px] font-bold text-white">{selectionLabel(leg.market, leg.name, leg.point)}</p>
          <p className="mt-0.5 truncate text-[12px] text-slate-400">
            {leg.homeTeam} vs {leg.awayTeam}
          </p>
          {started && <p className="mt-1 text-[11px] font-bold text-loss">Started — remove to continue</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`num text-[15px] font-bold ${
              moved === "up" ? "text-win" : moved === "down" ? "text-loss" : "text-[#9d7aff]"
            }`}
          >
            {moved === "up" ? "▲ " : moved === "down" ? "▼ " : ""}
            {leg.price.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={() => slip.remove(id)}
            className="rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-white"
            aria-label="Remove selection"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function BetSlip() {
  const slip = useSlip();
  const { status } = useSession();
  const pathname = usePathname();
  const { balanceCents, applyResult } = useWallet();
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Placed | null>(null);

  const { legs, mode } = slip;
  const signedOut = status === "unauthenticated";
  const distinctEvents = new Set(legs.map((l) => l.eventId)).size === legs.length;
  const multiAllowed = legs.length >= 2 && distinctEvents;
  const anyStarted = legs.some((l) => new Date(l.commenceTime).getTime() <= Date.now());
  const anyMoved = Object.keys(slip.moved).length > 0;

  const totals = useMemo(() => {
    if (mode === "multi") {
      const price = Math.min(MAX_MULTI_PRICE, Math.round(legs.reduce((p, l) => p * l.price, 1) * 100) / 100);
      const stake = parseAmountToCents(slip.multiStake) ?? 0;
      return { price, stake, payout: Math.round(stake * price) };
    }
    let stake = 0;
    let payout = 0;
    for (const l of legs) {
      const s = parseAmountToCents(slip.stakes[legId(l)] ?? "") ?? 0;
      stake += s;
      payout += Math.round(s * l.price);
    }
    return { price: null, stake, payout };
  }, [legs, mode, slip.multiStake, slip.stakes]);

  const place = async () => {
    setError(null);
    if (mode === "multi" && !multiAllowed) {
      setError("A multi needs two or more selections from different matches.");
      return;
    }
    const stakes = legs.map((l) => parseAmountToCents(slip.stakes[legId(l)] ?? "") ?? 0);
    if (mode === "single" ? stakes.some((s) => s <= 0) : totals.stake <= 0) {
      setError("Enter a stake for every bet.");
      return;
    }

    setPlacing(true);
    try {
      const body = {
        mode,
        legs: legs.map(({ eventId, sportKey, market, name, point, price }) => ({ eventId, sportKey, market, name, point, price })),
        ...(mode === "multi" ? { stakeCents: totals.stake } : { stakes }),
      };
      const res = await fetch("/api/sports/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "ODDS_CHANGED") slip.applyPrices(data.changed);
        setError(data.error ?? "Couldn't place that bet.");
        return;
      }
      applyResult(data.balanceCents);
      setPlaced({ count: data.betIds.length, stakeCents: totals.stake });
      slip.clear();
    } catch {
      setError("Network error — nothing was placed.");
    } finally {
      setPlacing(false);
    }
  };

  const dismissPlaced = () => {
    setPlaced(null);
    if (slip.legs.length === 0) slip.setOpen(false);
  };

  if (!slip.open) {
    if (legs.length === 0) return null;
    return (
      <button
        type="button"
        onClick={() => slip.setOpen(true)}
        className="fixed bottom-4 right-4 z-[45] flex items-center gap-2.5 rounded-full bg-brand py-3 pl-5 pr-3 text-sm font-bold text-white shadow-[0_12px_30px_-8px_rgba(124,58,255,0.8)] hover:bg-brand-400"
      >
        Bet Slip
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-white px-1.5 text-[12px] font-black text-brand">
          {legs.length}
        </span>
      </button>
    );
  }

  return (
    <aside className="fixed inset-x-0 bottom-0 z-[45] flex max-h-[85vh] flex-col rounded-t-2xl border border-white/10 bg-[#1a1c23] shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.9)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-h-[78vh] sm:w-[380px] sm:rounded-2xl xl:sticky xl:bottom-auto xl:right-auto xl:top-20 xl:z-auto xl:max-h-[calc(100vh-6rem)] xl:w-auto xl:self-start xl:shadow-none">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3.5">
        <h2 className="text-[15px] font-black text-white">Bet Slip</h2>
        {legs.length > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-black text-white">
            {legs.length}
          </span>
        )}
        {legs.length > 0 && (
          <button type="button" onClick={slip.clear} className="ml-auto text-[12px] font-semibold text-slate-400 hover:text-white">
            Clear all
          </button>
        )}
        <button
          type="button"
          onClick={() => slip.setOpen(false)}
          className={`${legs.length > 0 ? "" : "ml-auto"} rounded-md p-1 text-slate-400 hover:bg-white/5 hover:text-white`}
          aria-label="Close bet slip"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      {placed ? (
        <div className="px-5 py-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-win/15 text-2xl text-win">✓</div>
          <p className="mt-3 text-[15px] font-black text-white">
            {placed.count > 1 ? `${placed.count} bets placed` : "Bet placed"}
          </p>
          <p className="mt-1 text-[13px] text-slate-400">{formatCents(placed.stakeCents)} staked. Settles on the final score.</p>
          <div className="mt-5 flex gap-2">
            <button type="button" onClick={dismissPlaced} className="btn-ghost flex-1 py-2.5 text-sm">
              Keep betting
            </button>
            <Link href="/sports?tab=mybets" onClick={dismissPlaced} className="btn-primary flex-1 py-2.5 text-sm">
              My Bets
            </Link>
          </div>
        </div>
      ) : legs.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[14px] font-bold text-white">Your bet slip is empty</p>
          <p className="mt-1 text-[13px] text-slate-400">Tap any odds to add a selection.</p>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <div className="seg grid-cols-2">
              <button type="button" onClick={() => slip.setMode("single")} className={mode === "single" ? "seg-item-on" : "seg-item"}>
                Single{legs.length > 1 ? `s (${legs.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => slip.setMode("multi")}
                disabled={!multiAllowed}
                title={!multiAllowed ? "Pick two or more selections from different matches" : undefined}
                className={mode === "multi" ? "seg-item-on" : "seg-item"}
              >
                Multi
              </button>
            </div>
            {legs.length >= 2 && !distinctEvents && (
              <p className="mt-2 text-[11px] text-slate-500">Two picks from the same match can only go as singles.</p>
            )}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {legs.map((leg) => {
              const id = legId(leg);
              const stake = parseAmountToCents(slip.stakes[id] ?? "") ?? 0;
              return (
                <LegCard key={id} leg={leg}>
                  {mode === "single" && (
                    <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
                      <StakeInput value={slip.stakes[id] ?? ""} onChange={(v) => slip.setStake(id, v)} />
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">To win</p>
                        <p className="num text-[13px] font-bold text-win">{formatCents(Math.round(stake * leg.price))}</p>
                      </div>
                    </div>
                  )}
                </LegCard>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-white/[0.06] px-4 py-3.5">
            {mode === "multi" && (
              <>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-slate-400">{legs.length}-leg multi odds</span>
                  <span className="num font-black text-[#9d7aff]">{totals.price?.toFixed(2)}</span>
                </div>
                <StakeInput value={slip.multiStake} onChange={slip.setMultiStake} />
                <div className="flex gap-1.5">
                  {QUICK.map((q) => (
                    <button key={q} type="button" onClick={() => slip.setMultiStake(`${q}.00`)} className="btn-chip flex-1">
                      {q}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="space-y-1 text-[13px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Total stake</span>
                <span className="num font-bold text-white">{formatCents(totals.stake)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Potential payout</span>
                <span className="num font-black text-win">{formatCents(totals.payout)}</span>
              </div>
            </div>

            {error && <p className="text-[12px] font-semibold text-loss">{error}</p>}

            {signedOut ? (
              <Link href={`/login?callbackUrl=${encodeURIComponent(pathname ?? "/sports")}`} className="btn-primary w-full py-3 text-[15px]">
                Log in to place bets
              </Link>
            ) : (
              <button
                type="button"
                onClick={place}
                disabled={placing || anyStarted || (balanceCents !== null && totals.stake > balanceCents)}
                className="btn-primary w-full py-3 text-[15px]"
              >
                {placing
                  ? "Placing…"
                  : balanceCents !== null && totals.stake > balanceCents
                    ? "Not enough balance"
                    : anyMoved
                      ? "Accept odds & place bet"
                      : `Place bet${mode === "single" && legs.length > 1 ? "s" : ""}`}
              </button>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { formatCents } from "@/lib/money";
import {
  MAX_LEVEL,
  MAX_REBIRTHS,
  STAGES,
  UNLOCK_BLURBS,
  UNLOCK_LABELS,
  UNLOCK_LEVELS,
  maxBetCents,
  rebirthMultiplier,
  totalLadderXp,
  type Unlock,
} from "@/lib/progression";

const UNLOCK_ORDER: Unlock[] = ["TURBO", "BUY_FREE", "BUY_SUPER", "REBIRTH"];

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`num mt-1 text-lg font-black text-white ${tone}`}>{value}</p>
    </div>
  );
}

export default function LifePanel() {
  const { progression, refresh, loading } = useWallet();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rebirth = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/rebirth", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't rebirth right now.");
        return;
      }
      setMessage(
        `Rebirth ${data.rebirths} complete. Table limits are now ×${rebirthMultiplier(data.rebirths)}${
          data.grantCents > 0 ? `, and your bankroll was topped up to ${formatCents(data.balanceCents)}.` : "."
        }`,
      );
      setConfirming(false);
      await refresh();
    } catch {
      setError("Network error — nothing changed.");
    } finally {
      setWorking(false);
    }
  }, [refresh]);

  if (loading && !progression) {
    return <p className="text-sm text-slate-500">Loading your career…</p>;
  }
  if (!progression) {
    return <p className="text-sm text-slate-500">Sign in to start a career.</p>;
  }

  const p = progression;
  const atCeiling = p.level >= MAX_LEVEL;
  const nextLimit = atCeiling ? null : maxBetCents(p.level + 1, p.rebirths);
  const nextRebirthMultiplier = rebirthMultiplier(Math.min(p.rebirths + 1, MAX_REBIRTHS));

  return (
    <div className="space-y-4">
      {/* headline */}
      <div className="panel overflow-hidden">
        <div className="border-b border-white/5 bg-gradient-to-r from-volt/10 via-transparent to-transparent p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-volt">
                Level {p.level} of {MAX_LEVEL}
                {p.rebirths > 0 && ` · Rebirth ${p.rebirths}`}
              </p>
              <h2 className="font-display mt-1 text-3xl font-black tracking-tight text-white">
                {p.stage.title}
              </h2>
              <p className="mt-1 max-w-md text-[13px] leading-relaxed text-slate-400">{p.stage.blurb}</p>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Your table limit
              </p>
              <p className="num text-2xl font-black text-white">{formatCents(p.maxBetCents)}</p>
              {nextLimit !== null && (
                <p className="num mt-0.5 text-[11px] text-slate-500">
                  {formatCents(nextLimit)} at level {p.level + 1}
                </p>
              )}
            </div>
          </div>

          {/* xp bar */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
              <span className="font-bold uppercase tracking-wide text-slate-500">
                {atCeiling ? "Ladder complete" : `Next level in ${(p.xpToNext - p.xp).toLocaleString()} XP`}
              </span>
              <span className="num text-slate-400">
                {atCeiling ? "MAX" : `${p.xp.toLocaleString()} / ${p.xpToNext.toLocaleString()}`}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-volt transition-[width] duration-700"
                style={{ width: `${Math.round(p.progress * 100)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              XP comes from the amount you stake, never from what you win — one XP per 1.00 wagered,
              multiplied by ×{p.xpMultiplier.toFixed(1)} from your rebirths. The whole ladder costs{" "}
              {totalLadderXp().toLocaleString()} XP.
            </p>
          </div>
        </div>
      </div>

      {/* career stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Lifetime staked" value={formatCents(p.lifetimeWageredCents)} />
        <Stat label="Lifetime returned" value={formatCents(p.lifetimeWonCents)} />
        <Stat label="Biggest single win" value={formatCents(p.biggestWinCents)} tone="text-win" />
        <Stat
          label="Best multiplier"
          value={p.bestMultiplier > 0 ? `×${p.bestMultiplier.toFixed(2)}` : "—"}
          tone="text-volt"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* career track */}
        <div className="panel p-6">
          <h3 className="text-[13px] font-black tracking-tight text-white">Career track</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Every band renames your account and raises the ceiling on what you can put on one bet.
          </p>

          <ol className="mt-4 space-y-1.5">
            {STAGES.map((s) => {
              const reached = p.level >= s.from;
              const current = p.stage.from === s.from;
              return (
                <li
                  key={s.from}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
                    current
                      ? "border-volt bg-volt/10"
                      : reached
                        ? "border-white/10"
                        : "border-white/5 opacity-55"
                  }`}
                >
                  <span
                    className={`num grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-black ${
                      current ? "bg-volt text-base-900" : reached ? "bg-white/10 text-slate-200" : "bg-white/5 text-slate-500"
                    }`}
                  >
                    {s.from}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-slate-100">{s.title}</span>
                    <span className="block truncate text-[11px] text-slate-500">{s.blurb}</span>
                  </span>
                  <span className="num shrink-0 text-[11px] font-bold text-slate-400">
                    {formatCents(maxBetCents(s.from, p.rebirths))}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="space-y-4">
          {/* unlocks */}
          <div className="panel p-6">
            <h3 className="text-[13px] font-black tracking-tight text-white">Unlocks</h3>
            <ul className="mt-3 space-y-2">
              {UNLOCK_ORDER.map((u) => {
                const open = p.unlocked[u];
                return (
                  <li
                    key={u}
                    className={`rounded-xl border px-3 py-2.5 ${
                      open ? "border-volt/40 bg-volt/5" : "border-white/5 opacity-60"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-bold text-slate-100">{UNLOCK_LABELS[u]}</span>
                      <span
                        className={`num shrink-0 text-[11px] font-black ${open ? "text-volt" : "text-slate-500"}`}
                      >
                        {open ? "Unlocked" : `Level ${UNLOCK_LEVELS[u]}`}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{UNLOCK_BLURBS[u]}</p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Anything earned in a past life stays unlocked — a rebirth resets the ladder, not your
              know-how.
            </p>
          </div>

          {/* rebirth */}
          <div
            className={`panel p-6 ${p.canRebirth ? "border-fuchsia-400/40 bg-fuchsia-500/5" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[13px] font-black tracking-tight text-white">Rebirth</h3>
              <span className="num text-[11px] font-bold text-fuchsia-300">
                {p.rebirths} / {MAX_REBIRTHS} taken
              </span>
            </div>

            <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
              Hand back your level and start the ladder again with a permanent{" "}
              <span className="font-bold text-fuchsia-200">×{nextRebirthMultiplier}</span> on every
              table limit you will ever have, and{" "}
              <span className="font-bold text-fuchsia-200">
                ×{(1 + 0.5 * (p.rebirths + 1)).toFixed(1)}
              </span>{" "}
              XP so the climb back is faster.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-slate-400">
              Your balance is never reduced. The fresh stake is granted as a floor, so if you arrive
              rich you keep what you have — the cost of a rebirth is the level reset, not the money.
            </p>

            <dl className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
              {[
                ["Level after rebirth", "1"],
                ["Table limit at level 1", formatCents(maxBetCents(1, p.rebirths + 1))],
                ["Table limit at level 50", formatCents(maxBetCents(MAX_LEVEL, p.rebirths + 1))],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt>
                  <dd className="num text-[12px] font-bold text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-4">
              {!p.canRebirth ? (
                <p className="text-[12px] font-semibold text-slate-500">
                  {p.rebirths >= MAX_REBIRTHS
                    ? "You have taken every rebirth there is."
                    : `Reach level ${MAX_LEVEL} to unlock rebirth — ${MAX_LEVEL - p.level} levels to go.`}
                </p>
              ) : confirming ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={rebirth}
                    disabled={working}
                    className="btn-primary flex-1 py-2.5 disabled:opacity-60"
                  >
                    {working ? "Starting over…" : "Yes — start a new life"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={working}
                    className="btn-chip px-4"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="btn-primary w-full py-2.5"
                >
                  Rebirth — reset to level 1 for ×{nextRebirthMultiplier} limits
                </button>
              )}

              {message && <p className="mt-2 text-[12px] font-semibold text-win">{message}</p>}
              {error && <p className="mt-2 text-[12px] font-semibold text-loss">{error}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import KenoGem from "@/components/games/KenoGem";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  KENO_MAX_PICKS,
  KENO_POOL,
  KENO_RISKS,
  type KenoRisk,
  kenoExactRtp,
  kenoPaytable,
} from "@/lib/games/originals";

type Resp = {
  drawn: number[];
  hits: number;
  multiplier: number;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  risk: KenoRisk;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const RISK_LABEL: Record<KenoRisk, string> = {
  classic: "Classic",
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Each risk keeps its own colour so the selected one reads at a glance. */
const RISK_TONE: Record<KenoRisk, { text: string; active: string }> = {
  classic: { text: "text-volt", active: "bg-volt text-white" },
  low: { text: "text-win", active: "bg-win text-base-900" },
  medium: { text: "text-amber-400", active: "bg-amber-400 text-base-900" },
  high: { text: "text-loss", active: "bg-loss text-white" },
};

export default function KenoGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [mode, setMode] = useState<"manual" | "auto">("manual");
  const [risk, setRisk] = useState<KenoRisk>("classic");
  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  // --- auto mode ----------------------------------------------------------
  const [autoCount, setAutoCount] = useState("10");
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoDone, setAutoDone] = useState(0);
  const [autoNetCents, setAutoNetCents] = useState(0);
  // A ref as well as state: the loop reads it between rounds, and state alone
  // would be stale inside the closure.
  const stopRef = useRef(false);

  const table = useMemo(
    () => (picks.length > 0 ? kenoPaytable(picks.length, risk) : []),
    [picks.length, risk],
  );

  const toggle = useCallback(
    (n: number) => {
      if (busy) return;
      setLast(null);
      setPicks((p) => {
        if (p.includes(n)) return p.filter((x) => x !== n);
        if (p.length >= KENO_MAX_PICKS) return p;
        return [...p, n].sort((a, b) => a - b);
      });
    },
    [busy],
  );

  const clear = useCallback(() => {
    if (busy) return;
    setPicks([]);
    setLast(null);
  }, [busy]);

  /** Fills the board to the maximum with numbers drawn uniformly at random. */
  const autoPick = useCallback(() => {
    if (busy) return;
    const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    setLast(null);
    setPicks(pool.slice(0, KENO_MAX_PICKS).sort((a, b) => a - b));
  }, [busy]);

  /** One round. Returns the settled net, or null if it did not resolve. */
  const round = useCallback(async (): Promise<number | null> => {
    const res = await fetch("/api/games/keno", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betCents: effectiveBet, picks, risk }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't place that bet.");
      return null;
    }
    const payload = data as Resp;
    setLast(payload);
    applyResult(payload.balanceCents, payload.netCents);
    applyProgress(payload.progress);
    pushFlash(game.name, payload.netCents, `${payload.hits}/${picks.length} hits`);
    setFeedVersion((v) => v + 1);
    return payload.netCents;
  }, [effectiveBet, picks, risk, applyResult, applyProgress, pushFlash, game.name]);

  const ready = !betError && picks.length > 0 && effectiveBet > 0;

  const play = useCallback(async () => {
    if (busy) return;
    if (!ready) {
      setError(betError ?? (picks.length === 0 ? "Pick at least one number." : "Set a stake first."));
      return;
    }
    setBusy(true);
    setError(null);
    setLast(null);
    try {
      await round();
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, ready, betError, picks.length, round]);

  const runAuto = useCallback(async () => {
    if (busy || autoRunning) return;
    if (!ready) {
      setError(betError ?? (picks.length === 0 ? "Pick at least one number." : "Set a stake first."));
      return;
    }
    const target = Math.max(0, Math.floor(Number(autoCount) || 0));
    stopRef.current = false;
    setAutoRunning(true);
    setBusy(true);
    setError(null);
    setAutoDone(0);
    setAutoNetCents(0);

    try {
      // target 0 means "until stopped" — the Stop button is the only exit.
      for (let i = 0; target === 0 || i < target; i += 1) {
        if (stopRef.current) break;
        const net = await round();
        // A refused bet (out of balance, career over, table closed) ends the
        // run rather than hammering the endpoint with the same failure.
        if (net === null) break;
        setAutoDone((d) => d + 1);
        setAutoNetCents((t) => t + net);
        await new Promise((r) => setTimeout(r, 420));
      }
    } catch {
      setError("Network error — the run stopped.");
    } finally {
      stopRef.current = false;
      setAutoRunning(false);
      setBusy(false);
    }
  }, [busy, autoRunning, ready, betError, picks.length, autoCount, round]);

  // A navigation away mid-run must not leave the loop firing bets.
  useEffect(() => () => { stopRef.current = true; }, []);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Draw",
    ready,
    busy,
    run: play,
    note:
      picks.length > 0
        ? `${picks.length} picks · ${RISK_LABEL[risk]} · ${(kenoExactRtp(picks.length, risk) * 100).toFixed(2)}% RTP`
        : "Pick numbers on the board.",
  });

  const drawnSet = useMemo(() => new Set(last?.drawn ?? []), [last]);
  const showingResult = last !== null;
  const won = last !== null && last.netCents > 0;

  // ---------------------------------------------------------------- canvas
  const canvas = (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative">
        <div className="grid grid-cols-8 gap-1.5 sm:gap-2.5">
          {Array.from({ length: KENO_POOL }, (_, i) => i + 1).map((n) => {
            const picked = picks.includes(n);
            const drawn = drawnSet.has(n);
            const hit = picked && drawn;
            const missedDraw = drawn && !picked;

            return (
              <button
                key={n}
                type="button"
                onClick={() => toggle(n)}
                disabled={busy}
                aria-pressed={picked}
                className={`num relative grid aspect-square place-items-center rounded-2xl text-lg font-black transition-all duration-150 disabled:cursor-not-allowed sm:text-xl ${
                  hit
                    ? "bg-win/15 text-win shadow-[0_0_0_2px_rgba(46,230,184,0.55),0_0_22px_-4px_rgba(46,230,184,0.8)]"
                    : picked
                      ? "bg-win/10 text-win shadow-[0_0_0_2px_rgba(46,230,184,0.4)]"
                      : missedDraw
                        ? "bg-base-900 text-loss/80"
                        : "bg-base-700/70 text-slate-500 hover:-translate-y-0.5 hover:bg-base-600/70 hover:text-slate-300"
                }`}
              >
                {picked ? (
                  <>
                    <KenoGem
                      className={`h-[68%] w-[68%] ${hit ? "text-win" : "text-win/70"} ${
                        hit ? "animate-pop-in" : ""
                      }`}
                    />
                    <span
                      className={`absolute inset-0 grid place-items-center ${
                        hit ? "text-base-900" : "text-base-900/90"
                      }`}
                    >
                      {n}
                    </span>
                  </>
                ) : (
                  n
                )}
              </button>
            );
          })}
        </div>

        {/* The result card, floated over the board like a dealt ticket. */}
        {showingResult && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            {/* Green is reserved for an actual win. A losing round gets a muted
                card, because a bright green banner over a negative number is
                the kind of small lie that makes a casino feel rigged. */}
            <div
              className={`animate-pop-in overflow-hidden rounded-2xl shadow-2xl ring-2 ${
                won ? "ring-win" : "ring-white/15"
              }`}
            >
              <p
                className={`num px-8 py-3 text-center text-3xl font-black ${
                  won ? "bg-win text-base-900" : "bg-base-600 text-slate-300"
                }`}
              >
                ×{last.multiplier.toFixed(2)}
              </p>
              <p className="num flex items-center justify-center gap-3 bg-base-900 px-8 py-2.5 text-sm font-black">
                <span className={won ? "text-win" : "text-loss"}>
                  {formatSignedCents(last.netCents)}
                </span>
                <span className="flex items-center gap-1.5 text-slate-300">
                  <KenoGem className={`h-4 w-4 ${won ? "text-win" : "text-slate-500"}`} />
                  {last.hits}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* The paytable as a strip under the board: one cell per hit count. */}
      {picks.length > 0 && (
        <div
          className="mt-2.5 grid gap-1.5 sm:gap-2.5"
          style={{ gridTemplateColumns: `repeat(${Math.min(table.length, 6)}, minmax(0, 1fr))` }}
        >
          {table.map((m, h) => {
            const landed = showingResult && last.hits === h;
            return (
              <div
                key={h}
                className={`rounded-xl px-2 py-2 text-center transition ${
                  landed
                    ? m > 0
                      ? "bg-win/20 ring-1 ring-win"
                      : "bg-base-600 ring-1 ring-white/20"
                    : "bg-base-700/60"
                }`}
              >
                <p
                  className={`num truncate text-[13px] font-black ${
                    landed ? (m > 0 ? "text-win" : "text-slate-200") : m > 0 ? "text-slate-300" : "text-slate-600"
                  }`}
                >
                  {m > 0 ? `${m}×` : "0.00×"}
                </p>
                <p className="num mt-0.5 flex items-center justify-center gap-1 text-[11px] font-bold text-slate-500">
                  {h}×
                  <KenoGem className="h-3 w-3 text-win/70" />
                </p>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="mt-3 text-center text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  // ----------------------------------------------------------------- panel
  const panel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-base-900/80 p-1">
        {(["manual", "auto"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={autoRunning}
            onClick={() => setMode(m)}
            className={`rounded-xl py-2.5 text-sm font-bold capitalize transition disabled:opacity-50 ${
              mode === m ? "bg-base-600 text-white shadow" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <BetControls disabled={busy} />

      <div>
        <p className="label">Risk</p>
        <div className="grid grid-cols-4 gap-1.5">
          {KENO_RISKS.map((r) => {
            const tone = RISK_TONE[r];
            const on = risk === r;
            return (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => {
                  setRisk(r);
                  setLast(null);
                }}
                className={`rounded-xl py-2.5 text-[12px] font-black transition disabled:opacity-50 ${
                  on ? tone.active : `bg-base-700/70 ${tone.text} hover:bg-base-600/70`
                }`}
              >
                {RISK_LABEL[r]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-ghost py-2.5 text-xs" onClick={autoPick} disabled={busy}>
          Auto pick
        </button>
        <button
          type="button"
          className="btn-ghost py-2.5 text-xs"
          onClick={clear}
          disabled={busy || picks.length === 0}
        >
          Clear table
        </button>
      </div>

      {mode === "auto" && (
        <div className="space-y-2 rounded-2xl border border-white/5 bg-base-900/50 p-3">
          <label className="label mb-0" htmlFor="keno-auto-count">
            Number of bets <span className="normal-case text-slate-600">(0 = until stopped)</span>
          </label>
          <input
            id="keno-auto-count"
            className="field num"
            inputMode="numeric"
            value={autoCount}
            disabled={autoRunning}
            onChange={(e) => setAutoCount(e.target.value.replace(/[^\d]/g, ""))}
          />
          {(autoRunning || autoDone > 0) && (
            <p className="num flex items-center justify-between text-[12px]">
              <span className="text-slate-400">{autoDone} played</span>
              <span className={autoNetCents >= 0 ? "font-black text-win" : "font-black text-loss"}>
                {formatSignedCents(autoNetCents)}
              </span>
            </p>
          )}
        </div>
      )}

      {mode === "manual" ? (
        <button
          type="button"
          onClick={play}
          disabled={busy || picks.length === 0}
          className="btn-primary w-full py-3.5 text-base shadow-volt"
        >
          {busy ? "Drawing…" : `Bet ${formatCents(effectiveBet)}`}
        </button>
      ) : autoRunning ? (
        <button
          type="button"
          onClick={() => { stopRef.current = true; }}
          className="btn-ghost w-full py-3.5 text-base font-black text-loss"
        >
          Stop autobet
        </button>
      ) : (
        <button
          type="button"
          onClick={runAuto}
          disabled={busy || picks.length === 0}
          className="btn-primary w-full py-3.5 text-base shadow-volt"
        >
          Start autobet
        </button>
      )}

      <p className="num text-center text-[11px] text-slate-500">
        {picks.length}/{KENO_MAX_PICKS} picked
        {picks.length > 0 && ` · ${(kenoExactRtp(picks.length, risk) * 100).toFixed(2)}% RTP`}
      </p>
    </div>
  );

  const rules = (
    <>
      <p>
        Ten numbers are drawn from a pool of {KENO_POOL} by shuffling the whole pool with a
        Fisher-Yates shuffle seeded from <code className="text-volt">crypto</code> and taking the
        first ten — an unbiased draw without replacement. Pick 1–{KENO_MAX_PICKS} numbers; how many of
        yours are drawn decides the payout.
      </p>
      <p>
        The paytable for each pick count is derived, not hand-written: pays rise geometrically from
        the minimum paying hit count, then the whole row is scaled so the exact hypergeometric
        expectation lands on 99% — and the published RTP is recomputed from the rounded numbers that
        actually get paid.
      </p>
      <p>
        Risk changes the shape of that table and nothing else. Low pays earlier and flatter; high
        pays nothing until you are nearly perfect and then pays enormously. Every level is rescaled
        back to the same 99%, so risk buys you variance, never a better or worse deal — and{" "}
        <code className="text-volt">npm run rtp</code> checks all four at all ten pick counts.
      </p>
    </>
  );

  return (
    <GameFrame
      game={game}
      engineKey="keno"
      feedVersion={feedVersion}
      canvas={canvas}
      panel={panel}
      rules={rules}
    />
  );
}

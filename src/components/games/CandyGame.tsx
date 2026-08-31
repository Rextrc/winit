"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import CandySymbol from "@/components/games/CandySymbol";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { UNLOCK_LEVELS } from "@/lib/progression";
import {
  BUY_FEATURE_PRICE_MULTIPLIER,
  BUY_FEATURE_SPINS,
  COLS,
  MULTIPLIER_TRAIL,
  ROWS,
  SYMBOL_NAMES,
  paytableRows,
  type CandyMode,
  type CandyRound,
  type CascadeStep,
  type Sym,
} from "@/lib/games/candy";
import type { ProgressUpdate } from "@/lib/ledger";

type RoundResponse = {
  round: CandyRound;
  netCents: number;
  balanceCents: number;
  progress: ProgressUpdate;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TIMING = {
  reveal: 420, // grid settles in
  hold: 650, // pause on a win before it tumbles away
  clear: 260, // winning cells fade out
  turboReveal: 90,
  turboHold: 140,
  turboClear: 80,
};

const blank = (): (Sym | null)[][] => Array.from({ length: COLS }, () => Array(ROWS).fill(null));

export default function CandyGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { balanceCents, progression, applyResult, applyProgress } = useWallet();

  const [grid, setGrid] = useState<(Sym | null)[][]>(blank);
  const [litCells, setLitCells] = useState<Set<string>>(new Set());
  const [clearing, setClearing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const [stepPay, setStepPay] = useState<{ payCents: number; multiplier: number } | null>(null);
  const [running, setRunning] = useState(0);
  const [bonusBadge, setBonusBadge] = useState<{ index: number; remaining: number } | null>(null);
  const [finished, setFinished] = useState<RoundResponse | null>(null);

  const runId = useRef(0);
  useEffect(() => () => void (runId.current += 1), []);

  const level = progression?.level ?? 1;
  const unlocked = progression?.unlocked;
  const turboUnlocked = unlocked?.TURBO ?? false;
  const buyUnlocked = unlocked?.BUY_FREE ?? false;
  const t = turbo && turboUnlocked ? { reveal: TIMING.turboReveal, hold: TIMING.turboHold, clear: TIMING.turboClear } : TIMING;

  const revealStep = useCallback(
    async (step: CascadeStep, token: number, timings: { reveal: number; hold: number; clear: number }) => {
      setGrid(step.grid);
      setLitCells(new Set());
      setClearing(new Set());
      await sleep(timings.reveal);
      if (runId.current !== token) return;

      if (step.clusters.length === 0) return;

      const cells = new Set<string>();
      for (const cl of step.clusters) for (const [c, r] of cl.cells) cells.add(`${c}-${r}`);
      setLitCells(cells);
      setStepPay({ payCents: step.payCents, multiplier: step.multiplier });
      await sleep(timings.hold);
      if (runId.current !== token) return;

      setClearing(cells);
      await sleep(timings.clear);
    },
    [],
  );

  const play = useCallback(
    async (mode: CandyMode) => {
      if (busy) return;
      if (betError || effectiveBet <= 0) {
        setError(betError ?? "Set a stake first.");
        return;
      }

      const token = (runId.current += 1);
      setBusy(true);
      setError(null);
      setFinished(null);
      setStepPay(null);
      setRunning(0);
      setBonusBadge(null);
      setLitCells(new Set());
      setClearing(new Set());

      let payload: RoundResponse;
      try {
        const res = await fetch("/api/games/slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ betCents: effectiveBet, mode }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (runId.current !== token) return;
          setError(data.error ?? "Couldn't place that bet.");
          setBusy(false);
          return;
        }
        payload = data as RoundResponse;
      } catch {
        if (runId.current !== token) return;
        setError("Network error — the bet was not placed.");
        setBusy(false);
        return;
      }

      if (runId.current !== token) return;

      const timings = turbo && turboUnlocked ? { reveal: TIMING.turboReveal, hold: TIMING.turboHold, clear: TIMING.turboClear } : TIMING;
      let total = 0;

      for (const block of payload.round.blocks) {
        if (runId.current !== token) return;
        if (block.kind === "BONUS") setBonusBadge({ index: block.index, remaining: block.spinsRemaining });

        for (const step of block.steps) {
          if (runId.current !== token) return;
          await revealStep(step, token, timings);
          if (runId.current !== token) return;
          total += step.payCents;
          setRunning(total);
        }
      }

      if (runId.current !== token) return;

      total += payload.round.blocks.reduce((s, b) => s + b.scatterPayCents, 0);
      setBonusBadge(null);
      setFinished(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, payload.round.summary);
      setFeedVersion((v) => v + 1);
      setBusy(false);
    },
    [busy, betError, effectiveBet, turbo, turboUnlocked, revealStep, applyResult, applyProgress, pushFlash, game.name],
  );

  const spin = useCallback(() => void play("SPIN"), [play]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Spin",
    ready: !betError && effectiveBet > 0,
    busy,
    run: spin,
    note: bonusBadge
      ? `Bonus spin ${bonusBadge.index} · ${bonusBadge.remaining} left`
      : `${COLS}×${ROWS} grid · min cluster 5`,
  });

  const canSpin = !busy && !betError && effectiveBet > 0 && (balanceCents ?? 0) >= effectiveBet;
  const buyPrice = BUY_FEATURE_PRICE_MULTIPLIER * effectiveBet;
  const canBuy = !busy && buyUnlocked && (balanceCents ?? 0) >= buyPrice;

  const currentMultiplier = stepPay?.multiplier ?? 1;

  const canvas = (
    <div className="mx-auto w-full max-w-2xl">
      {/* candy-machine backdrop, scoped to this canvas only */}
      <div className="relative overflow-hidden rounded-3xl border-4 border-[#ffe1f2]/20 bg-gradient-to-b from-[#3a1d5c] via-[#241238] to-[#150c22] p-3 shadow-[0_0_40px_-10px_rgba(232,68,164,0.45)] sm:p-4">
        {/* icing drip along the top */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-[radial-gradient(circle_at_10px_-4px,#fff_8px,transparent_9px),radial-gradient(circle_at_34px_-4px,#fff_8px,transparent_9px),radial-gradient(circle_at_58px_-4px,#fff_8px,transparent_9px)] bg-repeat-x opacity-90 [background-size:24px_16px]" />

        <div className="mb-2.5 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em]">
          <span className="text-fuchsia-200/80">
            {COLS}×{ROWS} cluster pays
          </span>
          {bonusBadge ? (
            <span className="animate-pop-in rounded-full bg-fuchsia-400 px-3 py-1 text-[10px] font-black text-[#2a1140] shadow">
              BONUS {bonusBadge.index} · {bonusBadge.remaining} left
            </span>
          ) : (
            <span className="num rounded-full bg-white/10 px-2.5 py-1 text-white/70">
              ×{currentMultiplier} trail
            </span>
          )}
        </div>

        <div
          className="grid gap-1 sm:gap-1.5"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: COLS }, (_, c) =>
            Array.from({ length: ROWS }, (_, r) => {
              const key = `${c}-${r}`;
              const sym = grid[c]?.[r] ?? null;
              const lit = litCells.has(key);
              const isClearing = clearing.has(key);
              return (
                <div
                  key={key}
                  className={`relative aspect-square rounded-lg border p-1 transition-all duration-200 ${
                    lit
                      ? "border-fuchsia-300 bg-fuchsia-400/20 shadow-[0_0_16px_2px_rgba(240,110,220,0.55)] scale-[1.08]"
                      : "border-white/10 bg-white/[0.04]"
                  } ${isClearing ? "opacity-0 scale-50" : "opacity-100"} ${
                    litCells.size > 0 && !lit ? "opacity-40" : ""
                  }`}
                >
                  {sym && <CandySymbol symbol={sym} className="h-full w-full drop-shadow" />}
                </div>
              );
            }),
          )}
        </div>
      </div>

      {/* narration */}
      <div className="mt-4 min-h-[80px] text-center">
        {busy && !finished && !stepPay && <p className="text-sm text-fuchsia-200/70">Dropping candy…</p>}

        {stepPay && !finished && stepPay.payCents > 0 && (
          <div key={running} className="animate-pop-in">
            <p className="num-win text-3xl">{formatCents(stepPay.payCents)}</p>
            <p className="num mt-1 text-[12px] text-fuchsia-200/70">×{stepPay.multiplier} trail multiplier</p>
            {running > stepPay.payCents && (
              <p className="num mt-0.5 text-[11px] text-slate-500">Round so far {formatCents(running)}</p>
            )}
          </div>
        )}

        {finished && (
          <div className="animate-pop-in">
            <p className={finished.netCents > 0 ? "num-win text-4xl" : "num-loss text-3xl"}>
              {formatSignedCents(finished.netCents)}
            </p>
            <p className="mt-1 text-[12px] text-slate-400">{finished.round.summary}</p>
            {finished.progress.xpGained > 0 && (
              <p className="num mt-1 text-[11px] text-volt">+{finished.progress.xpGained.toLocaleString()} XP</p>
            )}
          </div>
        )}

        {!busy && !stepPay && !finished && <p className="text-sm text-slate-500">Set your stake and spin.</p>}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy} />

      <button
        type="button"
        onClick={spin}
        disabled={!canSpin}
        className="w-full rounded-xl bg-gradient-to-b from-[#ff8ad4] to-[#e8449f] py-3 text-base font-black text-white shadow-[0_6px_0_0_#a02277] transition active:translate-y-0.5 active:shadow-[0_3px_0_0_#a02277] disabled:opacity-50"
      >
        {busy ? "Dropping…" : `Spin ${formatCents(effectiveBet)}`}
      </button>

      <button
        type="button"
        onClick={() => turboUnlocked && setTurbo((v) => !v)}
        disabled={!turboUnlocked || busy}
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[12px] font-bold transition disabled:opacity-50 ${
          turbo && turboUnlocked ? "border-fuchsia-300 bg-fuchsia-400/10 text-fuchsia-200" : "border-white/10 text-slate-300"
        }`}
      >
        <span>Turbo spins</span>
        <span className="text-[10px] uppercase tracking-wider">
          {turboUnlocked ? (turbo ? "On" : "Off") : `Level ${UNLOCK_LEVELS.TURBO}`}
        </span>
      </button>

      <div>
        <p className="label">Buy feature</p>
        <button
          type="button"
          onClick={() => void play("BUY_FEATURE")}
          disabled={!canBuy}
          className={`w-full rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
            buyUnlocked ? "border-fuchsia-400/40 bg-fuchsia-500/5 hover:border-fuchsia-400/70" : "border-white/10"
          }`}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-black text-white">Bonus Round</span>
            <span className="num text-[13px] font-black text-fuchsia-200">
              {buyUnlocked ? formatCents(buyPrice) : `Level ${UNLOCK_LEVELS.BUY_FREE}`}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
            Skip straight to {BUY_FEATURE_SPINS} bonus spins, multiplier trail included.
          </p>
          <p className="num mt-0.5 text-[10px] text-slate-500">
            {BUY_FEATURE_PRICE_MULTIPLIER}× stake · returns the same % as spinning for it
          </p>
        </button>
      </div>

      <div>
        <p className="label">Paytable — per cluster</p>
        <ul className="space-y-1">
          {paytableRows().map((row) => (
            <li
              key={row.symbol}
              className="flex items-center justify-between rounded-lg border border-white/5 px-2.5 py-1.5"
            >
              <span className="flex items-center gap-2">
                <CandySymbol symbol={row.symbol} className="h-6 w-6 shrink-0" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
                  {SYMBOL_NAMES[row.symbol]}
                </span>
              </span>
              <span className="num text-[10px] text-slate-500">
                {(row.pays[row.pays.length - 1] * 100).toFixed(0)}%+
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        A {COLS}×{ROWS} grid where groups of 5 or more adjacent matching candies pay. Winners vanish,
        everything above falls to fill the gap, and fresh candies drop from the top — repeating until
        nothing new lines up. Every cell is drawn independently with{" "}
        <code className="text-volt">crypto.randomInt</code>, including every refill.
      </p>
      <p>
        Each drop in a spin raises a shared multiplier along the trail{" "}
        {MULTIPLIER_TRAIL.slice(0, 8).join(", ")}…{MULTIPLIER_TRAIL[MULTIPLIER_TRAIL.length - 1]} — and
        during the bonus round that multiplier keeps climbing across every spin in the feature instead
        of resetting. Land 4+ lollipops anywhere across a spin's drops to trigger it; 3+ during the
        bonus adds more spins.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP {(game.rtp! * 100).toFixed(0)}% (simulated).</span>{" "}
        Unlike every other game in WinIt, a cascading grid has no closed-form return — the outcome
        space is effectively unbounded once a match can trigger another draw, another match, another
        draw. Real cluster-pays slots in the industry publish simulated figures for the same reason.{" "}
        <code className="text-volt">npm run rtp</code> runs the exact function the API calls across
        tens of thousands of full rounds and reports the measured return with its confidence interval,
        rather than a false precision the maths can't back up.
      </p>
      <p className="text-[11px] text-slate-500">
        Your table limit is {formatCents(progression?.maxBetCents ?? 0)} at level {level}.
      </p>
    </>
  );

  return (
    <GameFrame
      game={game}
      engineKey="slots"
      feedVersion={feedVersion}
      canvas={canvas}
      panel={panel}
      rules={rules}
    />
  );
}

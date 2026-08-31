"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { UNLOCK_LEVELS } from "@/lib/progression";
import {
  BONUS_BUYS,
  LINE_COUNT,
  PAYLINES,
  REELS,
  REEL_STRIPS,
  ROWS,
  SCATTER_PAYS,
  SCATTER_SPINS,
  STRIP_LENGTHS,
  SYMBOL_GLYPHS,
  SYMBOL_NAMES,
  paytableRows,
  quantiseStake,
  type SlotsMode,
  type SlotsRound,
  type SpinView,
  type Sym,
} from "@/lib/games/slots";

type RoundResponse = {
  round: SlotsRound;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const SYMBOL_COLORS: Record<Sym, string> = {
  WILD: "text-volt",
  SCATTER: "text-fuchsia-300",
  SEVEN: "text-volt",
  DIAMOND: "text-cyan-300",
  BELL: "text-amber-300",
  BAR: "text-slate-200",
  CHERRY: "text-loss",
  LEMON: "text-yellow-200",
  CLOVER: "text-emerald-300",
};

/** Reel-stop timings. Turbo collapses the whole sequence to a flicker. */
const TIMING = {
  normal: { firstStop: 380, stagger: 130, hold: 620, freeHold: 900 },
  turbo: { firstStop: 70, stagger: 24, hold: 90, freeHold: 160 },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const blankGrid = (): (Sym | null)[][] =>
  Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => null));

/** A tall strip of glyphs used as the blurred spinning reel. */
function blurStrip(reel: number): Sym[] {
  const out: Sym[] = [];
  for (let i = 0; i < 9; i++) out.push(REEL_STRIPS[reel][(reel * 13 + i * 7) % STRIP_LENGTHS[reel]]);
  return out;
}

function Cell({ symbol, lit, dim }: { symbol: Sym | null; lit: boolean; dim: boolean }) {
  return (
    <div
      className={`grid aspect-square place-items-center rounded-lg border text-2xl font-black transition-all duration-200 sm:text-3xl ${
        lit
          ? "border-volt bg-volt/10 shadow-volt scale-[1.04]"
          : "border-white/5 bg-base-900/70"
      } ${symbol ? SYMBOL_COLORS[symbol] : "text-slate-700"} ${dim && !lit ? "opacity-35" : ""}`}
    >
      <span className={lit ? "animate-pop-in" : ""}>{symbol ? SYMBOL_GLYPHS[symbol] : "·"}</span>
    </div>
  );
}

function Reel({
  reel,
  symbols,
  spinning,
  litRows,
  dim,
}: {
  reel: number;
  symbols: (Sym | null)[];
  spinning: boolean;
  litRows: Set<number>;
  dim: boolean;
}) {
  const strip = useMemo(() => blurStrip(reel), [reel]);

  if (spinning) {
    return (
      <div className="relative overflow-hidden rounded-lg border border-white/5 bg-base-900/70">
        <div className="animate-reel-spin will-change-transform">
          {[...strip, ...strip].map((s, i) => (
            <div
              key={i}
              className={`grid aspect-square place-items-center text-2xl font-black blur-[2px] sm:text-3xl ${SYMBOL_COLORS[s]}`}
            >
              {SYMBOL_GLYPHS[s]}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-1.5">
      {symbols.map((s, row) => (
        <Cell key={row} symbol={s} lit={litRows.has(row)} dim={dim} />
      ))}
    </div>
  );
}

export default function SlotsGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { balanceCents, progression, applyResult, applyProgress } = useWallet();

  const [grid, setGrid] = useState<(Sym | null)[][]>(blankGrid);
  const [spinning, setSpinning] = useState<boolean[]>(() => Array(REELS).fill(false));
  const [lit, setLit] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  // What the canvas is currently narrating.
  const [spinWin, setSpinWin] = useState<SpinView | null>(null);
  const [roundTotal, setRoundTotal] = useState<number | null>(null);
  const [freeState, setFreeState] = useState<{ index: number; remaining: number; multiplier: number } | null>(null);
  const [finished, setFinished] = useState<RoundResponse | null>(null);

  // Cancels an in-flight animation when the component unmounts or a new round
  // starts, so stale timers can never write into the next round's state.
  const runId = useRef(0);
  useEffect(() => () => void (runId.current += 1), []);

  const level = progression?.level ?? 1;
  const rebirths = progression?.rebirths ?? 0;
  const unlocked = progression?.unlocked;
  const turboUnlocked = unlocked?.TURBO ?? false;

  const { stakeCents, lineBetCents } = quantiseStake(effectiveBet);

  /** Reveals one already-decided spin, reel by reel. */
  const revealSpin = useCallback(
    async (view: SpinView, token: number, timings: typeof TIMING.normal) => {
      setSpinning(Array(REELS).fill(true));
      setLit(new Set());
      setSpinWin(null);
      await sleep(timings.firstStop);
      if (runId.current !== token) return;

      for (let r = 0; r < REELS; r++) {
        setGrid((g) => {
          const next = g.map((col) => [...col]);
          next[r] = view.grid[r];
          return next;
        });
        setSpinning((s) => {
          const next = [...s];
          next[r] = false;
          return next;
        });
        await sleep(timings.stagger);
        if (runId.current !== token) return;
      }

      const cells = new Set<string>();
      for (const w of view.lineWins) for (const [reel, row] of w.cells) cells.add(`${reel}-${row}`);
      for (const [reel, row] of view.scatterCells) if (view.scatterCount >= 3) cells.add(`${reel}-${row}`);
      setLit(cells);
      setSpinWin(view);
    },
    [],
  );

  const play = useCallback(
    async (mode: SlotsMode) => {
      if (busy) return;
      if (betError || effectiveBet <= 0) {
        setError(betError ?? "Set a stake first.");
        return;
      }
      if (stakeCents <= 0) {
        setError(`A stake has to cover all ${LINE_COUNT} lines.`);
        return;
      }

      const token = (runId.current += 1);
      setBusy(true);
      setError(null);
      setFinished(null);
      setSpinWin(null);
      setRoundTotal(null);
      setFreeState(null);
      setLit(new Set());
      setSpinning(Array(REELS).fill(true));

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
          setSpinning(Array(REELS).fill(false));
          setError(data.error ?? "Couldn't place that bet.");
          setBusy(false);
          return;
        }
        payload = data as RoundResponse;
      } catch {
        if (runId.current !== token) return;
        setSpinning(Array(REELS).fill(false));
        setError("Network error — the bet was not placed.");
        setBusy(false);
        return;
      }

      if (runId.current !== token) return;

      const timings = turbo && turboUnlocked ? TIMING.turbo : TIMING.normal;
      let running = 0;

      for (const view of payload.round.spins) {
        if (runId.current !== token) return;

        if (view.kind === "FREE") {
          setFreeState({
            index: view.index,
            remaining: view.spinsRemaining,
            multiplier: view.multiplier,
          });
        }

        await revealSpin(view, token, timings);
        if (runId.current !== token) return;

        running += view.payCents;
        setRoundTotal(running);
        await sleep(view.kind === "FREE" ? timings.freeHold : timings.hold);
        if (runId.current !== token) return;
      }

      if (runId.current !== token) return;

      setFreeState(null);
      setFinished(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, payload.round.summary);
      setFeedVersion((v) => v + 1);
      setBusy(false);
    },
    [
      busy,
      betError,
      effectiveBet,
      stakeCents,
      turbo,
      turboUnlocked,
      revealSpin,
      applyResult,
      applyProgress,
      pushFlash,
      game.name,
    ],
  );

  const spin = useCallback(() => void play("SPIN"), [play]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Spin",
    ready: !betError && stakeCents > 0,
    busy,
    run: spin,
    note: freeState
      ? `Free spin ${freeState.index} · ${freeState.remaining} left · ×${freeState.multiplier}`
      : `${LINE_COUNT} lines · ${formatCents(lineBetCents)} a line`,
  });

  const canSpin = !busy && !betError && stakeCents > 0 && (balanceCents ?? 0) >= stakeCents;
  const anySpinning = spinning.some(Boolean);

  const canvas = (
    <div className="mx-auto w-full max-w-2xl">
      {/* status strip */}
      <div className="mb-3 flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.16em]">
        <span className="text-slate-500">
          {REELS} reels · {LINE_COUNT} lines
        </span>
        {freeState ? (
          <span className="animate-pop-in rounded-full bg-fuchsia-400/15 px-3 py-1 text-fuchsia-200">
            Free spin {freeState.index} · {freeState.remaining} left · ×{freeState.multiplier}
          </span>
        ) : (
          <span className="num text-slate-500">{formatCents(lineBetCents)} a line</span>
        )}
      </div>

      {/* the grid */}
      <div
        className={`grid grid-cols-5 gap-1.5 rounded-2xl border p-2 transition-colors duration-300 sm:gap-2 sm:p-3 ${
          freeState ? "border-fuchsia-400/40 bg-fuchsia-500/5" : "border-white/10 bg-base-900/50"
        }`}
      >
        {Array.from({ length: REELS }, (_, r) => (
          <Reel
            key={r}
            reel={r}
            symbols={grid[r]}
            spinning={spinning[r]}
            litRows={
              new Set(
                Array.from({ length: ROWS }, (_, row) => row).filter((row) => lit.has(`${r}-${row}`)),
              )
            }
            dim={lit.size > 0}
          />
        ))}
      </div>

      {/* narration */}
      <div className="mt-4 min-h-[86px] text-center">
        {anySpinning && !spinWin && <p className="text-sm text-slate-500">Spinning…</p>}

        {spinWin && !finished && (
          <div className="animate-pop-in">
            <p className={spinWin.payCents > 0 ? "num-win text-3xl" : "text-3xl font-black text-slate-600"}>
              {spinWin.payCents > 0 ? formatCents(spinWin.payCents) : "—"}
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              {spinWin.lineWins.length > 0
                ? spinWin.lineWins
                    .slice(0, 3)
                    .map((w) => `${w.count} ${SYMBOL_NAMES[w.symbol]}`)
                    .join(" · ")
                : spinWin.scatterCount >= 3
                  ? `${spinWin.scatterCount} scatters`
                  : "No win on this spin"}
              {spinWin.awardedSpins > 0 && (
                <span className="ml-2 font-bold text-fuchsia-300">+{spinWin.awardedSpins} free spins</span>
              )}
            </p>
            {roundTotal !== null && roundTotal > 0 && (
              <p className="num mt-1 text-[11px] text-slate-500">Round so far {formatCents(roundTotal)}</p>
            )}
          </div>
        )}

        {finished && (
          <div className="animate-pop-in">
            <p className={finished.netCents > 0 ? "num-win text-4xl" : "num-loss text-3xl"}>
              {formatSignedCents(finished.netCents)}
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              {finished.round.summary}
              {finished.round.payoutCents > 0 && ` — paid ${formatCents(finished.round.payoutCents)}`}
            </p>
            {finished.progress.xpGained > 0 && (
              <p className="num mt-1 text-[11px] text-volt">+{finished.progress.xpGained.toLocaleString()} XP</p>
            )}
          </div>
        )}

        {!anySpinning && !spinWin && !finished && (
          <p className="text-sm text-slate-500">Set your stake and spin.</p>
        )}

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
        className="btn-primary w-full py-3 text-base shadow-volt"
      >
        {busy ? "Spinning…" : `Spin ${formatCents(stakeCents)}`}
      </button>

      {/* Turbo */}
      <button
        type="button"
        onClick={() => turboUnlocked && setTurbo((v) => !v)}
        disabled={!turboUnlocked || busy}
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-[12px] font-bold transition disabled:opacity-50 ${
          turbo && turboUnlocked ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-300"
        }`}
      >
        <span>Turbo spins</span>
        <span className="text-[10px] uppercase tracking-wider">
          {turboUnlocked ? (turbo ? "On" : "Off") : `Level ${UNLOCK_LEVELS.TURBO}`}
        </span>
      </button>

      {/* Bonus buys */}
      <div>
        <p className="label">Bonus buy</p>
        <div className="space-y-2">
          {BONUS_BUYS.map((buy) => {
            const open = unlocked?.[buy.key] ?? false;
            const price = buy.priceMultiplier * stakeCents;
            const affordable = (balanceCents ?? 0) >= price;
            return (
              <button
                key={buy.key}
                type="button"
                onClick={() => void play(buy.key)}
                disabled={busy || !open || !affordable || stakeCents <= 0}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                  open
                    ? "border-fuchsia-400/40 bg-fuchsia-500/5 hover:border-fuchsia-400/70"
                    : "border-white/10"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-black text-white">{buy.label}</span>
                  <span className="num text-[13px] font-black text-fuchsia-200">
                    {open ? formatCents(price) : `Level ${UNLOCK_LEVELS[buy.key]}`}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{buy.blurb}</p>
                <p className="num mt-0.5 text-[10px] text-slate-500">
                  {buy.priceMultiplier}× stake · RTP {(buy.rtp * 100).toFixed(2)}%
                  {open && !affordable && " · not enough balance"}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Paytable */}
      <div>
        <p className="label">Paytable — per line bet</p>
        <ul className="space-y-1">
          {paytableRows().map((row) => (
            <li
              key={row.symbol}
              className="flex items-center justify-between rounded-lg border border-white/5 px-2.5 py-1.5"
            >
              <span className={`text-base font-black ${SYMBOL_COLORS[row.symbol]}`}>
                {SYMBOL_GLYPHS[row.symbol]}
                <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {SYMBOL_NAMES[row.symbol]}
                </span>
              </span>
              <span className="num flex items-baseline gap-2 text-[11px] text-slate-400">
                {row.pays.map((p) => (
                  <span key={p.count}>
                    <span className="text-slate-600">{p.count}</span>
                    <span className="ml-0.5 font-black text-white">×{p.multiplier}</span>
                  </span>
                ))}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/5 px-2.5 py-1.5">
            <span className="text-base font-black text-fuchsia-300">
              {SYMBOL_GLYPHS.SCATTER}
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Scatter</span>
            </span>
            <span className="num flex items-baseline gap-2 text-[11px] text-slate-400">
              {[3, 4, 5].map((c) => (
                <span key={c}>
                  <span className="text-slate-600">{c}</span>
                  <span className="ml-0.5 font-black text-white">×{SCATTER_PAYS[c]}</span>
                </span>
              ))}
            </span>
          </li>
          <li className="flex items-center justify-between rounded-lg border border-white/5 px-2.5 py-1.5">
            <span className="text-base font-black text-volt">
              {SYMBOL_GLYPHS.WILD}
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Wild</span>
            </span>
            <span className="text-[10px] text-slate-500">Substitutes · reels 2–4</span>
          </li>
        </ul>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        Five reels, three rows, {LINE_COUNT} fixed paylines. Every one of the {REELS * ROWS} visible
        cells is drawn independently from its reel&apos;s {STRIP_LENGTHS[0]}-stop virtual strip using
        Node&apos;s <code className="text-volt">crypto.randomInt</code>. Nothing is weighted by your
        balance, your history or how long you have been losing.
      </p>
      <p>
        Wilds sit on reels 2, 3 and 4 and substitute for any paying symbol. Lines pay left to right
        from reel 1 and need three in a row or more. Scatters pay wherever they land, and{" "}
        {SCATTER_SPINS[3]}, {SCATTER_SPINS[4]} or {SCATTER_SPINS[5]} free spins at ×
        {2} follow 3, 4 or 5 of them. Three more scatters during the round adds five spins.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP {(game.rtp! * 100).toFixed(2)}%.</span> That
        is a closed-form number, not a simulation: because cells are independent, a payline is five
        independent draws, so <code className="text-volt">exactRtp()</code> enumerates all 9<sup>5</sup>{" "}
        = 59,049 symbol combinations for the line pays, convolves five binomials for the scatter
        count, and sums the retrigger geometric series for the free spins.{" "}
        <code className="text-volt">npm run rtp</code> re-checks the whole thing against millions of
        simulated rounds.
      </p>
      <p>
        Both bonus buys are priced from their own exact expected value, so buying the feature returns
        essentially the same percentage as spinning for it — {(BONUS_BUYS[0].rtp * 100).toFixed(2)}%
        against the base game&apos;s {(game.rtp! * 100).toFixed(2)}%. A bonus buy is a shortcut, not
        an edge, in either direction.
      </p>
      <p className="text-[11px] text-slate-500">
        Your table limit is {formatCents(progression?.maxBetCents ?? 0)} at level {level}
        {rebirths > 0 && ` with ${rebirths} rebirth${rebirths === 1 ? "" : "s"}`}. Paylines used:{" "}
        {PAYLINES.length}.
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

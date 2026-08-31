"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  REEL_STRIP,
  SYMBOL_GLYPHS,
  SYMBOLS,
  THREE_OF_A_KIND,
  TWO_CHERRY_PAY,
  REEL_WEIGHTS,
  STRIP_LENGTH,
  type Symbol as SlotSymbol,
} from "@/lib/games/slots";

type SpinResponse = {
  result: {
    reels: [SlotSymbol, SlotSymbol, SlotSymbol];
    multiplier: number;
    payoutCents: number;
    outcome: "WIN" | "LOSS";
    summary: string;
    winningIndexes: number[];
  };
  betCents: number;
  netCents: number;
  balanceCents: number;
};

const SYMBOL_COLORS: Record<SlotSymbol, string> = {
  SEVEN: "text-volt",
  DIAMOND: "text-cyan-300",
  BELL: "text-amber-300",
  BAR: "text-slate-200",
  CHERRY: "text-loss",
  LEMON: "text-yellow-200",
  CLOVER: "text-emerald-300",
};

const FIRST_STOP_MS = 620;
const STAGGER_MS = 260;

/** A tall strip of glyphs used as the blurred spinning reel. */
function blurStrip(seed: number): SlotSymbol[] {
  const out: SlotSymbol[] = [];
  for (let i = 0; i < 12; i++) out.push(REEL_STRIP[(seed * 7 + i * 11) % STRIP_LENGTH]);
  return out;
}

function Reel({
  symbol,
  spinning,
  highlighted,
  index,
}: {
  symbol: SlotSymbol | null;
  spinning: boolean;
  highlighted: boolean;
  index: number;
}) {
  const strip = useMemo(() => blurStrip(index + 1), [index]);

  return (
    <div
      className={`relative h-[132px] flex-1 overflow-hidden rounded-2xl border bg-base-900/80 transition-colors duration-300 sm:h-[168px] ${
        highlighted ? "border-volt shadow-volt" : "border-white/10"
      }`}
    >
      {spinning ? (
        <div className="absolute inset-x-0 top-0 animate-reel-spin will-change-transform">
          {[...strip, ...strip].map((s, i) => (
            <div
              key={i}
              className={`grid h-[56px] place-items-center text-4xl font-black blur-[1.5px] ${SYMBOL_COLORS[s]}`}
            >
              {SYMBOL_GLYPHS[s]}
            </div>
          ))}
        </div>
      ) : (
        <div
          key={symbol ?? "idle"}
          className={`grid h-full animate-pop-in place-items-center text-5xl font-black sm:text-6xl ${
            symbol ? SYMBOL_COLORS[symbol] : "text-slate-700"
          }`}
        >
          {symbol ? SYMBOL_GLYPHS[symbol] : "·"}
        </div>
      )}

      {/* payline */}
      <div className="pointer-events-none absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-white/10" />
    </div>
  );
}

export default function SlotsGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { balanceCents, applyResult } = useWallet();

  const [reels, setReels] = useState<(SlotSymbol | null)[]>([null, null, null]);
  const [spinning, setSpinning] = useState([false, false, false]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<SpinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const [highlight, setHighlight] = useState<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
    },
    [],
  );

  const spin = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setHighlight([]);
    setSpinning([true, true, true]);

    const startedAt = Date.now();

    try {
      const res = await fetch("/api/games/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSpinning([false, false, false]);
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }

      const payload = data as SpinResponse;
      // Let the reels run for a beat even if the server answered instantly.
      const elapsed = Date.now() - startedAt;
      const firstStop = Math.max(0, FIRST_STOP_MS - elapsed);

      timers.current.forEach(clearTimeout);
      timers.current = [0, 1, 2].map((i) =>
        setTimeout(() => {
          setReels((r) => {
            const next = [...r];
            next[i] = payload.result.reels[i];
            return next;
          });
          setSpinning((s) => {
            const next = [...s];
            next[i] = false;
            return next;
          });

          if (i === 2) {
            setLast(payload);
            setHighlight(payload.result.winningIndexes);
            applyResult(payload.balanceCents, payload.netCents);
            pushFlash(game.name, payload.netCents, payload.result.summary);
            setFeedVersion((v) => v + 1);
            setBusy(false);
          }
        }, firstStop + i * STAGGER_MS),
      );
    } catch {
      setSpinning([false, false, false]);
      setError("Network error — the bet was not placed.");
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, applyResult, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Spin",
    ready: !betError && effectiveBet > 0,
    busy,
    run: spin,
  });

  const canSpin = !busy && !betError && effectiveBet > 0 && (balanceCents ?? 0) >= effectiveBet;

  const canvas = (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          1 payline · 3 reels
        </span>
        <span className="num text-[11px] text-slate-500">Stake {formatCents(effectiveBet)}</span>
      </div>

      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <Reel
            key={i}
            index={i}
            symbol={reels[i]}
            spinning={spinning[i]}
            highlighted={highlight.includes(i)}
          />
        ))}
      </div>

      <div className="mt-5 min-h-[64px] text-center">
        {busy && !last && <p className="text-sm text-slate-500">Spinning…</p>}

        {last && (
          <div className="animate-pop-in">
            <p className={last.netCents > 0 ? "num-win text-3xl" : "num-loss text-3xl"}>
              {formatSignedCents(last.netCents)}
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              {last.result.multiplier > 0
                ? `${last.result.summary} — paid ${formatCents(last.result.payoutCents)}`
                : last.result.summary}
            </p>
          </div>
        )}

        {!busy && !last && reels[0] === null && (
          <p className="text-sm text-slate-500">Set your stake and spin.</p>
        )}

        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy} />

      <button type="button" onClick={spin} disabled={!canSpin} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Spinning…" : `Spin ${formatCents(effectiveBet)}`}
      </button>

      <div>
        <p className="label">Paytable — per 1.00 staked</p>
        <ul className="space-y-1">
          {SYMBOLS.map((s) => {
            const p = (REEL_WEIGHTS[s] / STRIP_LENGTH) ** 3;
            return (
              <li
                key={s}
                className="flex items-center justify-between rounded-lg border border-white/5 px-2.5 py-1.5"
              >
                <span className={`text-base font-black ${SYMBOL_COLORS[s]}`}>
                  {SYMBOL_GLYPHS[s]} {SYMBOL_GLYPHS[s]} {SYMBOL_GLYPHS[s]}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="num text-[10px] text-slate-500">1 in {Math.round(1 / p).toLocaleString()}</span>
                  <span className="num text-sm font-black text-white">×{THREE_OF_A_KIND[s]}</span>
                </span>
              </li>
            );
          })}
          <li className="flex items-center justify-between rounded-lg border border-white/5 px-2.5 py-1.5">
            <span className="text-base font-black text-loss">
              {SYMBOL_GLYPHS.CHERRY} {SYMBOL_GLYPHS.CHERRY} <span className="text-slate-600">—</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="num text-[10px] text-slate-500">1 in 14</span>
              <span className="num text-sm font-black text-white">×{TWO_CHERRY_PAY}</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        Three independent reels, each drawing one stop from the same {STRIP_LENGTH}-position virtual
        strip using Node&apos;s <code className="text-volt">crypto.randomInt</code>. There is no
        near-miss weighting, no held state between spins and no adjustment based on your balance or
        history — every spin is drawn from an identical distribution.
      </p>
      <p>
        Reel strip occupancy:{" "}
        {SYMBOLS.map((s) => `${s.toLowerCase()} ${REEL_WEIGHTS[s]}`).join(", ")} — {STRIP_LENGTH} stops
        in total, giving {(STRIP_LENGTH ** 3).toLocaleString()} equally likely outcomes.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP {(game.rtp! * 100).toFixed(2)}%.</span> That is
        not an estimate: the paytable is enumerated over all{" "}
        {(STRIP_LENGTH ** 3).toLocaleString()} combinations at build time
        (<code className="text-volt">computeExactRtp()</code>), and{" "}
        <code className="text-volt">npm run rtp</code> re-checks it against a million simulated spins.
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

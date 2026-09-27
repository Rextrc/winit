"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { wait } from "@/lib/dealTiming";
import {
  DICE_MAX_CHANCE,
  DICE_MIN_CHANCE,
  DICE_OUTCOMES,
  diceChance,
  diceMultiplier,
  diceValidTarget,
  type DiceDirection,
} from "@/lib/games/originals";

type Resp = {
  roll: number;
  won: boolean;
  multiplier: number;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const MIN_TARGET = Math.round(DICE_OUTCOMES * (1 - DICE_MAX_CHANCE));
const MAX_TARGET = Math.round(DICE_OUTCOMES * DICE_MAX_CHANCE);
// The target moves in whole numbers (00.00 → 01.00 → …), not hundredths.
const STEP = 100;

function IconSwap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

/** A numeric box that only commits on blur/Enter, so typing isn't fought mid-edit. */
function NumberBox({
  label,
  value,
  suffix,
  disabled,
  onCommit,
}: {
  label: string;
  value: string;
  suffix: React.ReactNode;
  disabled?: boolean;
  onCommit?: (n: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text !== null && onCommit) {
      const n = Number(text);
      if (Number.isFinite(n)) onCommit(n);
    }
    setText(null);
  };
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center rounded-xl bg-base-700 pr-3">
        <input
          value={text ?? value}
          disabled={disabled}
          readOnly={!onCommit}
          inputMode="decimal"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="num min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[15px] font-bold text-white outline-none"
        />
        <span className="shrink-0 text-slate-300">{suffix}</span>
      </div>
    </div>
  );
}

export default function DiceGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [direction, setDirection] = useState<DiceDirection>("over");
  const [target, setTarget] = useState(5000); // 50.00
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  // The marker's own position, separate from `last`: it needs to exist and
  // move for a beat *before* the roll it belongs to is revealed, which a
  // value derived straight from `last` can't do.
  const [markerPos, setMarkerPos] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const chance = diceChance(direction, target);
  const multiplier = diceMultiplier(direction, target);
  const valid = diceValidTarget(direction, target);

  const setTargetClamped = useCallback(
    (n: number) => setTarget(Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(n / STEP) * STEP))),
    [],
  );

  /** Pick the whole-number target nearest to a desired win chance (0..1). */
  const setChance = useCallback(
    (c: number) => setTargetClamped(direction === "over" ? DICE_OUTCOMES * (1 - c) : DICE_OUTCOMES * c),
    [direction, setTargetClamped],
  );

  const swap = useCallback(() => {
    setDirection((d) => (d === "over" ? "under" : "over"));
    setTarget((t) => DICE_OUTCOMES - t);
  }, []);

  const roll = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    if (!valid) {
      setError("Win chance must stay between 2% and 98%.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);

    try {
      // A quick decoy jitter before the real number is even known, so the
      // dot is already moving the instant the bet resolves rather than
      // sitting still and then jumping straight to the answer.
      setMarkerPos((p) => p ?? 50);
      await wait(30);
      setMarkerPos(10 + Math.random() * 80);

      const res = await fetch("/api/games/dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, direction, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't place that bet.");
        return;
      }
      const payload = data as Resp;

      // The dot settles on its real landing spot — a CSS transition carries
      // it there from wherever the jitter left it — and only once it has
      // actually arrived does the number and the payout print underneath it.
      setMarkerPos((payload.roll / DICE_OUTCOMES) * 100);
      await wait(550);

      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, `Rolled ${(payload.roll / 100).toFixed(2)}`);
      setFeedVersion((v) => v + 1);
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, direction, target, valid, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Roll",
    ready: !betError && valid && effectiveBet > 0,
    busy,
    run: roll,
    note: `${direction === "over" ? "Over" : "Under"} ${(target / 100).toFixed(2)} · ${(chance * 100).toFixed(2)}% chance`,
  });

  const markerPct = (target / DICE_OUTCOMES) * 100;
  const profitCents = Math.round(effectiveBet * multiplier) - effectiveBet;

  const canvas = (
    <div className="mx-auto flex w-full max-w-3xl flex-col justify-between gap-16 py-6">
      <div className="h-6" />

      <div>
        <div className="relative rounded-2xl bg-base-600 px-6 py-5 shadow-[inset_0_0_0_6px_#171c26]">
          {/* Roll result, riding above the track */}
          {markerPos !== null && (
            <div
              className="absolute bottom-full mb-2 -translate-x-1/2 transition-[left] duration-500 ease-out"
              style={{ left: `calc(24px + (100% - 48px) * ${markerPos / 100})` }}
            >
              <div
                className={`num rounded-lg px-2.5 py-1 text-sm font-black shadow-lg ${
                  last ? (last.won ? "bg-win text-base-900" : "bg-loss text-white") : "bg-base-400 text-white"
                }`}
              >
                {last ? (last.roll / 100).toFixed(2) : "…"}
              </div>
              <div className={`mx-auto h-0 w-0 border-x-[6px] border-t-[6px] border-x-transparent ${
                last ? (last.won ? "border-t-win" : "border-t-loss") : "border-t-base-400"
              }`} />
            </div>
          )}

          <div className="relative h-2.5">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  direction === "over"
                    ? `linear-gradient(90deg, #ff4d5e ${markerPct}%, #22dd7a ${markerPct}%)`
                    : `linear-gradient(90deg, #22dd7a ${markerPct}%, #ff4d5e ${markerPct}%)`,
              }}
            />
            <div
              className="pointer-events-none absolute top-1/2 h-9 w-6 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-brand-300 shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
              style={{ left: `${markerPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={DICE_OUTCOMES}
              step={STEP}
              value={target}
              disabled={busy}
              onChange={(e) => setTargetClamped(Number(e.target.value))}
              aria-label="Target"
              className="absolute -inset-y-4 inset-x-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="relative mx-6 mt-1 h-10">
          {[0, 25, 50, 75, 100].map((n) => (
            <div key={n} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${n}%` }}>
              <div className="mx-auto h-0 w-0 border-x-[6px] border-b-[6px] border-x-transparent border-b-base-600" />
              <span className="num mt-1.5 block text-base font-black text-white">{n}</span>
            </div>
          ))}
        </div>

        <div className="mt-2 min-h-[36px] text-center">
          {last && (
            <p className={`animate-pop-in ${last.netCents > 0 ? "num-win text-2xl" : "num-loss text-2xl"}`}>
              {formatSignedCents(last.netCents)}
            </p>
          )}
          {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberBox
          label="Multiplier"
          value={multiplier.toFixed(2)}
          suffix={<span className="text-sm font-black">×</span>}
          disabled={busy}
          onCommit={(m) => m > 1 && setChance(0.99 / m)}
        />
        <div>
          <p className="label">Roll {direction === "over" ? "Over" : "Under"}</p>
          <div className="flex items-center rounded-xl bg-base-700 pr-2">
            <span className="num flex-1 px-4 py-3.5 text-[15px] font-bold text-white">{(target / 100).toFixed(2)}</span>
            <button
              type="button"
              onClick={swap}
              disabled={busy}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
              aria-label="Swap roll over / under"
            >
              <IconSwap className="h-5 w-5" />
            </button>
          </div>
        </div>
        <NumberBox
          label="Chance"
          value={(chance * 100).toFixed(2)}
          suffix={<span className="text-sm font-black">%</span>}
          disabled={busy}
          onCommit={(c) => setChance(c / 100)}
        />
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy} />

      <div>
        <p className="label">Profit on Win</p>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-3">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-win text-[11px] font-black text-base-900">$</span>
          <span className="num text-[15px] font-bold text-white">{formatCents(Math.max(0, profitCents))}</span>
        </div>
      </div>

      <button type="button" onClick={roll} disabled={busy || !valid} className="btn-primary w-full py-3.5 text-base">
        {busy ? "Rolling…" : "Bet"}
      </button>
    </div>
  );

  const rules = (
    <>
      <p>
        A single number 00.00–99.99 is drawn with{" "}
        <code className="text-volt">crypto.randomInt({DICE_OUTCOMES})</code>. Choose Over or Under and
        a target, and the payout is the exact fair multiplier for the probability you chose:
        <code className="text-volt"> multiplier = 0.99 / P(win)</code>. There is no separate paytable —
        moving the slider recomputes both numbers from the same formula, live.
      </p>
      <p>
        Win chance is restricted to {(DICE_MIN_CHANCE * 100).toFixed(0)}%–{(DICE_MAX_CHANCE * 100).toFixed(0)}%
        so the multiplier never explodes into something the ledger can't display cleanly, and never
        collapses to a coin-flip-or-worse edge case.
      </p>
      <p className="text-[11px] text-slate-500">RTP is exactly 99.00% for every valid target — see `npm run rtp`.</p>
    </>
  );

  return <GameFrame game={game} engineKey="dice" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

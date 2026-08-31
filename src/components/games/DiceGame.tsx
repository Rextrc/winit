"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
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

export default function DiceGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [direction, setDirection] = useState<DiceDirection>("over");
  const [target, setTarget] = useState(5000); // 50.00
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const chance = diceChance(direction, target);
  const multiplier = diceMultiplier(direction, target);
  const valid = diceValidTarget(direction, target);

  const setTargetClamped = useCallback(
    (n: number) => setTarget(Math.min(MAX_TARGET, Math.max(MIN_TARGET, Math.round(n)))),
    [],
  );

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
    try {
      const res = await fetch("/api/games/dice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, direction, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }
      const payload = data as Resp;
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(
        game.name,
        payload.netCents,
        payload.won ? `Rolled ${(payload.roll / 100).toFixed(2)}` : `Rolled ${(payload.roll / 100).toFixed(2)}`,
      );
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
  const winPct = direction === "over" ? 100 - markerPct : markerPct;

  const canvas = (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-6 flex items-baseline justify-between text-[11px] font-bold uppercase tracking-wide text-slate-500">
        <span>Roll 00.00 – 99.99</span>
        <span className="num text-volt">{multiplier.toFixed(4)}× on a win</span>
      </div>

      <div className="relative h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className={`absolute inset-y-0 ${direction === "over" ? "right-0 bg-win" : "left-0 bg-win"}`}
          style={{ width: `${winPct}%` }}
        />
        <div
          className="absolute top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-full bg-white shadow"
          style={{ left: `calc(${markerPct}% - 3px)` }}
        />
        {last && (
          <div
            key={last.roll}
            className="animate-pop-in absolute top-1/2 h-4 w-4 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-base-900 bg-volt shadow-volt"
            style={{ left: `${(last.roll / DICE_OUTCOMES) * 100}%` }}
          />
        )}
      </div>

      <div className="mt-8 text-center min-h-[86px]">
        {last ? (
          <div className="animate-pop-in">
            <p className="num text-4xl font-black text-white">{(last.roll / 100).toFixed(2)}</p>
            <p className={last.netCents > 0 ? "num-win mt-1 text-2xl" : "num-loss mt-1 text-2xl"}>
              {formatSignedCents(last.netCents)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Set a direction and target, then roll.</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["under", "over"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            disabled={busy}
            className={`rounded-xl border py-2 text-[12px] font-black uppercase tracking-wide transition ${
              direction === d ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-400"
            }`}
          >
            Roll {d}
          </button>
        ))}
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className="label mb-0">Target</label>
          <span className="num text-[11px] text-slate-500">
            {(chance * 100).toFixed(2)}% chance · {multiplier.toFixed(4)}×
          </span>
        </div>
        <input
          type="range"
          min={MIN_TARGET}
          max={MAX_TARGET}
          step={1}
          value={target}
          disabled={busy}
          onChange={(e) => setTargetClamped(Number(e.target.value))}
          className="mt-2 w-full accent-volt"
        />
        <input
          type="number"
          value={(target / 100).toFixed(2)}
          disabled={busy}
          step={0.01}
          onChange={(e) => setTargetClamped(Number(e.target.value) * 100)}
          className="field num mt-2 font-bold"
        />
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={roll} disabled={busy || !valid} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Rolling…" : `Roll ${formatCents(effectiveBet)}`}
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

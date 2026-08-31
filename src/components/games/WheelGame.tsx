"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { WHEEL_SEGMENTS, wheelExactRtp, type WheelRisk } from "@/lib/games/originals";

type Resp = {
  index: number;
  multiplier: number;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const SEG_COLORS = ["#f43f5e", "#f59e0b", "#eab308", "#a3e635", "#22d3ee", "#818cf8", "#e879f9"];

export default function WheelGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [risk, setRisk] = useState<WheelRisk>("low");
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const segments = WHEEL_SEGMENTS[risk];
  const segAngle = 360 / segments.length;

  const spin = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);

    try {
      const res = await fetch("/api/games/wheel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, risk }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }
      const payload = data as Resp;

      const target = 360 * 5 + (360 - (payload.index * segAngle + segAngle / 2));
      setRotation((r) => r - (r % 360) + target);

      await new Promise((r) => setTimeout(r, 3200));
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, `${payload.multiplier}x`);
      setFeedVersion((v) => v + 1);
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, risk, segAngle, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Spin",
    ready: !betError && effectiveBet > 0,
    busy,
    run: spin,
    note: `${risk[0].toUpperCase()}${risk.slice(1)} risk · ${(wheelExactRtp(risk) * 100).toFixed(2)}% RTP`,
  });

  const canvas = (
    <div className="mx-auto w-full max-w-sm text-center">
      <div className="relative mx-auto h-64 w-64">
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 text-2xl text-volt">▼</div>
        <div
          className="h-full w-full rounded-full border-4 border-white/10 shadow-volt transition-transform"
          style={{
            transform: `rotate(${rotation}deg)`,
            transitionDuration: busy ? "3.2s" : "0s",
            transitionTimingFunction: "cubic-bezier(0.15, 0.65, 0.25, 1)",
            background: `conic-gradient(${segments
              .map((_, i) => `${SEG_COLORS[i % SEG_COLORS.length]} ${i * segAngle}deg ${(i + 1) * segAngle}deg`)
              .join(", ")})`,
          }}
        >
          {segments.map((m, i) => (
            <div
              key={i}
              className="absolute inset-0 flex justify-center"
              style={{ transform: `rotate(${i * segAngle + segAngle / 2}deg)` }}
            >
              <span className="num mt-3 text-[11px] font-black text-base-900/80">{m}x</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 min-h-[54px]">
        {last && (
          <div className="animate-pop-in">
            <p className="num text-2xl font-black text-white">{last.multiplier}×</p>
            <p className={last.netCents > 0 ? "num-win text-xl" : "num-loss text-xl"}>
              {formatSignedCents(last.netCents)}
            </p>
          </div>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Risk</p>
        <div className="grid grid-cols-3 gap-2">
          {(["low", "medium", "high"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRisk(r)}
              disabled={busy}
              className={`rounded-xl border py-2 text-[11px] font-black uppercase tracking-wide transition ${
                risk === r ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={spin} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Spinning…" : `Spin ${formatCents(effectiveBet)}`}
      </button>
    </div>
  );

  const rules = (
    <>
      <p>
        A 10-segment wheel, one <code className="text-volt">crypto.randomInt(10)</code> draw per spin.
        Each risk level's segment multipliers sum to 9.9 across the 10 equally-likely segments — a
        mean of exactly 0.99 — so risk changes how spiky the distribution is, never the return.
      </p>
      <p className="text-[11px] text-slate-500">
        Low {(wheelExactRtp("low") * 100).toFixed(2)}% · Medium {(wheelExactRtp("medium") * 100).toFixed(2)}% ·
        High {(wheelExactRtp("high") * 100).toFixed(2)}%.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="wheel" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

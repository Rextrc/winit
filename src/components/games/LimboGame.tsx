"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { LIMBO_MAX_TARGET, LIMBO_MIN_TARGET, limboChance, limboValidTarget } from "@/lib/games/originals";

type Resp = {
  result: number;
  target: number;
  won: boolean;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

export default function LimboGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [target, setTarget] = useState(2);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [animated, setAnimated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const valid = limboValidTarget(target);
  const chance = valid ? limboChance(target) : 0;

  const play = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    if (!valid) {
      setError(`Target must be between ${LIMBO_MIN_TARGET}x and ${LIMBO_MAX_TARGET.toLocaleString()}x.`);
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setAnimated(1);

    try {
      const res = await fetch("/api/games/limbo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        setAnimated(null);
        return;
      }
      const payload = data as Resp;

      // Count up to the result for a beat before revealing the outcome.
      const steps = 16;
      const shown = Math.min(payload.result, 50);
      for (let i = 1; i <= steps; i++) {
        await new Promise((r) => setTimeout(r, 30));
        setAnimated(1 + ((shown - 1) * i) / steps);
      }
      setAnimated(payload.result);

      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, `Crashed at ${payload.result.toFixed(2)}x`);
      setFeedVersion((v) => v + 1);
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, target, valid, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Play",
    ready: !betError && valid && effectiveBet > 0,
    busy,
    run: play,
    note: `Target ${target.toFixed(2)}x · ${(chance * 100).toFixed(2)}% chance`,
  });

  const displayed = animated ?? 1;
  const won = last?.won ?? false;

  const canvas = (
    <div className="mx-auto w-full max-w-xl text-center">
      <div
        className={`num text-6xl font-black transition-colors sm:text-7xl ${
          last ? (won ? "text-win" : "text-loss") : "text-white"
        }`}
      >
        {displayed.toFixed(2)}×
      </div>
      <p className="mt-3 text-sm text-slate-500">
        {last ? (won ? "Target reached" : "Crashed before your target") : `Needs to reach ${target.toFixed(2)}x`}
      </p>

      {last && (
        <p className={last.netCents > 0 ? "num-win mt-4 text-2xl" : "num-loss mt-4 text-2xl"}>
          {formatSignedCents(last.netCents)}
        </p>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label mb-0">Target multiplier</label>
          <span className="num text-[11px] text-slate-500">{(chance * 100).toFixed(2)}% chance</span>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            type="number"
            value={target}
            min={LIMBO_MIN_TARGET}
            max={LIMBO_MAX_TARGET}
            step={0.01}
            disabled={busy}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="field num flex-1 font-bold"
          />
          <span className="grid place-items-center px-2 text-sm font-black text-slate-500">×</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {[1.5, 2, 5, 10, 100].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setTarget(v)}
              disabled={busy}
              className="btn-chip flex-1 text-[11px]"
            >
              {v}×
            </button>
          ))}
        </div>
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={play} disabled={busy || !valid} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Playing…" : `Play ${formatCents(effectiveBet)}`}
      </button>
    </div>
  );

  const rules = (
    <>
      <p>
        A crash multiplier is drawn from the continuous distribution{" "}
        <code className="text-volt">0.99 / u</code>, where u is a uniform crypto draw on (0, 1]. That
        distribution has the exact property <code className="text-volt">P(result ≥ M) = 0.99 / M</code>,
        so paying M× to anyone who set a target of M is, by construction, a 99% return whichever
        target you pick.
      </p>
      <p>
        The draw is made in full before the countdown animation runs — the animation renders a result
        that already exists, the same way the other instant games do.
      </p>
      <p className="text-[11px] text-slate-500">RTP is exactly 99.00% for every target — see `npm run rtp`.</p>
    </>
  );

  return <GameFrame game={game} engineKey="limbo" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

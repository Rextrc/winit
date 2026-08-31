"use client";

import { useCallback, useMemo, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { KENO_MAX_PICKS, KENO_POOL, kenoExactRtp, kenoPaytable } from "@/lib/games/originals";

type Resp = {
  drawn: number[];
  hits: number;
  multiplier: number;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

export default function KenoGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const table = useMemo(() => (picks.length > 0 ? kenoPaytable(picks.length) : []), [picks.length]);

  const toggle = useCallback(
    (n: number) => {
      if (busy) return;
      setPicks((p) => {
        if (p.includes(n)) return p.filter((x) => x !== n);
        if (p.length >= KENO_MAX_PICKS) return p;
        return [...p, n].sort((a, b) => a - b);
      });
    },
    [busy],
  );

  const clear = useCallback(() => !busy && setPicks([]), [busy]);

  const play = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    if (picks.length === 0) {
      setError("Pick at least one number.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);

    try {
      const res = await fetch("/api/games/keno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, picks }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }
      const payload = data as Resp;
      await new Promise((r) => setTimeout(r, 500));
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, `${payload.hits}/${picks.length} hits`);
      setFeedVersion((v) => v + 1);
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, picks, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Draw",
    ready: !betError && picks.length > 0 && effectiveBet > 0,
    busy,
    run: play,
    note: picks.length > 0 ? `${picks.length} picks · ${(kenoExactRtp(picks.length) * 100).toFixed(2)}% RTP` : "Pick numbers on the board.",
  });

  const drawnSet = new Set(last?.drawn ?? []);

  const canvas = (
    <div className="mx-auto w-full max-w-xl">
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
        {Array.from({ length: KENO_POOL }, (_, i) => i + 1).map((n) => {
          const picked = picks.includes(n);
          const drawn = drawnSet.has(n);
          const hit = picked && drawn;
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggle(n)}
              disabled={busy}
              className={`num aspect-square rounded-lg border text-[11px] font-bold transition disabled:opacity-70 ${
                hit
                  ? "border-win bg-win/20 text-win"
                  : drawn
                    ? "border-white/30 bg-white/10 text-slate-200"
                    : picked
                      ? "border-volt bg-volt/15 text-volt"
                      : "border-white/10 text-slate-400 hover:border-volt/50"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          {picks.length}/{KENO_MAX_PICKS} picked
        </span>
        <button type="button" onClick={clear} disabled={busy || picks.length === 0} className="font-bold text-volt hover:underline disabled:opacity-40">
          Clear
        </button>
      </div>

      <div className="mt-4 min-h-[54px] text-center">
        {last && (
          <div className="animate-pop-in">
            <p className="num text-xl font-black text-white">
              {last.hits}/{picks.length} hits · {last.multiplier}×
            </p>
            <p className={last.netCents > 0 ? "num-win text-2xl" : "num-loss text-2xl"}>
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
      <BetControls disabled={busy} />

      <button type="button" onClick={play} disabled={busy || picks.length === 0} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Drawing…" : `Draw ${formatCents(effectiveBet)}`}
      </button>

      {picks.length > 0 && (
        <div>
          <p className="label">Paytable — {picks.length} picks</p>
          <ul className="space-y-1">
            {table.map((m, h) =>
              m > 0 ? (
                <li key={h} className="flex items-center justify-between rounded-lg border border-white/5 px-2.5 py-1.5">
                  <span className="text-[12px] font-bold text-slate-300">{h} hits</span>
                  <span className="num text-sm font-black text-white">×{m}</span>
                </li>
              ) : null,
            )}
          </ul>
        </div>
      )}
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
    </>
  );

  return <GameFrame game={game} engineKey="keno" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

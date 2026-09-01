"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { FIELD, chanceOf, horseById, priceOf } from "@/lib/games/racing";

type Resp = {
  result: { order: number[]; winner: number; backed: number; won: boolean; multiplier: number; payoutCents: number };
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const RACE_MS = 3200;

export default function RacingGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [pick, setPick] = useState(FIELD[0].id);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  /** Final rail position per horse id, 0..1. */
  const [positions, setPositions] = useState<Record<number, number>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const run = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setPositions({});
    setRunning(true);

    try {
      const res = await fetch("/api/games/racing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, horseId: pick }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunning(false);
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }

      const payload = data as Resp;

      // The finishing order is already decided; the rails just render it.
      const finish: Record<number, number> = {};
      payload.result.order.forEach((id, place) => {
        finish[id] = 1 - place * (0.55 / FIELD.length);
      });
      requestAnimationFrame(() => setPositions(finish));

      timer.current = setTimeout(() => {
        setRunning(false);
        setLast(payload);
        applyResult(payload.balanceCents, payload.netCents);
        applyProgress(payload.progress);
        pushFlash(game.name, payload.netCents, `${horseById(payload.result.winner)!.name} won`);
        setFeedVersion((v) => v + 1);
        setBusy(false);
      }, RACE_MS);
    } catch {
      setRunning(false);
      setError("Network error — the bet was not placed.");
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, pick, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Run race",
    ready: !betError && effectiveBet > 0,
    busy,
    run,
    note: `Backing ${horseById(pick)!.name} at ${priceOf(horseById(pick)!)}x`,
  });

  const canvas = (
    <div className="mx-auto w-full max-w-xl">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0b2242] to-[#050f21] p-4">
        <div className="space-y-2">
          {FIELD.map((h) => {
            const place = last?.result.order.indexOf(h.id) ?? -1;
            const won = last?.result.winner === h.id;
            return (
              <div key={h.id} className="relative">
                <div className="flex items-center gap-2">
                  <span
                    className={`num grid h-5 w-5 shrink-0 place-items-center rounded text-[10px] font-black ${
                      h.id === pick ? "bg-volt text-white" : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {h.id}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-full border border-white/5 bg-black/30">
                    <span
                      className="absolute inset-y-0 left-0 grid place-items-center rounded-full px-2 text-[11px] font-black text-black transition-[left] ease-out"
                      style={{
                        background: h.silks,
                        left: `calc(${(positions[h.id] ?? 0) * 100}% - ${(positions[h.id] ?? 0) * 34}px)`,
                        transitionDuration: `${RACE_MS}ms`,
                        minWidth: 34,
                      }}
                    >
                      {h.id}
                    </span>
                  </div>
                  {last && (
                    <span
                      className={`num w-8 shrink-0 text-right text-[11px] font-bold ${
                        won ? "text-[#f0c75e]" : "text-slate-500"
                      }`}
                    >
                      {place + 1}
                      {place === 0 ? "st" : place === 1 ? "nd" : place === 2 ? "rd" : "th"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 text-center">
        {last ? (
          <div className="animate-pop-in">
            <p className="text-[13px] font-bold text-white">
              {horseById(last.result.winner)!.name} takes it
            </p>
            <p className={last.netCents > 0 ? "num-win mt-1 text-3xl" : "num-loss mt-1 text-3xl"}>
              {formatSignedCents(last.netCents)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">{running ? "And they're off…" : "Back a horse and run the race."}</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">The card</p>
        <ul className="space-y-1.5">
          {FIELD.map((h) => {
            const active = h.id === pick;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setPick(h.id)}
                  disabled={busy}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all duration-200 hover:-translate-y-px disabled:opacity-50 ${
                    active ? "border-volt bg-volt/10" : "border-white/10"
                  }`}
                >
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: h.silks }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold text-slate-100">{h.name}</span>
                    <span className="block text-[10px] text-slate-500">
                      {(chanceOf(h) * 100).toFixed(0)}% chance
                    </span>
                  </span>
                  <span className="num shrink-0 text-[12px] font-black text-volt">{priceOf(h)}x</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={run} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Racing…" : `Back for ${formatCents(effectiveBet)}`}
      </button>
    </div>
  );

  const rules = (
    <>
      <p>
        Eight fictional horses, each with a fixed and published chance of winning. The price of
        backing one is <code className="text-volt">fairMultiplier(chance)</code> — the true odds for
        that chance at a 1% edge — so the favourite at {priceOf(FIELD[0])}x and the outsider at{" "}
        {priceOf(FIELD[FIELD.length - 1])}x return exactly the same amount in the long run. The only
        thing that changes across the card is variance.
      </p>
      <p>
        The winner is drawn first, from those weights. The running order you watch is a rendering of
        a result that already exists — no horse has hidden &ldquo;form&rdquo; or &ldquo;stamina&rdquo;
        being simulated, because anything of that kind would be a second, unpublished source of odds.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP 99.00% on every horse.</span>
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="racing" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

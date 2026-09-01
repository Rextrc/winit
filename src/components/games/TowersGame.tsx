"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  DIFFICULTY_LABELS,
  SHAPES,
  floorChance,
  multiplierAt,
  type Difficulty,
} from "@/lib/games/towers";

type View = {
  status: "CLIMBING" | "CASHED_OUT" | "FELL";
  betCents: number;
  difficulty: Difficulty;
  shape: { cols: number; safe: number; floors: number };
  picks: number[];
  floorsClimbed: number;
  currentMultiplier: number;
  nextMultiplier: number | null;
  safeTiles: number[][] | null;
};

type Resp = {
  roundId: string;
  view: View;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate | null;
};

export default function TowersGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ netCents: number; won: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  // A climb survives a refresh, so pick it back up on mount.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/games/towers", { cache: "no-store" });
        const data = await res.json();
        if (data.round) {
          setRoundId(data.round.id);
          setView(data.round.view);
          setDifficulty(data.round.view.difficulty);
        }
      } catch {
        /* nothing in play — the fresh state below is correct */
      }
    })();
  }, []);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/games/towers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "That didn't work.");
          return null;
        }
        const payload = data as Resp;
        setView(payload.view);

        if (payload.view.status === "CLIMBING") {
          setRoundId(payload.roundId);
        } else {
          setRoundId(null);
          const won = payload.view.status === "CASHED_OUT";
          const payout = won ? Math.round(payload.view.betCents * payload.view.currentMultiplier) : 0;
          const netCents = payout - payload.view.betCents;
          setLast({ netCents, won });
          applyResult(payload.balanceCents, netCents);
          if (payload.progress) applyProgress(payload.progress);
          pushFlash(
            game.name,
            netCents,
            won ? `Cashed on floor ${payload.view.floorsClimbed}` : `Fell on floor ${payload.view.floorsClimbed + 1}`,
          );
          setFeedVersion((v) => v + 1);
        }
        return payload;
      } catch {
        setError("Network error — nothing changed.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [applyResult, applyProgress, pushFlash, game.name],
  );

  const start = useCallback(() => {
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    setLast(null);
    void send({ action: "start", betCents: effectiveBet, difficulty });
  }, [betError, effectiveBet, difficulty, send]);

  const pick = useCallback(
    (column: number) => {
      if (!roundId || busy) return;
      void send({ action: "pick", roundId, column });
    },
    [roundId, busy, send],
  );

  const cashout = useCallback(() => {
    if (!roundId || busy) return;
    void send({ action: "cashout", roundId });
  }, [roundId, busy, send]);

  const climbing = view?.status === "CLIMBING";
  const shape = view?.shape ?? SHAPES[difficulty];
  const climbed = view?.floorsClimbed ?? 0;

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: climbing ? "Cash out" : "Start climb",
    ready: climbing ? climbed > 0 : !betError && effectiveBet > 0,
    busy,
    run: climbing ? cashout : start,
    note: climbing
      ? `Floor ${climbed} · ${view!.currentMultiplier}x banked`
      : DIFFICULTY_LABELS[difficulty],
    autoplay: false,
  });

  const canvas = (
    <div className="mx-auto w-full max-w-sm">
      <div className="flex flex-col-reverse gap-1.5">
        {Array.from({ length: shape.floors }).map((_, floor) => {
          const done = floor < (view?.picks.length ?? 0);
          const active = climbing && floor === (view?.picks.length ?? 0);
          const pickedCol = view?.picks[floor];
          const safeCols = view?.safeTiles?.[floor] ?? null;

          return (
            <div key={floor} className="flex items-center gap-2">
              <span className="num w-10 shrink-0 text-right text-[10px] font-bold text-slate-600">
                {multiplierAt(view?.difficulty ?? difficulty, floor + 1).toFixed(2)}x
              </span>
              <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${shape.cols}, minmax(0,1fr))` }}>
                {Array.from({ length: shape.cols }).map((_, col) => {
                  const isPick = done && pickedCol === col;
                  const revealedSafe = safeCols?.includes(col) ?? false;
                  const revealedBad = safeCols !== null && !revealedSafe;

                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => pick(col)}
                      disabled={!active || busy}
                      className={`h-9 rounded-lg border text-[12px] font-black transition-all duration-200 ${
                        active
                          ? "border-volt/40 bg-volt/5 text-volt hover:-translate-y-0.5 hover:border-volt"
                          : "cursor-default"
                      } ${
                        isPick && view?.status === "FELL" && !revealedSafe
                          ? "border-loss bg-loss/25 text-loss"
                          : isPick
                            ? "border-win bg-win/20 text-win"
                            : revealedSafe
                              ? "border-white/10 bg-white/5 text-slate-500"
                              : revealedBad
                                ? "border-loss/20 bg-loss/5 text-loss/50"
                                : done
                                  ? "border-white/5 bg-white/[0.03] text-slate-700"
                                  : "border-white/10 bg-white/5 text-slate-600"
                      }`}
                    >
                      {isPick ? (view?.status === "FELL" && !revealedSafe ? "✕" : "✓") : revealedSafe ? "·" : revealedBad ? "✕" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-center">
        {last ? (
          <div className="animate-pop-in">
            <p className={last.netCents > 0 ? "num-win text-3xl" : "num-loss text-3xl"}>
              {formatSignedCents(last.netCents)}
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              {last.won ? `Cashed out on floor ${climbed}` : `Fell on floor ${climbed + 1}`}
            </p>
          </div>
        ) : climbing ? (
          <p className="num text-2xl font-black text-white">{view!.currentMultiplier.toFixed(2)}x banked</p>
        ) : (
          <p className="text-sm text-slate-500">Pick a safe tile on each floor and climb.</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Difficulty</p>
        <div className="space-y-2">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              disabled={climbing || busy}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-all duration-200 disabled:opacity-50 ${
                difficulty === d ? "border-volt bg-volt/10" : "border-white/10"
              }`}
            >
              <span className="text-[12px] font-bold text-slate-100">{DIFFICULTY_LABELS[d]}</span>
              <span className="num text-[11px] font-bold text-volt">
                {multiplierAt(d, 1).toFixed(2)}x/floor
              </span>
            </button>
          ))}
        </div>
      </div>

      <BetControls disabled={climbing || busy} />

      {climbing ? (
        <button
          type="button"
          onClick={cashout}
          disabled={busy || climbed === 0}
          className="btn-primary w-full py-3 text-base shadow-volt"
        >
          Cash out {formatCents(Math.round(view!.betCents * view!.currentMultiplier))}
        </button>
      ) : (
        <button type="button" onClick={start} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
          {busy ? "Starting…" : `Climb ${formatCents(effectiveBet)}`}
        </button>
      )}

      {climbing && view!.nextMultiplier !== null && (
        <p className="num text-center text-[11px] text-slate-500">
          Next floor pays {view!.nextMultiplier.toFixed(2)}x ·{" "}
          {(floorChance(view!.difficulty) * 100).toFixed(1)}% safe
        </p>
      )}
    </div>
  );

  const rules = (
    <>
      <p>
        Every floor has the same shape: {shape.cols} tiles, {shape.safe} of them safe. Pick a safe
        one and you climb; pick wrong and the run ends with nothing.
      </p>
      <p>
        The price of standing on floor r is derived, never tabulated:{" "}
        <code className="text-volt">0.99 / (safe/cols)^r</code>. That makes cashing out on any floor
        worth exactly the same 99%, which is what lets the cash-out button be genuinely free of a
        &ldquo;right&rdquo; answer.
      </p>
      <p>
        Because the price is recomputed from the true remaining probability at every step, the return
        stays exactly 99% under <em>any</em> stopping rule — including one that reacts to how the
        climb has gone so far.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="towers" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

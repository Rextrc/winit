"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { GRID_SIZE, MAX_MINES, MIN_MINES, multiplierAt, validMinesCount } from "@/lib/games/mines";
import type { ProgressUpdate } from "@/lib/ledger";

type View = {
  mines: number;
  revealed: number[];
  betCents: number;
  status: "ACTIVE" | "WON" | "LOST" | "CASHED_OUT";
  currentMultiplier: number;
  nextMultiplier: number | null;
  minePositions?: number[];
};

type Resp = { view: View; balanceCents: number; progress: ProgressUpdate | null; roundId: string };

export default function MinesGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { balanceCents, applyResult, applyProgress } = useWallet();

  const [minesCount, setMinesCount] = useState(3);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Resume an in-progress round on load, same as blackjack.
  useEffect(() => {
    fetch("/api/games/mines")
      .then((r) => r.json())
      .then((data) => {
        if (data.round) {
          setRoundId(data.round.id);
          setView(data.round.view);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const inPlay = view?.status === "ACTIVE";

  const applyOutcome = useCallback(
    (payload: Resp, summary: string, netCents: number) => {
      setView(payload.view);
      applyResult(payload.balanceCents, netCents);
      if (payload.progress) applyProgress(payload.progress);
      pushFlash(game.name, netCents, summary);
      setFeedVersion((v) => v + 1);
    },
    [applyResult, applyProgress, pushFlash, game.name],
  );

  const start = useCallback(async () => {
    if (busy || inPlay) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/mines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", betCents: effectiveBet, mines: minesCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start that round.");
        setBusy(false);
        return;
      }
      setRoundId(data.roundId);
      setView(data.view);
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, inPlay, betError, effectiveBet, minesCount]);

  const reveal = useCallback(
    async (cell: number) => {
      if (busy || !inPlay || !roundId) return;
      if (view?.revealed.includes(cell)) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/games/mines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reveal", roundId, cell }),
        });
        const data = (await res.json()) as Resp & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Couldn't reveal that cell.");
          setBusy(false);
          return;
        }
        if (data.view.status === "LOST") {
          applyOutcome(data, "Hit a mine", -view!.betCents);
        } else if (data.view.status === "WON") {
          const payout = Math.round(view!.betCents * data.view.currentMultiplier);
          applyOutcome(data, "Cleared the board", payout - view!.betCents);
        } else {
          setView(data.view);
        }
      } catch {
        setError("Network error.");
      } finally {
        setBusy(false);
      }
    },
    [busy, inPlay, roundId, view, applyOutcome],
  );

  const cashOut = useCallback(async () => {
    if (busy || !inPlay || !roundId || !view) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/mines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashout", roundId }),
      });
      const data = (await res.json()) as Resp & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't cash out.");
        setBusy(false);
        return;
      }
      const payout = Math.round(view.betCents * view.currentMultiplier);
      applyOutcome(data, `Cashed out at ${view.currentMultiplier.toFixed(2)}×`, payout - view.betCents);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }, [busy, inPlay, roundId, view, applyOutcome]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: inPlay ? "Cash Out" : "Start",
    ready: inPlay ? true : !betError && effectiveBet > 0,
    busy,
    run: inPlay ? cashOut : start,
    note: inPlay
      ? `${view!.revealed.length} revealed · cash out at ${view!.currentMultiplier.toFixed(2)}×`
      : `${minesCount} mines on a ${GRID_SIZE}-cell grid`,
    // A grid mid-reveal isn't a fresh bet each round.
    autoplay: false,
  });

  const canvas = (
    <div className="mx-auto w-full max-w-md">
      {view && (
        <div className="mb-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
          <span className="text-slate-500">{view.mines} mines</span>
          <span className="num text-volt">
            {view.currentMultiplier.toFixed(2)}×
            {view.nextMultiplier !== null && (
              <span className="ml-1.5 text-slate-500">next {view.nextMultiplier.toFixed(2)}×</span>
            )}
          </span>
        </div>
      )}

      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: GRID_SIZE }, (_, i) => {
          const isRevealed = view?.revealed.includes(i) ?? false;
          const isMine = view?.minePositions?.includes(i) ?? false;
          const showMine = view && view.status !== "ACTIVE" && isMine;
          const settled = view && view.status !== "ACTIVE";

          return (
            <button
              key={i}
              type="button"
              onClick={() => reveal(i)}
              disabled={!inPlay || busy || isRevealed}
              className={`relative aspect-square rounded-lg border text-lg font-black transition-all disabled:cursor-default ${
                showMine
                  ? "border-loss bg-loss/20 text-loss"
                  : isRevealed
                    ? "border-volt/60 bg-volt/10 text-volt animate-pop-in"
                    : settled
                      ? "border-white/5 bg-white/[0.02] opacity-40"
                      : "border-white/10 bg-white/[0.04] hover:border-volt/40 hover:bg-white/[0.08]"
              }`}
            >
              {showMine ? "✸" : isRevealed ? "✓" : ""}
            </button>
          );
        })}
      </div>

      <div className="mt-4 min-h-[50px] text-center">
        {!loaded ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : view?.status === "LOST" ? (
          <p className="num-loss animate-pop-in text-2xl">Hit a mine — {formatSignedCents(-view.betCents)}</p>
        ) : view?.status === "WON" ? (
          <p className="num-win animate-pop-in text-2xl">
            Board cleared — {formatCents(Math.round(view.betCents * view.currentMultiplier))}
          </p>
        ) : view?.status === "CASHED_OUT" ? (
          <p className="num-win animate-pop-in text-2xl">
            Cashed out at {view.currentMultiplier.toFixed(2)}×
          </p>
        ) : inPlay ? (
          <p className="text-sm text-slate-400">Reveal a cell, or cash out any time.</p>
        ) : (
          <p className="text-sm text-slate-500">Set your mines and stake, then start.</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      {!inPlay && (
        <div>
          <div className="flex items-baseline justify-between">
            <label className="label mb-0">Mines</label>
            <span className="num text-[11px] text-slate-500">
              {minesCount} of {GRID_SIZE} cells
            </span>
          </div>
          <input
            type="range"
            min={MIN_MINES}
            max={MAX_MINES}
            step={1}
            value={minesCount}
            disabled={busy}
            onChange={(e) => setMinesCount(Number(e.target.value))}
            className="mt-2 w-full accent-volt"
          />
        </div>
      )}

      <BetControls disabled={busy || inPlay} />

      {inPlay ? (
        <button type="button" onClick={cashOut} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
          {busy ? "Working…" : `Cash Out ${formatCents(Math.round((view?.betCents ?? 0) * (view?.currentMultiplier ?? 1)))}`}
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy || !!betError || !validMinesCount(minesCount)}
          className="btn-primary w-full py-3 text-base shadow-volt"
        >
          {busy ? "Starting…" : `Start ${formatCents(effectiveBet)}`}
        </button>
      )}

      <div>
        <p className="label">Fair multiplier by reveal</p>
        <ul className="space-y-1">
          {[1, 2, 3, 5, 8].map((r) => (
            <li key={r} className="flex items-center justify-between rounded-lg border border-white/5 px-2.5 py-1.5 text-[11px]">
              <span className="text-slate-500">After {r} safe reveal{r === 1 ? "" : "s"}</span>
              <span className="num font-black text-white">
                {r > GRID_SIZE - minesCount ? "—" : multiplierAt(minesCount, r).toFixed(2) + "×"}
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
        {MIN_MINES}–{MAX_MINES} mines are placed uniformly at random among {GRID_SIZE} cells, hidden
        until you reveal them or the round ends. Every reveal is decided the instant you click it,
        with <code className="text-volt">crypto.randomInt</code> already having fixed the layout when
        the round started — nothing adapts to how you're playing.
      </p>
      <p>
        Because mines are placed independently of reveal order, the chance that your first r reveals
        are all safe is exactly C(25−mines, r) / C(25, r) — a hypergeometric survival probability, not
        an approximation. The multiplier for cashing out at that point is set to{" "}
        <code className="text-volt">0.99 / P(survive r)</code>, so the return is exactly 99% for
        whichever reveal count you stop at.
      </p>
      <p className="text-[11px] text-slate-500">RTP is exactly 99.00% at every cash-out point — see `npm run rtp`.</p>
    </>
  );

  return <GameFrame game={game} engineKey="mines" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

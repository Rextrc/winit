"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import PlayingCard from "@/components/games/PlayingCard";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import type { Card } from "@/lib/games/blackjack";
import type { Direction } from "@/lib/games/hilo";
import type { ProgressUpdate } from "@/lib/ledger";

type View = {
  current: Card;
  streakMultiplier: number;
  steps: number;
  betCents: number;
  status: "ACTIVE" | "WON_OUT" | "LOST" | "CASHED_OUT";
  cardsLeft: number;
  higherMultiplier: number | null;
  lowerMultiplier: number | null;
  revealed?: Card;
};

type Resp = { view: View; balanceCents: number; progress: ProgressUpdate | null; roundId: string };

export default function HiloGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/games/hilo")
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
      const res = await fetch("/api/games/hilo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", betCents: effectiveBet }),
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
  }, [busy, inPlay, betError, effectiveBet]);

  const guess = useCallback(
    async (direction: Direction) => {
      if (busy || !inPlay || !roundId || !view) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/games/hilo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "guess", roundId, direction }),
        });
        const data = (await res.json()) as Resp & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Couldn't place that guess.");
          setBusy(false);
          return;
        }
        if (data.view.status === "LOST") {
          applyOutcome(data, `Guessed ${direction}`, -view.betCents);
        } else if (data.view.status === "WON_OUT") {
          const payout = Math.round(view.betCents * data.view.streakMultiplier);
          applyOutcome(data, "Ran the deck out", payout - view.betCents);
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
    if (busy || !inPlay || !roundId || !view || view.steps === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/hilo", {
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
      const payout = Math.round(view.betCents * view.streakMultiplier);
      applyOutcome(data, `Cashed out at ${view.streakMultiplier.toFixed(2)}×`, payout - view.betCents);
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
    ready: inPlay ? (view?.steps ?? 0) > 0 : !betError && effectiveBet > 0,
    busy,
    run: inPlay ? cashOut : start,
    note: inPlay
      ? `${view!.steps} correct · ${view!.streakMultiplier.toFixed(2)}× so far`
      : "Guess higher or lower on the next card",
    autoplay: false,
  });

  const canvas = (
    <div className="mx-auto w-full max-w-md text-center">
      {view && (
        <div className="mb-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
          <span className="text-slate-500">{view.cardsLeft} cards left</span>
          <span className="num text-volt">{view.streakMultiplier.toFixed(2)}× so far</span>
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <PlayingCard card={view?.current} small={false} />
        {view?.revealed && <PlayingCard card={view.revealed} small={false} />}
      </div>

      <div className="mt-6 min-h-[60px]">
        {!loaded ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : view?.status === "LOST" ? (
          <p className="num-loss animate-pop-in text-2xl">Wrong — {formatSignedCents(-view.betCents)}</p>
        ) : view?.status === "WON_OUT" ? (
          <p className="num-win animate-pop-in text-2xl">
            Deck cleared — {formatCents(Math.round(view.betCents * view.streakMultiplier))}
          </p>
        ) : view?.status === "CASHED_OUT" ? (
          <p className="num-win animate-pop-in text-2xl">Cashed out at {view.streakMultiplier.toFixed(2)}×</p>
        ) : inPlay ? (
          <p className="text-sm text-slate-400">Will the next card be higher or lower than {view!.current.r}?</p>
        ) : (
          <p className="text-sm text-slate-500">Start a round to draw the first card.</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy || inPlay} />

      {inPlay ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => guess("lower")}
              disabled={busy || view!.lowerMultiplier === null}
              className="rounded-xl border border-loss/40 bg-loss/5 py-3 text-[13px] font-black uppercase tracking-wide text-loss transition hover:border-loss/70 disabled:opacity-40"
            >
              Lower
              {view!.lowerMultiplier !== null && (
                <span className="num mt-0.5 block text-[11px] font-bold">{view!.lowerMultiplier.toFixed(2)}×</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => guess("higher")}
              disabled={busy || view!.higherMultiplier === null}
              className="rounded-xl border border-win/40 bg-win/5 py-3 text-[13px] font-black uppercase tracking-wide text-win transition hover:border-win/70 disabled:opacity-40"
            >
              Higher
              {view!.higherMultiplier !== null && (
                <span className="num mt-0.5 block text-[11px] font-bold">{view!.higherMultiplier.toFixed(2)}×</span>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={cashOut}
            disabled={busy || view!.steps === 0}
            className="btn-primary w-full py-3 text-base shadow-volt"
          >
            {busy ? "Working…" : `Cash Out ${formatCents(Math.round((view?.betCents ?? 0) * (view?.streakMultiplier ?? 1)))}`}
          </button>
        </>
      ) : (
        <button type="button" onClick={start} disabled={busy || !!betError} className="btn-primary w-full py-3 text-base shadow-volt">
          {busy ? "Starting…" : `Start ${formatCents(effectiveBet)}`}
        </button>
      )}
    </div>
  );

  const rules = (
    <>
      <p>
        One 52-card deck, freshly shuffled every round with a crypto Fisher-Yates shuffle. Guess
        whether the next card ranks higher or lower than the one showing — a tie counts as a loss for
        both directions. Rank order is A (low) through K (high).
      </p>
      <p>
        Because it is a real deck with no replacement, the exact count of cards left that would win
        each guess is known precisely at every step, and the multiplier offered is{" "}
        <code className="text-volt">0.99 / P(that guess wins)</code>, recomputed fresh each time from
        what has actually been dealt. A direction with zero winning cards left is disabled rather than
        offered at odds that can't pay.
      </p>
      <p className="text-[11px] text-slate-500">RTP is exactly 99.00% on every correct guess — see `npm run rtp`.</p>
    </>
  );

  return <GameFrame game={game} engineKey="hilo" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

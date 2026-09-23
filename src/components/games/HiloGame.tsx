"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import PlayingCard from "@/components/games/PlayingCard";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { CARD_DEAL_MS, CARD_STAGGER_MS, wait } from "@/lib/dealTiming";
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
  // The card the server drew for this guess, shown beside the one that was
  // already showing, before either the streak ticks up or the round settles.
  // The server only sends a separate `revealed` card on a loss — on a correct
  // or deck-clearing guess it just advances `current` in place — so this is
  // built client-side from whichever of the two the response actually gives.
  const [revealPair, setRevealPair] = useState<{ base: Card; drawn: Card } | null>(null);
  // The climb so far, purely for the history strip — the server only keeps
  // the current card and the cumulative multiplier, not every card along the
  // way, so this is rebuilt client-side as the round progresses.
  const [history, setHistory] = useState<{ card: Card; label: string }[]>([]);

  const { status: sessionStatus } = useSession();

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (sessionStatus === "unauthenticated") {
      setLoaded(true);
      return;
    }
    fetch("/api/games/hilo")
      .then((r) => r.json())
      .then((data) => {
        if (data.round) {
          setRoundId(data.round.id);
          setView(data.round.view);
          const v = data.round.view as View;
          setHistory([{ card: v.current, label: v.steps === 0 ? "Start card" : `${v.streakMultiplier.toFixed(2)}×` }]);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [sessionStatus]);

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
      setHistory([{ card: data.view.current, label: "Start card" }]);
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
      const beforeCard = view.current;
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

        // On a loss the server hands back the wrong card as `revealed` and
        // leaves `current` as the one you guessed against; on anything else
        // it has already advanced `current` to the card it drew. Either way,
        // this is the card that needs to visibly land next to the old one
        // before the guess is allowed to resolve.
        const drawnCard = data.view.status === "LOST" ? data.view.revealed! : data.view.current;
        setRevealPair({ base: beforeCard, drawn: drawnCard });
        await wait(CARD_STAGGER_MS + CARD_DEAL_MS);

        if (data.view.status === "LOST") {
          applyOutcome(data, `Guessed ${direction}`, -view.betCents);
        } else {
          // Any non-loss outcome here was a correct guess that advanced the
          // climb, so the drawn card joins the history strip either way.
          setHistory((h) => [...h, { card: data.view.current, label: `${data.view.streakMultiplier.toFixed(2)}×` }]);
          if (data.view.status === "WON_OUT") {
            const payout = Math.round(view.betCents * data.view.streakMultiplier);
            applyOutcome(data, "Ran the deck out", payout - view.betCents);
          } else {
            setView(data.view);
          }
        }
        setRevealPair(null);
      } catch {
        setError("Network error.");
      } finally {
        setBusy(false);
      }
    },
    [busy, inPlay, roundId, view, applyOutcome],
  );

  const skip = useCallback(async () => {
    if (busy || !inPlay || !roundId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/hilo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", roundId }),
      });
      const data = (await res.json()) as Resp & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't skip that card.");
        setBusy(false);
        return;
      }
      setView(data.view);
      // The skipped card was never a completed step, so it replaces the
      // last entry in the strip rather than adding a new one.
      setHistory((h) => {
        const copy = h.slice(0, -1);
        copy.push({ card: data.view.current, label: h[h.length - 1]?.label ?? "Start card" });
        return copy;
      });
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }, [busy, inPlay, roundId]);

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
      // A beat before the number lands, matching every other settle in the
      // game rather than snapping the header balance up instantly.
      await wait(CARD_DEAL_MS);
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

  const ringClass =
    view?.status === "LOST" ? "ring-loss" : view?.status === "CASHED_OUT" || view?.status === "WON_OUT" ? "ring-win" : "ring-volt";

  const tile = (direction: Direction) => {
    const win = direction === "higher";
    const multiplier = win ? view?.higherMultiplier : view?.lowerMultiplier;
    const disabled = busy || !inPlay || !!revealPair || multiplier == null;
    return (
      <button
        type="button"
        onClick={() => guess(direction)}
        disabled={disabled}
        className={`flex w-24 shrink-0 flex-col items-center justify-between gap-2 rounded-2xl border-2 px-2 py-4 transition sm:w-32 sm:py-5 ${
          win ? "border-win/50 bg-win/10 hover:enabled:border-win" : "border-loss/50 bg-loss/10 hover:enabled:border-loss"
        } disabled:cursor-not-allowed disabled:opacity-30`}
      >
        <span className={`text-2xl ${win ? "text-win" : "text-loss"}`}>{win ? "▲" : "▼"}</span>
        <span className={`text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:text-[11px] ${win ? "text-win" : "text-loss"}`}>
          {win ? "Higher / Same" : "Lower / Same"}
        </span>
        <span className="num rounded-lg bg-base-900/60 px-2 py-1 text-xs font-bold text-white sm:text-sm">
          {multiplier != null ? `${multiplier.toFixed(2)}×` : "—"}
        </span>
      </button>
    );
  };

  const canvas = (
    <div className="mx-auto w-full max-w-lg text-center">
      {view && (
        <div className="mb-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
          <span className="text-slate-500">{view.cardsLeft} cards left</span>
          <span className="num text-volt">{view.streakMultiplier.toFixed(2)}× so far</span>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 sm:gap-5">
        {tile("higher")}

        <div className="flex items-center justify-center gap-4">
          {revealPair ? (
            <>
              <PlayingCard card={revealPair.base} small={false} />
              <PlayingCard
                key={`${revealPair.drawn.r}${revealPair.drawn.s}`}
                card={revealPair.drawn}
                small={false}
                delayMs={CARD_STAGGER_MS}
              />
            </>
          ) : (
            <div className="relative">
              {inPlay && (
                <>
                  <div className="absolute inset-0 h-[104px] w-[74px] translate-x-1.5 translate-y-1.5 rounded-xl border border-white/10 bg-base-700" />
                  <div className="absolute inset-0 h-[104px] w-[74px] translate-x-0.5 translate-y-0.5 rounded-xl border border-white/10 bg-base-700" />
                </>
              )}
              <div className={`relative rounded-xl ${inPlay ? `ring-2 ring-offset-2 ring-offset-base-900 ${ringClass}` : ""}`}>
                <PlayingCard card={view?.current} small={false} />
              </div>
              {view?.revealed && <PlayingCard card={view.revealed} small={false} />}
            </div>
          )}
        </div>

        {tile("lower")}
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
        ) : revealPair ? (
          <p className="text-sm text-slate-400">Drew {revealPair.drawn.r}…</p>
        ) : inPlay ? (
          <p className="text-sm text-slate-400">Will the next card be higher or lower than {view!.current.r}?</p>
        ) : (
          <p className="text-sm text-slate-500">Start a round to draw the first card.</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>

      {history.length > 0 && (
        <div className="mt-2 flex justify-center">
          <div className="flex max-w-full gap-3 overflow-x-auto rounded-xl border border-white/10 bg-base-900/40 p-3">
            {history.map((h, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <PlayingCard card={h.card} small />
                <span
                  className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    i === 0 ? "bg-white/10 text-slate-300" : "bg-win/15 text-win"
                  }`}
                >
                  {h.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy || inPlay} />

      {inPlay ? (
        <>
          <p className="text-center text-[12px] text-slate-500">
            Pick Higher/Same or Lower/Same beside the card — or skip it for a fresh one.
          </p>
          <button
            type="button"
            onClick={skip}
            disabled={busy || !!revealPair}
            className="w-full rounded-xl border border-white/15 py-3 text-[13px] font-black uppercase tracking-wide text-slate-300 transition hover:border-white/30 disabled:opacity-40"
          >
            Skip card
          </button>
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
        whether the next card ranks higher or lower than the one showing — Higher/Same and
        Lower/Same both win on a tie, so the two win chances overlap. Rank order is A (low) through
        K (high).
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

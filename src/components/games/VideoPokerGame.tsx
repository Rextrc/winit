"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import SuitCard from "@/components/games/SuitCard";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { HAND_LABELS, HAND_ORDER, PAYTABLE, type Card, type HandClass } from "@/lib/games/videopoker";

type View = {
  phase: "DEAL" | "DONE";
  betCents: number;
  hand: Card[];
  held: number[];
  result: HandClass | null;
  multiplier: number | null;
};

type Resp = {
  roundId: string;
  view: View;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate | null;
};

export default function VideoPokerGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [held, setHeld] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ netCents: number; hand: HandClass } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  // A dealt hand survives a refresh — it has already been paid for.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/games/videopoker", { cache: "no-store" });
        const data = await res.json();
        if (data.round) {
          setRoundId(data.round.id);
          setView(data.round.view);
          setHeld(data.round.view.held ?? []);
        }
      } catch {
        /* nothing in play */
      }
    })();
  }, []);

  const deal = useCallback(async () => {
    if (busy || roundId) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setHeld([]);

    try {
      const res = await fetch("/api/games/videopoker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deal", betCents: effectiveBet }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't deal that hand.");
        return;
      }
      const payload = data as Resp;
      setRoundId(payload.roundId);
      setView(payload.view);
    } catch {
      setError("Network error — the hand was not dealt.");
    } finally {
      setBusy(false);
    }
  }, [busy, roundId, betError, effectiveBet]);

  const draw = useCallback(async () => {
    if (!roundId || busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/games/videopoker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draw", roundId, held }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't draw.");
        return;
      }

      const payload = data as Resp;
      setView(payload.view);
      setRoundId(null);

      const payout = Math.round(payload.view.betCents * (payload.view.multiplier ?? 0));
      const netCents = payout - payload.view.betCents;
      setLast({ netCents, hand: payload.view.result! });
      applyResult(payload.balanceCents, netCents);
      if (payload.progress) applyProgress(payload.progress);
      pushFlash(game.name, netCents, HAND_LABELS[payload.view.result!]);
      setFeedVersion((v) => v + 1);
    } catch {
      setError("Network error — the draw did not happen.");
    } finally {
      setBusy(false);
    }
  }, [roundId, busy, held, applyResult, applyProgress, pushFlash, game.name]);

  const toggleHold = (i: number) => {
    if (!roundId || busy) return;
    setHeld((h) => (h.includes(i) ? h.filter((x) => x !== i) : [...h, i]));
  };

  const dealt = roundId !== null && view?.phase === "DEAL";

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: dealt ? "Draw" : "Deal",
    ready: dealt ? true : !betError && effectiveBet > 0,
    busy,
    run: dealt ? draw : deal,
    note: dealt
      ? held.length === 0
        ? "Nothing held — the whole hand is replaced."
        : `Holding ${held.length} card${held.length === 1 ? "" : "s"}.`
      : "Five cards, hold what you want, the rest are replaced.",
    autoplay: false,
  });

  const cards = view?.hand ?? [];

  const canvas = (
    <div className="mx-auto w-full max-w-lg text-center">
      <div className="flex items-end justify-center gap-2 sm:gap-3">
        {Array.from({ length: 5 }).map((_, i) => {
          const card = cards[i];
          const isHeld = held.includes(i);
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span
                className={`text-[9px] font-black uppercase tracking-[0.14em] transition-opacity ${
                  dealt && isHeld ? "text-volt opacity-100" : "opacity-0"
                }`}
              >
                Held
              </span>
              <button
                type="button"
                onClick={() => toggleHold(i)}
                disabled={!dealt || busy}
                className={dealt ? "cursor-pointer" : "cursor-default"}
                aria-label={card ? `${card.r}${card.s}${isHeld ? " (held)" : ""}` : "Card"}
              >
                <SuitCard
                  rank={card?.r}
                  suit={card?.s}
                  hidden={!card}
                  delayMs={i * 90}
                  highlighted={dealt && isHeld}
                  dimmed={dealt && held.length > 0 && !isHeld}
                />
              </button>
            </div>
          );
        })}
      </div>

      {view?.phase === "DONE" && last ? (
        <div className="animate-pop-in mt-5">
          <p
            className={`text-[13px] font-black uppercase tracking-wide ${
              last.netCents > 0 ? "text-win" : "text-slate-300"
            }`}
          >
            {HAND_LABELS[last.hand]}
          </p>
          <p className={last.netCents > 0 ? "num-win mt-1 text-3xl" : "num-loss mt-1 text-3xl"}>
            {formatSignedCents(last.netCents)}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-500">
          {dealt ? "Tap the cards you want to keep, then draw." : "Deal to start a hand."}
        </p>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={dealt || busy} />

      {dealt ? (
        <div className="space-y-2">
          <button type="button" onClick={draw} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
            {busy ? "Drawing…" : `Draw ${5 - held.length} card${5 - held.length === 1 ? "" : "s"}`}
          </button>
          <button
            type="button"
            onClick={() => setHeld([0, 1, 2, 3, 4])}
            disabled={busy}
            className="btn-ghost w-full py-2 text-xs"
          >
            Hold everything
          </button>
        </div>
      ) : (
        <button type="button" onClick={deal} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
          {busy ? "Dealing…" : `Deal ${formatCents(effectiveBet)}`}
        </button>
      )}

      <div className="rounded-xl border border-white/5 bg-base-900/50 p-3">
        <p className="label mb-2">Paytable</p>
        <ul className="space-y-1">
          {HAND_ORDER.map((h) => (
            <li
              key={h}
              className={`flex items-center justify-between rounded-lg px-1.5 py-1 text-[12px] transition ${
                view?.result === h ? "bg-volt/15 text-volt" : "text-slate-300"
              }`}
            >
              <span>{HAND_LABELS[h]}</span>
              <span className="num font-bold">{PAYTABLE[h]}x</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-600">
          Multipliers are total return, so a pair of jacks at 1x is your money back.
        </p>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        Five cards, hold what you want, the rest are replaced from the <em>same</em> deck the deal
        came out of. The deck is shuffled once when the hand starts and the replacements are the next
        cards off it, so the draw respects every card you have already seen — holding four hearts
        really does leave nine hearts in 47 cards.
      </p>
      <p>
        This is the one game here with no single published RTP, and that is deliberate rather than a
        gap: the return is a function of which cards you hold, so a hand played badly and the same
        hand played well are genuinely different bets. Rather than assert a number, the RTP harness
        measures the return under one documented reference strategy and publishes it with a
        confidence interval derived from the run&apos;s own variance.
      </p>
      <p>
        What <em>is</em> exact is the value of any given hold: the engine can enumerate every
        possible draw from the remaining deck rather than sampling it, and the harness checks the
        paytable and the hand evaluator against that.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="videopoker" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

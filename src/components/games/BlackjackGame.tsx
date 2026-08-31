"use client";

import { useCallback, useEffect, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import type { Action, BlackjackView } from "@/lib/games/blackjack";
import GameFrame from "@/components/games/GameFrame";
import PlayingCard from "@/components/games/PlayingCard";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";

const ACTION_LABEL: Record<Action, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
};

const OUTCOME_TEXT: Record<string, string> = {
  BLACKJACK: "Blackjack!",
  WIN: "Win",
  LOSS: "Lose",
  PUSH: "Push",
  BUST: "Bust",
};

export default function BlackjackGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult } = useWallet();

  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<BlackjackView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const [settledNet, setSettledNet] = useState<number | null>(null);

  const inPlay = view !== null && view.phase !== "DONE";

  // Pick a hand back up after a refresh — the shoe lives on the server.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/games/blackjack", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.round) {
          setRoundId(data.round.id);
          setView(data.round.view);
        }
      } catch {
        /* ignore — the player can just deal a fresh hand */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const settle = useCallback(
    (next: BlackjackView) => {
      const net = next.payoutCents - next.totalStakeCents;
      setSettledNet(net);
      pushFlash(
        game.name,
        net,
        next.hands.map((h) => (h.result ? OUTCOME_TEXT[h.result.outcome] : "")).join(" · "),
      );
      setFeedVersion((v) => v + 1);
    },
    [game.name, pushFlash],
  );

  const deal = useCallback(async () => {
    if (busy || inPlay) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setSettledNet(null);
    setView(null);

    try {
      const res = await fetch("/api/games/blackjack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deal", betCents: effectiveBet }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't deal that hand.");
        return;
      }

      setRoundId(data.roundId);
      setView(data.view);
      applyResult(data.balanceCents, data.view.phase === "DONE" ? data.view.payoutCents - data.view.totalStakeCents : undefined);
      if (data.view.phase === "DONE") settle(data.view);
    } catch {
      setError("Network error — the hand was not dealt.");
    } finally {
      setBusy(false);
    }
  }, [busy, inPlay, betError, effectiveBet, applyResult, settle]);

  const act = useCallback(
    async (action: Action) => {
      if (busy || !roundId) return;
      setBusy(true);
      setError(null);

      try {
        const res = await fetch("/api/games/blackjack", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, roundId }),
        });
        const data = await res.json();

        if (!res.ok) {
          setError(data.error ?? "That move wasn't accepted.");
          return;
        }

        setView(data.view);
        const done = data.view.phase === "DONE";
        applyResult(data.balanceCents, done ? data.view.payoutCents - data.view.totalStakeCents : undefined);
        if (done) settle(data.view);
      } catch {
        setError("Network error — your move may not have been applied.");
      } finally {
        setBusy(false);
      }
    },
    [busy, roundId, applyResult, settle],
  );

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Deal",
    ready: !betError && effectiveBet > 0 && !inPlay,
    busy,
    run: deal,
    note: inPlay ? "Hand in play — finish it with the table controls." : undefined,
  });

  const dealerTotalText = view
    ? view.dealerHoleHidden
      ? `${view.dealerTotal} + ?`
      : String(view.dealerTotal)
    : "—";

  const canvas = (
    <div className="mx-auto w-full max-w-2xl">
      {/* Dealer */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Dealer</span>
          <span className="num rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-bold text-slate-300">
            {dealerTotalText}
          </span>
        </div>
        <div className="flex min-h-[104px] gap-2">
          {view ? (
            <>
              {view.dealer.map((c, i) => (
                <PlayingCard key={`${c.r}${c.s}${i}`} card={c} delayMs={i * 90} />
              ))}
              {view.dealerHoleHidden && <PlayingCard hidden delayMs={90} />}
            </>
          ) : (
            <div className="grid h-[104px] w-[74px] place-items-center rounded-xl border border-dashed border-white/10 text-slate-700">
              ?
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 border-t border-dashed border-white/10" />

      {/* Player hands */}
      <div className="flex flex-wrap gap-6">
        {view ? (
          view.hands.map((hand, i) => {
            const active = view.phase === "PLAYER" && view.active === i;
            return (
              <div
                key={i}
                className={`rounded-2xl p-2 transition ${
                  active ? "bg-volt/10 shadow-[inset_0_0_0_1px_rgba(182,255,46,0.3)]" : ""
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {view.hands.length > 1 ? `Hand ${i + 1}` : "You"}
                  </span>
                  <span className="num rounded-md bg-white/5 px-2 py-0.5 text-[11px] font-bold text-slate-200">
                    {hand.total}
                    {hand.soft && hand.total <= 21 ? " soft" : ""}
                  </span>
                  <span className="num text-[11px] text-slate-500">{formatCents(hand.betCents)}</span>
                  {hand.doubled && (
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                      DOUBLED
                    </span>
                  )}
                  {hand.result && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${
                        hand.result.outcome === "BUST" || hand.result.outcome === "LOSS"
                          ? "bg-loss/15 text-loss"
                          : hand.result.outcome === "PUSH"
                            ? "bg-white/10 text-slate-300"
                            : "bg-win/15 text-win"
                      }`}
                    >
                      {OUTCOME_TEXT[hand.result.outcome]}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {hand.cards.map((c, ci) => (
                    <PlayingCard key={`${c.r}${c.s}${ci}`} card={c} delayMs={ci * 90} />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="grid h-[104px] w-[74px] place-items-center rounded-xl border border-dashed border-white/10 text-slate-700">
            ?
          </div>
        )}
      </div>

      <div className="mt-6 min-h-[52px] text-center">
        {settledNet !== null && view?.phase === "DONE" && (
          <div className="animate-pop-in">
            <p className={settledNet > 0 ? "num-win text-3xl" : settledNet === 0 ? "num text-3xl text-slate-300" : "num-loss text-3xl"}>
              {settledNet === 0 ? "PUSH" : formatSignedCents(settledNet)}
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              Staked {formatCents(view.totalStakeCents)} · returned {formatCents(view.payoutCents)}
            </p>
          </div>
        )}
        {!view && !busy && <p className="text-sm text-slate-500">Set your stake and deal.</p>}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy || inPlay} />

      {inPlay ? (
        <div className="grid grid-cols-2 gap-2">
          {(["hit", "stand", "double", "split"] as Action[]).map((a) => {
            const allowed = view?.actions.includes(a) ?? false;
            const primary = a === "hit" || a === "stand";
            return (
              <button
                key={a}
                type="button"
                onClick={() => act(a)}
                disabled={!allowed || busy}
                className={`${primary ? "btn-primary" : "btn-ghost"} py-3`}
              >
                {ACTION_LABEL[a]}
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={deal}
          disabled={busy || !!betError || effectiveBet <= 0}
          className="btn-primary w-full py-3 text-base shadow-volt"
        >
          {busy ? "Dealing…" : `Deal ${formatCents(effectiveBet)}`}
        </button>
      )}

      <div className="rounded-xl border border-white/5 bg-base-900/50 p-3">
        <p className="label mb-2">Table</p>
        <dl className="space-y-1 text-[12px]">
          {[
            ["Decks", "6, reshuffled every hand"],
            ["Dealer", "Stands on all 17"],
            ["Blackjack", "Pays 3:2"],
            ["Double", "Any first two cards"],
            ["Split", "Same rank, once"],
            ["Insurance", "Not offered"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-right font-semibold text-slate-300">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        Six decks are shuffled with a crypto Fisher-Yates before <em>every</em> hand, so the count is
        reset each round and card counting gains you nothing. The shoe is stored server-side against
        the round — the browser only ever receives the cards it is entitled to see, and the dealer&apos;s
        hole card genuinely is not sent until the dealer plays.
      </p>
      <p>
        Dealer stands on all 17 including soft 17. Blackjack pays 3:2 with winnings rounded down to
        the whole cent. Double is offered on any first two cards for one card only. Split is offered
        once on two cards of the same rank; split aces take exactly one card each and cannot make
        blackjack. No surrender, no insurance, no even money.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP ≈ 99.4%</span> — a house edge of roughly 0.6%
        under these rules with basic strategy. Unlike the slots and roulette figures this one depends
        on you: it is the ceiling you reach with correct decisions, not an average across all play.
      </p>
    </>
  );

  return (
    <GameFrame
      game={game}
      engineKey="blackjack"
      feedVersion={feedVersion}
      canvas={canvas}
      panel={panel}
      rules={rules}
    />
  );
}

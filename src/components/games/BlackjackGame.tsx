"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { GameDef } from "@/lib/games/registry";
import type { Action, BlackjackView, Card } from "@/lib/games/blackjack";
import GameFrame from "@/components/games/GameFrame";
import CardBack, { CardBackFace } from "@/components/games/CardBack";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { wait } from "@/lib/dealTiming";
import sfx from "@/lib/sound";

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

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** A clean, centered card face — this table's own look, no corner indices. */
/** Where the shoe sits relative to a card landing at this table position. */
type Flight = { dx: number; dy: number };
const DEALER_FLIGHT: Flight = { dx: 150, dy: -55 };
const PLAYER_FLIGHT: Flight = { dx: 210, dy: -270 };

/** Slower than the shared CARD_STAGGER_MS other games use — Blackjack's cards
 * fly and flip (see the card-fly/card-flip-reveal keyframes), and that extra
 * motion reads as rushed at the same pace a flat deal-in uses elsewhere. */
const BJ_CARD_STAGGER_MS = 520;
/** The dealer draws one considered card at a time to reach 17 — a bigger
 * beat between each than the player's own cards, so it reads as the dealer
 * making a decision rather than the whole hand being flicked out at once. */
const BJ_DEALER_STAGGER_MS = 720;
/** Must match the card-fly/card-flip-reveal animation duration in tailwind.config.ts. */
const BJ_CARD_DEAL_MS = 650;

/** How long a card at absolute position `index` (0-based, within its own
 * row) takes to finish landing — the delay every BjCard is actually given,
 * plus its own flight+flip time. */
function bjCardFinishMs(index: number, staggerMs: number = BJ_CARD_STAGGER_MS): number {
  return index * staggerMs + BJ_CARD_DEAL_MS;
}

/**
 * How long to hold the verdict back so every card the dealer reveals — the
 * hole card, and any hit after it to reach 17 — has actually finished
 * landing first. The dealer's hole always re-mounts from scratch on a DONE
 * transition (it was a face-down placeholder the instant before), so its
 * finish time is driven by its final hand length alone, not by how many
 * cards were merely "new" this round; the same goes for whichever player
 * hand's own last card triggered the transition (e.g. a hit that busted).
 */
function bjRevealMs(next: BlackjackView, dealerOffsetMs = 0): number {
  const dealerFinish = dealerOffsetMs + bjCardFinishMs(next.dealer.length - 1, BJ_DEALER_STAGGER_MS);
  const handFinish = Math.max(0, ...next.hands.map((h) => bjCardFinishMs(h.cards.length - 1)));
  return Math.max(dealerFinish, handFinish);
}

/** Best total ≤21 if possible — a local copy of the server's handTotal(),
 * since that lives in a module that pulls in Node's crypto for the shoe
 * shuffle and can't be imported into client code. */
function cardsTotal(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += c.r === "A" ? 11 : ["K", "Q", "J", "10"].includes(c.r) ? 10 : Number(c.r);
    if (c.r === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

/**
 * A dealt card: flies in from the shoe, then flips from back to front once
 * it lands. Two nested layers on purpose — the outer one only ever
 * translates and scales in a straight line (no rotation), and the inner one
 * only ever rotates in place (no translation). Combining fly and flip into a
 * single transform was what made the first version look warped: a large
 * translate and a 3D rotation sharing one perspective skew badly together.
 * Kept apart, each stays simple, and the inner flip is a real two-sided card
 * — separate back and front faces with backface-visibility hidden — rather
 * than one face spun past itself, so it never looks mirrored or blurry.
 */
function BjCard({ card, delayMs = 0, flight = DEALER_FLIGHT }: { card?: Card; delayMs?: number; flight?: Flight }) {
  // A card still in the shoe: no flip, it isn't dealt yet.
  if (!card) return <CardBack delayMs={delayMs} />;

  const red = card.s === "H" || card.s === "D";
  const flyStyle = {
    animationDelay: `${delayMs}ms`,
    "--deal-dx": `${flight.dx}px`,
    "--deal-dy": `${flight.dy}px`,
  } as React.CSSProperties;

  return (
    <div className="relative h-[104px] w-[74px] animate-card-fly shadow-tile" style={flyStyle} onAnimationStart={() => sfx.cardDeal()}>
      <div
        className="relative h-full w-full animate-card-flip-reveal"
        style={{ animationDelay: `${delayMs}ms`, transformStyle: "preserve-3d" }}
      >
        <div className="absolute inset-0 [backface-visibility:hidden]">
          <CardBackFace />
        </div>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-white [backface-visibility:hidden] [transform:rotateY(180deg)]"
          aria-label={`${card.r} of ${SUIT_GLYPH[card.s]}`}
        >
          <span className={`font-display text-3xl font-black leading-none ${red ? "text-[#c0142f]" : "text-slate-900"}`}>
            {card.r}
          </span>
          <span className={`text-2xl leading-none ${red ? "text-[#c0142f]" : "text-slate-900"}`}>
            {SUIT_GLYPH[card.s]}
          </span>
        </div>
      </div>
    </div>
  );
}

/** A dark banner with notched ends, like real felt table text. */
function Ribbon({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mx-auto w-full max-w-sm bg-base-600/90 py-2 text-center text-[11px] font-black uppercase tracking-[0.12em] text-slate-300"
      style={{ clipPath: "polygon(2% 0, 98% 0, 100% 50%, 98% 100%, 2% 100%, 0 50%)" }}
    >
      {children}
    </div>
  );
}

/** The shoe — a small fan of face-down cards in the corner of the table. */
function Shoe() {
  return (
    <div className="pointer-events-none absolute right-4 top-4 h-11 w-9" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="absolute inset-0 rounded-md border border-white/20 bg-gradient-to-br from-brand-400 to-brand shadow-tile"
          style={{ transform: `translateY(${-i * 3}px)` }}
        />
      ))}
    </div>
  );
}

/** The four action icons, each in the accent colour its button uses. */
const ACTION_ICON: Record<Action, JSX.Element> = {
  hit: (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="#22dd7a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3v10M5.5 9 10 13.5 14.5 9M4 16.5h12" />
    </svg>
  ),
  stand: (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="#ff5a6e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 10.5V5.2a1.3 1.3 0 0 1 2.6 0V9M8.6 9V4.2a1.3 1.3 0 0 1 2.6 0V9M11.2 9V5.2a1.3 1.3 0 0 1 2.6 0v6.3M13.8 9.5a1.3 1.3 0 0 1 2.6 0v3.7c0 3-2.2 5.3-5.2 5.3H10c-1.6 0-2.6-.5-3.5-1.7l-3-4a1.2 1.2 0 0 1 1.8-1.6l1.7 1.5" />
    </svg>
  ),
  split: (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="#4a7dff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 17V11M10 11 4.5 5.5M10 11l5.5-5.5M4.5 3.5h4v4M15.5 3.5h-4v4" />
    </svg>
  ),
  double: (
    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="#ffc53d" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="3.5" y="6.5" width="9" height="10" rx="1.6" />
      <path d="M7 6.5V5a1.5 1.5 0 0 1 1.5-1.5H15A1.5 1.5 0 0 1 16.5 5v8a1.5 1.5 0 0 1-1.5 1.5h-1.5" />
    </svg>
  ),
};

export default function BlackjackGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<BlackjackView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const [settledNet, setSettledNet] = useState<number | null>(null);
  // Gates the per-hand WIN/LOSS/PUSH/BUST badges specifically: `view` itself
  // is set the instant a response arrives (that's what lets the cards start
  // flying in), but the verdict printed on each hand has to wait for that
  // reveal to actually finish, or the badge would just appear alongside the
  // first card and give the hand away.
  const [resultsShown, setResultsShown] = useState(true);
  // How many of the dealer's cards count toward the number shown under the
  // dealer's hand — ticks up as each one actually lands, instead of either
  // spoiling the total instantly or hiding it behind a placeholder.
  const [dealerShownCount, setDealerShownCount] = useState(0);
  // Set whenever a player action busts (or auto-stands on 21) and the
  // dealer's own reveal has to wait for that card to finish landing first —
  // otherwise the dealer's hole flips at the same moment the bust does, and
  // you never get to actually see your own card arrive before the dealer's.
  const [dealerOffsetMs, setDealerOffsetMs] = useState(0);

  const inPlay = view !== null && view.phase !== "DONE";

  useEffect(() => {
    if (!view) {
      setDealerShownCount(0);
      return;
    }
    if (view.dealerHoleHidden) {
      setDealerShownCount(1);
      return;
    }
    setDealerShownCount(1);
    const timers = view.dealer.slice(1).map((_, i) =>
      setTimeout(
        () => setDealerShownCount((n) => Math.max(n, i + 2)),
        dealerOffsetMs + bjCardFinishMs(i + 1, BJ_DEALER_STAGGER_MS),
      ),
    );
    return () => timers.forEach(clearTimeout);
  }, [view, dealerOffsetMs]);

  const { status: sessionStatus } = useSession();

  // Pick a hand back up after a refresh — the shoe lives on the server. Only
  // worth asking once there is a session to ask it for; otherwise this fires
  // on every anonymous visit to the page and draws a 401 nobody needs.
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
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
  }, [sessionStatus]);

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
    setResultsShown(true);
    setDealerOffsetMs(0);
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
      const nextView = data.view as BlackjackView;
      const done = nextView.phase === "DONE";

      if (done) {
        // A natural blackjack settles on the opening two cards — the deal
        // still has to be seen landing before the verdict prints under it.
        setResultsShown(false);
        setView(nextView);
        await wait(bjRevealMs(nextView));
        setResultsShown(true);
        applyResult(data.balanceCents, nextView.payoutCents - nextView.totalStakeCents);
        if (data.progress) applyProgress(data.progress);
        settle(nextView);
      } else {
        setView(nextView);
        applyResult(data.balanceCents);
        if (data.progress) applyProgress(data.progress);
      }
    } catch {
      setError("Network error — the hand was not dealt.");
    } finally {
      setBusy(false);
    }
  }, [busy, inPlay, betError, effectiveBet, applyResult, applyProgress, settle]);

  const act = useCallback(
    async (action: Action) => {
      if (busy || !roundId) return;
      setBusy(true);
      setError(null);
      // A hit or double adds exactly one card to whichever hand is active
      // right now — captured before the request, since the response's view
      // has no active hand any more once the round is DONE.
      const activeIndex = view?.active ?? -1;
      const addsPlayerCard = (action === "hit" || action === "double") && activeIndex >= 0;

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

        const nextView = data.view as BlackjackView;
        const done = nextView.phase === "DONE";

        if (done) {
          // If this action just busted (or auto-stood on 21), the player
          // needs to actually see that card land before the dealer so much
          // as flips its hole — otherwise both happen on the same beat and
          // the bust gets no moment of its own. The dealer's whole reveal
          // starts only once that card has finished.
          const offset = addsPlayerCard
            ? bjCardFinishMs(nextView.hands[activeIndex].cards.length - 1, BJ_CARD_STAGGER_MS)
            : 0;
          setDealerOffsetMs(offset);
          setResultsShown(false);
          setView(nextView);
          await wait(bjRevealMs(nextView, offset));
          setResultsShown(true);
          applyResult(data.balanceCents, nextView.payoutCents - nextView.totalStakeCents);
          if (data.progress) applyProgress(data.progress);
          settle(nextView);
        } else {
          setView(nextView);
          applyResult(data.balanceCents);
          if (data.progress) applyProgress(data.progress);
        }
      } catch {
        setError("Network error — your move may not have been applied.");
      } finally {
        setBusy(false);
      }
    },
    [busy, roundId, view, applyResult, applyProgress, settle],
  );

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Deal",
    ready: !betError && effectiveBet > 0 && !inPlay,
    busy,
    run: deal,
    note: inPlay ? "Hand in play — finish it with the table controls." : undefined,
    // Turn-based: dealing again doesn't resolve a hand by itself.
    autoplay: false,
  });

  const dealerTotalText = view
    ? view.dealerHoleHidden
      ? `${view.dealerTotal} + ?`
      : // The hole is flipped and any extra cards are drawn server-side before
        // this response ever arrives, so the full total is known immediately —
        // but the number shown ticks up with dealerShownCount, one card at a
        // time as each actually lands, rather than spoiling it instantly or
        // hiding it behind a placeholder.
        String(cardsTotal(view.dealer.slice(0, dealerShownCount)))
    : "—";

  const canvas = (
    <div className="relative mx-auto w-full max-w-2xl">
      <Shoe />

      {/* Dealer */}
      <div className="mb-3 flex flex-col items-center">
        <span className="num mb-3 rounded-full bg-base-600 px-3.5 py-1 text-sm font-black text-white">
          {dealerTotalText}
        </span>
        <div className="flex min-h-[104px] gap-3" style={{ perspective: "1000px" }}>
          {view &&
            view.dealer.map((c, i) => (
              <BjCard key={`${c.r}${c.s}${i}`} card={c} delayMs={dealerOffsetMs + i * BJ_DEALER_STAGGER_MS} />
            ))}
          {view?.dealerHoleHidden && <BjCard delayMs={BJ_DEALER_STAGGER_MS} />}
        </div>
      </div>

      <div className="my-5 space-y-2">
        <Ribbon>Blackjack pays 3 to 2</Ribbon>
      </div>

      {/* Player hands */}
      <div className="flex flex-wrap justify-center gap-8">
        {view &&
          view.hands.map((hand, i) => {
            const active = view.phase === "PLAYER" && view.active === i;
            return (
              <div key={i} className="flex flex-col items-center">
                <span
                  className={`num mb-3 rounded-full px-3.5 py-1 text-sm font-black text-white transition ${
                    active ? "bg-brand shadow-volt" : "bg-base-600"
                  }`}
                >
                  {hand.total}
                  {hand.soft && hand.total <= 21 ? "s" : ""}
                </span>
                <div className="flex gap-3" style={{ perspective: "1000px" }}>
                  {hand.cards.map((c, ci) => (
                    <BjCard key={`${c.r}${c.s}${ci}`} card={c} delayMs={ci * BJ_CARD_STAGGER_MS} flight={PLAYER_FLIGHT} />
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
                  {view.hands.length > 1 && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Hand {i + 1}
                    </span>
                  )}
                  <span className="num text-[11px] text-slate-500">{formatCents(hand.betCents)}</span>
                  {hand.doubled && (
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                      DOUBLED
                    </span>
                  )}
                  {hand.result && resultsShown && (
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
              </div>
            );
          })}
      </div>

      <div className="mt-6 min-h-[52px] text-center">
        {settledNet !== null && resultsShown && view?.phase === "DONE" && (
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
      <div className="seg grid-cols-2">
        <span className="seg-item-on cursor-default">Standard</span>
        <span className="seg-item cursor-not-allowed opacity-50" title="Not offered at this table">
          Side bet
        </span>
      </div>

      <BetControls disabled={busy || inPlay} />

      {inPlay ? (
        <div className="grid grid-cols-2 gap-2">
          {(["hit", "stand", "split", "double"] as Action[]).map((a) => {
            const allowed = view?.actions.includes(a) ?? false;
            return (
              <button
                key={a}
                type="button"
                onClick={() => act(a)}
                disabled={!allowed || busy}
                className="flex items-center justify-between rounded-xl bg-base-600 px-4 py-3 text-[15px] font-semibold text-slate-100 transition hover:bg-base-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {ACTION_LABEL[a]}
                {ACTION_ICON[a]}
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

"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { CARD_DEAL_MS, CARD_STAGGER_MS, wait } from "@/lib/dealTiming";
import { DECKS, PAYOUT, type BetType, type HandResult } from "@/lib/games/baccarat";
import type { Card } from "@/lib/games/blackjack";
import type { ProgressUpdate } from "@/lib/ledger";

type Resp = {
  hand: HandResult;
  bet: BetType;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  progress: ProgressUpdate;
};

const BET_LABELS: Record<BetType, string> = { player: "Player", banker: "Banker", tie: "Tie" };
const BET_ODDS: Record<BetType, string> = { player: "1:1", tie: "8:1", banker: "0.95:1" };
const BET_TAB: Record<BetType, string> = { player: "bg-sky-400", tie: "bg-win", banker: "bg-loss" };
const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** Extra beat before a third card, so the draw reads as its own moment. */
const THIRD_CARD_PAUSE_MS = 650;

type Outcome = "win" | "lose" | "tie" | null;

function TableCard({ card, outcome, first }: { card: Card; outcome: Outcome; first: boolean }) {
  const red = card.s === "H" || card.s === "D";
  const border =
    outcome === "win" ? "border-win" : outcome === "lose" ? "border-loss" : outcome === "tie" ? "border-volt" : "border-black/10";
  return (
    <div
      className={`animate-card-deal relative grid h-[118px] w-[84px] place-items-center rounded-lg border-[3px] bg-slate-50 font-display font-black shadow-tile transition-colors duration-500 sm:h-[132px] sm:w-[94px] ${border} ${
        first ? "" : "-ml-7"
      }`}
    >
      <div className={`flex flex-col items-center leading-none ${red ? "text-rose-700" : "text-slate-900"}`}>
        <span className="text-[40px] sm:text-[46px]">{card.r}</span>
        <span className="mt-1 text-[30px] sm:text-[34px]">{SUIT_GLYPH[card.s]}</span>
      </div>
    </div>
  );
}

function Hand({
  label,
  cards,
  total,
  outcome,
}: {
  label: string;
  cards: Card[];
  total: number | null;
  outcome: Outcome;
}) {
  const pill =
    outcome === "win" ? "bg-win text-base-900" : outcome === "lose" ? "bg-loss text-white" : outcome === "tie" ? "bg-volt text-base-900" : "bg-white/10 text-white";
  return (
    <div className="flex flex-col items-center">
      <p className="mb-4 font-display text-xl font-black uppercase tracking-wide text-slate-500 sm:text-2xl">{label}</p>
      <div className="flex min-h-[118px] items-center justify-center sm:min-h-[132px]">
        {cards.length > 0 ? (
          cards.map((c, i) => <TableCard key={i} card={c} outcome={outcome} first={i === 0} />)
        ) : (
          <div className="h-[118px] w-[84px] rounded-lg border-2 border-dashed border-white/10 sm:h-[132px] sm:w-[94px]" />
        )}
      </div>
      <div className="mt-4 h-9">
        {total !== null && (
          <span className={`num inline-grid h-9 min-w-[52px] place-items-center rounded-full px-4 text-base font-black transition-colors duration-500 ${pill}`}>
            {total}
          </span>
        )}
      </div>
    </div>
  );
}

export default function BaccaratGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [bet, setBet] = useState<BetType>("player");
  const [busy, setBusy] = useState(false);
  const [hand, setHand] = useState<HandResult | null>(null);
  // How many cards have landed so far, in real table order (P, B, P, B, then
  // any third cards) — totals and borders are derived from only these.
  const [shown, setShown] = useState({ player: 0, banker: 0 });
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const deal = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setHand(null);
    setShown({ player: 0, banker: 0 });
    try {
      const res = await fetch("/api/games/baccarat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, bet }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }
      const payload = data as Resp;
      // Deal like a real table: Player, Banker, Player, Banker, one card at a
      // time, then a held beat before any third card. The result, payout and
      // balance wait until the last card has landed.
      const h = payload.hand;
      setHand(h);
      const order: ("player" | "banker")[] = ["player", "banker", "player", "banker"];
      if (h.playerFaces.length > 2) order.push("player");
      if (h.bankerFaces.length > 2) order.push("banker");
      const counts = { player: 0, banker: 0 };
      for (let i = 0; i < order.length; i++) {
        if (i === 4) await wait(THIRD_CARD_PAUSE_MS);
        counts[order[i]] += 1;
        setShown({ ...counts });
        await wait(i === order.length - 1 ? CARD_DEAL_MS : CARD_STAGGER_MS + 120);
      }
      await wait(350);
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(
        game.name,
        payload.netCents,
        `${payload.hand.winner} ${payload.hand.playerTotal}-${payload.hand.bankerTotal}`,
      );
      setFeedVersion((v) => v + 1);
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, bet, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Deal",
    ready: !betError && effectiveBet > 0,
    busy,
    run: deal,
    note: `${BET_LABELS[bet]} · pays ${PAYOUT[bet]}×`,
  });

  const handTotal = (faces: Card[], n: number) =>
    faces.slice(0, n).reduce((t, c) => t + (["10", "J", "Q", "K"].includes(c.r) ? 0 : c.r === "A" ? 1 : Number(c.r)), 0) % 10;

  const winner = last?.hand.winner ?? null;
  const outcomeFor = (side: "player" | "banker"): Outcome =>
    !winner ? null : winner === "tie" ? "tie" : winner === side ? "win" : "lose";

  const canvas = (
    <div className="mx-auto w-full max-w-2xl">
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 sm:gap-8">
        <Hand
          label="Player"
          cards={hand ? hand.playerFaces.slice(0, shown.player) : []}
          total={hand && shown.player > 0 ? handTotal(hand.playerFaces, shown.player) : null}
          outcome={outcomeFor("player")}
        />
        <div className="mt-16 h-24 w-px bg-white/10" />
        <Hand
          label="Banker"
          cards={hand ? hand.bankerFaces.slice(0, shown.banker) : []}
          total={hand && shown.banker > 0 ? handTotal(hand.bankerFaces, shown.banker) : null}
          outcome={outcomeFor("banker")}
        />
      </div>

      <div className="mt-5 min-h-[56px] text-center">
        {last ? (
          <div className="animate-pop-in">
            <p className="text-[13px] font-black uppercase tracking-wide text-volt">
              {last.hand.winner === "tie" ? "Tie" : `${BET_LABELS[last.hand.winner]} wins`}
            </p>
            <p className={last.netCents > 0 ? "num-win mt-1 text-2xl" : last.netCents === 0 ? "num mt-1 text-2xl text-slate-400" : "num-loss mt-1 text-2xl"}>
              {last.netCents === 0 ? "Push" : formatSignedCents(last.netCents)}
            </p>
          </div>
        ) : busy ? (
          <p className="text-sm text-slate-500">Dealing…</p>
        ) : (
          <p className="text-sm text-slate-500">Pick Player, Tie or Banker below, then deal.</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        {(["player", "tie", "banker"] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBet(b)}
            disabled={busy}
            className={`relative overflow-hidden rounded-xl border bg-white/[0.03] px-2 pb-6 pt-7 text-center transition hover:bg-white/[0.06] disabled:cursor-not-allowed ${
              bet === b ? "border-volt/60" : "border-white/10"
            } ${winner === b ? "animate-win-pulse" : ""}`}
          >
            <span className={`absolute left-1/2 top-0 h-1.5 w-14 -translate-x-1/2 rounded-b ${BET_TAB[b]}`} />
            <span className="block text-base font-black text-white sm:text-lg">{BET_LABELS[b]}</span>
            <span className="num mt-1 block text-sm font-bold text-slate-500">{BET_ODDS[b]}</span>
            {bet === b && <span className="absolute inset-x-0 bottom-0 h-1.5 bg-volt" />}
          </button>
        ))}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12px] text-slate-400">
        Betting on <span className="font-black text-white">{BET_LABELS[bet]}</span> · pays {BET_ODDS[bet]}
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={deal} disabled={busy || !!betError} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Dealing…" : `Deal ${formatCents(effectiveBet)}`}
      </button>
    </div>
  );

  const rules = (
    <>
      <p>
        Standard Punto Banco: an {DECKS}-deck shoe, reset fresh every hand. There are no player
        decisions — the third-card rules are fixed, so once a bet is placed the hand plays itself out
        exactly the same way a real automatic baccarat table would.
      </p>
      <p>
        Every card is drawn from a real {DECKS}-deck shoe, rank and suit included, though suit never
        affects scoring: ten, jack, queen and king are all worth 0, ace is worth 1, and everything else
        is its face value. A hand total is the sum of its cards&apos; points, mod 10.
      </p>
      <p>
        Player pays 1:1, Banker pays 1:1 less the standard 5% commission, and Tie pays 8:1. A tie
        pushes any Player or Banker bet rather than losing it — the stake comes back, it just doesn't
        win.
      </p>
      <p className="text-[11px] text-slate-500">
        Exact odds — not textbook citations, enumerated from these exact rules and this exact shoe —
        are Player 44.6247%, Banker 45.8597%, Tie 9.5156% to win, giving RTPs of 98.76% / 98.94% /
        85.64%. See <code className="text-volt">npm run rtp</code>.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="baccarat" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

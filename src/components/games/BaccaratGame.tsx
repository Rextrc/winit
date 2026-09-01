"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { DECKS, PAYOUT, type BetType, type HandResult } from "@/lib/games/baccarat";
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

/** A point-value pip — baccarat scoring only ever depends on this. */
function Pip({ value, delayMs = 0 }: { value: number; delayMs?: number }) {
  return (
    <div
      className="animate-card-deal grid h-[74px] w-[52px] place-items-center rounded-xl border border-black/20 bg-slate-50 font-display text-2xl font-black text-slate-900 shadow-tile"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {value}
    </div>
  );
}

export default function BaccaratGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [bet, setBet] = useState<BetType>("player");
  const [busy, setBusy] = useState(false);
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

  const canvas = (
    <div className="mx-auto w-full max-w-xl">
      <div className="grid grid-cols-2 gap-6">
        <div className="text-center">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Player</p>
          <div className="flex min-h-[74px] items-center justify-center gap-1.5">
            {last?.hand.playerCards.map((v, i) => <Pip key={i} value={v} delayMs={i * 120} />) ?? (
              <div className="grid h-[74px] w-[52px] place-items-center rounded-xl border border-dashed border-white/10 text-slate-700">
                ·
              </div>
            )}
          </div>
          {last && <p className="num mt-2 text-2xl font-black text-white">{last.hand.playerTotal}</p>}
        </div>
        <div className="text-center">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Banker</p>
          <div className="flex min-h-[74px] items-center justify-center gap-1.5">
            {last?.hand.bankerCards.map((v, i) => <Pip key={i} value={v} delayMs={i * 120} />) ?? (
              <div className="grid h-[74px] w-[52px] place-items-center rounded-xl border border-dashed border-white/10 text-slate-700">
                ·
              </div>
            )}
          </div>
          {last && <p className="num mt-2 text-2xl font-black text-white">{last.hand.bankerTotal}</p>}
        </div>
      </div>

      <div className="mt-6 min-h-[70px] text-center">
        {last ? (
          <div className="animate-pop-in">
            <p className="text-[13px] font-black uppercase tracking-wide text-volt">{last.hand.winner} wins</p>
            <p className={last.netCents > 0 ? "num-win mt-1 text-2xl" : last.netCents === 0 ? "num mt-1 text-2xl text-slate-400" : "num-loss mt-1 text-2xl"}>
              {last.netCents === 0 ? "Push" : formatSignedCents(last.netCents)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Pick Player, Banker or Tie, then deal.</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Your bet</p>
        <div className="grid grid-cols-3 gap-2">
          {(["player", "banker", "tie"] as const).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBet(b)}
              disabled={busy}
              className={`rounded-xl border py-2.5 text-[12px] font-black uppercase tracking-wide transition ${
                bet === b ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-400"
              }`}
            >
              {BET_LABELS[b]}
              <span className="num mt-0.5 block text-[10px] font-bold text-slate-500">{PAYOUT[b]}×</span>
            </button>
          ))}
        </div>
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
        Cards are tracked by point value rather than suit, since baccarat scoring never depends on
        suit: ten, jack, queen and king are all worth 0, ace is worth 1, and everything else is its
        face value. A hand total is the sum of its cards' points, mod 10.
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

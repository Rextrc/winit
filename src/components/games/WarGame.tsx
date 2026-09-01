"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import SuitCard from "@/components/games/SuitCard";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { exactRtp, type Card, type WarOutcome } from "@/lib/games/war";

type Hand = {
  player: Card;
  dealer: Card;
  war: { player: Card; dealer: Card } | null;
  outcome: WarOutcome;
  stakeCents: number;
  payoutCents: number;
};

type Resp = {
  hand: Hand;
  won: boolean;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const RTP = exactRtp().rtp;

export default function WarGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [busy, setBusy] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [showWar, setShowWar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const deal = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setDealing(true);
    setError(null);
    setLast(null);
    setShowWar(false);

    try {
      const res = await fetch("/api/games/war", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDealing(false);
        setError(data.error ?? "Couldn't deal that hand.");
        setBusy(false);
        return;
      }

      const payload = data as Resp;
      await new Promise((r) => setTimeout(r, 550));
      setDealing(false);
      setLast(payload);

      // A war gets its own beat, so the tie reads before the second pair lands.
      if (payload.hand.war) {
        await new Promise((r) => setTimeout(r, 900));
        setShowWar(true);
        await new Promise((r) => setTimeout(r, 500));
      }

      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, payload.hand.war ? "Went to war" : `${payload.hand.player.r} v ${payload.hand.dealer.r}`);
      setFeedVersion((v) => v + 1);
    } catch {
      setDealing(false);
      setError("Network error — the hand was not dealt.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Deal",
    ready: !betError && effectiveBet > 0,
    busy,
    run: deal,
    note: "A tie doubles your stake and goes to war.",
  });

  const hand = last?.hand ?? null;
  const atWar = hand?.war != null;

  const row = (label: string, card: Card | undefined, delay: number) => (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <SuitCard rank={card?.r} suit={card?.s} hidden={!card || dealing} delayMs={delay} />
    </div>
  );

  const canvas = (
    <div className="mx-auto w-full max-w-md text-center">
      <div className="flex items-start justify-center gap-8">
        {row("You", hand?.player, 0)}
        <div className="grid h-[104px] place-items-center">
          <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-600">vs</span>
        </div>
        {row("House", hand?.dealer, 120)}
      </div>

      {atWar && (
        <div className={`mt-5 transition-opacity duration-300 ${showWar ? "opacity-100" : "opacity-0"}`}>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-[#f0c75e]">
            Tie — to war
          </p>
          <div className="flex items-start justify-center gap-8">
            {row("You", showWar ? hand!.war!.player : undefined, 0)}
            <div className="grid h-[104px] place-items-center">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-600">vs</span>
            </div>
            {row("House", showWar ? hand!.war!.dealer : undefined, 120)}
          </div>
        </div>
      )}

      {last && (!atWar || showWar) && (
        <div className="animate-pop-in mt-5">
          <p className={last.netCents > 0 ? "num-win text-3xl" : last.netCents === 0 ? "num text-3xl text-slate-300" : "num-loss text-3xl"}>
            {last.netCents === 0 ? "PUSH" : formatSignedCents(last.netCents)}
          </p>
          <p className="num mt-1 text-[11px] text-slate-500">
            Staked {formatCents(last.hand.stakeCents)} · returned {formatCents(last.hand.payoutCents)}
          </p>
        </div>
      )}

      {!last && <p className="mt-5 text-sm text-slate-500">{dealing ? "Dealing…" : "Highest card wins."}</p>}
      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy} />

      <button type="button" onClick={deal} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Dealing…" : `Deal ${formatCents(effectiveBet)}`}
      </button>

      <div className="rounded-xl border border-white/5 bg-base-900/50 p-3 text-[12px] leading-relaxed text-slate-400">
        <p className="mb-1.5 font-bold text-slate-200">On a tie</p>
        <p>
          Your stake doubles and both sides draw again. Win the war and the raise pays even money
          while the original stake pushes — so you risk {formatCents(effectiveBet * 2)} to win{" "}
          {formatCents(effectiveBet)}. That asymmetry is the entire house edge here.
        </p>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        One card each, highest rank wins, suits are decoration. The shoe is modelled as continuously
        shuffled — every card is an independent uniform draw over the thirteen ranks — which is a
        deliberate choice, not a shortcut: it means the published return below is EXACTLY what the
        dealing code produces, with no deck-depletion drift between the figure and the game.
      </p>
      <p>
        A tie sends the hand to war: the stake doubles, both draw again, and a win pays even money on
        the raise while the original stake pushes. A tie inside the war also pays the raise.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP exactly {(RTP * 100).toFixed(3)}%</span>,
        computed by enumerating the full 13x13 grid of rank pairs and, on the ties, the war pairs too.
        It is quoted against total money staked rather than the opening bet, because a war changes
        how much you have at risk — quoting it against the opening bet alone would flatter the number.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="war" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import SuitCard from "@/components/games/SuitCard";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  HAND_LABELS,
  exactRtp,
  paytable,
  probabilityOf,
  type Card,
  type HandClass,
} from "@/lib/games/threecard";

type Resp = {
  result: { cards: Card[]; hand: HandClass; multiplier: number; payoutCents: number };
  won: boolean;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const PAYS = paytable();
const ORDER: HandClass[] = ["straightFlush", "trips", "straight", "flush", "pair"];

export default function ThreeCardGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [busy, setBusy] = useState(false);
  const [dealing, setDealing] = useState(false);
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
    setDealing(true);
    setError(null);
    setLast(null);

    try {
      const res = await fetch("/api/games/threecard", {
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
      await new Promise((r) => setTimeout(r, 700));
      setDealing(false);
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, HAND_LABELS[payload.result.hand]);
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
    note: "Pair Plus — paid on your own three cards, no dealer to beat.",
  });

  const cards = last?.result.cards;

  const canvas = (
    <div className="mx-auto w-full max-w-md text-center">
      <div className="flex items-center justify-center gap-3">
        {[0, 1, 2].map((i) => (
          <SuitCard
            key={i}
            rank={cards?.[i]?.r}
            suit={cards?.[i]?.s}
            hidden={!cards || dealing}
            delayMs={i * 130}
            highlighted={!!last && last.result.multiplier > 0}
          />
        ))}
      </div>

      {last ? (
        <div className="animate-pop-in mt-5">
          <p className="text-[13px] font-black uppercase tracking-wide text-white">
            {HAND_LABELS[last.result.hand]}
          </p>
          <p className={last.netCents > 0 ? "num-win mt-1 text-3xl" : "num-loss mt-1 text-3xl"}>
            {formatSignedCents(last.netCents)}
          </p>
          {last.result.multiplier > 0 && (
            <p className="num mt-1 text-[12px] text-slate-400">Paid {last.result.multiplier}x</p>
          )}
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-500">{dealing ? "Dealing…" : "Three cards, paid on their own merit."}</p>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy} />

      <button type="button" onClick={deal} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Dealing…" : `Deal ${formatCents(effectiveBet)}`}
      </button>

      <div className="rounded-xl border border-white/5 bg-base-900/50 p-3">
        <p className="label mb-2">Pair Plus paytable</p>
        <ul className="space-y-1">
          {ORDER.map((h) => (
            <li
              key={h}
              className={`flex items-center justify-between rounded-lg px-1.5 py-1 text-[12px] transition ${
                last?.result.hand === h ? "bg-volt/15 text-volt" : "text-slate-300"
              }`}
            >
              <span>
                {HAND_LABELS[h]}
                <span className="ml-1.5 text-[10px] text-slate-600">
                  {(probabilityOf(h) * 100).toFixed(2)}%
                </span>
              </span>
              <span className="num font-bold">{PAYS[h]}x</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        One three-card hand, paid on what it is — there is no dealer hand to beat, which is what
        makes the odds here fully enumerable. There are only C(52,3) = 22,100 distinct hands, so
        every probability on this page comes from counting all of them rather than from a table
        someone typed in.
      </p>
      <p>
        The paytable itself is derived the same way Keno&apos;s is: a fixed shape sets the relative
        worth of each hand class, then the whole row is scaled so the exact expectation over those
        22,100 hands lands on 99%.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP exactly {(exactRtp() * 100).toFixed(2)}%</span>,
        recomputed from the rounded multipliers actually paid.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="threecard" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

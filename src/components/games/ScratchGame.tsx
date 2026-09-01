"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { TIERS, exactRtp } from "@/lib/games/scratch";

type Resp = {
  card: { panels: string[]; winningSymbol: string | null; multiplier: number; payoutCents: number };
  won: boolean;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

export default function ScratchGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>(Array(9).fill(false));
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const allRevealed = revealed.every(Boolean);

  const buy = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setRevealed(Array(9).fill(false));
    timers.current.forEach(clearTimeout);
    timers.current = [];

    try {
      const res = await fetch("/api/games/scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't buy that card.");
        setBusy(false);
        return;
      }

      const payload = data as Resp;
      setLast(payload);

      // The card is already decided; this is purely the reveal.
      payload.card.panels.forEach((_, i) => {
        timers.current.push(
          setTimeout(() => {
            setRevealed((r) => {
              const next = [...r];
              next[i] = true;
              return next;
            });
          }, 120 * i + 150),
        );
      });

      timers.current.push(
        setTimeout(() => {
          applyResult(payload.balanceCents, payload.netCents);
          applyProgress(payload.progress);
          pushFlash(game.name, payload.netCents, payload.card.winningSymbol ? `Three ${payload.card.winningSymbol}` : "No match");
          setFeedVersion((v) => v + 1);
          setBusy(false);
        }, 120 * 9 + 350),
      );
    } catch {
      setError("Network error — the card was not bought.");
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, applyResult, applyProgress, pushFlash, game.name]);

  const revealAll = useCallback(() => {
    timers.current.forEach(clearTimeout);
    setRevealed(Array(9).fill(true));
  }, []);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Buy card",
    ready: !betError && effectiveBet > 0,
    busy,
    run: buy,
    note: "Match three symbols to win — the card is decided the moment you buy it.",
  });

  const panels = last?.card.panels ?? Array(9).fill("?");
  const winner = last?.card.winningSymbol ?? null;

  const canvas = (
    <div className="mx-auto w-full max-w-sm text-center">
      <div className="mx-auto grid w-full max-w-[300px] grid-cols-3 gap-2 rounded-2xl border-2 border-[#8a5f18] bg-gradient-to-b from-[#1a1206] to-[#0b0a07] p-3 shadow-[inset_0_2px_12px_rgba(0,0,0,0.6)]">
        {panels.map((symbol, i) => {
          const open = last !== null && revealed[i];
          const isWinner = open && winner !== null && symbol === winner;
          return (
            <div
              key={i}
              className={`relative grid aspect-square place-items-center overflow-hidden rounded-xl border text-3xl font-black transition-all duration-300 ${
                open
                  ? isWinner
                    ? "animate-win-pulse border-[#f0c75e] bg-[#f0c75e]/15 text-[#f5d78e]"
                    : "border-white/10 bg-base-900/70 text-slate-400"
                  : "border-[#c9a227]/40 bg-gradient-to-br from-[#d9b64a] to-[#9c7a1e] text-transparent"
              }`}
            >
              {open ? symbol : ""}
              {!open && (
                <span
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(45deg, rgba(0,0,0,0.25) 0 4px, transparent 4px 9px)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {last && !allRevealed && (
        <button type="button" onClick={revealAll} className="btn-chip mt-3">
          Reveal all
        </button>
      )}

      {last && allRevealed && (
        <div className="animate-pop-in mt-4">
          <p className={last.netCents > 0 ? "num-win text-3xl" : "num-loss text-3xl"}>
            {formatSignedCents(last.netCents)}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            {winner ? `Three ${winner} — ${last.card.multiplier}x` : "No three of a kind"}
          </p>
        </div>
      )}

      {!last && <p className="mt-4 text-sm text-slate-500">Buy a card and scratch the panels.</p>}
      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <BetControls disabled={busy} />

      <button type="button" onClick={buy} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Scratching…" : `Buy card ${formatCents(effectiveBet)}`}
      </button>

      <div className="rounded-xl border border-white/5 bg-base-900/50 p-3">
        <p className="label mb-2">Prizes</p>
        <ul className="space-y-1">
          {TIERS.map((t) => (
            <li key={t.symbol} className="flex items-center justify-between text-[12px]">
              <span className="text-slate-300">
                <span className="mr-2 text-base">{t.symbol}</span>
                Three {t.label.toLowerCase()}s
              </span>
              <span className="num font-bold text-volt">{t.multiplier}x</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        Nine panels, three matching symbols to win. The prize is drawn from a fixed weighted table
        the moment you buy the card — the panels are then laid out to show that result, exactly the
        way the roulette animation renders a pocket that has already been drawn. Scratching in a
        different order cannot change anything, because nothing about the order is read.
      </p>
      <p>
        A losing card never shows a symbol three times, so it cannot be mistaken for a winner you
        failed to spot.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP exactly {(exactRtp() * 100).toFixed(2)}%</span> — the
        weighted mean of the prize table, which is exact by construction rather than measured.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="scratch" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

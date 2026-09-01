"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  MIN_PAYING_HITS,
  PICKS,
  POOL,
  exactRtp,
  hitProbability,
  paytable,
  quickPick,
} from "@/lib/games/lottery";

type Resp = {
  result: {
    drawn: number[];
    ticket: number[];
    matched: number[];
    hits: number;
    multiplier: number;
    payoutCents: number;
  };
  won: boolean;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const PAYS = paytable();

export default function LotteryGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [ticket, setTicket] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [drawnSoFar, setDrawnSoFar] = useState<number[]>([]);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const toggle = (n: number) => {
    if (busy) return;
    setLast(null);
    setDrawnSoFar([]);
    setTicket((t) => (t.includes(n) ? t.filter((x) => x !== n) : t.length < PICKS ? [...t, n] : t));
  };

  const play = useCallback(async () => {
    if (busy) return;
    if (ticket.length !== PICKS) {
      setError(`Pick ${PICKS} numbers.`);
      return;
    }
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setDrawnSoFar([]);
    timers.current.forEach(clearTimeout);
    timers.current = [];

    try {
      const res = await fetch("/api/games/lottery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, numbers: ticket }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't buy that ticket.");
        setBusy(false);
        return;
      }

      const payload = data as Resp;

      // The draw already happened; the balls just come out one at a time.
      payload.result.drawn.forEach((n, i) => {
        timers.current.push(setTimeout(() => setDrawnSoFar((d) => [...d, n]), 480 * (i + 1)));
      });

      timers.current.push(
        setTimeout(
          () => {
            setLast(payload);
            applyResult(payload.balanceCents, payload.netCents);
            applyProgress(payload.progress);
            pushFlash(game.name, payload.netCents, `${payload.result.hits} of ${PICKS}`);
            setFeedVersion((v) => v + 1);
            setBusy(false);
          },
          480 * PICKS + 400,
        ),
      );
    } catch {
      setError("Network error — the ticket was not bought.");
      setBusy(false);
    }
  }, [busy, ticket, betError, effectiveBet, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Buy ticket",
    ready: !betError && effectiveBet > 0 && ticket.length === PICKS,
    busy,
    run: play,
    note:
      ticket.length === PICKS
        ? `Ticket: ${[...ticket].sort((a, b) => a - b).join(", ")}`
        : `Pick ${PICKS - ticket.length} more number${PICKS - ticket.length === 1 ? "" : "s"}.`,
  });

  const canvas = (
    <div className="mx-auto w-full max-w-lg text-center">
      <div className="mb-4 flex min-h-[52px] flex-wrap items-center justify-center gap-2">
        {drawnSoFar.length === 0 && !last ? (
          <p className="text-sm text-slate-500">
            {busy ? "Drawing…" : `Pick ${PICKS} numbers from ${POOL}.`}
          </p>
        ) : (
          drawnSoFar.map((n, i) => (
            <span
              key={`${n}-${i}`}
              className={`num animate-pop-in grid h-11 w-11 place-items-center rounded-full border-2 text-[15px] font-black shadow-tile ${
                ticket.includes(n)
                  ? "animate-win-pulse border-[#f0c75e] bg-gradient-to-b from-[#f5d78e] to-[#d4a83c] text-[#2a1d05]"
                  : "border-white/15 bg-base-700 text-slate-300"
              }`}
            >
              {n}
            </span>
          ))
        )}
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-10">
        {Array.from({ length: POOL }, (_, i) => i + 1).map((n) => {
          const picked = ticket.includes(n);
          const hit = last && last.result.matched.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggle(n)}
              disabled={busy}
              className={`num aspect-square rounded-lg border text-[11px] font-bold transition-all duration-200 hover:-translate-y-px disabled:opacity-60 ${
                hit
                  ? "animate-win-pulse border-[#f0c75e] bg-[#f0c75e]/20 text-[#f5d78e]"
                  : picked
                    ? "border-volt bg-volt/15 text-volt"
                    : "border-white/10 bg-white/5 text-slate-400"
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>

      {last && (
        <div className="animate-pop-in mt-4">
          <p className={last.netCents > 0 ? "num-win text-3xl" : "num-loss text-3xl"}>
            {formatSignedCents(last.netCents)}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            {last.result.hits} of {PICKS} matched
            {last.result.multiplier > 0 ? ` — paid ${last.result.multiplier}x` : ""}
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setLast(null);
            setDrawnSoFar([]);
            setTicket(quickPick());
          }}
          disabled={busy}
          className="btn-ghost flex-1 py-2 text-xs"
        >
          Quick pick
        </button>
        <button
          type="button"
          onClick={() => {
            setLast(null);
            setDrawnSoFar([]);
            setTicket([]);
          }}
          disabled={busy || ticket.length === 0}
          className="btn-ghost flex-1 py-2 text-xs"
        >
          Clear
        </button>
      </div>

      <BetControls disabled={busy} />

      <button
        type="button"
        onClick={play}
        disabled={busy || ticket.length !== PICKS}
        className="btn-primary w-full py-3 text-base shadow-volt"
      >
        {busy ? "Drawing…" : `Buy ticket ${formatCents(effectiveBet)}`}
      </button>

      <div className="rounded-xl border border-white/5 bg-base-900/50 p-3">
        <p className="label mb-2">Paytable</p>
        <ul className="space-y-1">
          {PAYS.map((m, hits) =>
            m > 0 ? (
              <li
                key={hits}
                className={`flex items-center justify-between rounded-lg px-1.5 py-1 text-[12px] ${
                  last?.result.hits === hits ? "bg-volt/15 text-volt" : "text-slate-300"
                }`}
              >
                <span>
                  {hits} of {PICKS}
                  <span className="ml-1.5 text-[10px] text-slate-600">
                    1 in {Math.round(1 / hitProbability(hits)).toLocaleString()}
                  </span>
                </span>
                <span className="num font-bold">{m.toLocaleString()}x</span>
              </li>
            ) : null,
          )}
        </ul>
      </div>
    </div>
  );

  const rules = (
    <>
      <p>
        Pick {PICKS} numbers from {POOL}; {PICKS} are drawn by an unbiased Fisher-Yates shuffle. Match{" "}
        {MIN_PAYING_HITS} or more and the ticket pays.
      </p>
      <p>
        A real lottery keeps something like half of every ticket. This one does not, because the
        paytable is derived rather than written down: pays rise geometrically from the lowest paying
        hit count, then the whole row is scaled so the exact hypergeometric expectation lands on 99%.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP exactly {(exactRtp() * 100).toFixed(2)}%</span>,
        recomputed from the rounded multipliers actually paid.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="lottery" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { BET_LABELS, exactRtp, type CrapsBet } from "@/lib/games/craps";

type Roll = { dice: [number, number]; total: number };

type Resp = {
  result: {
    bet: CrapsBet;
    rolls: Roll[];
    point: number | null;
    outcome: "WIN" | "LOSS" | "PUSH";
    multiplier: number;
    payoutCents: number;
    summary: string;
  };
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Die({ face, rolling }: { face: number; rolling: boolean }) {
  return (
    <div
      className={`grid h-14 w-14 grid-cols-3 grid-rows-3 gap-1 rounded-xl border border-white/20 bg-gradient-to-br from-white to-slate-300 p-1.5 shadow-tile ${
        rolling ? "animate-[spin_0.45s_linear_infinite]" : "animate-pop-in"
      }`}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className={`rounded-full ${PIPS[face]?.includes(i) ? "bg-base-900" : ""}`} />
      ))}
    </div>
  );
}

export default function CrapsGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [bet, setBet] = useState<CrapsBet>("pass");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Roll[]>([]);
  const [rolling, setRolling] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const play = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setShown([]);
    setRolling(true);
    timers.current.forEach(clearTimeout);
    timers.current = [];

    try {
      const res = await fetch("/api/games/craps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, bet }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRolling(false);
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }

      const payload = data as Resp;

      // The whole sequence already resolved server-side; replay it a roll at a time.
      payload.result.rolls.forEach((roll, i) => {
        timers.current.push(
          setTimeout(() => {
            setShown((s) => [...s, roll]);
            if (i === payload.result.rolls.length - 1) setRolling(false);
          }, 700 * (i + 1)),
        );
      });

      timers.current.push(
        setTimeout(
          () => {
            setLast(payload);
            applyResult(payload.balanceCents, payload.netCents);
            applyProgress(payload.progress);
            pushFlash(game.name, payload.netCents, payload.result.summary);
            setFeedVersion((v) => v + 1);
            setBusy(false);
          },
          700 * payload.result.rolls.length + 350,
        ),
      );
    } catch {
      setRolling(false);
      setError("Network error — the bet was not placed.");
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, bet, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Roll",
    ready: !betError && effectiveBet > 0,
    busy,
    run: play,
    note: `${BET_LABELS[bet]} · RTP ${(exactRtp(bet) * 100).toFixed(3)}%`,
  });

  const current = shown[shown.length - 1];
  const point = last?.result.point ?? (shown.length > 0 && ![2, 3, 7, 11, 12].includes(shown[0].total) ? shown[0].total : null);

  const canvas = (
    <div className="mx-auto w-full max-w-lg text-center">
      <div className="rounded-2xl border-2 border-[#8a5f18] bg-gradient-to-b from-[#0b2242] to-[#050f21] p-6">
        <div className="flex items-center justify-center gap-4">
          <Die face={rolling ? 3 : (current?.dice[0] ?? 1)} rolling={rolling} />
          <Die face={rolling ? 5 : (current?.dice[1] ?? 1)} rolling={rolling} />
        </div>

        {current && !rolling && (
          <p className="num mt-3 text-2xl font-black text-white">{current.total}</p>
        )}

        {point !== null && bet !== "field" && (
          <p className="mt-2 inline-block rounded-full border border-[#f0c75e]/50 bg-[#f0c75e]/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#f0c75e]">
            Point {point}
          </p>
        )}

        {shown.length > 1 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {shown.map((r, i) => (
              <span
                key={i}
                className={`num grid h-6 w-6 place-items-center rounded-md text-[10px] font-black ${
                  i === shown.length - 1 ? "bg-volt text-white" : "bg-white/10 text-slate-400"
                }`}
              >
                {r.total}
              </span>
            ))}
          </div>
        )}
      </div>

      {last ? (
        <div className="animate-pop-in mt-4">
          <p className={last.netCents > 0 ? "num-win text-3xl" : last.netCents === 0 ? "num text-3xl text-slate-300" : "num-loss text-3xl"}>
            {last.netCents === 0 ? "PUSH" : formatSignedCents(last.netCents)}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">{last.result.summary}</p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          {busy ? "Rolling…" : "Pick a bet — the whole sequence resolves in one throw."}
        </p>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Bet</p>
        <div className="space-y-2">
          {(["pass", "dontPass", "field"] as CrapsBet[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBet(b)}
              disabled={busy}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-px disabled:opacity-50 ${
                bet === b ? "border-volt bg-volt/10" : "border-white/10"
              }`}
            >
              <span className="text-[13px] font-bold text-slate-100">{BET_LABELS[b]}</span>
              <span className="num text-[11px] font-bold text-volt">
                {(exactRtp(b) * 100).toFixed(2)}%
              </span>
            </button>
          ))}
        </div>
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={play} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Rolling…" : `Roll ${formatCents(effectiveBet)}`}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-slate-500">
        Pass and don&apos;t pass roll on until the point repeats or a seven shows. Field is settled on
        one roll.
      </p>
    </div>
  );

  const rules = (
    <>
      <p>
        The come-out is rolled, and if it sets a point the dice keep rolling until the point repeats
        or a seven shows — all inside one request, server-side. You are shown the full sequence
        afterwards, so nothing about the result waits on anything the browser sends.
      </p>
      <p>
        The point phase looks like an infinite series but collapses: once a point is set, the only
        rolls that matter are the point and the seven, so the chance of making it is simply
        ways(point) / (ways(point) + ways(7)).
      </p>
      <p>
        <span className="font-bold text-slate-200">
          Pass {(exactRtp("pass") * 100).toFixed(3)}% · Don&apos;t pass{" "}
          {(exactRtp("dontPass") * 100).toFixed(3)}% · Field {(exactRtp("field") * 100).toFixed(3)}%
        </span>{" "}
        — the real odds of the real game. This is the one family of bets in the app not priced to a
        flat 99%, because the point mechanic is the thing being modelled and re-pricing it would make
        it a different game.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="craps" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

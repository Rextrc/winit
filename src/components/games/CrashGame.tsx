"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  MAX_TARGET,
  MIN_TARGET,
  chanceOfReaching,
  multiplierAt,
  timeToReach,
  validTarget,
} from "@/lib/games/crash";

type View = {
  status: "RUNNING" | "CASHED_OUT" | "BUSTED";
  betCents: number;
  startedAt: number;
  autoTarget: number | null;
  cashedAt: number | null;
  crashPoint: number | null;
};

type Resp = {
  roundId: string;
  view: View;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate | null;
};

/** How often a live manual round asks the server whether it has crashed. */
const POLL_MS = 700;

export default function CrashGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [auto, setAuto] = useState(true);
  const [targetText, setTargetText] = useState("2.00");
  const [busy, setBusy] = useState(false);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  /** The multiplier the curve is showing right now. */
  const [display, setDisplay] = useState(1);
  const [settled, setSettled] = useState<{ netCents: number; cashedAt: number | null; crashPoint: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const frame = useRef<number | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  /** For an auto round the whole thing is already decided; this is the replay. */
  const replayStop = useRef<number | null>(null);

  const target = Number(targetText);
  const targetOk = validTarget(target);

  const stopLoops = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    if (poll.current) clearInterval(poll.current);
    frame.current = null;
    poll.current = null;
  }, []);

  useEffect(() => () => stopLoops(), [stopLoops]);

  /** Runs the rising curve until `stopAt` (auto replay) or forever (manual). */
  const animate = useCallback((startedAt: number, stopAt: number | null, onDone?: () => void) => {
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const m = multiplierAt(elapsed);
      if (stopAt !== null && m >= stopAt) {
        setDisplay(stopAt);
        onDone?.();
        return;
      }
      setDisplay(m);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, []);

  const finish = useCallback(
    (payload: Resp, netCents: number) => {
      const v = payload.view;
      setSettled({
        netCents,
        cashedAt: v.cashedAt,
        crashPoint: v.crashPoint ?? 0,
      });
      setRoundId(null);
      setView(v);
      applyResult(payload.balanceCents, netCents);
      if (payload.progress) applyProgress(payload.progress);
      pushFlash(
        game.name,
        netCents,
        v.status === "CASHED_OUT"
          ? `Cashed at ${v.cashedAt?.toFixed(2)}x`
          : `Crashed at ${v.crashPoint?.toFixed(2)}x`,
      );
      setFeedVersion((f) => f + 1);
      setBusy(false);
    },
    [applyResult, applyProgress, pushFlash, game.name],
  );

  const start = useCallback(async () => {
    if (busy || roundId) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    if (auto && !targetOk) {
      setError(`Auto cash-out must be between ${MIN_TARGET} and ${MAX_TARGET}.`);
      return;
    }

    setBusy(true);
    setError(null);
    setSettled(null);
    setDisplay(1);
    stopLoops();

    try {
      const res = await fetch("/api/games/crash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          betCents: effectiveBet,
          autoTarget: auto ? target : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't start that round.");
        setBusy(false);
        return;
      }

      const payload = data as Resp;
      setView(payload.view);

      if (auto) {
        // Already settled server-side. Replay the curve up to whatever happened.
        const v = payload.view;
        const stopAt = v.status === "CASHED_OUT" ? v.cashedAt! : v.crashPoint!;
        replayStop.current = stopAt;
        const replayStart = Date.now();
        animate(replayStart, stopAt, () => {
          const won = v.status === "CASHED_OUT";
          const netCents = won ? Math.round(v.betCents * v.cashedAt!) - v.betCents : -v.betCents;
          finish(payload, netCents);
        });
        return;
      }

      // Manual: the curve runs off the server's own start time, and we ask the
      // server whether it has crashed rather than guessing locally.
      setRoundId(payload.roundId);
      animate(payload.view.startedAt, null);
      poll.current = setInterval(async () => {
        try {
          const r = await fetch("/api/games/crash", { cache: "no-store" });
          const d = await r.json();
          if (!d.round) return;
          if (d.round.view && d.round.view.status !== "RUNNING") {
            stopLoops();
            const v = d.round.view as View;
            setDisplay(v.crashPoint ?? display);
            finish({ roundId: d.round.id, view: v, balanceCents: d.balanceCents, progress: d.round.progress ?? null }, -v.betCents);
          }
        } catch {
          /* a dropped poll is harmless — the next one will catch it */
        }
      }, POLL_MS);
      setBusy(false);
    } catch {
      setError("Network error — the round was not started.");
      setBusy(false);
    }
  }, [busy, roundId, betError, effectiveBet, auto, target, targetOk, animate, finish, stopLoops, display]);

  const cashout = useCallback(async () => {
    if (!roundId) return;
    stopLoops();
    try {
      const res = await fetch("/api/games/crash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashout", roundId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't cash out.");
        setRoundId(null);
        setBusy(false);
        return;
      }
      const payload = data as Resp;
      const v = payload.view;
      const won = v.status === "CASHED_OUT";
      const netCents = won ? Math.round(v.betCents * v.cashedAt!) - v.betCents : -v.betCents;
      if (v.cashedAt) setDisplay(v.cashedAt);
      finish(payload, netCents);
    } catch {
      setError("Network error — could not cash out.");
    }
  }, [roundId, stopLoops, finish]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: roundId ? "Cash out" : "Launch",
    ready: roundId ? true : !betError && effectiveBet > 0 && (!auto || targetOk),
    busy: busy && !roundId,
    run: roundId ? cashout : start,
    note: auto
      ? `Auto cash-out at ${targetOk ? target.toFixed(2) : "—"}x · ${targetOk ? (chanceOfReaching(target) * 100).toFixed(2) : "—"}% chance`
      : "Manual — cash out before it breaks.",
    autoplay: false,
  });

  const live = roundId !== null;
  const crashed = settled !== null && settled.cashedAt === null;

  const canvas = (
    <div className="mx-auto w-full max-w-lg">
      <div className="relative h-56 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0b1424] to-[#03060e]">
        {/* the curve */}
        <svg viewBox="0 0 400 200" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={crashed ? "#ff5a6e" : "#2e8bff"} stopOpacity="0.35" />
              <stop offset="100%" stopColor={crashed ? "#ff5a6e" : "#2e8bff"} stopOpacity="0" />
            </linearGradient>
          </defs>
          {(() => {
            // The curve is the same exponential the server prices against, drawn
            // across whatever span keeps the head on screen.
            const span = Math.max(4000, timeToReach(display) * 1.15);
            const pts: string[] = [];
            for (let i = 0; i <= 60; i++) {
              const t = (span * i) / 60;
              const m = multiplierAt(t);
              const x = (i / 60) * 400;
              const y = 200 - Math.min(196, (Math.log2(m) / Math.log2(Math.max(2, display * 1.3))) * 190);
              pts.push(`${x},${y}`);
              if (m > display) break;
            }
            const line = pts.join(" ");
            return (
              <>
                <polyline points={`0,200 ${line} ${pts[pts.length - 1]?.split(",")[0] ?? 0},200`} fill="url(#crash-fill)" />
                <polyline
                  points={line}
                  fill="none"
                  stroke={crashed ? "#ff5a6e" : "#2e8bff"}
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </>
            );
          })()}
        </svg>

        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p
              className={`num text-6xl font-black tabular-nums transition-colors ${
                crashed ? "text-loss" : settled ? "text-win" : "text-white"
              }`}
            >
              {display.toFixed(2)}x
            </p>
            {crashed && <p className="mt-1 text-[13px] font-black uppercase tracking-[0.2em] text-loss">Crashed</p>}
            {settled && !crashed && (
              <p className="mt-1 text-[13px] font-black uppercase tracking-[0.2em] text-win">
                Cashed at {settled.cashedAt?.toFixed(2)}x
              </p>
            )}
            {live && <p className="mt-1 text-[12px] text-slate-400">Cash out any time</p>}
          </div>
        </div>
      </div>

      {settled && (
        <div className="animate-pop-in mt-4 text-center">
          <p className={settled.netCents > 0 ? "num-win text-3xl" : "num-loss text-3xl"}>
            {formatSignedCents(settled.netCents)}
          </p>
          <p className="num mt-1 text-[12px] text-slate-500">
            It went to {settled.crashPoint.toFixed(2)}x
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-center text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: true, label: "Auto" },
          { key: false, label: "Manual" },
        ].map((m) => (
          <button
            key={String(m.key)}
            type="button"
            onClick={() => setAuto(m.key)}
            disabled={busy || live}
            className={`rounded-xl border py-2.5 text-[12px] font-black uppercase tracking-wide transition-all duration-200 disabled:opacity-50 ${
              auto === m.key ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-400"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {auto && (
        <div>
          <label className="label" htmlFor="crash-target">
            Auto cash-out
          </label>
          <input
            id="crash-target"
            className="field num"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            disabled={busy || live}
            inputMode="decimal"
          />
          {targetOk && (
            <p className="num mt-1.5 text-[11px] text-slate-500">
              {(chanceOfReaching(target) * 100).toFixed(2)}% chance · pays {target.toFixed(2)}x
            </p>
          )}
        </div>
      )}

      <BetControls disabled={busy || live} />

      {live ? (
        <button type="button" onClick={cashout} className="btn-primary w-full py-3 text-base shadow-volt">
          Cash out at {display.toFixed(2)}x
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy || (auto && !targetOk)}
          className="btn-primary w-full py-3 text-base shadow-volt"
        >
          {busy ? "In the air…" : `Launch ${formatCents(effectiveBet)}`}
        </button>
      )}

      <p className="text-center text-[11px] leading-relaxed text-slate-500">
        {auto
          ? "Auto is settled server-side the instant you launch, so reaction time cannot cost you anything."
          : "Manual pays whatever the server's clock reads when your cash-out lands."}
      </p>
    </div>
  );

  const rules = (
    <>
      <p>
        The crash point is drawn once, when the round starts, and stored server-side before your
        browser is told anything. It is the same draw Limbo uses: with u uniform on (0,1], the crash
        point is 0.99 / u, so the chance of reaching any multiplier M is exactly 0.99 / M. Cash out
        at M and you are paid M for an event of probability 0.99 / M — a return of exactly 99% at
        every point on the curve. There is no safe end and no greedy end; they are priced identically.
      </p>
      <p>
        <span className="font-bold text-slate-200">Auto</span> names your multiplier up front and is
        settled at once, server-side, by comparing it to the drawn crash point. Reaction time cannot
        enter into it, so the 99% is exact.
      </p>
      <p>
        <span className="font-bold text-slate-200">Manual</span> is honest but not exactly 99% for
        you personally: the multiplier is read from the server&apos;s own clock, never from a number
        your browser sends, and your reaction time plus the network round trip can only ever land you
        lower than you aimed, never higher. Auto is the mode with no such drag.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="crash" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

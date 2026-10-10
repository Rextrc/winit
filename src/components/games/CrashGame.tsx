"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import CrashPlayers, { type LivePlayer } from "@/components/games/CrashPlayers";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { useSession } from "next-auth/react";
import { formatCents, formatSignedCents } from "@/lib/money";
import type { ProgressUpdate } from "@/lib/ledger";
import { MAX_TARGET, MIN_TARGET, multiplierAt, timeToReach, validTarget } from "@/lib/games/crash";
import sfx from "@/lib/sound";

type MyBet = {
  roundId: number;
  betCents: number;
  autoTarget: number | null;
  status: "ACTIVE" | "CASHED" | "LOST";
  cashedAt: number | null;
  payoutCents: number;
};

type Live = {
  serverNow: number;
  round: { id: number; phase: "countdown" | "flight" | "crashed"; startsAt: number; crashPoint: number | null };
  players: LivePlayer[];
  history: number[];
  me: {
    balanceCents: number;
    bet: MyBet | null;
    settled: (Omit<MyBet, "autoTarget"> & { progress: ProgressUpdate }) | null;
  } | null;
};

/** Fixed starfield — positions only, so it can be generated once. */
const STARS = Array.from({ length: 46 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: r(1) * 130 - 15, y: r(2) * 130 - 15, s: 1 + r(3) * 1.8, o: 0.25 + r(4) * 0.6 };
});

const SHARDS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + 0.3;
  const d = 40 + (i % 3) * 18;
  return { dx: `${Math.cos(a) * d}px`, dy: `${Math.sin(a) * d}px`, c: i % 2 ? "#ffb347" : "#ff5a6e" };
});

function Rocket({ angle, flying }: { angle: number; flying: boolean }) {
  return (
    <div className="absolute" style={{ transform: `translate(-70%, -50%) rotate(${angle}deg)`, transformOrigin: "70% 50%" }}>
      <div className={flying ? "animate-rocket-shake" : ""}>
        <svg width="88" height="41" viewBox="0 0 64 30" className="overflow-visible drop-shadow-[0_0_10px_rgba(143,92,255,0.55)]">
          {flying && (
            <g className="animate-flame" style={{ transformOrigin: "14px 15px", transformBox: "view-box" }}>
              <path d="M14 8 C 2 10, -14 15, 14 22 Z" fill="#ff7a1a" opacity="0.9" />
              <path d="M14 11 C 6 12, -2 15, 14 19 Z" fill="#ffd166" />
            </g>
          )}
          <path d="M16 5 L 26 15 L 16 25 Z" fill="#8f5cff" />
          <path d="M14 9 H 44 C 54 9, 60 13, 63 15 C 60 17, 54 21, 44 21 H 14 Z" fill="#e8edf5" />
          <path d="M44 9 C 54 9, 60 13, 63 15 C 60 17, 54 21, 44 21 Z" fill="#ff5a6e" />
          <circle cx="36" cy="15" r="3.6" fill="#0b1424" stroke="#8f5cff" strokeWidth="1.6" />
          <path d="M20 9 L 14 0 L 30 9 Z M20 21 L 14 30 L 30 21 Z" fill="#8f5cff" />
        </svg>
      </div>
    </div>
  );
}


/** Faster while the rocket is up, so a crash shows up within a beat. */
const POLL_FLIGHT_MS = 350;
const POLL_IDLE_MS = 900;

export default function CrashGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();
  const { status } = useSession();
  const signedIn = status === "authenticated";

  const [live, setLive] = useState<Live | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [autoOn, setAutoOn] = useState(false);
  const [targetText, setTargetText] = useState("2.00");
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const [myResult, setMyResult] = useState<{ roundId: number; netCents: number; cashedAt: number | null } | null>(null);

  /** serverNow − Date.now() at the last poll: the client's clock skew. */
  const offset = useRef(0);
  /** Rounds whose result this tab has already shown, so none shows twice. */
  const handled = useRef(new Set<number>());

  const target = Number(targetText);
  const targetOk = validTarget(target);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/games/crash", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as Live;
      offset.current = data.serverNow - Date.now();
      setLive(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  // The polling loop: quick in flight, relaxed otherwise.
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const data = await poll();
      if (stop) return;
      const flying = data?.round.phase === "flight" || (data?.round.phase === "countdown" && data.round.startsAt - data.serverNow < 600);
      t = setTimeout(loop, flying ? POLL_FLIGHT_MS : POLL_IDLE_MS);
    };
    void loop();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [poll]);

  // Frame clock for the curve and countdown.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const showResult = useCallback(
    (roundId: number, betCents: number, payoutCents: number, cashedAt: number | null, balanceCents: number, progress: ProgressUpdate | null) => {
      if (handled.current.has(roundId)) return;
      handled.current.add(roundId);
      const net = payoutCents - betCents;
      applyResult(balanceCents, net);
      if (progress) applyProgress(progress);
      pushFlash(game.name, net, cashedAt ? `Cashed at ${cashedAt.toFixed(2)}x` : "Crashed");
      setMyResult({ roundId, netCents: net, cashedAt });
      setFeedVersion((v) => v + 1);
      if (net > 0) sfx.win();
      else sfx.lose();
    },
    [applyResult, applyProgress, pushFlash, game.name],
  );

  // Results settled by the server on its own (auto cash-outs, crashes).
  useEffect(() => {
    const s = live?.me?.settled;
    if (s && live?.me) showResult(s.roundId, s.betCents, s.payoutCents, s.cashedAt, live.me.balanceCents, s.progress);
  }, [live, showResult]);

  const placeBet = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    if (autoOn && !targetOk) {
      setError(`Auto cash-out must be between ${MIN_TARGET} and ${MAX_TARGET}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/games/crash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bet", betCents: effectiveBet, autoTarget: autoOn ? target : null }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Couldn't place that bet.");
      else {
        applyResult(data.balanceCents);
        sfx.chipPlace();
        setMyResult(null);
      }
      await poll();
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, autoOn, targetOk, target, applyResult, poll]);

  const cashout = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/games/crash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashout" }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Couldn't cash out.");
      else {
        const bet = live?.me?.bet;
        showResult(data.roundId, bet?.betCents ?? 0, data.payoutCents, data.multiplier, data.balanceCents, data.progress);
      }
      await poll();
    } catch {
      setError("Network error — could not cash out.");
    } finally {
      setBusy(false);
    }
  }, [busy, live, showResult, poll]);

  // ---- derived state -------------------------------------------------------
  const serverNow = now + offset.current;
  const round = live?.round ?? null;
  const phase: "countdown" | "flight" | "crashed" | null = !round
    ? null
    : round.phase === "countdown" && serverNow >= round.startsAt
      ? "flight"
      : round.phase;
  const display =
    !round || phase === "countdown"
      ? 1
      : phase === "crashed"
        ? (round.crashPoint ?? 1)
        : multiplierAt(serverNow - round.startsAt);
  const countdownLeft = round && phase === "countdown" ? Math.max(0, round.startsAt - serverNow) : null;

  const myBet = live?.me?.bet && live.me.bet.roundId === round?.id ? live.me.bet : null;
  const inPlay = myBet?.status === "ACTIVE" && !handled.current.has(myBet.roundId);
  const canBetNow = phase === "countdown" && !myBet;

  // A queued bet goes in the moment the next countdown opens.
  useEffect(() => {
    if (queued && canBetNow && !busy) {
      setQueued(false);
      void placeBet();
    }
  }, [queued, canBetNow, busy, placeBet]);

  const mainAction = useCallback(() => {
    if (inPlay && phase === "flight") return void cashout();
    if (canBetNow) return void placeBet();
    if (!myBet || phase !== "countdown") setQueued((q) => !q);
  }, [inPlay, phase, canBetNow, myBet, cashout, placeBet]);

  const mainActionRef = useRef(mainAction);
  mainActionRef.current = mainAction;
  const runAction = useCallback(() => mainActionRef.current(), []);

  const label =
    inPlay && phase === "flight"
      ? `Cash out ${formatCents(Math.floor(myBet!.betCents * display))}`
      : canBetNow
        ? `Bet ${formatCents(effectiveBet)}`
        : myBet && phase === "countdown"
          ? "Bet placed — get ready"
          : queued
            ? "In next round — tap to cancel"
            : `Bet next round`;

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel:
      inPlay && phase === "flight" ? "Cash out" : canBetNow ? "Bet" : myBet && phase === "countdown" ? "Bet placed" : queued ? "Cancel" : "Bet next round",
    ready: inPlay && phase === "flight" ? true : !(myBet && phase === "countdown") && !betError && effectiveBet > 0 && (!autoOn || targetOk),
    busy,
    run: runAction,
    note: autoOn ? `Auto cash-out at ${targetOk ? target.toFixed(2) : "—"}x` : "Live room — cash out before it crashes.",
    autoplay: false,
  });

  const flying = phase === "flight";
  const crashed = phase === "crashed";

  const canvas = (
    <div className="mx-auto w-full max-w-2xl">
      {live && live.history.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-hidden">
          {live.history.map((c, i) => (
            <span
              key={i}
              className={`num shrink-0 rounded-md px-2 py-0.5 text-[11px] font-black ${
                c >= 10 ? "bg-amber-400/15 text-amber-300" : c >= 2 ? "bg-win/15 text-win" : "bg-white/5 text-slate-400"
              }`}
            >
              {c.toFixed(2)}x
            </span>
          ))}
        </div>
      )}

      <div className="relative h-80 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#0a1226] via-[#070c1b] to-[#03060e]">
        <div className={`absolute inset-0 ${flying ? "animate-star-drift" : ""}`}>
          {STARS.map((st, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-white"
              style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, opacity: st.o }}
            />
          ))}
        </div>

        {(() => {
          const span = Math.max(4000, timeToReach(display) * 1.15);
          const pts: [number, number][] = [];
          for (let i = 0; i <= 60; i++) {
            const t = (span * i) / 60;
            const m = multiplierAt(t);
            const x = 12 + (i / 60) * 340;
            const y = 190 - Math.min(160, (Math.log2(m) / Math.log2(Math.max(2, display * 1.3))) * 160);
            pts.push([x, y]);
            if (m > display) break;
          }
          const head = pts[pts.length - 1] ?? [12, 190];
          const prev = pts[Math.max(0, pts.length - 3)] ?? [0, 190];
          const angle =
            pts.length < 3 ? -18 : Math.max(-70, Math.min(-8, (Math.atan2((head[1] - prev[1]) * 1.25, head[0] - prev[0]) * 180) / Math.PI));
          const line = pts.map((q) => q.join(",")).join(" ");
          const color = crashed ? "#ff5a6e" : "#8f5cff";
          return (
            <>
              {phase !== "countdown" && (
                <svg viewBox="0 0 400 200" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="crash-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                      <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <polyline points={`12,200 ${line} ${head[0]},200`} fill="url(#crash-fill)" />
                  <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
                </svg>
              )}
              <div className="absolute" style={{ left: `${(head[0] / 400) * 100}%`, top: `${(head[1] / 200) * 100}%` }}>
                {crashed ? (
                  <>
                    <span className="absolute h-24 w-24 animate-boom rounded-full bg-[radial-gradient(circle,#fff5d6_0%,#ffb347_35%,#ff5a6e_60%,transparent_72%)]" />
                    {SHARDS.map((sh, i) => (
                      <span
                        key={i}
                        className="absolute h-2 w-2 animate-shard rounded-sm"
                        style={{ background: sh.c, ["--dx" as string]: sh.dx, ["--dy" as string]: sh.dy }}
                      />
                    ))}
                  </>
                ) : (
                  <Rocket angle={angle} flying={flying} />
                )}
              </div>
            </>
          );
        })()}

        <div className="pointer-events-none absolute inset-x-0 top-6 text-center">
          <p
            className={`num text-6xl font-black tabular-nums drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] ${
              crashed ? "text-loss" : "text-white"
            }`}
          >
            {!round ? "…" : countdownLeft !== null ? `${(countdownLeft / 1000).toFixed(1)}s` : `${display.toFixed(2)}x`}
          </p>
          {countdownLeft !== null && (
            <p className="mt-1 text-[13px] font-black uppercase tracking-[0.2em] text-slate-300">Bets open · round #{round!.id}</p>
          )}
          {crashed && <p className="mt-1 text-[13px] font-black uppercase tracking-[0.2em] text-loss">Crashed</p>}
          {flying && myBet?.status === "CASHED" && (
            <p className="mt-1 text-[13px] font-black uppercase tracking-[0.2em] text-win">
              You cashed at {myBet.cashedAt?.toFixed(2)}x
            </p>
          )}
        </div>
      </div>

      {myResult && myResult.roundId === round?.id && (
        <div className="animate-pop-in mt-4 text-center">
          <p className={myResult.netCents > 0 ? "num-win text-3xl" : "num-loss text-3xl"}>{formatSignedCents(myResult.netCents)}</p>
        </div>
      )}

      <CrashPlayers players={live?.players ?? []} flying={flying} />

      {error && <p className="mt-3 text-center text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Auto cash-out</p>
        <div className="seg grid-cols-2">
          <button type="button" onClick={() => setAutoOn(false)} disabled={!!myBet && inPlay} className={!autoOn ? "seg-item-on" : "seg-item"}>
            Off
          </button>
          <button type="button" onClick={() => setAutoOn(true)} disabled={!!myBet && inPlay} className={autoOn ? "seg-item-on" : "seg-item"}>
            On
          </button>
        </div>
        {autoOn && (
          <input
            id="crash-target"
            className="field num mt-2"
            value={targetText}
            onChange={(e) => setTargetText(e.target.value)}
            disabled={inPlay}
            inputMode="decimal"
            aria-label="Auto cash-out multiplier"
          />
        )}
      </div>

      <BetControls disabled={busy || inPlay} />

      <button
        type="button"
        onClick={mainAction}
        disabled={!signedIn || busy || (!!myBet && phase === "countdown")}
        className={`w-full py-3 text-base ${inPlay && flying ? "btn-primary bg-win text-base-900 hover:bg-win" : "btn-primary shadow-volt"}`}
      >
        {busy ? "…" : label}
      </button>

      <p className="text-center text-[11px] leading-relaxed text-slate-500">
        Everyone plays the same round. Bets open during the countdown; cash out any time before it crashes.
      </p>
    </div>
  );

  const rules = (
    <p>
      One shared round at a time. The crash point is drawn by the server when the round is created and is never sent to
      anyone until the rocket gets there. Cash-outs are priced from the server&apos;s clock.
    </p>
  );

  return <GameFrame game={game} engineKey="crash" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

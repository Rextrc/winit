"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  DIFFICULTY_LABELS,
  SHAPES,
  floorChance,
  multiplierAt,
  type Difficulty,
} from "@/lib/games/towers";

type View = {
  status: "CLIMBING" | "CASHED_OUT" | "FELL";
  betCents: number;
  difficulty: Difficulty;
  shape: { cols: number; safe: number; floors: number };
  picks: number[];
  floorsClimbed: number;
  currentMultiplier: number;
  nextMultiplier: number | null;
  safeTiles: number[][] | null;
};

type Resp = {
  roundId: string;
  view: View;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate | null;
};

export default function TowersGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [roundId, setRoundId] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ netCents: number; won: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const { status: sessionStatus } = useSession();

  // A climb survives a refresh, so pick it back up on mount.
  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    (async () => {
      try {
        const res = await fetch("/api/games/towers", { cache: "no-store" });
        const data = await res.json();
        if (data.round) {
          setRoundId(data.round.id);
          setView(data.round.view);
          setDifficulty(data.round.view.difficulty);
        }
      } catch {
        /* nothing in play — the fresh state below is correct */
      }
    })();
  }, [sessionStatus]);

  const send = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/games/towers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "That didn't work.");
          return null;
        }
        const payload = data as Resp;
        setView(payload.view);

        if (payload.view.status === "CLIMBING") {
          setRoundId(payload.roundId);
        } else {
          setRoundId(null);
          const won = payload.view.status === "CASHED_OUT";
          const payout = won ? Math.round(payload.view.betCents * payload.view.currentMultiplier) : 0;
          const netCents = payout - payload.view.betCents;
          setLast({ netCents, won });
          applyResult(payload.balanceCents, netCents);
          if (payload.progress) applyProgress(payload.progress);
          pushFlash(
            game.name,
            netCents,
            won ? `Cashed on floor ${payload.view.floorsClimbed}` : `Fell on floor ${payload.view.floorsClimbed + 1}`,
          );
          setFeedVersion((v) => v + 1);
        }
        return payload;
      } catch {
        setError("Network error — nothing changed.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [applyResult, applyProgress, pushFlash, game.name],
  );

  const start = useCallback(() => {
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    setLast(null);
    void send({ action: "start", betCents: effectiveBet, difficulty });
  }, [betError, effectiveBet, difficulty, send]);

  const pick = useCallback(
    (column: number) => {
      if (!roundId || busy) return;
      void send({ action: "pick", roundId, column });
    },
    [roundId, busy, send],
  );

  const cashout = useCallback(() => {
    if (!roundId || busy) return;
    void send({ action: "cashout", roundId });
  }, [roundId, busy, send]);

  const climbing = view?.status === "CLIMBING";
  const shape = view?.shape ?? SHAPES[difficulty];
  const climbed = view?.floorsClimbed ?? 0;

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: climbing ? "Cash out" : "Start climb",
    ready: climbing ? climbed > 0 : !betError && effectiveBet > 0,
    busy,
    run: climbing ? cashout : start,
    note: climbing
      ? `Floor ${climbed} · ${view!.currentMultiplier}x banked`
      : DIFFICULTY_LABELS[difficulty],
    autoplay: false,
  });

  const canvas = (
    <div className="mx-auto w-full max-w-md">
      {/* Battlements and flag */}
      <div className="relative mx-3">
        <svg viewBox="0 0 40 34" className="absolute -top-[46px] left-1/2 h-12 -translate-x-1/2" aria-hidden="true">
          <line x1="8" y1="4" x2="8" y2="34" stroke="#8b93a3" strokeWidth="2" />
          <path d="M9 5 C 18 1, 24 11, 36 6 L 36 18 C 24 23, 18 13, 9 17 Z" fill={view?.status === "FELL" ? "#ff5a6e" : "#8f5cff"} className="animate-flag" style={{ transformOrigin: "9px 11px", transformBox: "view-box" }} />
        </svg>
        <div className="flex justify-between">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-4 w-[8%] rounded-t-sm border border-b-0 border-black/40 bg-[#3a3f4f]" />
          ))}
        </div>
      </div>

      <div
        className="relative rounded-b-xl border border-black/40 px-3 pb-3 pt-3 shadow-[inset_0_0_40px_rgba(0,0,0,0.6)]"
        style={{
          backgroundColor: "#2e3342",
          backgroundImage:
            "linear-gradient(#262a37 2px, transparent 2px), linear-gradient(90deg, #262a37 2px, transparent 2px), linear-gradient(90deg, #262a37 2px, transparent 2px)",
          backgroundSize: "100% 22px, 44px 44px, 44px 44px",
          backgroundPosition: "0 0, 0 0, 22px 22px",
        }}
      >
        <div className="flex flex-col-reverse gap-2">
          {Array.from({ length: shape.floors }).map((_, floor) => {
            const done = floor < (view?.picks.length ?? 0);
            const active = climbing && floor === (view?.picks.length ?? 0);
            const pickedCol = view?.picks[floor];
            const safeCols = view?.safeTiles?.[floor] ?? null;
            const reached = floor < climbed;

            return (
              <div
                key={floor}
                className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors duration-500 ${
                  active ? "bg-[radial-gradient(ellipse_at_center,rgba(255,197,61,0.22),transparent_70%)]" : ""
                }`}
              >
                <span
                  className={`num w-14 shrink-0 rounded-md border px-1 py-1 text-center text-[11px] font-black ${
                    reached
                      ? "border-gold/60 bg-gold/15 text-gold"
                      : active
                        ? "border-gold/40 bg-black/30 text-gold/90"
                        : "border-black/40 bg-black/25 text-slate-500"
                  }`}
                >
                  {multiplierAt(view?.difficulty ?? difficulty, floor + 1).toFixed(2)}x
                </span>
                <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${shape.cols}, minmax(0,1fr))` }}>
                  {Array.from({ length: shape.cols }).map((_, col) => {
                    const isPick = done && pickedCol === col;
                    const revealedSafe = safeCols?.includes(col) ?? false;
                    const revealedBad = safeCols !== null && !revealedSafe;
                    const fell = isPick && view?.status === "FELL" && !revealedSafe;

                    return (
                      <button
                        key={col}
                        type="button"
                        onClick={() => pick(col)}
                        disabled={!active || busy}
                        aria-label={`Floor ${floor + 1}, window ${col + 1}`}
                        className={`relative grid h-11 place-items-center rounded-t-[999px] rounded-b-md border-2 transition-all duration-300 ${
                          fell
                            ? "animate-pop-in border-loss bg-loss/30 shadow-[0_0_18px_rgba(255,90,110,0.55)]"
                            : isPick
                              ? "animate-pop-in border-win bg-win/25 shadow-[0_0_16px_rgba(34,221,122,0.5)]"
                              : active
                                ? "border-gold/50 bg-[#141824] hover:-translate-y-0.5 hover:border-gold hover:bg-[#1c2130] hover:shadow-[0_0_14px_rgba(255,197,61,0.35)]"
                                : revealedBad
                                  ? "border-loss/25 bg-[#161a24]"
                                  : "border-black/40 bg-[#10131b]"
                        } ${!active ? "cursor-default" : ""}`}
                      >
                        {isPick && !fell && <Gem />}
                        {fell && <Spikes />}
                        {!isPick && revealedSafe && <Gem faint />}
                        {!isPick && revealedBad && <Spikes faint />}
                        {!isPick && !safeCols && !active && <span className="absolute inset-x-3 bottom-1 h-px bg-white/5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mx-[-6px] h-3 rounded-b-lg bg-gradient-to-b from-[#3a3f4f] to-[#22262f]" />

      <div className="mt-5 min-h-[64px] text-center">
        {last ? (
          <div className="animate-pop-in">
            <p className={last.netCents > 0 ? "num-win text-3xl" : "num-loss text-3xl"}>
              {formatSignedCents(last.netCents)}
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              {last.won ? `Cashed out on floor ${climbed}` : `Fell on floor ${climbed + 1}`}
            </p>
          </div>
        ) : climbing ? (
          <p className="num text-2xl font-black text-gold">{view!.currentMultiplier.toFixed(2)}x banked</p>
        ) : (
          <p className="text-sm text-slate-500">Pick a safe window on each floor and climb.</p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Difficulty</p>
        <div className="space-y-2">
          {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              disabled={climbing || busy}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-all duration-200 disabled:opacity-50 ${
                difficulty === d ? "border-volt bg-volt/10" : "border-white/10"
              }`}
            >
              <span className="text-[12px] font-bold text-slate-100">{DIFFICULTY_LABELS[d]}</span>
              <span className="num text-[11px] font-bold text-volt">
                {multiplierAt(d, 1).toFixed(2)}x/floor
              </span>
            </button>
          ))}
        </div>
      </div>

      <BetControls disabled={climbing || busy} />

      {climbing ? (
        <button
          type="button"
          onClick={cashout}
          disabled={busy || climbed === 0}
          className="btn-primary w-full py-3 text-base shadow-volt"
        >
          Cash out {formatCents(Math.round(view!.betCents * view!.currentMultiplier))}
        </button>
      ) : (
        <button type="button" onClick={start} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
          {busy ? "Starting…" : `Climb ${formatCents(effectiveBet)}`}
        </button>
      )}

      {climbing && view!.nextMultiplier !== null && (
        <p className="num text-center text-[11px] text-slate-500">
          Next floor pays {view!.nextMultiplier.toFixed(2)}x ·{" "}
          {(floorChance(view!.difficulty) * 100).toFixed(1)}% safe
        </p>
      )}
    </div>
  );

  const rules = (
    <>
      <p>
        Every floor has the same shape: {shape.cols} tiles, {shape.safe} of them safe. Pick a safe
        one and you climb; pick wrong and the run ends with nothing.
      </p>
      <p>
        The price of standing on floor r is derived, never tabulated:{" "}
        <code className="text-volt">0.99 / (safe/cols)^r</code>. That makes cashing out on any floor
        worth exactly the same 99%, which is what lets the cash-out button be genuinely free of a
        &ldquo;right&rdquo; answer.
      </p>
      <p>
        Because the price is recomputed from the true remaining probability at every step, the return
        stays exactly 99% under <em>any</em> stopping rule — including one that reacts to how the
        climb has gone so far.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="towers" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

function Gem({ faint = false }: { faint?: boolean }) {
  return (
    <svg viewBox="0 0 24 20" className={`h-5 w-6 ${faint ? "opacity-30" : "drop-shadow-[0_0_6px_rgba(34,221,122,0.8)]"}`} aria-hidden="true">
      <path d="M6 1 H18 L23 7 L12 19 L1 7 Z" fill="#22dd7a" />
      <path d="M6 1 L9 7 H15 L18 1 Z M1 7 H23" fill="#7ff0b5" stroke="#0f7a44" strokeWidth="0.6" />
      <path d="M9 7 L12 19 L15 7" fill="none" stroke="#0f7a44" strokeWidth="0.6" />
    </svg>
  );
}

function Spikes({ faint = false }: { faint?: boolean }) {
  return (
    <svg viewBox="0 0 24 18" className={`h-5 w-6 ${faint ? "opacity-30" : "drop-shadow-[0_0_6px_rgba(255,90,110,0.8)]"}`} aria-hidden="true">
      <path d="M1 17 L5 4 L8 17 L12 1 L16 17 L19 4 L23 17 Z" fill="#ff5a6e" stroke="#8a1a28" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  );
}

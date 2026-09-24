"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { WHEEL_SEGMENTS, wheelExactRtp, type WheelRisk } from "@/lib/games/originals";

type Resp = {
  index: number;
  multiplier: number;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

// Ascending by multiplier; 0× is always the dark "blank" segment.
const PALETTE = [
  { outer: "#c9d0db", inner: "#8b93a3" },
  { outer: "#8b7cf6", inner: "#6d5ce8" },
  { outer: "#ff5a5f", inner: "#d63c42" },
  { outer: "#c6ef2a", inner: "#86b312" },
  { outer: "#fb923c", inner: "#d9711c" },
  { outer: "#22d3ee", inner: "#0ea5c4" },
];
const BLANK = { outer: "#2b3240", inner: "#222834" };

const REPEAT = 2; // the logical 10-segment wheel is drawn twice round the ring
const SPIN_MS = 5600;
const SIZE = 320;
const C = SIZE / 2;
const R_OUT = 150;
const R_MID = 128;
const R_IN = 116;

function colorsFor(values: number[]) {
  const ranked = Array.from(new Set(values.filter((v) => v > 0))).sort((x, y) => x - y);
  return (v: number) => (v === 0 ? BLANK : PALETTE[ranked.indexOf(v) % PALETTE.length]);
}

function arcPath(r1: number, r2: number, a0: number, a1: number) {
  const pt = (r: number, a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${C + r * Math.cos(rad)} ${C + r * Math.sin(rad)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${pt(r2, a0)} A ${r2} ${r2} 0 ${large} 1 ${pt(r2, a1)} L ${pt(r1, a1)} A ${r1} ${r1} 0 ${large} 0 ${pt(r1, a0)} Z`;
}

const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

export default function WheelGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [risk, setRisk] = useState<WheelRisk>("low");
  const [busy, setBusy] = useState(false);
  const wheelRef = useRef<SVGGElement | null>(null);
  const pinRef = useRef<SVGGElement | null>(null);
  const rotRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const segments = WHEEL_SEGMENTS[risk];
  const visual = useMemo(() => Array.from({ length: REPEAT }, () => segments).flat(), [segments]);
  const segAngle = 360 / visual.length;
  const colorOf = useMemo(() => colorsFor(segments), [segments]);
  const legend = useMemo(() => Array.from(new Set(segments)).sort((x, y) => x - y), [segments]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  /** Eases the wheel onto `visualIndex`, ticking the pin at every segment edge. */
  const animateTo = useCallback(
    (visualIndex: number) =>
      new Promise<void>((resolve) => {
        const start = rotRef.current;
        // Anywhere inside the segment, uniformly — not always dead centre.
        const offset = (Math.random() - 0.5) * segAngle * 0.7;
        const center = visualIndex * segAngle + segAngle / 2 + offset;
        const base = Math.ceil(start / 360) * 360 + 360 * 6;
        const target = base + (360 - center);
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / SPIN_MS);
          const angle = start + (target - start) * easeOutQuart(p);
          rotRef.current = angle;
          wheelRef.current?.setAttribute("transform", `rotate(${angle} ${C} ${C})`);
          // How far past the last segment edge the pointer is (0..1): the pin
          // is knocked back as an edge passes and relaxes through the segment.
          const within = (((-angle % segAngle) + segAngle) % segAngle) / segAngle;
          const kick = Math.max(0, 1 - within * 3.5) * 18 * (1 - p * 0.6);
          pinRef.current?.setAttribute("transform", `rotate(${-kick} ${C} 20)`);
          if (p < 1) rafRef.current = requestAnimationFrame(tick);
          else {
            rafRef.current = null;
            pinRef.current?.setAttribute("transform", `rotate(0 ${C} 20)`);
            resolve();
          }
        };
        rafRef.current = requestAnimationFrame(tick);
      }),
    [segAngle],
  );

  const spin = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);

    try {
      const res = await fetch("/api/games/wheel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, risk }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }
      const payload = data as Resp;

      // The server picks the logical segment; which of its copies on the
      // ring the pointer stops on is purely cosmetic.
      const copy = Math.floor(Math.random() * REPEAT);
      await animateTo(copy * segments.length + payload.index);
      await new Promise((r) => setTimeout(r, 300));
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, `${payload.multiplier}x`);
      setFeedVersion((v) => v + 1);
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, risk, segments.length, animateTo, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Spin",
    ready: !betError && effectiveBet > 0,
    busy,
    run: spin,
    note: `${risk[0].toUpperCase()}${risk.slice(1)} risk · ${(wheelExactRtp(risk) * 100).toFixed(2)}% RTP`,
  });

  const canvas = (
    <div className="mx-auto w-full max-w-md text-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[340px]" aria-label="Wheel">
        <circle cx={C} cy={C} r={R_OUT + 6} fill="#1a1f29" />
        <g ref={wheelRef} transform={`rotate(${rotRef.current} ${C} ${C})`}>
          {visual.map((m, i) => {
            const col = colorOf(m);
            const a0 = i * segAngle + 0.6;
            const a1 = (i + 1) * segAngle - 0.6;
            return (
              <g key={i}>
                <path d={arcPath(R_MID, R_OUT, a0, a1)} fill={col.outer} />
                <path d={arcPath(R_IN, R_MID, a0, a1)} fill={col.inner} />
              </g>
            );
          })}
        </g>
        <circle cx={C} cy={C} r={R_IN - 4} fill="#141925" />
        <circle cx={C} cy={C} r={R_IN - 18} fill="#171d2a" />
        {last && (
          <text x={C} y={C + 10} textAnchor="middle" className="animate-pop-in" fill="white" fontSize="34" fontWeight="900">
            {last.multiplier.toFixed(2)}×
          </text>
        )}
        <g ref={pinRef}>
          <path d={`M ${C} 42 C ${C - 5} 32 ${C - 16} 24 ${C - 16} 14 A 16 16 0 1 1 ${C + 16} 14 C ${C + 16} 24 ${C + 5} 32 ${C} 42 Z`} fill="#e5177a" />
          <path d={`M ${C} 7 L ${C + 6} 14 L ${C} 21 L ${C - 6} 14 Z`} fill="#9d0f52" />
        </g>
      </svg>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {legend.map((m) => {
          const col = colorOf(m);
          const hit = last?.multiplier === m;
          return (
            <div
              key={m}
              className={`num relative min-w-[64px] overflow-hidden rounded-lg bg-white/[0.05] px-3 pb-3 pt-2 text-sm font-bold transition ${
                hit ? "text-white ring-1 ring-white/40" : "text-slate-300"
              }`}
            >
              {m.toFixed(2)}×
              <span className="absolute inset-x-0 bottom-0 h-1.5" style={{ background: col.outer }} />
            </div>
          );
        })}
      </div>

      <div className="mt-3 min-h-[32px]">
        {last && (
          <p className={`animate-pop-in ${last.netCents > 0 ? "num-win text-xl" : "num-loss text-xl"}`}>
            {formatSignedCents(last.netCents)}
          </p>
        )}
        {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
      </div>
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Risk</p>
        <div className="grid grid-cols-3 gap-2">
          {(["low", "medium", "high"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRisk(r)}
              disabled={busy}
              className={`rounded-xl py-2.5 text-[13px] font-black capitalize transition ${
                risk === r
                  ? r === "low"
                    ? "bg-win text-base-900"
                    : r === "medium"
                      ? "bg-orange-400 text-base-900"
                      : "bg-loss text-white"
                  : `bg-white/[0.05] ${r === "low" ? "text-win" : r === "medium" ? "text-orange-400" : "text-loss"}`
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={spin} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Spinning…" : `Spin ${formatCents(effectiveBet)}`}
      </button>
    </div>
  );

  const rules = (
    <>
      <p>
        A 10-segment wheel, one <code className="text-volt">crypto.randomInt(10)</code> draw per spin.
        Each risk level's segment multipliers sum to 9.9 across the 10 equally-likely segments — a
        mean of exactly 0.99 — so risk changes how spiky the distribution is, never the return. The
        ring draws that 10-segment pattern twice over, so every multiplier covers exactly the same
        share of the circle it does on the server.
      </p>
      <p className="text-[11px] text-slate-500">
        Low {(wheelExactRtp("low") * 100).toFixed(2)}% · Medium {(wheelExactRtp("medium") * 100).toFixed(2)}% ·
        High {(wheelExactRtp("high") * 100).toFixed(2)}%.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="wheel" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

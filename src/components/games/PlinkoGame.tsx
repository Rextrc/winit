"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  PLINKO_ROWS,
  PLINKO_TABLES,
  plinkoExactRtp,
  type PlinkoRisk,
  type PlinkoRows,
} from "@/lib/games/originals";

type Resp = {
  bucket: number;
  path: ("L" | "R")[];
  multiplier: number;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

function bucketColor(m: number, max: number) {
  const t = Math.min(1, m / max);
  if (m === 0) return "text-slate-600";
  if (t > 0.5) return "text-loss";
  if (t > 0.15) return "text-volt";
  return "text-win";
}

/** Preset ball counts for a drop. Anything else is typed into the field. */
const COUNT_PRESETS = [1, 10, 25, 50, 100] as const;

/** How long one row-to-row hop takes. Slower than a real chip drop on
 * purpose — this is the whole show, and 8-16 rows at a brisk clip is still
 * under two seconds. */
const ROW_MS = 170;
/** A short settle beat once the ball reaches its bucket, before it fades. */
const SETTLE_MS = 550;

// ---------------------------------------------------------------------------
// The board's geometry, computed analytically rather than laid out with flex
// and margins, so the ball's flight path can be expressed in the exact same
// coordinate system as the pegs it is supposedly bouncing off. Row r has
// r + 2 pegs; the classic Galton-board fact this leans on is that after r
// bounces the ball sits in one of r + 1 slots, indexed by how many of those
// bounces went right, and that slot IS the column of the peg it hits on row
// r. Percentages are of the board's own box, not the viewport.
// ---------------------------------------------------------------------------

const TOP_MARGIN = 6;
const BOTTOM_MARGIN = 14;

function pegX(row: number, col: number): number {
  const pegsInRow = row + 2;
  return ((col + 1) / (pegsInRow + 1)) * 100;
}

function pegY(row: number, rows: number): number {
  return TOP_MARGIN + (row / Math.max(1, rows - 1)) * (100 - TOP_MARGIN - BOTTOM_MARGIN);
}

type Waypoint = { x: number; y: number; row: number; col: number };

/** The sequence of peg contacts a path implies, plus where it ends up. */
function routeFor(path: ("L" | "R")[], rows: number): { hits: Waypoint[]; bucket: number; bucketX: number } {
  const hits: Waypoint[] = [];
  let right = 0;
  for (let row = 0; row < path.length; row++) {
    hits.push({ x: pegX(row, right), y: pegY(row, rows), row, col: right });
    if (path[row] === "R") right += 1;
  }
  const bucket = right;
  const bucketX = ((bucket + 0.5) / (rows + 1)) * 100;
  return { hits, bucket, bucketX };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

type Ball = {
  id: number;
  hits: Waypoint[];
  bucketX: number;
  bucket: number;
  multiplier: number;
  startedAt: number;
};

type BallFrame = {
  x: number;
  y: number;
  rotation: number;
  squashX: number;
  squashY: number;
  opacity: number;
  hotPeg: string | null;
};

/** Where a ball actually is, purely as a function of elapsed time — nothing
 * about the animation lives in React state, so there is nothing to get out
 * of sync no matter how many balls are in flight at once. */
function frameFor(ball: Ball, now: number): BallFrame {
  const waypoints: { x: number; y: number }[] = [
    { x: 50, y: 0 },
    ...ball.hits.map((h) => ({ x: h.x, y: h.y })),
    { x: ball.bucketX, y: 100 - BOTTOM_MARGIN + 6 },
  ];
  const elapsed = now - ball.startedAt;
  const totalMs = (waypoints.length - 1) * ROW_MS;

  if (elapsed >= totalMs) {
    const settleT = Math.min(1, (elapsed - totalMs) / SETTLE_MS);
    const last = waypoints[waypoints.length - 1];
    return {
      x: last.x,
      y: last.y,
      rotation: 0,
      squashX: 1 + Math.sin(settleT * Math.PI) * 0.12 * (1 - settleT),
      squashY: 1 - Math.sin(settleT * Math.PI) * 0.16 * (1 - settleT),
      opacity: 1 - Math.max(0, settleT - 0.6) / 0.4,
      hotPeg: null,
    };
  }

  const segIndex = Math.min(waypoints.length - 2, Math.floor(elapsed / ROW_MS));
  const segT = Math.min(1, (elapsed % ROW_MS) / ROW_MS);
  const a = waypoints[segIndex];
  const b = waypoints[segIndex + 1];
  const eased = easeInOutCubic(segT);

  // A small parabolic sag mid-hop reads as gravity rather than a straight
  // diagonal slide, and costs nothing but a sine.
  const sag = Math.sin(segT * Math.PI) * 1.6;
  const x = a.x + (b.x - a.x) * eased;
  const y = a.y + (b.y - a.y) * segT + sag;

  // Impact squash: a quick flatten-and-widen right as a hop begins, easing
  // straight back out — the "bonk" a rigid peg gives a falling ball.
  const impact = Math.max(0, 1 - segT / 0.35);
  const squashY = 1 - impact * 0.22;
  const squashX = 1 + impact * 0.16;

  // Rotation tracks horizontal direction so the ball reads as rolling rather
  // than sliding — the same idea as a wheel's angular speed matching its
  // ground speed.
  const dir = b.x - a.x;
  const rotation = segIndex * 46 + dir * eased * 3.2;

  const hotPeg = segIndex > 0 && segT < 0.3 ? `${ball.hits[segIndex - 1].row}-${ball.hits[segIndex - 1].col}` : null;

  return { x, y, rotation, squashX, squashY, opacity: 1, hotPeg };
}

export default function PlinkoGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [risk, setRisk] = useState<PlinkoRisk>("medium");
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [count, setCount] = useState("1");
  const [running, setRunning] = useState(false);
  const [launched, setLaunched] = useState(0);
  const [landed, setLanded] = useState(0);
  const [runTotal, setRunTotal] = useState(0);
  const [runNetCents, setRunNetCents] = useState(0);
  const [last, setLast] = useState<Resp | null>(null);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const stopRef = useRef(false);
  const ballId = useRef(0);
  const [, forceTick] = useState(0);

  const table = PLINKO_TABLES[risk][rows];
  const maxMult = Math.max(...table);

  // One RAF loop drives every ball on the board at once — cosmetic-only,
  // never touching the outcome or the wallet, which are settled on their own
  // timers below regardless of whether this frame ever paints.
  useEffect(() => {
    if (balls.length === 0) return;
    let raf: number;
    const tick = () => {
      forceTick((t) => (t + 1) % 1_000_000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [balls.length]);

  /** One ball, one bet. Resolves the wager immediately but only reveals it —
   * visually and to the wallet — once its ball has actually finished falling. */
  const dropOne = useCallback(async (): Promise<number | null> => {
    const res = await fetch("/api/games/plinko", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betCents: effectiveBet, risk, rows }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Couldn't place that bet.");
      return null;
    }
    const payload = data as Resp;
    const { hits, bucket, bucketX } = routeFor(payload.path, rows);

    const id = ++ballId.current;
    setBalls((bs) => [...bs, { id, hits, bucketX, bucket, multiplier: payload.multiplier, startedAt: performance.now() }]);

    const fallMs = (hits.length + 1) * ROW_MS;
    await new Promise((r) => setTimeout(r, fallMs));

    setLast(payload);
    applyResult(payload.balanceCents, payload.netCents);
    applyProgress(payload.progress);
    pushFlash(game.name, payload.netCents, `${payload.multiplier}x`);
    setFeedVersion((v) => v + 1);
    setLanded((n) => n + 1);
    setRunNetCents((n) => n + payload.netCents);

    setTimeout(() => setBalls((bs) => bs.filter((b) => b.id !== id)), SETTLE_MS + 250);
    return payload.netCents;
  }, [effectiveBet, risk, rows, applyResult, applyProgress, pushFlash, game.name]);

  const drop = useCallback(async () => {
    if (running) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }
    const n = Math.max(1, Math.min(200, Math.round(Number(count) || 1)));

    stopRef.current = false;
    setRunning(true);
    setError(null);
    setLaunched(0);
    setLanded(0);
    setRunTotal(n);
    setRunNetCents(0);

    try {
      for (let i = 0; i < n; i++) {
        if (stopRef.current) break;
        setLaunched((l) => l + 1);
        // Fire-and-forget: each ball resolves and reveals on its own clock,
        // so a burst of them genuinely falls together rather than queueing.
        void dropOne();
        if (i < n - 1) await new Promise((r) => setTimeout(r, 90));
      }
    } finally {
      setRunning(false);
    }
  }, [running, betError, effectiveBet, count, dropOne]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Drop",
    ready: !betError && effectiveBet > 0,
    busy: running,
    run: drop,
    note: `${risk[0].toUpperCase()}${risk.slice(1)} · ${rows} rows · ${(plinkoExactRtp(risk, rows) * 100).toFixed(2)}% RTP`,
  });

  const pegRows = useMemo(() => Array.from({ length: rows }, (_, r) => r), [rows]);

  const now = performance.now();
  const frames = balls.map((b) => ({ ball: b, frame: frameFor(b, now) }));
  const hotPegs = new Set(frames.map((f) => f.frame.hotPeg).filter((p): p is string => p !== null));

  const canvas = (
    <div className="mx-auto w-full max-w-xl">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-base-900/60 p-4">
        {pegRows.map((r) =>
          Array.from({ length: r + 2 }, (_, c) => {
            const hot = hotPegs.has(`${r}-${c}`);
            return (
              <span
                key={`${r}-${c}`}
                className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[background-color,box-shadow] duration-150 ${
                  hot ? "bg-volt shadow-[0_0_10px_2px_rgba(46,139,255,0.8)]" : "bg-white/25"
                }`}
                style={{ left: `${pegX(r, c)}%`, top: `${pegY(r, rows)}%` }}
              />
            );
          }),
        )}

        {frames.map(({ ball, frame }) => (
          <div
            key={ball.id}
            className="absolute h-3 w-3 rounded-full bg-volt shadow-volt"
            style={{
              left: `${frame.x}%`,
              top: `${frame.y}%`,
              opacity: frame.opacity,
              transform: `translate(-50%, -50%) rotate(${frame.rotation}deg) scale(${frame.squashX}, ${frame.squashY})`,
            }}
          />
        ))}

        <div className="absolute inset-x-2 bottom-2 flex gap-0.5">
          {table.map((m, i) => {
            const justHit = frames.some(
              (f) => f.frame.opacity > 0.6 && f.frame.y > 100 - BOTTOM_MARGIN && Math.round(f.ball.bucket) === i,
            );
            return (
              <div
                key={i}
                className={`num flex-1 rounded border py-1 text-center text-[9px] font-black transition ${
                  justHit || last?.bucket === i ? "border-volt bg-volt/15" : "border-white/5"
                } ${bucketColor(m, maxMult)}`}
              >
                {m}x
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 min-h-[54px] text-center">
        {running && runTotal > 1 ? (
          <div>
            <p className="num text-[13px] font-bold text-slate-300">
              {landed}/{runTotal} landed
            </p>
            <p className={runNetCents >= 0 ? "num-win text-xl" : "num-loss text-xl"}>
              {formatSignedCents(runNetCents)}
            </p>
          </div>
        ) : last ? (
          <div className="animate-pop-in">
            <p className="num text-2xl font-black text-white">{last.multiplier}×</p>
            <p className={last.netCents > 0 ? "num-win text-xl" : "num-loss text-xl"}>
              {formatSignedCents(last.netCents)}
            </p>
          </div>
        ) : null}
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
              disabled={running}
              className={`rounded-xl border py-2 text-[11px] font-black uppercase tracking-wide transition disabled:opacity-50 ${
                risk === r ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="label">Rows</p>
        <div className="grid grid-cols-3 gap-2">
          {PLINKO_ROWS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRows(r)}
              disabled={running}
              className={`rounded-xl border py-2 text-[11px] font-black transition disabled:opacity-50 ${
                rows === r ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <BetControls disabled={running} />

      <div>
        <div className="flex items-baseline justify-between">
          <label className="label mb-0" htmlFor="plinko-count">
            Balls
          </label>
          <span className="num text-[11px] text-slate-500">up to 200</span>
        </div>
        <input
          id="plinko-count"
          className="field num"
          inputMode="numeric"
          value={count}
          disabled={running}
          onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, ""))}
        />
        <div className="mt-1.5 grid grid-cols-5 gap-1.5">
          {COUNT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={running}
              onClick={() => setCount(String(n))}
              className={`rounded-lg py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
                count === String(n) ? "bg-volt/15 text-volt" : "bg-base-700/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {running ? (
        <button
          type="button"
          onClick={() => {
            stopRef.current = true;
          }}
          className="btn-ghost w-full py-3 text-base font-black text-loss"
        >
          Stop ({launched}/{runTotal} launched)
        </button>
      ) : (
        <button type="button" onClick={drop} disabled={!!betError} className="btn-primary w-full py-3 text-base shadow-volt">
          {Number(count) > 1 ? `Drop ${count} × ${formatCents(effectiveBet)}` : `Drop ${formatCents(effectiveBet)}`}
        </button>
      )}
    </div>
  );

  const rules = (
    <>
      <p>
        The ball takes {rows} independent left/right bounces, each one a{" "}
        <code className="text-volt">crypto.randomInt(2)</code> draw, so the bucket it lands in follows
        a Binomial({rows}, ½) distribution — the middle buckets are genuinely far more likely than the
        edges, exactly like a real peg board. The board on screen isn't decoration either: every peg
        the ball is drawn passing sits at the exact row and column its path implies.
      </p>
      <p>
        The payout table is fixed, but the RTP is not assumed to be 99% — it is computed exactly by
        weighting every bucket's multiplier by its true binomial probability, and that computed
        figure is what gets published.
      </p>
      <p>
        Dropping more than one ball fires that many independent bets at once — each is staked,
        settled and paid the instant it is placed, the same as a single drop. The board just holds
        the reveal back until that ball's own fall finishes, so a burst of fifty is fifty ordinary
        bets that happen to land at a glance rather than one bet split fifty ways.
      </p>
      <p className="text-[11px] text-slate-500">
        This board: {(plinkoExactRtp(risk, rows) * 100).toFixed(2)}% RTP.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="plinko" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

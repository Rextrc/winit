"use client";

import { useCallback, useMemo, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import RouletteWheel from "@/components/games/RouletteWheel";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import {
  betLabel,
  betOdds,
  colorOf,
  coverageCount,
  cornerNumbers,
  streetNumbers,
  type BetType,
  type RouletteBet,
} from "@/lib/games/roulette";

type Placed = RouletteBet & { key: string };

type SpinResponse = {
  result: {
    pocket: number;
    color: "red" | "black" | "green";
    bets: { type: BetType; number?: number; label: string; amountCents: number; won: boolean; returnedCents: number }[];
    totalStakeCents: number;
    payoutCents: number;
    summary: string;
  };
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

/** Standard felt layout: top row is column 3, bottom row is column 1. */
const GRID_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];
const ROW_COLUMN: BetType[] = ["col3", "col2", "col1"];

const OUTSIDE: { type: BetType; label: string; span: string }[] = [
  { type: "dozen1", label: "1st 12", span: "col-span-4" },
  { type: "dozen2", label: "2nd 12", span: "col-span-4" },
  { type: "dozen3", label: "3rd 12", span: "col-span-4" },
  { type: "low", label: "1–18", span: "col-span-2" },
  { type: "even", label: "Even", span: "col-span-2" },
  { type: "red", label: "Red", span: "col-span-2" },
  { type: "black", label: "Black", span: "col-span-2" },
  { type: "odd", label: "Odd", span: "col-span-2" },
  { type: "high", label: "19–36", span: "col-span-2" },
];

function keyFor(type: BetType, n?: number) {
  return type === "straight" || type === "street" || type === "corner" ? `${type}:${n}` : type;
}

/** The row of 12 street anchors, in the same left-to-right order as the felt. */
const STREET_ANCHORS = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

/** Every valid corner anchor between the two row gaps, 11 per gap. */
const CORNER_ANCHOR_ROWS = [
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31], // between the middle and bottom row
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32], // between the top and middle row
];

export default function RouletteGame({ game }: { game: GameDef }) {
  const { effectiveBet, maxBetCents, betError, pushFlash } = useBet();
  const { balanceCents, applyResult, applyProgress } = useWallet();

  const [placed, setPlaced] = useState<Placed[]>([]);
  const [busy, setBusy] = useState(false);
  const [pocket, setPocket] = useState<number | null>(null);
  const [last, setLast] = useState<SpinResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);
  const [recent, setRecent] = useState<number[]>([]);

  const totalStake = useMemo(() => placed.reduce((s, b) => s + b.amountCents, 0), [placed]);
  const chip = effectiveBet;

  const stakeOn = useCallback(
    (type: BetType, n?: number) => placed.find((b) => b.key === keyFor(type, n))?.amountCents ?? 0,
    [placed],
  );

  const place = useCallback(
    (type: BetType, n?: number) => {
      if (busy) return;
      if (chip <= 0) {
        setError("Set a chip value first.");
        return;
      }
      const key = keyFor(type, n);

      setPlaced((prev) => {
        const nextTotal = prev.reduce((s, b) => s + b.amountCents, 0) + chip;
        if (nextTotal > maxBetCents) {
          setError(`Your table limit is ${formatCents(maxBetCents)} total per spin.`);
          return prev;
        }
        if (balanceCents !== null && nextTotal > balanceCents) {
          setError("That's more than your balance.");
          return prev;
        }
        setError(null);

        const existing = prev.find((b) => b.key === key);
        if (existing) {
          return prev.map((b) => (b.key === key ? { ...b, amountCents: b.amountCents + chip } : b));
        }
        return [...prev, { key, type, number: n, amountCents: chip }];
      });
    },
    [busy, chip, balanceCents, maxBetCents],
  );

  const clearBets = useCallback(() => {
    if (busy) return;
    setPlaced([]);
    setError(null);
  }, [busy]);

  const undo = useCallback(() => {
    if (busy) return;
    setPlaced((prev) => prev.slice(0, -1));
  }, [busy]);

  const spin = useCallback(async () => {
    if (busy || placed.length === 0) {
      if (placed.length === 0) setError("Place at least one chip on the layout.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);
    setPocket(null);

    try {
      const res = await fetch("/api/games/roulette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bets: placed.map(({ type, number, amountCents }) => ({ type, number, amountCents })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't place those bets.");
        setBusy(false);
        return;
      }

      const payload = data as SpinResponse;
      setPocket(payload.result.pocket);

      // Hold the result back until the wheel has finished decelerating.
      setTimeout(() => {
        setLast(payload);
        setRecent((r) => [payload.result.pocket, ...r].slice(0, 12));
        applyResult(payload.balanceCents, payload.netCents);
        applyProgress(payload.progress);
        pushFlash(game.name, payload.netCents, payload.result.summary);
        setFeedVersion((v) => v + 1);
        setBusy(false);
      }, 3500);
    } catch {
      setError("Network error — the bet was not placed.");
      setBusy(false);
    }
  }, [busy, placed, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Spin",
    ready: placed.length > 0,
    busy,
    run: spin,
    note:
      placed.length > 0
        ? `${placed.length} chip${placed.length === 1 ? "" : "s"} on the felt · ${formatCents(totalStake)} at risk`
        : "Place chips on the layout to arm the spin.",
    // Needs chips placed on the felt each round, not just a stake.
    autoplay: false,
  });

  const Chip = ({ amount }: { amount: number }) =>
    amount > 0 ? (
      <span className="num absolute -right-1.5 -top-1.5 z-10 grid h-5 min-w-[20px] place-items-center rounded-full border border-[#8a5f18] bg-gradient-to-b from-[#f5d78e] to-[#d4a83c] px-1 text-[9px] font-black text-[#2a1d05] shadow">
        {amount >= 100_000 ? `${Math.round(amount / 100_000)}k` : Math.round(amount / 100)}
      </span>
    ) : null;

  const numberCell = (n: number) => {
    const c = colorOf(n);
    const amount = stakeOn("straight", n);
    const hit = last?.result.pocket === n;
    return (
      <button
        key={n}
        type="button"
        onClick={() => place("straight", n)}
        disabled={busy}
        className={`relative h-9 rounded-md border text-[12px] font-bold transition disabled:opacity-60 ${
          c === "red" ? "bg-gradient-to-b from-[#e2385a] to-[#a8102c] text-white" : "bg-gradient-to-b from-[#26272f] to-[#0e0f14] text-slate-200"
        } ${hit ? "border-[#f0c75e] ring-2 ring-[#f0c75e]" : amount > 0 ? "border-[#d4a83c]/70" : "border-black/40"} hover:border-[#f0c75e]/60`}
        aria-label={`Straight up on ${n}`}
      >
        {n}
        <Chip amount={amount} />
      </button>
    );
  };

  const outsideCell = (type: BetType, label: string, span: string) => {
    const amount = stakeOn(type);
    const hit = last ? last.result.bets.some((b) => b.won && b.label === betLabel({ type, amountCents: 0 })) : false;
    return (
      <button
        key={type}
        type="button"
        onClick={() => place(type)}
        disabled={busy}
        className={`relative h-9 rounded-md border text-[11px] font-bold uppercase tracking-wide transition disabled:opacity-60 ${
          type === "red"
            ? "bg-gradient-to-b from-[#e2385a]/85 to-[#a8102c]/85 text-white"
            : type === "black"
              ? "bg-gradient-to-b from-[#26272f] to-[#0e0f14] text-slate-200"
              : "bg-[#12633a] text-slate-100"
        } ${hit ? "border-[#f0c75e] ring-2 ring-[#f0c75e]" : amount > 0 ? "border-[#d4a83c]/70" : "border-black/40"} hover:border-[#f0c75e]/60 ${span}`}
      >
        {label}
        <Chip amount={amount} />
      </button>
    );
  };

  const canvas = (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-5 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-between">
        <RouletteWheel pocket={pocket} spinning={busy && pocket === null} />

        <div className="min-w-0 flex-1 text-center sm:text-right">
          {last ? (
            <div className="animate-pop-in">
              <p className={last.netCents > 0 ? "num-win text-3xl" : last.netCents === 0 ? "num text-3xl text-slate-300" : "num-loss text-3xl"}>
                {last.netCents === 0 ? "PUSH" : formatSignedCents(last.netCents)}
              </p>
              <p className="mt-1 text-[12px] text-slate-400">{last.result.summary}</p>
              <p className="num mt-0.5 text-[11px] text-slate-500">
                Staked {formatCents(last.result.totalStakeCents)} · returned {formatCents(last.result.payoutCents)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {busy ? "No more bets…" : "Click the layout to place chips."}
            </p>
          )}

          {recent.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1 sm:justify-end">
              {recent.map((n, i) => (
                <span
                  key={`${n}-${i}`}
                  className={`num grid h-6 w-6 place-items-center rounded-md text-[10px] font-black ${
                    colorOf(n) === "red"
                      ? "bg-gradient-to-b from-[#e2385a] to-[#a8102c] text-white"
                      : colorOf(n) === "black"
                        ? "bg-gradient-to-b from-[#26272f] to-[#0e0f14] text-slate-200"
                        : "bg-gradient-to-b from-[#12a15f] to-[#0a5c37] text-white"
                  }`}
                >
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Felt — green baize in a gold-railed frame */}
      <div className="overflow-x-auto rounded-2xl border-2 border-[#8a5f18] bg-gradient-to-b from-[#0d3d24] to-[#082818] p-3 shadow-[inset_0_2px_12px_rgba(0,0,0,0.5)] sm:p-4">
        <div className="min-w-[520px]">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => place("straight", 0)}
              disabled={busy}
              className={`relative w-9 rounded-md border bg-gradient-to-b from-[#12a15f] to-[#0a5c37] text-[12px] font-bold text-white transition disabled:opacity-60 ${
                last?.result.pocket === 0
                  ? "border-[#f0c75e] ring-2 ring-[#f0c75e]"
                  : stakeOn("straight", 0) > 0
                    ? "border-[#d4a83c]/70"
                    : "border-black/40"
              }`}
              aria-label="Straight up on 0"
            >
              0
              <Chip amount={stakeOn("straight", 0)} />
            </button>

            <div className="relative flex-1 space-y-1.5">
              {GRID_ROWS.map((row, ri) => (
                <div key={ri} className="grid grid-cols-[repeat(12,minmax(0,1fr))_44px] gap-1.5">
                  {row.map(numberCell)}
                  <button
                    type="button"
                    onClick={() => place(ROW_COLUMN[ri])}
                    disabled={busy}
                    className={`relative h-9 rounded-md border bg-[#12633a] text-[10px] font-bold uppercase text-slate-100 transition disabled:opacity-60 ${
                      stakeOn(ROW_COLUMN[ri]) > 0 ? "border-[#d4a83c]/70" : "border-[#1f8f57]"
                    } hover:border-[#f0c75e]/60`}
                    aria-label={`Column ${3 - ri} bet`}
                  >
                    2:1
                    <Chip amount={stakeOn(ROW_COLUMN[ri])} />
                  </button>
                </div>
              ))}

              {/* Corner bets: a dot straddling each 4-number intersection,
                  one row of dots per gap between the three number rows. */}
              {[0, 1].map((gap) => (
                <div
                  key={gap}
                  className="pointer-events-none absolute inset-x-0 z-10 grid grid-cols-[repeat(12,minmax(0,1fr))_44px]"
                  style={{ top: gap === 0 ? "36px" : "78px", height: 0 }}
                >
                  {CORNER_ANCHOR_ROWS[gap].map((anchor, i) => {
                    const amount = stakeOn("corner", anchor);
                    const hit = last?.result.bets.some((b) => b.won && b.type === "corner" && b.number === anchor) ?? false;
                    return (
                      <button
                        key={anchor}
                        type="button"
                        onClick={() => place("corner", anchor)}
                        disabled={busy}
                        style={{ gridColumn: `${i + 1} / ${i + 3}` }}
                        className={`pointer-events-auto relative z-10 h-3.5 w-3.5 -translate-y-1/2 justify-self-center rounded-full border-2 bg-[#0a2818] transition hover:scale-125 hover:border-[#f0c75e] disabled:opacity-60 ${
                          hit ? "border-[#f0c75e] ring-2 ring-[#f0c75e]" : amount > 0 ? "border-[#d4a83c]" : "border-white/40"
                        }`}
                        aria-label={`Corner bet on ${cornerNumbers(anchor).join(", ")}`}
                      >
                        <Chip amount={amount} />
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Street bets: one per row of 3, along the bottom edge of the grid. */}
          <div className="mt-1.5 grid grid-cols-[repeat(12,minmax(0,1fr))_44px] gap-1.5 pl-[42px]">
            {STREET_ANCHORS.map((anchor) => {
              const amount = stakeOn("street", anchor);
              const hit = last?.result.bets.some((b) => b.won && b.type === "street" && b.number === anchor) ?? false;
              return (
                <button
                  key={anchor}
                  type="button"
                  onClick={() => place("street", anchor)}
                  disabled={busy}
                  className={`relative h-4 rounded border bg-[#0a2818] text-[8px] font-bold text-slate-400 transition disabled:opacity-60 ${
                    hit ? "border-[#f0c75e] ring-2 ring-[#f0c75e]" : amount > 0 ? "border-[#d4a83c]" : "border-white/20"
                  } hover:border-[#f0c75e]/70`}
                  aria-label={`Street bet on ${streetNumbers(anchor).join(", ")}`}
                >
                  <Chip amount={amount} />
                </button>
              );
            })}
            <div />
          </div>

          <div className="mt-1.5 grid grid-cols-12 gap-1.5 pl-[42px]">
            {OUTSIDE.map((o) => outsideCell(o.type, o.label, o.span))}
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-center text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Chip value</p>
        <BetControls compact disabled={busy} />
      </div>

      <div className="rounded-xl border border-white/5 bg-base-900/50 p-3">
        <div className="flex items-baseline justify-between">
          <span className="label mb-0">On the felt</span>
          <span className="num text-sm font-black text-white">{formatCents(totalStake)}</span>
        </div>

        {placed.length === 0 ? (
          <p className="mt-2 text-[12px] text-slate-500">No chips placed.</p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {placed.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate text-slate-300">
                  {betLabel(b)}
                  <span className="ml-1.5 text-slate-600">
                    {betOdds(b)}:1 · {coverageCount(b.type)}/37
                  </span>
                </span>
                <span className="num shrink-0 font-bold text-slate-200">{formatCents(b.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" onClick={undo} disabled={busy || placed.length === 0}>
            Undo
          </button>
          <button type="button" className="btn-ghost flex-1 py-1.5 text-xs" onClick={clearBets} disabled={busy || placed.length === 0}>
            Clear
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={spin}
        disabled={busy || placed.length === 0 || !!betError}
        className="btn-primary w-full py-3 text-base shadow-volt"
      >
        {busy ? "Spinning…" : `Spin ${formatCents(totalStake)}`}
      </button>
    </div>
  );

  const rules = (
    <>
      <p>
        A European single-zero wheel: 37 pockets, one green zero, no double zero. The winning pocket
        is a single <code className="text-volt">crypto.randomInt(37)</code> draw taken before the
        wheel animation starts — the animation is just a rendering of a result that already exists.
      </p>
      <p>
        Every bet pays true odds for the pockets it covers: straight up 35:1, columns and dozens 2:1,
        red/black, odd/even and high/low 1:1. There is no en prison or la partage rule, and no bet on
        this table is priced worse than any other.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP 36/37 = {(game.rtp! * 100).toFixed(3)}%</span>{" "}
        on every single bet type — a house edge of 2.703%. A straight-up bet wins 1 spin in 37 and
        returns 36× the stake; an even-money bet wins 18 spins in 37 and returns 2×. Both come to the
        same number, which is exactly what a fair single-zero wheel does.
      </p>
    </>
  );

  return (
    <GameFrame
      game={game}
      engineKey="roulette"
      feedVersion={feedVersion}
      canvas={canvas}
      panel={panel}
      rules={rules}
    />
  );
}

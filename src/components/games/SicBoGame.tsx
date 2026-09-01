"use client";

import { useCallback, useMemo, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { labelFor, probability, quotedMultiplier, type SicBoBet, type Throw } from "@/lib/games/sicbo";

type Resp = {
  throw: Throw;
  multiplier: number;
  payoutCents: number;
  won: boolean;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

/** Pip layout for each die face, as a 3x3 grid of filled cells. */
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
      className={`grid h-16 w-16 grid-cols-3 grid-rows-3 gap-1 rounded-xl border border-white/20 bg-gradient-to-br from-white to-slate-300 p-2 shadow-tile ${
        rolling ? "animate-[spin_0.5s_linear_infinite]" : "animate-pop-in"
      }`}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className={`rounded-full ${PIPS[face]?.includes(i) ? "bg-base-900" : "bg-transparent"}`}
        />
      ))}
    </div>
  );
}

export default function SicBoGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [bet, setBet] = useState<SicBoBet>({ type: "small" });
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const price = useMemo(() => quotedMultiplier(bet), [bet]);
  const chance = useMemo(() => probability(bet), [bet]);

  const play = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setRolling(true);
    setError(null);
    setLast(null);

    try {
      const res = await fetch("/api/games/sicbo", {
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
      await new Promise((r) => setTimeout(r, 900));
      setRolling(false);
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, payload.throw.join("-"));
      setFeedVersion((v) => v + 1);
    } catch {
      setRolling(false);
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, bet, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Throw",
    ready: !betError && effectiveBet > 0,
    busy,
    run: play,
    note: `${labelFor(bet)} · pays ${price}x`,
  });

  const dice = last?.throw ?? ([1, 1, 1] as Throw);

  const chip = (b: SicBoBet, label: string, className = "") => {
    const active = JSON.stringify(b) === JSON.stringify(bet);
    return (
      <button
        key={label}
        type="button"
        onClick={() => setBet(b)}
        disabled={busy}
        className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-all duration-200 hover:-translate-y-px disabled:opacity-50 ${
          active ? "border-volt bg-volt/15 text-volt" : "border-white/10 bg-white/5 text-slate-300"
        } ${className}`}
      >
        {label}
      </button>
    );
  };

  const canvas = (
    <div className="mx-auto w-full max-w-lg text-center">
      <div className="flex items-center justify-center gap-4">
        {dice.map((f, i) => (
          <Die key={i} face={rolling ? ((i + 1) % 6) + 1 : f} rolling={rolling} />
        ))}
      </div>

      {last ? (
        <div className="animate-pop-in mt-5">
          <p className="num text-lg font-black text-white">
            {dice.join(" + ")} = {dice[0] + dice[1] + dice[2]}
          </p>
          <p className={last.netCents > 0 ? "num-win mt-1 text-3xl" : "num-loss mt-1 text-3xl"}>
            {formatSignedCents(last.netCents)}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">
            {last.won ? `${labelFor(bet)} paid ${last.multiplier}x` : `${labelFor(bet)} missed`}
          </p>
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-500">{rolling ? "Rolling…" : "Pick a bet and throw."}</p>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div>
        <p className="label">Even-money area</p>
        <div className="grid grid-cols-2 gap-2">
          {chip({ type: "small" }, "Small 4-10")}
          {chip({ type: "big" }, "Big 11-17")}
        </div>
      </div>

      <div>
        <p className="label">Triples</p>
        <div className="grid grid-cols-4 gap-1.5">
          {chip({ type: "anyTriple" }, "Any", "col-span-4")}
          {[1, 2, 3, 4, 5, 6].map((f) => chip({ type: "triple", face: f }, `${f}${f}${f}`))}
        </div>
      </div>

      <div>
        <p className="label">Single face</p>
        <div className="grid grid-cols-6 gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((f) => chip({ type: "single", face: f }, String(f)))}
        </div>
      </div>

      <div>
        <p className="label">Exact total</p>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 14 }, (_, i) => i + 4).map((t) =>
            chip({ type: "total", total: t }, String(t)),
          )}
        </div>
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={play} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Rolling…" : `Throw ${formatCents(effectiveBet)}`}
      </button>

      <p className="num text-center text-[11px] text-slate-500">
        {labelFor(bet)} · pays {price}x · {(chance * 100).toFixed(2)}% chance
      </p>
    </div>
  );

  const rules = (
    <>
      <p>
        Three dice, one throw, 6<sup>3</sup> = 216 equally likely results. Every bet on this table is
        priced straight off a full enumeration of those 216 throws:{" "}
        <code className="text-volt">fairMultiplier(p)</code> turns each exact probability into its
        own price, so there is no hand-written paytable anywhere in this game.
      </p>
      <p>
        Betting a single face is the one bet that is not simply win-or-lose — it pays more the more
        of the three dice show your number. That row is derived instead: a fixed shape scaled so its
        exact expectation lands on the same 99%.
      </p>
      <p>
        <span className="font-bold text-slate-200">RTP 99.00% on every bet</span>, small and big
        included. The odds are identical wherever you put the chip; only the variance changes.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="sicbo" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

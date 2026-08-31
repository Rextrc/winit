"use client";

import { useCallback, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { COINFLIP_MULTIPLIER, type CoinSide } from "@/lib/games/originals";

type Resp = {
  result: CoinSide;
  won: boolean;
  multiplier: number;
  payoutCents: number;
  netCents: number;
  balanceCents: number;
  progress: import("@/lib/ledger").ProgressUpdate;
};

export default function CoinflipGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [side, setSide] = useState<CoinSide>("heads");
  const [busy, setBusy] = useState(false);
  const [flipping, setFlipping] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const flip = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setFlipping(true);
    setError(null);
    setLast(null);

    try {
      const res = await fetch("/api/games/coinflip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, side }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlipping(false);
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }
      const payload = data as Resp;

      await new Promise((r) => setTimeout(r, 850));
      setFlipping(false);
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, payload.result);
      setFeedVersion((v) => v + 1);
    } catch {
      setFlipping(false);
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, side, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Flip",
    ready: !betError && effectiveBet > 0,
    busy,
    run: flip,
    note: `Calling ${side} · ${COINFLIP_MULTIPLIER}× on a win`,
  });

  const shown = last?.result ?? side;

  const canvas = (
    <div className="mx-auto w-full max-w-sm text-center">
      <div className="mx-auto grid h-40 w-40 place-items-center [perspective:800px]">
        <div
          className={`grid h-32 w-32 place-items-center rounded-full border-4 text-4xl font-black shadow-volt transition-transform duration-500 ${
            flipping ? "animate-[spin_0.6s_linear_infinite]" : ""
          } ${
            last
              ? last.won
                ? "border-win bg-win/15 text-win"
                : "border-loss bg-loss/15 text-loss"
              : "border-volt bg-volt/10 text-volt"
          }`}
        >
          {shown === "heads" ? "H" : "T"}
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-500">
        {flipping ? "Flipping…" : last ? (last.won ? "It landed your way" : "Landed the other side") : "Pick a side and flip."}
      </p>

      {last && (
        <p className={last.netCents > 0 ? "num-win mt-2 text-2xl" : "num-loss mt-2 text-2xl"}>
          {formatSignedCents(last.netCents)}
        </p>
      )}
      {error && <p className="mt-2 text-sm font-semibold text-loss">{error}</p>}
    </div>
  );

  const panel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["heads", "tails"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            disabled={busy}
            className={`rounded-xl border py-3 text-[13px] font-black uppercase tracking-wide transition ${
              side === s ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-400"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={flip} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Flipping…" : `Flip ${formatCents(effectiveBet)}`}
      </button>

      <p className="num text-center text-[11px] text-slate-500">Pays {COINFLIP_MULTIPLIER}× · 50% chance</p>
    </div>
  );

  const rules = (
    <>
      <p>
        One <code className="text-volt">crypto.randomInt(2)</code> draw decides heads or tails. A
        true 50/50 pays {COINFLIP_MULTIPLIER}× — the exact fair price for a 50% event at a 1% house
        edge — with no separate paytable to tune.
      </p>
      <p className="text-[11px] text-slate-500">RTP is exactly 99.00% — see `npm run rtp`.</p>
    </>
  );

  return <GameFrame game={game} engineKey="coinflip" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

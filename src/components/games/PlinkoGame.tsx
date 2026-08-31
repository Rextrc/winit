"use client";

import { useCallback, useMemo, useState } from "react";
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

export default function PlinkoGame({ game }: { game: GameDef }) {
  const { effectiveBet, betError, pushFlash } = useBet();
  const { applyResult, applyProgress } = useWallet();

  const [risk, setRisk] = useState<PlinkoRisk>("medium");
  const [rows, setRows] = useState<PlinkoRows>(12);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Resp | null>(null);
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedVersion, setFeedVersion] = useState(0);

  const table = PLINKO_TABLES[risk][rows];
  const maxMult = Math.max(...table);

  const drop = useCallback(async () => {
    if (busy) return;
    if (betError || effectiveBet <= 0) {
      setError(betError ?? "Set a stake first.");
      return;
    }

    setBusy(true);
    setError(null);
    setLast(null);

    try {
      const res = await fetch("/api/games/plinko", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCents: effectiveBet, risk, rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }
      const payload = data as Resp;

      // Walk the already-decided path so the ball visibly bounces to a bucket
      // that was fixed the moment the server drew it.
      let x = 50;
      setBallPos({ x, y: 0 });
      for (let i = 0; i < payload.path.length; i++) {
        await new Promise((r) => setTimeout(r, 130));
        x += (payload.path[i] === "R" ? 1 : -1) * (50 / (payload.path.length + 1));
        setBallPos({ x, y: ((i + 1) / payload.path.length) * 100 });
      }

      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, `${payload.multiplier}x`);
      setFeedVersion((v) => v + 1);
      setTimeout(() => setBallPos(null), 400);
    } catch {
      setError("Network error — the bet was not placed.");
    } finally {
      setBusy(false);
    }
  }, [busy, betError, effectiveBet, risk, rows, applyResult, applyProgress, pushFlash, game.name]);

  useBetSlipHook({
    slug: game.slug,
    name: game.name,
    actionLabel: "Drop",
    ready: !betError && effectiveBet > 0,
    busy,
    run: drop,
    note: `${risk[0].toUpperCase()}${risk.slice(1)} · ${rows} rows · ${(plinkoExactRtp(risk, rows) * 100).toFixed(2)}% RTP`,
  });

  const pegRows = useMemo(() => Array.from({ length: rows }, (_, r) => r), [rows]);

  const canvas = (
    <div className="mx-auto w-full max-w-xl">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-base-900/60 p-4">
        {pegRows.map((r) => (
          <div key={r} className="flex justify-center gap-0" style={{ marginTop: r === 0 ? 0 : "2.2%" }}>
            {Array.from({ length: r + 2 }, (_, i) => (
              <span
                key={i}
                className="mx-[1.6%] h-1.5 w-1.5 rounded-full bg-white/25"
                style={{ visibility: r % 2 === 0 ? "visible" : "visible" }}
              />
            ))}
          </div>
        ))}

        {ballPos && (
          <div
            className="absolute h-3 w-3 -translate-x-1/2 rounded-full bg-volt shadow-volt transition-all duration-100"
            style={{ left: `${ballPos.x}%`, top: `${ballPos.y * 0.85}%` }}
          />
        )}

        <div className="absolute inset-x-2 bottom-2 flex gap-0.5">
          {table.map((m, i) => (
            <div
              key={i}
              className={`num flex-1 rounded border py-1 text-center text-[9px] font-black transition ${
                last?.bucket === i ? "border-volt bg-volt/15" : "border-white/5"
              } ${bucketColor(m, maxMult)}`}
            >
              {m}x
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 min-h-[54px] text-center">
        {last && (
          <div className="animate-pop-in">
            <p className="num text-2xl font-black text-white">{last.multiplier}×</p>
            <p className={last.netCents > 0 ? "num-win text-xl" : "num-loss text-xl"}>
              {formatSignedCents(last.netCents)}
            </p>
          </div>
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
              className={`rounded-xl border py-2 text-[11px] font-black uppercase tracking-wide transition ${
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
              disabled={busy}
              className={`rounded-xl border py-2 text-[11px] font-black transition ${
                rows === r ? "border-volt bg-volt/10 text-volt" : "border-white/10 text-slate-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <BetControls disabled={busy} />

      <button type="button" onClick={drop} disabled={busy} className="btn-primary w-full py-3 text-base shadow-volt">
        {busy ? "Dropping…" : `Drop ${formatCents(effectiveBet)}`}
      </button>
    </div>
  );

  const rules = (
    <>
      <p>
        The ball takes {rows} independent left/right bounces, each one a{" "}
        <code className="text-volt">crypto.randomInt(2)</code> draw, so the bucket it lands in follows
        a Binomial({rows}, ½) distribution — the middle buckets are genuinely far more likely than the
        edges, exactly like a real peg board.
      </p>
      <p>
        The payout table is fixed, but the RTP is not assumed to be 99% — it is computed exactly by
        weighting every bucket's multiplier by its true binomial probability, and that computed
        figure is what gets published.
      </p>
      <p className="text-[11px] text-slate-500">
        This board: {(plinkoExactRtp(risk, rows) * 100).toFixed(2)}% RTP.
      </p>
    </>
  );

  return <GameFrame game={game} engineKey="plinko" feedVersion={feedVersion} canvas={canvas} panel={panel} rules={rules} />;
}

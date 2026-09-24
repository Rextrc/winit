"use client";

import { useCallback, useRef, useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameFrame from "@/components/games/GameFrame";
import BetControls from "@/components/BetControls";
import { useBet, useBetSlipHook } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { COINFLIP_MULTIPLIER, type CoinSide } from "@/lib/games/originals";

const WINDUP_MS = 280;
const TOSS_MS = 2300;
const SETTLE_MS = 700;
const TURNS = 7;
const TOSS_HEIGHT = 70;

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

  const coinRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const setCoin = (y: number, angle: number, scale = 1) => {
    if (coinRef.current) coinRef.current.style.transform = `translateY(${-y}px) rotateX(${angle}deg) scale(${scale})`;
    if (shadowRef.current) {
      const h = Math.min(1, y / TOSS_HEIGHT);
      shadowRef.current.style.transform = `scale(${1 - h * 0.55})`;
      shadowRef.current.style.opacity = `${1 - h * 0.7}`;
    }
  };

  const animate = (durationMs: number, frame: (p: number) => void) =>
    new Promise<void>((resolve) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / durationMs);
        frame(p);
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
        else {
          rafRef.current = null;
          resolve();
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    });

  /** Crouch before the throw — runs while the bet is in flight. */
  const windUp = () => {
    const a = rotationRef.current;
    return animate(WINDUP_MS, (p) => setCoin(-6 * Math.sin(p * Math.PI * 0.5), a, 1 - 0.07 * Math.sin(p * Math.PI * 0.5)));
  };

  /** One end-over-end toss that lands face-up on `result`, then wobbles to rest. */
  const toss = async (result: CoinSide) => {
    const start = rotationRef.current;
    const face = result === "heads" ? 0 : 180;
    const mod = ((start % 360) + 360) % 360;
    const target = start + ((face - mod + 360) % 360) + 360 * TURNS;
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

    await animate(TOSS_MS, (p) => {
      const angle = start + (target - start) * easeOut(p);
      rotationRef.current = angle;
      // Pops up fast from the crouch, hangs at the top, drops back down.
      const y = TOSS_HEIGHT * Math.sin(Math.PI * Math.pow(p, 0.85));
      setCoin(y, angle, 1 + 0.08 * Math.sin(Math.PI * p));
    });
    // Landing: a small bounce and a rocking wobble that dies away.
    await animate(SETTLE_MS, (p) => {
      const decay = Math.pow(1 - p, 2);
      const wobble = 16 * decay * Math.sin(p * Math.PI * 5);
      const bounce = 9 * Math.abs(Math.sin(p * Math.PI * 2)) * decay;
      setCoin(bounce, target + wobble);
    });
    rotationRef.current = target;
    setCoin(0, target);
  };

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
      const [res] = await Promise.all([
        fetch("/api/games/coinflip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ betCents: effectiveBet, side }),
        }),
        windUp(),
      ]);
      const data = await res.json();
      if (!res.ok) {
        setCoin(0, rotationRef.current);
        setFlipping(false);
        setError(data.error ?? "Couldn't place that bet.");
        setBusy(false);
        return;
      }
      const payload = data as Resp;

      await toss(payload.result);
      await new Promise((r) => setTimeout(r, 200));
      setFlipping(false);
      setLast(payload);
      applyResult(payload.balanceCents, payload.netCents);
      applyProgress(payload.progress);
      pushFlash(game.name, payload.netCents, payload.result);
      setFeedVersion((v) => v + 1);
    } catch {
      setCoin(0, rotationRef.current);
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

  const faceClass = (face: CoinSide) => {
    const ring =
      !flipping && last
        ? last.won
          ? "border-win from-win/40 via-win/15 to-win/5 text-win"
          : "border-loss from-loss/40 via-loss/15 to-loss/5 text-loss"
        : "border-volt from-volt/40 via-volt/15 to-volt/5 text-volt";
    return `absolute inset-0 grid place-items-center rounded-full border-4 bg-gradient-to-br text-4xl font-black shadow-volt [backface-visibility:hidden] ${ring} ${
      face === "tails" ? "[transform:rotateX(180deg)]" : ""
    }`;
  };

  const canvas = (
    <div className="mx-auto w-full max-w-sm text-center">
      <div className="mx-auto mt-16 grid h-40 w-40 place-items-center [perspective:800px]">
        <div
          ref={coinRef}
          className="relative h-32 w-32 [transform-style:preserve-3d] will-change-transform"
        >
          <div className={faceClass("heads")}>
            <span className="grid h-[70%] w-[70%] place-items-center rounded-full border-2 border-current/30 bg-black/10">
              H
            </span>
          </div>
          <div className={faceClass("tails")}>
            <span className="grid h-[70%] w-[70%] place-items-center rounded-full border-2 border-current/30 bg-black/10">
              T
            </span>
          </div>
        </div>
      </div>
      <div
        ref={shadowRef}
        className="mx-auto -mt-2 h-5 w-28 rounded-full bg-black/70 blur-md"
        aria-hidden
      />

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
              side === s ? "border-transparent bg-base-500 text-white" : "border-transparent bg-base-900 text-slate-400 hover:text-white"
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

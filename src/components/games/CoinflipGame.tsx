"use client";

import { useCallback, useRef, useState } from "react";
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

  const coinRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<HTMLDivElement | null>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const spin = useCallback((targetSide: CoinSide, durationMs: number, onDone?: () => void) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    const start = rotationRef.current;
    // Land exactly face-on: heads = 0deg (mod 360), tails = 180deg (mod 360).
    const faceOffset = targetSide === "heads" ? 0 : 180;
    const currentMod = ((start % 360) + 360) % 360;
    let delta = faceOffset - currentMod;
    if (delta < 0) delta += 360;
    // A few full spins on top so it visibly tumbles rather than just nudging into place.
    const target = start + delta + 360 * 4;
    const bounceHeight = 26;

    const t0 = performance.now();
    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = easeOutCubic(p);
      const angle = start + (target - start) * eased;
      rotationRef.current = angle;
      // A single hop synced to the tumble: up on the way out, down on landing,
      // with a shrinking, fading shadow so it reads as leaving the ground.
      const hop = Math.sin(Math.min(1, p) * Math.PI) * bounceHeight;
      if (coinRef.current) {
        coinRef.current.style.transform = `translateY(${-hop}px) rotateY(${angle}deg)`;
      }
      if (shadowRef.current) {
        const shrink = 1 - (hop / bounceHeight) * 0.4;
        shadowRef.current.style.transform = `scale(${shrink})`;
        shadowRef.current.style.opacity = `${1 - (hop / bounceHeight) * 0.6}`;
      }
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        onDone?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

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

    // Tumble immediately on tap, guessing the called side, so the coin is
    // already mid-air by the time the server answers — no dead pause first.
    spin(side, 900);

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

      // Re-target the spin onto the real result and let it settle there,
      // rather than teleporting the face once the network call resolves.
      await new Promise<void>((resolve) => spin(payload.result, 550, resolve));
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
  }, [busy, betError, effectiveBet, side, spin, applyResult, applyProgress, pushFlash, game.name]);

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
      face === "tails" ? "[transform:rotateY(180deg)]" : ""
    }`;
  };

  const canvas = (
    <div className="mx-auto w-full max-w-sm text-center">
      <div className="mx-auto grid h-40 w-40 place-items-center [perspective:800px]">
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

"use client";

import { useEffect, useState } from "react";
import { formatCents, formatSignedCents } from "@/lib/money";
import { useWallet } from "@/components/WalletProvider";

/**
 * The always-visible balance. Counts up/down to the new figure and flashes the
 * net change in high-contrast win/loss colour.
 */
export default function BalanceDisplay({ size = "md" }: { size?: "sm" | "md" }) {
  const { balanceCents, lastDelta, loading } = useWallet();
  const [shown, setShown] = useState<number | null>(balanceCents);
  const [flash, setFlash] = useState<{ id: number; netCents: number } | null>(null);

  // Ease the displayed number toward the real balance.
  useEffect(() => {
    if (balanceCents === null) {
      setShown(null);
      return;
    }
    if (shown === null) {
      setShown(balanceCents);
      return;
    }
    if (shown === balanceCents) return;

    const from = shown;
    const to = balanceCents;
    const start = performance.now();
    const duration = 420;
    let frame = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceCents]);

  useEffect(() => {
    if (!lastDelta || lastDelta.netCents === 0) return;
    setFlash(lastDelta);
    const timer = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(timer);
  }, [lastDelta]);

  const won = (flash?.netCents ?? 0) > 0;

  return (
    <div className="relative flex flex-col items-end leading-none">
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Balance</span>
      <span
        className={[
          "num font-black text-white",
          size === "md" ? "text-[19px]" : "text-[16px]",
          flash ? (won ? "text-win" : "text-loss") : "",
          "transition-colors duration-300",
        ].join(" ")}
      >
        {loading && balanceCents === null ? "—" : formatCents(shown ?? 0)}
      </span>

      {flash && (
        <span
          key={flash.id}
          className={`pointer-events-none absolute -top-3 right-0 animate-float-up text-xs font-black ${
            won ? "num-win" : "num-loss"
          }`}
        >
          {formatSignedCents(flash.netCents)}
        </span>
      )}
    </div>
  );
}

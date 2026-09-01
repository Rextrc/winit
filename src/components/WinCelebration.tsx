"use client";

import { useEffect, useMemo, useState } from "react";
import { useBet } from "@/components/BetProvider";
import { formatCents } from "@/lib/money";

const TIER_STYLE: Record<
  string,
  { label: string; from: string; to: string; glow: string; duration: number; pieces: number }
> = {
  NICE: { label: "Nice Win", from: "#2ee6b8", to: "#12a98a", glow: "rgba(46,230,184,0.5)", duration: 2200, pieces: 0 },
  BIG: { label: "Big Win", from: "#7fd8ff", to: "#2f9fe0", glow: "rgba(127,216,255,0.55)", duration: 2800, pieces: 24 },
  HUGE: { label: "Huge Win", from: "#c98bff", to: "#9a3fe8", glow: "rgba(201,139,255,0.6)", duration: 3400, pieces: 40 },
  MEGA: { label: "Mega Win", from: "#ffcf5c", to: "#f2a51e", glow: "rgba(255,207,92,0.65)", duration: 4000, pieces: 60 },
  EPIC: { label: "Epic Win", from: "#ff8ad4", to: "#e8449f", glow: "rgba(255,138,212,0.7)", duration: 4800, pieces: 90 },
};

const CONFETTI_COLORS = ["#2e8bff", "#7fd8ff", "#2ee6b8", "#ffcf5c", "#c98bff", "#a3ceff"];

/**
 * A tier-scaled celebration for outsized wins, triggered from anywhere a game
 * calls `pushFlash` with a big enough multiplier (see BetProvider). Purely
 * decorative — it never touches the balance or the transaction log, both of
 * which are already final by the time this fires.
 */
export default function WinCelebration() {
  const { celebration, dismissCelebration } = useBet();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!celebration) return;
    setLeaving(false);
    const style = TIER_STYLE[celebration.tier];
    const leaveTimer = setTimeout(() => setLeaving(true), style.duration - 300);
    const dismissTimer = setTimeout(dismissCelebration, style.duration);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(dismissTimer);
    };
  }, [celebration, dismissCelebration]);

  const confetti = useMemo(() => {
    if (!celebration) return [];
    const style = TIER_STYLE[celebration.tier];
    return Array.from({ length: style.pieces }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.2 + Math.random() * 1.6,
      size: 6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration?.id]);

  if (!celebration) return null;
  const style = TIER_STYLE[celebration.tier];

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {confetti.map((c) => (
        <span
          key={c.id}
          className="absolute top-0 animate-confetti-fall rounded-sm"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size * 0.6,
            backgroundColor: c.color,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            transform: `rotate(${c.rotate}deg)`,
          }}
        />
      ))}

      <div className="absolute inset-x-0 top-24 flex justify-center px-4">
        <div
          className={`${leaving ? "animate-banner-out" : "animate-banner-in"} rounded-2xl border px-6 py-4 text-center shadow-2xl backdrop-blur-md`}
          style={{
            background: `linear-gradient(160deg, ${style.from}22, ${style.to}11)`,
            borderColor: `${style.from}66`,
            boxShadow: `0 0 60px -10px ${style.glow}`,
          }}
        >
          <p
            className="font-display text-2xl font-black uppercase tracking-[0.08em] sm:text-3xl"
            style={{ color: style.from }}
          >
            {style.label}
          </p>
          <p className="num mt-1 text-lg font-black text-white sm:text-xl">
            ×{celebration.multiplier.toFixed(1)} · +{formatCents(celebration.netCents)}
          </p>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-300/80">
            {celebration.game}
          </p>
        </div>
      </div>
    </div>
  );
}

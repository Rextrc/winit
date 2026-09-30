"use client";

import { useId } from "react";
import sfx from "@/lib/sound";

/** A 4-point sparkle glyph, the same shape in both corners — self-contained gradient, no cross-svg id lookup. */
function Sparkle({ gradientId, className }: { gradientId: string; className: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8f5cff" />
          <stop offset="100%" stopColor="#3d8bff" />
        </linearGradient>
      </defs>
      <path d="M8 0c.4 3 1.6 5.6 3.6 6.4C9.6 7.2 8.4 9.8 8 12.8c-.4-3-1.6-5.6-3.6-6.4C6.4 5.6 7.6 3 8 0Z" fill={`url(#${gradientId})`} />
    </svg>
  );
}

/**
 * The card-back artwork itself — the W-mark, gradient border, brushed
 * texture, corner sparkles — with no sizing or animation of its own. Fills
 * whatever box it's put in. Exported so a game that builds its own flip
 * animation (Blackjack) can use the exact same face without duplicating it.
 */
export function CardBackFace({ className = "" }: { className?: string }) {
  const id = useId();
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-xl bg-[#0a0a0f] ${className}`}
      style={{
        border: "1.5px solid transparent",
        backgroundImage: `linear-gradient(#0a0a0f, #0a0a0f), linear-gradient(135deg, #8f5cff, #3d8bff)`,
        backgroundOrigin: "border-box",
        backgroundClip: "padding-box, border-box",
      }}
      aria-label="Face-down card"
    >
      {/* Faint diagonal hairlines, like brushed foil. */}
      <div
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.9) 0 1px, transparent 1px 9px)",
        }}
      />

      <svg viewBox="0 0 100 140" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-mark`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#8f5cff" />
            <stop offset="100%" stopColor="#3d8bff" />
          </linearGradient>
        </defs>
        {/* The W-mark, centered. */}
        <g transform="translate(28, 60) scale(1.35)">
          <path
            d="M0 4 5.5 18.5 12 9 18.5 18.5 25 4"
            fill="none"
            stroke={`url(#${id}-mark)`}
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="25" cy="1" r="3.4" fill="#3d8bff" />
        </g>
      </svg>

      <Sparkle gradientId={`${id}-sparkle-tl`} className="absolute left-1.5 top-1.5 h-3 w-3" />
      <Sparkle gradientId={`${id}-sparkle-br`} className="absolute bottom-1.5 right-1.5 h-3 w-3" />
    </div>
  );
}

/**
 * WinIt's card back, sized and animated — the version every game reaches
 * for. Used everywhere a card deals face-down; no image assets, pure SVG/CSS
 * so it scales cleanly at any card size.
 */
export default function CardBack({
  delayMs = 0,
  small = false,
}: {
  delayMs?: number;
  small?: boolean;
}) {
  const size = small ? "h-[74px] w-[52px]" : "h-[104px] w-[74px]";
  return (
    <div
      className={`${size} animate-card-deal shadow-tile`}
      style={{ animationDelay: `${delayMs}ms` }}
      onAnimationStart={() => sfx.cardDeal()}
    >
      <CardBackFace />
    </div>
  );
}

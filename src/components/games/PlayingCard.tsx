"use client";

import type { Card } from "@/lib/games/blackjack";

const SUIT_GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** Original CSS card face — no card image assets. */
export default function PlayingCard({
  card,
  hidden = false,
  delayMs = 0,
  small = false,
}: {
  card?: Card;
  hidden?: boolean;
  delayMs?: number;
  small?: boolean;
}) {
  const size = small ? "h-[74px] w-[52px] text-[13px]" : "h-[104px] w-[74px] text-[17px]";

  if (hidden || !card) {
    return (
      <div
        className={`${size} animate-card-deal rounded-xl border border-white/15 bg-base-600 shadow-tile`}
        style={{ animationDelay: `${delayMs}ms` }}
        aria-label="Face-down card"
      >
        <div
          className="h-full w-full rounded-xl opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(46,139,255,0.40) 0 3px, transparent 3px 8px)",
          }}
        />
      </div>
    );
  }

  const red = card.s === "H" || card.s === "D";

  return (
    <div
      className={`${size} relative animate-card-deal rounded-xl border border-black/20 bg-slate-50 font-display font-black shadow-tile`}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-label={`${card.r} of ${SUIT_GLYPH[card.s]}`}
    >
      <span className={`absolute left-1.5 top-1 leading-tight ${red ? "text-rose-600" : "text-slate-900"}`}>
        {card.r}
        <span className="block text-[11px]">{SUIT_GLYPH[card.s]}</span>
      </span>
      <span
        className={`absolute inset-0 grid place-items-center ${small ? "text-2xl" : "text-3xl"} ${
          red ? "text-rose-600/85" : "text-slate-900/85"
        }`}
        aria-hidden="true"
      >
        {SUIT_GLYPH[card.s]}
      </span>
      <span
        className={`absolute bottom-1 right-1.5 rotate-180 leading-tight ${
          red ? "text-rose-600" : "text-slate-900"
        }`}
        aria-hidden="true"
      >
        {card.r}
        <span className="block text-[11px]">{SUIT_GLYPH[card.s]}</span>
      </span>
    </div>
  );
}

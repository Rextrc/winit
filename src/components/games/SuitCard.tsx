"use client";

/**
 * Card face for the games whose engines carry the suit as its glyph (War,
 * Three Card, Draw Poker). Blackjack's own PlayingCard encodes suits as
 * letters, so the two deliberately stay separate rather than one of them
 * translating on every render.
 */
export default function SuitCard({
  rank,
  suit,
  hidden = false,
  delayMs = 0,
  small = false,
  dimmed = false,
  highlighted = false,
}: {
  rank?: string;
  suit?: string;
  hidden?: boolean;
  delayMs?: number;
  small?: boolean;
  dimmed?: boolean;
  highlighted?: boolean;
}) {
  const size = small ? "h-[74px] w-[52px] text-[13px]" : "h-[104px] w-[74px] text-[17px]";

  if (hidden || !rank || !suit) {
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

  const red = suit === "♥" || suit === "♦";

  return (
    <div
      className={`${size} relative animate-card-deal rounded-xl border font-display font-black shadow-tile transition-all duration-200 ${
        highlighted ? "border-volt ring-2 ring-volt -translate-y-1.5" : "border-black/20"
      } ${dimmed ? "opacity-40" : ""} bg-slate-50`}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-label={`${rank} of ${suit}`}
    >
      <span className={`absolute left-1.5 top-1 leading-none ${red ? "text-[#c0142f]" : "text-slate-900"}`}>
        {rank}
      </span>
      <span
        className={`absolute inset-0 grid place-items-center text-[26px] ${
          red ? "text-[#c0142f]" : "text-slate-900"
        }`}
      >
        {suit}
      </span>
      <span
        className={`absolute bottom-1 right-1.5 rotate-180 leading-none ${
          red ? "text-[#c0142f]" : "text-slate-900"
        }`}
      >
        {rank}
      </span>
    </div>
  );
}

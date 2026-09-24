"use client";

import { useEffect, useRef } from "react";
import { useWallet, type Award } from "@/components/WalletProvider";
import { TIER_COLOURS } from "@/lib/life/achievements";
import sfx from "@/lib/sound";

/** How long each celebration stays up before it dismisses itself. */
const LIFETIME_MS = 5200;

function Toast({ award, onDone }: { award: Award; onDone: () => void }) {
  // The callback is held in a ref rather than depended on, so the countdown is
  // armed once per toast. Depending on it directly restarted the timer on every
  // re-render, and the bonus countdown in WalletProvider re-renders this tree
  // once a second — the toast was cancelling its own dismissal forever.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const t = setTimeout(() => done.current(), LIFETIME_MS);
    return () => clearTimeout(t);
  }, [award.id]);

  const style = (() => {
    switch (award.kind) {
      case "achievement":
        return {
          eyebrow: "Achievement unlocked",
          title: award.name,
          body: award.description,
          colour: TIER_COLOURS[award.tier as keyof typeof TIER_COLOURS] ?? "#8f5cff",
          glyph: "★",
        };
      case "vip":
        return {
          eyebrow: "VIP promotion",
          title: `${award.name} tier`,
          body: "Your table limit and daily bonus just went up.",
          colour: award.colour,
          glyph: "◆",
        };
      case "reputation":
        return {
          eyebrow: "Reputation",
          title: award.name,
          body: award.blurb,
          colour: "#8f5cff",
          glyph: "◉",
        };
      case "challenge":
        return {
          eyebrow: `${award.period === "daily" ? "Daily" : "Weekly"} challenge complete`,
          title: award.name,
          body: "Claim it on the career page.",
          colour: "#2ee6b8",
          glyph: "✓",
        };
    }
  })();

  return (
    <div
      className="animate-banner-in panel pointer-events-auto flex w-[300px] items-start gap-3 border-white/10 p-3.5"
      style={{ boxShadow: `0 0 0 1px ${style.colour}44, 0 14px 34px -18px ${style.colour}` }}
      role="status"
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-black"
        style={{ background: `${style.colour}22`, color: style.colour }}
        aria-hidden="true"
      >
        {style.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="text-[9px] font-black uppercase tracking-[0.18em]"
          style={{ color: style.colour }}
        >
          {style.eyebrow}
        </p>
        <p className="truncate text-[13px] font-black text-white">{style.title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{style.body}</p>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="shrink-0 rounded-lg px-1.5 text-slate-600 hover:text-slate-300"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

/** Stacked celebrations for achievements, VIP, reputation and challenges. */
export default function AwardToasts() {
  const { awards, dismissAward } = useWallet();
  // Plays once per award id, tracked in a set rather than by array position —
  // awards are appended and dismissed independently of when the sound should
  // fire, so position or length alone can't tell "new" from "still here."
  const played = useRef<Set<number>>(new Set());
  useEffect(() => {
    for (const a of awards) {
      if (!played.current.has(a.id)) {
        played.current.add(a.id);
        sfx.award();
      }
    }
  }, [awards]);

  if (awards.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[80] flex flex-col gap-2">
      {awards.slice(0, 4).map((a) => (
        <Toast key={a.id} award={a} onDone={() => dismissAward(a.id)} />
      ))}
    </div>
  );
}

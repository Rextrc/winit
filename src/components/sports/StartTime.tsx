"use client";

import { useEffect, useState } from "react";

/** Re-renders every `ms` so relative times ("In 12m") stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function relative(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${Math.max(1, mins)} minute${mins === 1 ? "" : "s"}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/** A pie that empties as kick-off approaches over the last hour. */
function Countdown({ fraction }: { fraction: number }) {
  const r = 7;
  const angle = Math.max(0.0001, Math.min(1, fraction)) * Math.PI * 2;
  const x = 8 + r * Math.sin(angle);
  const y = 8 - r * Math.cos(angle);
  const large = angle > Math.PI ? 1 : 0;
  return (
    <svg viewBox="0 0 16 16" className="h-[18px] w-[18px]" aria-hidden="true">
      <circle cx="8" cy="8" r="7.5" fill="rgba(34,221,122,0.22)" />
      {fraction >= 0.999 ? (
        <circle cx="8" cy="8" r={r} fill="#22dd7a" />
      ) : (
        <path d={`M8 8 L8 1 A${r} ${r} 0 ${large} 1 ${x} ${y} Z`} fill="#22dd7a" />
      )}
    </svg>
  );
}

/**
 * "Sep 28, 1:00 PM · In 59m" in green inside the last hour, "Sep 28, 9:15 PM
 * - in 9 hours" otherwise, and a red LIVE pill once it's started.
 */
export default function StartTime({
  iso,
  className = "",
  onHero = false,
}: {
  iso: string;
  className?: string;
  /** Sitting on the violet banner art: brighter text with a shadow. */
  onHero?: boolean;
}) {
  const shadow = onHero ? "[text-shadow:0_1px_8px_rgba(20,10,60,0.9)]" : "";
  const now = useNow();
  const t = new Date(iso).getTime();
  const left = t - now;

  if (left <= 0) {
    return (
      <span className={`inline-flex items-center gap-2 text-[13px] ${className}`}>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-loss/15 px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-loss">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-loss" />
          Live
        </span>
        <span className={onHero ? `text-white/90 ${shadow}` : "text-slate-400"}>Started {formatKickoff(iso)}</span>
      </span>
    );
  }

  if (left < 60 * 60_000) {
    const mins = Math.max(1, Math.ceil(left / 60_000));
    return (
      <span className={`inline-flex items-center gap-2.5 text-[13px] text-win ${shadow} ${className}`}>
        <span>{formatKickoff(iso)}</span>
        <Countdown fraction={left / (60 * 60_000)} />
        <span>In {mins}m</span>
      </span>
    );
  }

  return (
    <span className={`text-[13px] ${onHero ? `font-semibold text-white/90 ${shadow}` : "text-slate-400"} ${className}`}>
      {formatKickoff(iso)} - {relative(left)}
    </span>
  );
}

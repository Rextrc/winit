/** Original WinIt wordmark — pure SVG/CSS, no external assets. */
export function Mark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="winit-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d6ff85" />
          <stop offset="100%" stopColor="#98e300" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="#12162a" stroke="rgba(182,255,46,0.35)" />
      {/* A "W" drawn as a rising bet line, with the dot of the "i" as the payout. */}
      <path
        d="M8 12.5 13.5 27 20 17.5 26.5 27 32 12.5"
        fill="none"
        stroke="url(#winit-mark)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="9.5" r="3" fill="#b6ff2e" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark className={compact ? "h-8 w-8" : "h-9 w-9"} />
      {!compact && (
        <span className="font-display text-[22px] font-black tracking-tight text-white">
          Win<span className="text-volt">It</span>
        </span>
      )}
    </span>
  );
}

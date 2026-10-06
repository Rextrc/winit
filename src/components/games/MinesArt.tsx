/** Original vector art for Mines tiles — a cut emerald and a lit bomb. */

export function Gem({ className = "h-[70%] w-[70%]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_0_10px_rgba(34,221,122,0.55)]`} aria-hidden="true">
      <defs>
        <linearGradient id="gem-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b8ffd9" />
          <stop offset="1" stopColor="#22dd7a" />
        </linearGradient>
        <linearGradient id="gem-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2bea8a" />
          <stop offset="1" stopColor="#0b7a45" />
        </linearGradient>
      </defs>
      <path d="M18 10h28l12 14-26 32L6 24z" fill="url(#gem-b)" />
      <path d="M18 10h28l12 14H6z" fill="url(#gem-a)" />
      <path d="M6 24h52L32 56z" fill="#13b866" />
      <path d="M22 24 32 56 42 24z" fill="#3df29b" opacity=".85" />
      <path d="M18 10l4 14 10-14 10 14 4-14" fill="none" stroke="#e9fff3" strokeOpacity=".7" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6 24h52" stroke="#e9fff3" strokeOpacity=".6" strokeWidth="1.2" />
      <path d="M24 14l-3 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

export function Bomb({ className = "h-[72%] w-[72%]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_0_12px_rgba(255,90,110,0.6)]`} aria-hidden="true">
      <defs>
        <radialGradient id="bomb-body" cx="0.35" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#5b6170" />
          <stop offset="0.45" stopColor="#242833" />
          <stop offset="1" stopColor="#0b0d12" />
        </radialGradient>
        <radialGradient id="bomb-spark" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff7d1" />
          <stop offset="0.4" stopColor="#ffc93c" />
          <stop offset="1" stopColor="#ff5a1f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="28" cy="38" r="20" fill="url(#bomb-body)" />
      <rect x="34" y="14" width="12" height="9" rx="2" transform="rotate(40 40 18)" fill="#3a3f4b" />
      <path d="M44 14c3-5 8-6 11-3" fill="none" stroke="#c9a46a" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="56" cy="10" r="7" fill="url(#bomb-spark)" />
      <ellipse cx="20" cy="29" rx="6" ry="3.5" transform="rotate(-35 20 29)" fill="#fff" opacity=".22" />
    </svg>
  );
}

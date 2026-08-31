import type { Sym } from "@/lib/games/candy";

/**
 * Reel artwork — original inline SVG, drawn here rather than loaded, so the
 * game ships no image assets. Each symbol layers a base gradient, an inner
 * shade for volume, a hard specular highlight and an outer rim light, which
 * is what actually reads as "glossy 3D candy" instead of a flat vector icon.
 */

type Props = { symbol: Sym; className?: string };

function Frame({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? "h-full w-full"} role="img" aria-hidden="true" focusable="false">
      <defs>
        <filter id={`shadow-${id}`} x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <radialGradient id={`spec-${id}`} cx="30%" cy="26%" r="35%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g filter={`url(#shadow-${id})`}>{children}</g>
    </svg>
  );
}

/** A hard round specular highlight — the single biggest cue for "glossy". */
function Spec({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  return <circle cx={cx} cy={cy} r={r} fill={`url(#spec-${id})`} />;
}

/** A soft secondary sheen, lower opacity, for a rounder feel on big shapes. */
function Sheen({ cx, cy, rx, ry, rotate = -25 }: { cx: number; cy: number; rx: number; ry: number; rotate?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity="0.22" transform={`rotate(${rotate} ${cx} ${cy})`} />;
}

function grad(id: string, stops: [string, string][]) {
  return (
    <linearGradient id={id} x1="0.15" y1="0" x2="0.85" y2="1">
      {stops.map(([offset, color]) => (
        <stop key={offset} offset={offset} stopColor={color} />
      ))}
    </linearGradient>
  );
}

const ART: Record<Sym, (id: string) => React.ReactNode> = {
  STAR: (id) => (
    <>
      <defs>{grad(`g-${id}`, [["0%", "#e6ffa3"], ["45%", "#9be83e"], ["100%", "#4a9e1c"]])}</defs>
      <path
        d="M32 6l8 17.5 19 2.4-14 13.4 3.6 19-16.6-9.6L15.4 58.3 19 39.3 5 25.9l19-2.4z"
        fill={`url(#g-${id})`}
        stroke="#2f6e0f"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 12l5.6 12.2L51 26l-9.8 9.4 2.5 13.3-11.7-6.7-11.7 6.7 2.5-13.3L13 26l13.4-1.8z"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="1.6"
      />
      <Spec id={id} cx={22} cy={18} r={9} />
      <Sheen cx={40} cy={40} rx={7} ry={4} rotate={30} />
    </>
  ),

  GEM: (id) => (
    <>
      <defs>{grad(`g-${id}`, [["0%", "#c9f6ff"], ["45%", "#4fc4f0"], ["100%", "#136fa8"]])}</defs>
      <path
        d="M32 6 52 22 40 58H24L12 22z"
        fill={`url(#g-${id})`}
        stroke="#0b4c73"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M12 22h40" stroke="#0b4c73" strokeWidth="1.4" opacity="0.5" />
      <path
        d="M22 22 32 6l10 16M25 22l7 36 7-36"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        opacity="0.55"
      />
      <path d="M32 6 22 22h20z" fill="#fff" opacity="0.3" />
      <Spec id={id} cx={24} cy={16} r={8} />
    </>
  ),

  HEX: (id) => (
    <>
      <defs>{grad(`g-${id}`, [["0%", "#f3d6ff"], ["45%", "#c96bf2"], ["100%", "#7a1fa8"]])}</defs>
      <path
        d="M32 4 56 18v28L32 60 8 46V18z"
        fill={`url(#g-${id})`}
        stroke="#54137a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 10 50 20.5v21L32 52 14 41.5v-21z"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.3"
        strokeWidth="1.6"
      />
      <Spec id={id} cx={22} cy={18} r={9} />
      <Sheen cx={42} cy={42} rx={7} ry={4} rotate={20} />
    </>
  ),

  HEART: (id) => (
    <>
      <defs>{grad(`g-${id}`, [["0%", "#ffd3e4"], ["45%", "#ff6b9d"], ["100%", "#c81558"]])}</defs>
      <path
        d="M32 56S8 39.5 8 22.5C8 13.5 14.5 8 21.5 8c5.5 0 9.5 3.4 10.5 7 1-3.6 5-7 10.5-7 7 0 13.5 5.5 13.5 14.5C56 39.5 32 56 32 56z"
        fill={`url(#g-${id})`}
        stroke="#900f3f"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M32 50S14 37 14 23.5C14 17 18.6 13 23 13c3.6 0 6.4 2 7.6 4.6"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Spec id={id} cx={20} cy={20} r={8} />
    </>
  ),

  BEAR: (id) => (
    <>
      <defs>
        {grad(`g-${id}`, [["0%", "#ffe3a8"], ["50%", "#ffb545"], ["100%", "#d67a12"]])}
        {grad(`g-${id}-ear`, [["0%", "#ffe3a8"], ["100%", "#e89528"]])}
      </defs>
      <circle cx="17" cy="15" r="7.5" fill={`url(#g-${id}-ear)`} stroke="#a8590c" strokeWidth="2" />
      <circle cx="47" cy="15" r="7.5" fill={`url(#g-${id}-ear)`} stroke="#a8590c" strokeWidth="2" />
      <circle cx="17" cy="15.5" r="3.2" fill="#7a3f14" opacity="0.8" />
      <circle cx="47" cy="15.5" r="3.2" fill="#7a3f14" opacity="0.8" />
      <path
        d="M32 11c12.2 0 20.5 9.7 20.5 20.5C52.5 44.5 43 54 32 54S11.5 44.5 11.5 31.5C11.5 20.7 19.8 11 32 11z"
        fill={`url(#g-${id})`}
        stroke="#a8590c"
        strokeWidth="2.5"
      />
      <ellipse cx="32" cy="36" rx="10" ry="8.5" fill="#fff0d6" />
      <ellipse cx="26" cy="27" rx="2.6" ry="3.4" fill="#402008" />
      <ellipse cx="38" cy="27" rx="2.6" ry="3.4" fill="#402008" />
      <ellipse cx="24.6" cy="25.3" rx="0.9" ry="1.1" fill="#fff" />
      <ellipse cx="36.6" cy="25.3" rx="0.9" ry="1.1" fill="#fff" />
      <ellipse cx="32" cy="37" rx="3" ry="2.2" fill="#7a3f14" />
      <path d="M32 39c-2.2 2.4-6.4 2.4-8.6-0.6M32 39c2.2 2.4 6.4 2.4 8.6-0.6" stroke="#7a3f14" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <Spec id={id} cx={22} cy={22} r={8} />
    </>
  ),

  CANDY: (id) => (
    <>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff8ad4" />
          <stop offset="35%" stopColor="#ffd76b" />
          <stop offset="70%" stopColor="#7fe89a" />
          <stop offset="100%" stopColor="#6be3ff" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="25" fill={`url(#g-${id})`} stroke="#6c1f9e" strokeWidth="2.5" />
      {[0, 30, 60, 90, 120, 150].map((a) => (
        <line key={a} x1="32" y1="8" x2="32" y2="56" stroke="#fff" strokeWidth="2.6" opacity="0.5" transform={`rotate(${a} 32 32)`} />
      ))}
      <circle cx="32" cy="32" r="25" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.5" />
      <circle cx="32" cy="32" r="8" fill="#fff" opacity="0.55" />
      <Spec id={id} cx={23} cy={21} r={8} />
    </>
  ),

  LOLLI: (id) => (
    <>
      <defs>
        <radialGradient id={`g-${id}`} cx="35%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#fff0f8" />
          <stop offset="40%" stopColor="#ff9ad2" />
          <stop offset="75%" stopColor="#e0399e" />
          <stop offset="100%" stopColor="#a02277" />
        </radialGradient>
      </defs>
      <path d="M32 40v20" stroke="#c9822f" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 40v20" stroke="#e8a94e" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
      <circle cx="32" cy="23" r="19" fill={`url(#g-${id})`} stroke="#7a1858" strokeWidth="2.5" />
      <path
        d="M32 23 m-14 0 a14 14 0 0 1 28 0 a10 10 0 0 1 -20 0 a6 6 0 0 1 12 0"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        opacity="0.65"
      />
      <Spec id={id} cx={24} cy={15} r={7} />
    </>
  ),
};

export default function CandySymbol({ symbol, className }: Props) {
  return (
    <Frame id={symbol} className={className}>
      {ART[symbol](symbol)}
    </Frame>
  );
}

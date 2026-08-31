import type { Sym } from "@/lib/games/candy";

/**
 * Original inline SVG candy artwork — no image assets, glossy 3D-style
 * shading via gradients and drop shadows so the board reads as vivid and
 * "alive" rather than flat glyphs on a dark background.
 */

type Props = { symbol: Sym; className?: string };

function Frame({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? "h-full w-full"} role="img" aria-hidden="true" focusable="false">
      <defs>
        <filter id={`shadow-${id}`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter={`url(#shadow-${id})`}>{children}</g>
    </svg>
  );
}

function Gloss({ cx, cy, rx, ry, rotate = -25 }: { cx: number; cy: number; rx: number; ry: number; rotate?: number }) {
  return (
    <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity="0.4" transform={`rotate(${rotate} ${cx} ${cy})`} />
  );
}

function grad(id: string, from: string, to: string) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  );
}

const ART: Record<Sym, React.ReactNode> = {
  STAR: (
    <>
      <defs>{grad("g-star", "#baff5c", "#5fbf2f")}</defs>
      <path
        d="M32 8l7 15.5 17 2-12.5 12 3 17L32 46l-14.5 8.5 3-17-12.5-12 17-2z"
        fill="url(#g-star)"
        stroke="#3f8a1f"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Gloss cx={26} cy={22} rx={5} ry={3} />
    </>
  ),

  GEM: (
    <>
      <defs>{grad("g-gem", "#7fe2ff", "#1b8fcf")}</defs>
      <path d="M32 8 50 24 40 56H24L14 24z" fill="url(#g-gem)" stroke="#0e5c8a" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 24h36M22 24 32 8l10 16M24 24l8 32 8-32" fill="none" stroke="#e5faff" strokeWidth="1.4" opacity="0.6" />
      <Gloss cx={24} cy={19} rx={4.5} ry={2.6} />
    </>
  ),

  HEX: (
    <>
      <defs>{grad("g-hex", "#e2a6ff", "#9b3fd6")}</defs>
      <path
        d="M32 6 54 19v26L32 58 10 45V19z"
        fill="url(#g-hex)"
        stroke="#6c1f9e"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Gloss cx={24} cy={20} rx={6} ry={3.4} />
    </>
  ),

  HEART: (
    <>
      <defs>{grad("g-heart", "#ffa8c6", "#f2467e")}</defs>
      <path
        d="M32 54S10 39 10 24c0-8 6-13 12-13 5 0 8.5 3 10 6 1.5-3 5-6 10-6 6 0 12 5 12 13 0 15-22 30-22 30z"
        fill="url(#g-heart)"
        stroke="#b8265a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <Gloss cx={22} cy={22} rx={5} ry={3} />
    </>
  ),

  BEAR: (
    <>
      <defs>{grad("g-bear", "#ffcf70", "#e8862a")}</defs>
      <circle cx="18" cy="14" r="6.5" fill="url(#g-bear)" stroke="#b5601a" strokeWidth="1.6" />
      <circle cx="46" cy="14" r="6.5" fill="url(#g-bear)" stroke="#b5601a" strokeWidth="1.6" />
      <path
        d="M32 12c11 0 19 9 19 19 0 12-9 21-19 21S13 43 13 31c0-10 8-19 19-19z"
        fill="url(#g-bear)"
        stroke="#b5601a"
        strokeWidth="2"
      />
      <ellipse cx="26" cy="30" rx="2.2" ry="2.8" fill="#5a2f0d" />
      <ellipse cx="38" cy="30" rx="2.2" ry="2.8" fill="#5a2f0d" />
      <ellipse cx="32" cy="38" rx="4" ry="3" fill="#f6dcae" />
      <path d="M32 40c-2 2-6 2-8-1M32 40c2 2 6 2 8-1" stroke="#5a2f0d" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <Gloss cx={24} cy={24} rx={5} ry={3} />
    </>
  ),

  CANDY: (
    <>
      <defs>
        <linearGradient id="g-candyA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff8ad4" />
          <stop offset="50%" stopColor="#ffd76b" />
          <stop offset="100%" stopColor="#6be3ff" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill="url(#g-candyA)" stroke="#7a2f9e" strokeWidth="2" />
      {[0, 45, 90, 135].map((a) => (
        <line
          key={a}
          x1="32"
          y1="10"
          x2="32"
          y2="54"
          stroke="#fff"
          strokeWidth="3"
          opacity="0.55"
          transform={`rotate(${a} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="24" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.4" />
      <Gloss cx={24} cy={22} rx={6} ry={3.4} />
    </>
  ),

  LOLLI: (
    <>
      <defs>
        <radialGradient id="g-lolli" cx="35%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#fff0f8" />
          <stop offset="45%" stopColor="#ff9ad2" />
          <stop offset="100%" stopColor="#e0399e" />
        </radialGradient>
      </defs>
      <path d="M32 40v18" stroke="#c9822f" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="24" r="18" fill="url(#g-lolli)" stroke="#a02277" strokeWidth="2" />
      <path
        d="M32 24 m-13 0 a13 13 0 0 1 26 0 a9 9 0 0 1 -18 0 a5.5 5.5 0 0 1 11 0"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        opacity="0.65"
      />
      <Gloss cx={25} cy={16} rx={4.5} ry={2.6} />
    </>
  ),
};

export default function CandySymbol({ symbol, className }: Props) {
  return (
    <Frame id={symbol} className={className}>
      {ART[symbol]}
    </Frame>
  );
}

import type { Sym } from "@/lib/games/slots";

/**
 * Reel artwork — original inline SVG, drawn here rather than loaded, so the
 * game ships no image assets and every symbol scales cleanly and stays crisp
 * on any display.
 *
 * Each symbol is drawn inside a 0 0 64 64 box and inherits its size from the
 * wrapper, so the same component serves the reels, the paytable and the tiles.
 */

type Props = { symbol: Sym; className?: string };

const LEAF = "#3fbf6a";
const LEAF_DARK = "#2e9450";
const STEM = "#7a5a3a";

function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className ?? "h-full w-full"}
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A soft top-left highlight, reused so every fruit reads as the same material. */
function Gloss({ cx, cy, rx, ry, rotate = -25 }: { cx: number; cy: number; rx: number; ry: number; rotate?: number }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill="#ffffff"
      opacity="0.28"
      transform={`rotate(${rotate} ${cx} ${cy})`}
    />
  );
}

const ART: Record<Sym, React.ReactNode> = {
  CHERRY: (
    <>
      <path d="M33 12c-6 6-14 10-19 20" stroke={STEM} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M33 12c4 8 8 13 12 20" stroke={STEM} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M33 12c6-6 13-5 16-2-5 4-11 5-16 2z" fill={LEAF} />
      <circle cx="21" cy="45" r="12" fill="#d9243f" />
      <circle cx="45" cy="45" r="11" fill="#b81c33" />
      <Gloss cx={17} cy={40} rx={4.5} ry={2.8} />
      <Gloss cx={41} cy={41} rx={4} ry={2.4} />
    </>
  ),

  LEMON: (
    <>
      <ellipse cx="32" cy="35" rx="23" ry="18" fill="#f2cf2e" transform="rotate(-15 32 35)" />
      <path d="M52 24c3-1 5 0 6 1-2 2-4 2-6 1z" fill="#e0b81f" />
      <path d="M30 15c5-5 12-6 16-4-4 5-11 7-16 4z" fill={LEAF} />
      <Gloss cx={22} cy={27} rx={7} ry={3.6} />
    </>
  ),

  ORANGE: (
    <>
      <circle cx="32" cy="36" r="20" fill="#f08a24" />
      <circle cx="32" cy="36" r="20" fill="none" stroke="#d4711a" strokeWidth="2" />
      <path d="M32 14c0-4 3-7 6-8-1 5-3 7-6 8z" fill={STEM} />
      <path d="M32 14c5-5 13-5 17-3-4 5-12 7-17 3z" fill={LEAF} />
      <path d="M20 26c4 3 7 8 8 14" stroke="#ffb968" strokeWidth="2.5" fill="none" opacity="0.55" strokeLinecap="round" />
      <Gloss cx={23} cy={28} rx={6} ry={3.4} />
    </>
  ),

  PLUM: (
    <>
      <ellipse cx="32" cy="37" rx="19" ry="20" fill="#8b3fb5" />
      <path d="M32 18c-2 7-2 14 0 20" stroke="#6c2c8f" strokeWidth="2.5" fill="none" opacity="0.7" />
      <path d="M32 17c1-5 4-8 7-9-1 5-3 8-7 9z" fill={STEM} />
      <path d="M33 16c5-5 13-5 17-3-4 5-12 8-17 3z" fill={LEAF_DARK} />
      <Gloss cx={23} cy={29} rx={6} ry={3.4} />
    </>
  ),

  GRAPES: (
    <>
      <path d="M32 13c0 5 0 8-1 11" stroke={STEM} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M32 13c5-4 12-4 16-2-4 5-11 7-16 2z" fill={LEAF} />
      {[
        [32, 27],
        [23, 34],
        [41, 34],
        [32, 39],
        [18, 44],
        [46, 44],
        [27, 47],
        [37, 47],
        [32, 54],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="7" fill={i % 3 === 0 ? "#8d5fd3" : "#7a4cc4"} />
      ))}
      <Gloss cx={29} cy={25} rx={3} ry={1.8} />
      <Gloss cx={20} cy={32} rx={2.6} ry={1.5} />
    </>
  ),

  WATERMELON: (
    <>
      {/* a half slice, rind down */}
      <path d="M6 44a26 26 0 0 1 52 0z" fill="#e8455f" />
      <path d="M6 44a26 26 0 0 0 52 0z" fill="#2f9d4f" />
      <path d="M9 44a23 23 0 0 0 46 0z" fill="#8fd66a" />
      <path d="M12 44a20 20 0 0 0 40 0z" fill="#e8455f" />
      {[
        [24, 36],
        [32, 32],
        [40, 36],
        [28, 41],
        [36, 41],
      ].map(([cx, cy], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx="1.9" ry="2.8" fill="#22242f" />
      ))}
    </>
  ),

  SEVEN: (
    <>
      <path
        d="M18 14h30l-16 38h-11l15-30H18z"
        fill="#e8455f"
        stroke="#ffd166"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M22 18h20l-3 6H22z" fill="#ffffff" opacity="0.25" />
    </>
  ),

  WILD: (
    <>
      <rect x="6" y="18" width="52" height="30" rx="7" fill="#c8ff4d" />
      <rect x="6" y="18" width="52" height="30" rx="7" fill="none" stroke="#9ade1f" strokeWidth="2" />
      <text
        x="32"
        y="39"
        textAnchor="middle"
        fontSize="15"
        fontWeight="900"
        fill="#0d1018"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        letterSpacing="0.5"
      >
        WILD
      </text>
    </>
  ),

  SCATTER: (
    <>
      <path
        d="M32 8l6.6 15.2L55 24.9 42.7 36l3.6 16.2L32 44l-14.3 8.2L21.3 36 9 24.9l16.4-1.7z"
        fill="#e879f9"
        stroke="#f5b8ff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="31" r="5" fill="#ffffff" opacity="0.35" />
    </>
  ),
};

export default function SlotSymbol({ symbol, className }: Props) {
  return <Frame className={className}>{ART[symbol]}</Frame>;
}

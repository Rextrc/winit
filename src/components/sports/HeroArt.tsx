import type { SportIconKey } from "@/lib/sports/meta";
import SportIcon from "@/components/sports/SportIcon";

function pentagon(cx: number, cy: number, r: number, rotDeg: number): string {
  return Array.from({ length: 5 }, (_, i) => {
    const a = ((rotDeg + i * 72) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

/** A classic panelled ball in the banner's violets. */
function Ball() {
  const outer = Array.from({ length: 5 }, (_, k) => -54 + k * 72);
  const seams = Array.from({ length: 5 }, (_, k) => -90 + k * 72);
  const rad = (d: number) => (d * Math.PI) / 180;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-auto">
      <defs>
        <radialGradient id="ball-shade" cx="36%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#a996ff" />
          <stop offset="60%" stopColor="#7a63e0" />
          <stop offset="100%" stopColor="#4c37a8" />
        </radialGradient>
        <clipPath id="ball-clip">
          <circle cx="50" cy="50" r="46" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#ball-shade)" />
      <g clipPath="url(#ball-clip)" fill="#2c2070">
        <polygon points={pentagon(50, 50, 13, -90)} />
        {outer.map((a) => (
          <polygon key={a} points={pentagon(50 + 37 * Math.cos(rad(a)), 50 + 37 * Math.sin(rad(a)), 13, a + 180)} />
        ))}
      </g>
      <g clipPath="url(#ball-clip)" stroke="#2c2070" strokeWidth="1.3" opacity="0.8">
        {seams.map((a) => (
          <line key={a} x1={50 + 13 * Math.cos(rad(a))} y1={50 + 13 * Math.sin(rad(a))} x2={50 + 46 * Math.cos(rad(a))} y2={50 + 46 * Math.sin(rad(a))} />
        ))}
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke="#2c2070" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

/**
 * The violet match banner: faceted light streaks raking in from the top left
 * and the sport's glyph drawn huge and faint behind the fixture. All vector,
 * drawn for WinIt — it sits behind the trending cards and the match hero.
 */
export default function HeroArt({ sport, className = "" }: { sport: SportIconKey; className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="hero-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3a2a8c" />
            <stop offset="45%" stopColor="#4d33b3" />
            <stop offset="100%" stopColor="#35248a" />
          </linearGradient>
          <radialGradient id="hero-glow" cx="52%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#8a6cff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8a6cff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hero-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="60%" stopColor="#1b1340" stopOpacity="0" />
            <stop offset="100%" stopColor="#1b1340" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        <rect width="1200" height="400" fill="url(#hero-bg)" />
        <rect width="1200" height="400" fill="url(#hero-glow)" />

        {/* Speed streaks from the top left. */}
        <g fill="#ffffff">
          <polygon points="0,0 420,0 180,210 0,300" opacity="0.06" />
          <polygon points="120,0 300,0 60,260 0,250" opacity="0.05" />
          <polygon points="380,0 620,0 330,160" opacity="0.05" />
          <polygon points="560,40 1000,-10 690,120" opacity="0.07" />
          <polygon points="620,120 1180,60 760,170" opacity="0.05" />
          <polygon points="0,330 240,240 150,400 0,400" opacity="0.05" />
        </g>

        {/* Faceted figure — a stylised athlete's silhouette in flat planes. */}
        <g fill="#2a1d6b" opacity="0.55">
          <polygon points="140,400 250,250 330,300 300,400" />
          <polygon points="250,250 360,150 420,210 330,300" />
          <polygon points="360,150 470,90 500,160 420,210" />
          <polygon points="880,400 930,280 1040,250 1010,400" />
          <polygon points="930,280 1010,190 1100,220 1040,250" />
        </g>
        <g fill="#7b62e6" opacity="0.25">
          <polygon points="250,250 330,300 290,330" />
          <polygon points="360,150 420,210 390,215" />
          <polygon points="1010,190 1100,220 1050,230" />
        </g>
      </svg>

      {/* The sport itself, drawn big behind the fixture. */}
      {sport === "soccer" || sport === "popular" ? (
        <div className="absolute left-1/2 top-1/2 h-[118%] -translate-x-[40%] -translate-y-[52%] rotate-[18deg] opacity-60">
          <Ball />
        </div>
      ) : (
        <div className="absolute left-1/2 top-1/2 h-[135%] -translate-x-[38%] -translate-y-[46%] text-white/[0.13]">
          <SportIcon sport={sport} className="h-full w-auto" strokeWidth={0.9} />
        </div>
      )}

      <svg viewBox="0 0 1200 400" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <rect width="1200" height="400" fill="url(#hero-fade)" />
      </svg>
    </div>
  );
}

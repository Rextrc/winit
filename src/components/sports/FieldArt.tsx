import type { Surface } from "@/lib/sports/meta";

const SURFACES: Record<Surface, { a: string; b: string; line: string }> = {
  grass: { a: "#3f8a3a", b: "#357a31", line: "rgba(255,255,255,0.75)" },
  court: { a: "#c98a4a", b: "#b97a3d", line: "rgba(255,255,255,0.85)" },
  ice: { a: "#dfeef6", b: "#d2e5f0", line: "rgba(200,40,60,0.7)" },
  hard: { a: "#2f6aa8", b: "#285e97", line: "rgba(255,255,255,0.85)" },
  canvas: { a: "#6b7280", b: "#5f6673", line: "rgba(255,255,255,0.5)" },
};

/**
 * A stadium seen from the stands: dark tiers of crowd across the top and the
 * playing surface running away in perspective below. Used under the
 * scoreboard's kick-off countdown.
 */
export default function FieldArt({ surface }: { surface: Surface }) {
  const s = SURFACES[surface];
  const stripes = Array.from({ length: 10 }, (_, i) => i);

  return (
    <svg viewBox="0 0 640 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="stand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1d24" />
          <stop offset="100%" stopColor="#343844" />
        </linearGradient>
        <pattern id="crowd" width="8" height="7" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.3" fill="#5a606d" />
          <circle cx="6" cy="5.5" r="1.3" fill="#4a4f5b" />
        </pattern>
        <clipPath id="pitch">
          <polygon points="-60,300 700,300 560,70 80,70" />
        </clipPath>
      </defs>

      <rect width="640" height="300" fill="url(#stand)" />
      <rect width="640" height="70" fill="url(#crowd)" opacity="0.8" />
      <rect y="62" width="640" height="10" fill="#111318" />

      <g clipPath="url(#pitch)">
        {stripes.map((i) => (
          <polygon
            key={i}
            points={`${-60 + i * 76},300 ${-60 + (i + 1) * 76},300 ${80 + (i + 1) * 48},70 ${80 + i * 48},70`}
            fill={i % 2 ? s.a : s.b}
          />
        ))}
        <g fill="none" stroke={s.line} strokeWidth="2.2">
          <polygon points="-30,296 670,296 548,76 92,76" />
          <line x1="320" y1="76" x2="320" y2="296" />
          <ellipse cx="320" cy="170" rx="70" ry="30" />
          <polygon points="130,140 210,140 190,200 95,200" />
          <polygon points="510,140 430,140 450,200 545,200" />
        </g>
      </g>

      {/* Goals / hoops at each end. */}
      <g stroke="#e5e7eb" strokeWidth="2" fill="none" opacity="0.8">
        <path d="M60 150v-26h14v26M580 150v-26h-14v26" />
      </g>
    </svg>
  );
}

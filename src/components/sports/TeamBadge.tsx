import { flagCode, flagUrl } from "@/lib/sports/flags";

/** A deterministic colour pair for a club crest. */
function crestColors(name: string): [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return [`hsl(${hue} 62% 46%)`, `hsl(${(hue + 28) % 360} 70% 30%)`];
}

function initials(name: string): string {
  const words = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * A national team's flag, or a generated shield crest for a club. `shape`
 * "flag" is the small rectangle used in lists; "round" is the circle used
 * in market rows.
 */
export default function TeamBadge({
  team,
  shape = "flag",
  className = "",
}: {
  team: string;
  shape?: "flag" | "round";
  className?: string;
}) {
  const code = flagCode(team);

  if (code) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={flagUrl(code)}
        alt=""
        loading="lazy"
        className={`shrink-0 object-cover ${shape === "round" ? "rounded-full" : "rounded-[3px]"} ${className}`}
      />
    );
  }

  const [a, b] = crestColors(team);
  const id = `crest-${team.replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={a} />
          <stop offset="100%" stopColor={b} />
        </linearGradient>
      </defs>
      {shape === "round" ? (
        <circle cx="16" cy="16" r="15" fill={`url(#${id})`} stroke="rgba(255,255,255,0.25)" strokeWidth="1.2" />
      ) : (
        <path
          d="M16 2 28 6v9.5C28 23 22.6 28 16 30 9.4 28 4 23 4 15.5V6Z"
          fill={`url(#${id})`}
          stroke="rgba(255,255,255,0.28)"
          strokeWidth="1.2"
        />
      )}
      <text
        x="16"
        y={shape === "round" ? 20.5 : 19.5}
        textAnchor="middle"
        fontSize="11"
        fontWeight="800"
        fill="#fff"
        fontFamily="system-ui, sans-serif"
      >
        {initials(team)}
      </text>
    </svg>
  );
}

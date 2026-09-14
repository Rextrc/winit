/**
 * The gem that marks a chosen number.
 *
 * Drawn here as plain SVG rather than shipped as an asset: an octagon, a bevel
 * highlight and an inner facet, tinted by `currentColor` so the same shape can
 * be green while it is only a pick and brighter when it turns out to be a hit.
 */
export default function KenoGem({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="keno-gem-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {/* Octagon: a square with the corners cut, which is the classic keno chip. */}
      <path
        d="M13 3h14l10 10v14L27 37H13L3 27V13z"
        fill="url(#keno-gem-face)"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M15 8h10l7 7v10l-7 7H15l-7-7V15z"
        fill="none"
        stroke="#fff"
        strokeOpacity="0.28"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M13 3h14l-3.5 5h-7z" fill="#fff" fillOpacity="0.22" />
    </svg>
  );
}

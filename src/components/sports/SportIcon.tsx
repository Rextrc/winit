import type { SportIconKey } from "@/lib/sports/meta";

/** Outlined sport glyphs, drawn for WinIt on a 24px grid. */
const PATHS: Record<SportIconKey, JSX.Element> = {
  popular: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="M3 11h16M11 3c2.4 2.2 3.6 4.9 3.6 8s-1.2 5.8-3.6 8c-2.4-2.2-3.6-4.9-3.6-8S8.6 5.2 11 3Z" />
      <path d="m18 14.6 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.3 1.3.4-2.6-1.9-1.8 2.6-.4Z" fill="currentColor" stroke="none" />
    </>
  ),
  soccer: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 8.4 3.4 2.5-1.3 4H9.9l-1.3-4Z" />
      <path d="M12 8.4V3.2M15.4 10.9l4.8-1.6M14.1 14.9l3 4.1M9.9 14.9l-3 4.1M8.6 10.9 3.8 9.3" />
    </>
  ),
  americanfootball: (
    <>
      <path d="M4.2 15.5C3.4 9.4 7 4.6 12.6 4.6c4.3 0 7.6 3 7.6 7.1v1.8h-6.3l-1.2 3.6H7.4" />
      <path d="M13.9 13.5v5.6h6.3M17 13.5v5.6M7.4 17.1v2.9H4.6" />
      <circle cx="10" cy="11" r="1.1" />
    </>
  ),
  basketball: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18M5.7 5.6c3.2 3.4 3.2 9.4 0 12.8M18.3 5.6c-3.2 3.4-3.2 9.4 0 12.8" />
    </>
  ),
  baseball: (
    <>
      <path d="M19.8 4.2 9.3 14.7l-2.2.3-.3-2.2L17.3 2.3a1.4 1.4 0 0 1 2 0l.5.5a1 1 0 0 1 0 1.4Z" />
      <path d="m6.8 15.3-2.9 2.9" />
      <circle cx="16.5" cy="17" r="3.2" />
      <path d="M14.2 15.6c.9.3 1.5 1 1.8 1.9M18.8 18.4c-.9-.3-1.5-1-1.8-1.9" />
    </>
  ),
  icehockey: (
    <>
      <path d="M6 3.5 11.8 16c.3.6.9 1 1.6 1h6.1v2.5h-7a3 3 0 0 1-2.7-1.7L3.5 4.6" />
      <ellipse cx="7" cy="19" rx="3" ry="1.3" />
      <path d="M4 19v.8c0 .7 1.3 1.3 3 1.3s3-.6 3-1.3V19" />
    </>
  ),
  tennis: (
    <>
      <ellipse cx="9.6" cy="9.6" rx="5.6" ry="6.4" transform="rotate(-45 9.6 9.6)" />
      <path d="m13.6 13.8 6.4 6.4M5.8 9.4l8-2.6M7 12.8l6.8-4.4" />
      <circle cx="18.6" cy="5.4" r="1.8" />
    </>
  ),
  mma: (
    <>
      <path d="M7 11V7.4A3.9 3.9 0 0 1 10.9 3.5h3.4a3.9 3.9 0 0 1 3.9 3.9v5.1a4 4 0 0 1-4 4H9.6" />
      <path d="M7 11h4.2a1.8 1.8 0 0 1 0 3.6H7.8A2.8 2.8 0 0 1 5 11.8V9.6" />
      <path d="M8.2 16.5h8.3v4H8.2z" />
    </>
  ),
  boxing: (
    <>
      <path d="M6.5 10.5V8a4.5 4.5 0 0 1 4.5-4.5h2.8A4.2 4.2 0 0 1 18 7.7v4.6a4.2 4.2 0 0 1-4.2 4.2H9" />
      <path d="M6.5 10.5h3.8a1.7 1.7 0 0 1 0 3.4H8.3a2.6 2.6 0 0 1-2.6-2.6" />
      <path d="M8.5 16.5h8v4h-8zM10.5 18.5h4" />
    </>
  ),
  cricket: (
    <>
      <path d="m15.6 3.4 5 5-9.8 9.8-5-5Z" />
      <path d="m5.8 13.2-2.6 2.6 5 5 2.6-2.6" />
      <circle cx="18" cy="17.8" r="2.4" />
    </>
  ),
  rugby: (
    <>
      <ellipse cx="12" cy="12" rx="9.4" ry="5.4" transform="rotate(-45 12 12)" />
      <path d="m8.6 15.4 6.8-6.8M10.2 10.2l1.4 1.4M11.6 8.8 13 10.2M12.4 12.4l1.4 1.4" />
    </>
  ),
  aussierules: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="5.8" transform="rotate(45 12 12)" />
      <path d="m8.2 8.2 7.6 7.6M11 9.6l-1.4 1.4M12.4 11l-1.4 1.4M13.8 12.4 12.4 13.8" />
    </>
  ),
  lacrosse: (
    <>
      <path d="M4 20 13.5 10.5" />
      <path d="M13.5 10.5c-1.8-2.4-1.4-5.8 1.2-7.2 2.7-1.5 6 .6 6 3.8 0 3-3.1 5.6-7.2 3.4Z" />
      <path d="M15 5.5l3.5 3.5M17 4.3l2.2 2.2" />
      <circle cx="6.5" cy="7" r="1.8" />
    </>
  ),
  golf: (
    <>
      <path d="M8 21V3.5l9 3.8-9 3.8" />
      <ellipse cx="11" cy="20.4" rx="6" ry="1.4" />
    </>
  ),
  other: (
    <>
      <path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0Z" />
      <path d="M7.5 5.5H4.8c0 2.6 1 4.2 3.2 4.6M16.5 5.5h2.7c0 2.6-1 4.2-3.2 4.6M12 13v4M8.5 20.5h7l-.8-3.5H9.3Z" />
    </>
  ),
};

export default function SportIcon({
  sport,
  className = "h-6 w-6",
  strokeWidth = 1.6,
}: {
  sport: SportIconKey;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[sport]}
    </svg>
  );
}

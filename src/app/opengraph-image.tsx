import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "WinIt — a play-money casino";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The link-preview card for shares to Slack, Discord, X, iMessage, etc.
 * Built at request/build time from the same mark and palette as the site
 * itself, rather than a shipped screenshot that would drift out of sync
 * with a redesign.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 30% 20%, #0f1c38 0%, #03060e 60%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="120" height="120" viewBox="0 0 40 40">
            <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="#0b1426" stroke="rgba(143,92,255,0.55)" strokeWidth="1.5" />
            <path
              d="M8 12.5 13.5 27 20 17.5 26.5 27 32 12.5"
              fill="none"
              stroke="#4c9bff"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="32" cy="9.5" r="3" fill="#8f5cff" />
          </svg>
          <div style={{ display: "flex", fontSize: 108, fontWeight: 900, color: "white", letterSpacing: -2 }}>
            Win<span style={{ color: "#8f5cff" }}>It</span>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 32, color: "#94a3b8" }}>
          A play-money casino. No deposits. No withdrawals. Just the games.
        </div>
      </div>
    ),
    { ...size },
  );
}

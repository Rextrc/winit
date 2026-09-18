import { ImageResponse } from "next/og";
import { loadShareableWin } from "@/lib/share";
import { GAME_LABELS } from "@/lib/gameLabels";
import { formatCents } from "@/lib/money";

export const runtime = "nodejs";
export const alt = "A win on WinIt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The link-preview card for one shared win — see src/lib/share.ts. */
export default async function ShareImage({ params }: { params: { id: string } }) {
  const win = await loadShareableWin(params.id);
  const label = win ? (GAME_LABELS[win.game] ?? win.game) : null;
  const multiplier = win && win.betCents > 0 ? win.payoutCents / win.betCents : 0;

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
          background: "radial-gradient(circle at 30% 20%, #103824 0%, #03060e 60%)",
          fontFamily: "sans-serif",
        }}
      >
        {win ? (
          <>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 900, color: "#2ee6b8", letterSpacing: 4, textTransform: "uppercase" }}>
              Winner
            </div>
            <div style={{ display: "flex", fontSize: 130, fontWeight: 900, color: "white", marginTop: 12 }}>
              +{formatCents(win.netCents)}
            </div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#2ee6b8", marginTop: 4 }}>
              ×{multiplier.toFixed(2)}
            </div>
            <div style={{ display: "flex", fontSize: 32, color: "#94a3b8", marginTop: 28 }}>
              {win.username} on {label}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", fontSize: 40, color: "#94a3b8" }}>This win is no longer available.</div>
        )}
        <div style={{ display: "flex", fontSize: 28, fontWeight: 900, color: "white", marginTop: 44 }}>
          Win<span style={{ color: "#2e8bff" }}>It</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

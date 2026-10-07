"use client";

import { useState } from "react";
import { useBet } from "@/components/BetProvider";
import { formatCents } from "@/lib/money";

const W = 1080;
const H = 1920;
const SECONDS = 4.5;
const SITE = "winit.one";

function pickMime(): string {
  const options = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Draws one frame of the clip at time t (seconds). */
function drawFrame(ctx: CanvasRenderingContext2D, t: number, clip: { game: string; netCents: number; summary: string }) {
  const win = clip.netCents > 0;
  const accent = win ? "#22dd7a" : clip.netCents < 0 ? "#ff5a6e" : "#cbd5e1";

  // Background: deep navy with a slow-drifting glow in the result colour.
  ctx.fillStyle = "#080a12";
  ctx.fillRect(0, 0, W, H);
  const gx = W / 2 + Math.sin(t * 0.9) * 120;
  const glow = ctx.createRadialGradient(gx, H * 0.45, 40, gx, H * 0.45, 900);
  glow.addColorStop(0, win ? "rgba(34,221,122,0.28)" : "rgba(124,58,255,0.30)");
  glow.addColorStop(1, "rgba(8,10,18,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Confetti-ish sparks on a win.
  if (win) {
    for (let i = 0; i < 60; i++) {
      const seed = Math.sin(i * 91.7) * 10_000;
      const x = ((seed % 1) + 1) % 1;
      const speed = 0.4 + (((seed * 7) % 1) + 1) % 1;
      const y = ((t * speed * 0.35 + (((seed * 13) % 1) + 1) % 1) % 1) * H;
      ctx.fillStyle = i % 3 === 0 ? "#ffd166" : i % 3 === 1 ? "#22dd7a" : "#8f5cff";
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x * W, y, 10, 18);
    }
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Wordmark.
  ctx.font = "900 92px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Win", W / 2 - 48, 240);
  ctx.fillStyle = "#8f5cff";
  ctx.fillText("It", W / 2 + 92, 240);

  // Game name pops in.
  const a1 = ease(t / 0.5);
  ctx.globalAlpha = a1;
  ctx.font = "800 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(clip.game.toUpperCase(), W / 2, 620 + (1 - a1) * 40);
  ctx.globalAlpha = 1;

  // The amount counts up, then punches.
  const count = ease((t - 0.4) / 1.6);
  const shown = Math.round(Math.abs(clip.netCents) * count);
  const punch = t > 2 && t < 2.35 ? 1 + Math.sin(((t - 2) / 0.35) * Math.PI) * 0.12 : 1;
  ctx.save();
  ctx.translate(W / 2, 900);
  ctx.scale(punch, punch);
  ctx.font = "900 170px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = accent;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 50;
  const sign = clip.netCents > 0 ? "+" : clip.netCents < 0 ? "−" : "";
  ctx.fillText(`${sign}${formatCents(shown)}`, 0, 0);
  ctx.restore();

  // Summary line.
  const a2 = ease((t - 1.8) / 0.5);
  ctx.globalAlpha = a2;
  ctx.font = "700 60px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(clip.summary, W / 2, 1090, W - 140);
  ctx.globalAlpha = 1;

  // Call to action.
  const a3 = ease((t - 2.6) / 0.5);
  ctx.globalAlpha = a3;
  ctx.fillStyle = "#7c3aff";
  const bw = 640;
  const bh = 130;
  const bx = (W - bw) / 2;
  const by = 1520;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 36);
  ctx.fill();
  ctx.font = "800 58px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`Play free at ${SITE}`, W / 2, by + bh / 2);
  ctx.globalAlpha = 1;
}

/**
 * Turns your last bet into a short vertical (9:16) video — ready for TikTok,
 * Reels or Shorts — and opens the share sheet, or downloads it on desktop.
 */
export default function ClipButton({ className = "" }: { className?: string }) {
  const { flash } = useBet();
  const [busy, setBusy] = useState(false);

  async function clip() {
    if (!flash || busy) return;
    const mime = pickMime();
    if (!mime) {
      alert("Your browser can't record clips. Try Chrome or Safari.");
      return;
    }
    setBusy(true);
    const data = { game: flash.game, netCents: flash.netCents, summary: flash.summary };
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    drawFrame(ctx, 0, data);

    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start();

    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        drawFrame(ctx, t, data);
        if (t < SECONDS) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await done;

    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const file = new File(chunks, `winit-${data.game.toLowerCase().replace(/\s+/g, "-")}.${ext}`, { type: mime.split(";")[0] });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${data.summary} on WinIt — ${SITE}` });
      } else throw new Error("no share");
    } catch {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={clip}
      disabled={!flash || busy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-40 ${className}`}
      title={flash ? "Make a short video of your last bet" : "Place a bet first"}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <path d="m16 10 5-3v10l-5-3" />
      </svg>
      {busy ? "Recording…" : "Clip it"}
    </button>
  );
}

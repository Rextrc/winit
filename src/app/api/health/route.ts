import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness probe for the host platform. Deliberately touches nothing — no
 * database, no session — so a healthy process still reports healthy while a
 * dependency is degraded, and the platform's own error page never masks the
 * real fault.
 */
export function GET() {
  return NextResponse.json({ ok: true, service: "winit", time: new Date().toISOString() });
}

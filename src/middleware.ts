import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/ip";
import { hit, limitFor } from "@/lib/rateLimit";

export const config = { matcher: "/api/:path*" };

export function middleware(req: NextRequest) {
  const limit = limitFor(req.method, req.nextUrl.pathname);
  const ip = clientIp(req);
  // No address to key on: skip rather than lump everyone into one bucket.
  if (!limit || !ip) return NextResponse.next();

  const { ok, retryAfterSec } = hit(ip, limit);
  if (ok) return NextResponse.next();

  return NextResponse.json(
    { error: "Too many requests — slow down a little and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

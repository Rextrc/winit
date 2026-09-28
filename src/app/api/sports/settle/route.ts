import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { settlePending } from "@/lib/sports/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs one settlement pass on demand. The server already runs these every
 * five minutes on its own (src/instrumentation.ts); this is for an external
 * scheduler or a manual nudge, and only answers callers holding CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return jsonError("Not authorized.", 401);
  }
  return NextResponse.json(await settlePending());
}

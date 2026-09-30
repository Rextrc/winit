import { NextResponse } from "next/server";
import { lookupCrest } from "@/lib/sports/crest";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name");
  if (!name) return NextResponse.json({ url: null });
  const url = await lookupCrest(name);
  return NextResponse.json({ url }, { headers: { "Cache-Control": "public, max-age=3600" } });
}

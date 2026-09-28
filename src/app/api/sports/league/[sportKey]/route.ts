import { NextResponse } from "next/server";
import { getLeague } from "@/lib/sports/feed";
import { feedErrorResponse } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { sportKey: string } }) {
  try {
    return NextResponse.json(await getLeague(params.sportKey));
  } catch (err) {
    return feedErrorResponse(err);
  }
}

import { NextResponse } from "next/server";
import { getLeague } from "@/lib/sports/feed";
import { feedErrorResponse } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { sportKey: string; eventId: string } }) {
  try {
    const { league, events, fetchedAt } = await getLeague(params.sportKey);
    const event = events.find((e) => e.id === params.eventId);
    if (!event) return NextResponse.json({ error: "That match is no longer on the board." }, { status: 404 });
    return NextResponse.json({ league, event, fetchedAt });
  } catch (err) {
    return feedErrorResponse(err);
  }
}

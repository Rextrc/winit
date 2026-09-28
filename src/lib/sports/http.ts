import { NextResponse } from "next/server";
import { FeedError, feedConfigured } from "@/lib/sports/provider";

/** A feed failure as a response the lobby knows how to show. */
export function feedErrorResponse(err: unknown) {
  if (!feedConfigured()) {
    return NextResponse.json(
      { error: "Sports betting isn't switched on yet — the odds feed has no API key.", setup: true },
      { status: 503 },
    );
  }
  const message = err instanceof FeedError ? err.message : "Couldn't load odds right now.";
  if (!(err instanceof FeedError)) console.error("[sports]", err);
  return NextResponse.json({ error: message }, { status: 503 });
}

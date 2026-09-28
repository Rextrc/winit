import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import MatchView from "@/components/sports/MatchView";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return pageMetadata("Match", "Every market on this match at real bookmaker prices. Play money only.");
}

export default function MatchPage({ params }: { params: { sportKey: string; eventId: string } }) {
  return <MatchView sportKey={decodeURIComponent(params.sportKey)} eventId={decodeURIComponent(params.eventId)} />;
}

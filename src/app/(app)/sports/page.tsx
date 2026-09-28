import { Suspense } from "react";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SportsLobby from "@/components/sports/SportsLobby";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return pageMetadata(
    "Sports",
    "Real matches at real bookmaker prices — 1x2, handicaps and totals, singles and multis, settled on the final score. Play money only.",
  );
}

export default function SportsPage() {
  return (
    <Suspense>
      <SportsLobby />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import SportsBetting from "@/components/sports/SportsBetting";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return pageMetadata("Sports", "Real matches, real bookmaker odds — moneyline, spread and totals, settled on the real final score.");
}

export default function SportsPage() {
  return <SportsBetting />;
}

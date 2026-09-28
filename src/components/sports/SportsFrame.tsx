"use client";

import { useSlip } from "@/components/sports/SlipProvider";
import BetSlip from "@/components/sports/BetSlip";

/** The board, with the bet slip docked as a right-hand column on wide screens. */
export default function SportsFrame({ children }: { children: React.ReactNode }) {
  const { open } = useSlip();
  return (
    <div className={`xl:grid xl:gap-5 ${open ? "xl:grid-cols-[minmax(0,1fr)_360px]" : ""}`}>
      <div className="min-w-0">{children}</div>
      <BetSlip />
    </div>
  );
}

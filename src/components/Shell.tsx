"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import BetSlipBar from "@/components/BetSlipBar";
import LevelUpToast from "@/components/LevelUpToast";
import WinCelebration from "@/components/WinCelebration";
import DeathOverlay from "@/components/DeathOverlay";
import EventModal from "@/components/EventModal";
import AwardToasts from "@/components/AwardToasts";
import GoalBar from "@/components/GoalBar";
import Onboarding from "@/components/onboarding/Onboarding";
import Chat from "@/components/Chat";
import MobileNav from "@/components/MobileNav";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const sportsbook = pathname?.startsWith("/sports") ?? false;

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setMenuOpen(true)} />
        <GoalBar />
        <main
          className={"flex-1 px-3 pt-4 sm:px-4 sm:pt-6 lg:px-6"}
          style={{ paddingBottom: `calc(${sportsbook ? "0px" : "var(--betslip-h, 0px)"} + var(--mobilenav-h, 0px) + 24px)` }}
        >
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
        {!sportsbook && <BetSlipBar />}
        <LevelUpToast />
        <WinCelebration />
        <DeathOverlay />
        <EventModal />
        <AwardToasts />
        <Onboarding />
        <Chat />
        <MobileNav onOpenMenu={() => setMenuOpen(true)} />
      </div>
    </div>
  );
}

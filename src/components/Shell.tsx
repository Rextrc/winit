"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import BetSlipBar from "@/components/BetSlipBar";
import LevelUpToast from "@/components/LevelUpToast";
import WinCelebration from "@/components/WinCelebration";

export default function Shell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex-1 px-4 py-6 lg:px-6">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
        <BetSlipBar />
        <LevelUpToast />
        <WinCelebration />
      </div>
    </div>
  );
}

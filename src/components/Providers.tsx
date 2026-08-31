"use client";

import { SessionProvider } from "next-auth/react";
import { WalletProvider } from "@/components/WalletProvider";
import { BetProvider } from "@/components/BetProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <WalletProvider>
        <BetProvider>{children}</BetProvider>
      </WalletProvider>
    </SessionProvider>
  );
}

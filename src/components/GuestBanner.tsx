"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { formatCents } from "@/lib/money";

/** Pinned under the header while playing as a guest. */
export default function GuestBanner() {
  const { progression, balanceCents } = useWallet();
  const pathname = usePathname();
  if (!progression?.isGuest || pathname === "/claim") return null;

  const left = progression.guestBetsLeft;
  return (
    <div className="flex items-center gap-3 border-b border-volt/20 bg-volt/10 px-4 py-2 lg:px-6">
      <p className="min-w-0 flex-1 text-[12px] leading-snug text-slate-200">
        <span className="font-black text-volt">Guest mode</span>
        <span className="text-slate-400">
          {" "}
          · {left} guest {left === 1 ? "bet" : "bets"} left. Create a free account to keep playing and get{" "}
          {formatCents(10_000_000)} credits.
        </span>
      </p>
      <Link href="/claim" className="btn-primary shrink-0 px-3 py-1.5 text-xs">
        Save account
      </Link>
    </div>
  );
}

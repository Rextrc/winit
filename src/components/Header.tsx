"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { IconMenu } from "@/components/Icons";
import { Wordmark } from "@/components/Wordmark";
import BalanceDisplay from "@/components/BalanceDisplay";
import ClaimBonusButton from "@/components/ClaimBonusButton";
import SearchBox from "@/components/SearchBox";
import AvatarMenu from "@/components/AvatarMenu";
import Inbox from "@/components/Inbox";
import LevelBar from "@/components/LevelBar";
import Link from "next/link";

export default function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { status } = useSession();
  const pathname = usePathname();
  const signedOut = status === "unauthenticated";
  const callbackUrl = pathname && pathname !== "/" ? `?callbackUrl=${encodeURIComponent(pathname)}` : "";

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-base-900/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden"
          aria-label="Open menu"
        >
          <IconMenu />
        </button>

        <Link href="/" className="lg:hidden" aria-label="WinIt home">
          <Wordmark compact />
        </Link>

        <div className="ml-1 hidden flex-1 md:block">
          <SearchBox />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {signedOut ? (
            <>
              <Link href={`/login${callbackUrl}`} className="btn-ghost px-4 py-2 text-sm">
                Log in
              </Link>
              <Link href={`/signup${callbackUrl}`} className="btn-primary px-4 py-2 text-sm">
                Sign up
              </Link>
            </>
          ) : (
            <>
              <LevelBar />
              <BalanceDisplay />
              <ClaimBonusButton />
              <Inbox />
              <AvatarMenu />
            </>
          )}
        </div>
      </div>

      <div className="border-t border-white/5 px-4 py-2 md:hidden">
        <SearchBox />
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import type { GameDef } from "@/lib/games/registry";
import BetFeed from "@/components/BetFeed";
import BalanceDisplay from "@/components/BalanceDisplay";
import { IconHistory, IconLock } from "@/components/Icons";

/**
 * Shared game page frame: canvas centred, control panel docked to the side on
 * desktop and below the canvas on mobile, balance always in view, bet history
 * underneath the panel.
 */
export default function GameFrame({
  game,
  engineKey,
  feedVersion,
  canvas,
  panel,
  rules,
}: {
  game: GameDef;
  engineKey: string;
  feedVersion: number;
  canvas: React.ReactNode;
  panel: React.ReactNode;
  /** No longer shown — kept so every game's call site doesn't need editing. */
  rules?: React.ReactNode;
}) {
  const { status } = useSession();
  const pathname = usePathname();
  const signedOut = status === "unauthenticated";
  const callbackUrl = pathname ? `?callbackUrl=${encodeURIComponent(pathname)}` : "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">{game.name}</h1>
        {/* Balance is repeated here so it is on screen even when the header
            scrolls — but there is none to show until you have an account. */}
        {!signedOut && <BalanceDisplay size="sm" />}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="order-1 min-w-0 xl:order-2">
          <div className="stage overflow-hidden">
            <div className="flex min-h-[300px] items-center justify-center p-3 sm:min-h-[460px] sm:p-8">
              <div className="w-full">{canvas}</div>
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.05] px-4 py-3">
              <Link
                href="/history"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-white"
                aria-label="Bet history"
              >
                <IconHistory className="h-4 w-4" />
              </Link>
              <span className="font-display text-lg font-black tracking-tight text-white/15">WinIt</span>
              <span className="text-[12px] font-bold text-slate-500">Exact odds ✓</span>
            </div>
          </div>
        </div>

        <div className="order-2 space-y-4 xl:order-1">
          <div className="panel relative p-4">
            {/* Browsing never needs an account; placing a bet does. Rather than
                let every game's own controls hit the API and 401, the whole
                betting panel is visibly inert underneath a sign-in prompt —
                one gate for every game instead of one per game. */}
            {signedOut && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-base-800/90 p-6 text-center backdrop-blur-sm">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-white/5 text-slate-400">
                  <IconLock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[14px] font-black text-white">Sign in to place a bet</p>
                  <p className="mt-1 max-w-[220px] text-[12px] leading-snug text-slate-400">
                    Everything else on this page is free to look at — no account needed to browse.
                  </p>
                </div>
                <div className="flex w-full max-w-[220px] flex-col gap-2">
                  <Link href={`/signup${callbackUrl}`} className="btn-primary w-full py-2 text-sm">
                    Sign up — it&apos;s free
                  </Link>
                  <Link href={`/login${callbackUrl}`} className="btn-ghost w-full py-2 text-sm">
                    Log in
                  </Link>
                </div>
              </div>
            )}
            <div className={signedOut ? "pointer-events-none select-none opacity-30" : ""}>{panel}</div>
          </div>
          <BetFeed game={engineKey} version={feedVersion} take={14} title="Bet history" />
        </div>
      </div>
    </>
  );
}

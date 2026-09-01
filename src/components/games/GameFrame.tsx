"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import type { GameDef } from "@/lib/games/registry";
import BetFeed from "@/components/BetFeed";
import BalanceDisplay from "@/components/BalanceDisplay";
import { IconInfo, IconLock } from "@/components/Icons";

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
  rules: React.ReactNode;
}) {
  const { status } = useSession();
  const pathname = usePathname();
  const signedOut = status === "unauthenticated";
  const callbackUrl = pathname ? `?callbackUrl=${encodeURIComponent(pathname)}` : "";

  return (
    <>
      <nav className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
        <Link href="/" className="hover:text-volt">
          Lobby
        </Link>
        <span>/</span>
        <Link href={`/category/${game.category}`} className="hover:text-volt">
          {game.tags[0]}
        </Link>
        <span>/</span>
        <span className="text-slate-300">{game.name}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black tracking-tight text-white">{game.name}</h1>
          <p className="mt-0.5 text-sm text-slate-400">{game.tagline}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="num rounded-lg border border-volt/25 bg-volt/10 px-2.5 py-1 text-xs font-bold text-volt">
            RTP {game.rtp === null ? "—" : `${(game.rtp * 100).toFixed(2)}%`}
          </span>
          {/* Balance is repeated here so it is on screen even when the header
              scrolls — but there is none to show until you have an account. */}
          {!signedOut && <BalanceDisplay size="sm" />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_356px]">
        <div className="order-1 min-w-0">
          <div className="panel flex min-h-[440px] items-center justify-center overflow-hidden p-4 sm:p-6">
            <div className="w-full">{canvas}</div>
          </div>

          <div className="panel mt-4 p-5">
            <h3 className="flex items-center gap-2 text-[13px] font-black tracking-tight text-white">
              <IconInfo className="h-4 w-4 text-volt" />
              House rules &amp; odds
            </h3>
            <div className="mt-3 space-y-3 text-[12px] leading-relaxed text-slate-400">{rules}</div>
          </div>
        </div>

        <div className="order-2 space-y-4">
          <div className="panel relative p-4 xl:sticky xl:top-20">
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

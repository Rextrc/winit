"use client";

import Link from "next/link";
import type { GameDef } from "@/lib/games/registry";
import BetFeed from "@/components/BetFeed";
import BalanceDisplay from "@/components/BalanceDisplay";
import { IconInfo } from "@/components/Icons";

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
          {/* Balance is repeated here so it is on screen even when the header scrolls. */}
          <BalanceDisplay size="sm" />
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
          <div className="panel p-4 xl:sticky xl:top-20">{panel}</div>
          <BetFeed game={engineKey} version={feedVersion} take={14} title="Bet history" />
        </div>
      </div>
    </>
  );
}

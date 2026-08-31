"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBet } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { IconPlay } from "@/components/Icons";
import BetControls from "@/components/BetControls";
import { PLAYABLE } from "@/lib/games/registry";

/**
 * The persistent, bet-slip-style control bar. It docks to the bottom of every
 * page so the stake and the primary action stay reachable while you browse.
 * On a game page the game takes it over; elsewhere it offers a quick jump into
 * the last-styled game with the stake already set.
 */
export default function BetSlipBar() {
  const { hook, effectiveBet, betError, flash } = useBet();
  const { balanceCents } = useWallet();
  const [open, setOpen] = useState(true);
  const [shownFlash, setShownFlash] = useState<typeof flash>(null);

  useEffect(() => {
    if (!flash) return;
    setShownFlash(flash);
    const t = setTimeout(() => setShownFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);

  const fallback = PLAYABLE[0];
  const canAfford = balanceCents !== null && effectiveBet > 0 && !betError;

  return (
    <div className="sticky bottom-0 z-30 border-t border-white/10 bg-base-800/95 backdrop-blur-md">
      {shownFlash && (
        <div
          className={`flex items-center justify-center gap-2 border-b px-4 py-1.5 text-[12px] font-semibold ${
            shownFlash.netCents > 0
              ? "border-win/20 bg-win/10 text-win"
              : shownFlash.netCents < 0
                ? "border-loss/20 bg-loss/10 text-loss"
                : "border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          <span className="uppercase tracking-wide">{shownFlash.game}</span>
          <span className="text-slate-400">·</span>
          <span className="truncate">{shownFlash.summary}</span>
          <span className="num font-black">{formatSignedCents(shownFlash.netCents)}</span>
        </div>
      )}

      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-4 py-2.5 lg:flex-row lg:items-center lg:gap-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg border border-white/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 hover:text-slate-100 lg:hidden"
            aria-expanded={open}
          >
            Bet slip
          </button>

          <div className="hidden min-w-[168px] flex-col leading-tight lg:flex">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Bet slip
            </span>
            <span className="truncate text-sm font-bold text-slate-100">
              {hook ? hook.name : "Browsing"}
            </span>
          </div>

          <div className="ml-auto flex flex-col items-end leading-tight lg:hidden">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Stake</span>
            <span className="num text-sm font-bold text-white">{formatCents(effectiveBet)}</span>
          </div>
        </div>

        <div className={`${open ? "flex" : "hidden"} flex-1 flex-col gap-2 lg:flex lg:flex-row lg:items-center`}>
          <div className="flex-1 lg:max-w-md">
            <BetControls compact disabled={hook?.busy ?? false} />
          </div>

          {hook ? (
            <button
              type="button"
              onClick={hook.run}
              disabled={!hook.ready || hook.busy || !canAfford}
              className="btn-primary h-[42px] min-w-[150px] shadow-volt"
            >
              <IconPlay className="h-4 w-4" />
              {hook.busy ? "Working…" : hook.actionLabel}
            </button>
          ) : (
            <Link href={`/game/${fallback.slug}`} className="btn-primary h-[42px] min-w-[150px] justify-center">
              <IconPlay className="h-4 w-4" />
              Play {fallback.name}
            </Link>
          )}
        </div>
      </div>

      {hook?.note && (
        <p className="px-4 pb-2 text-center text-[11px] text-slate-500 lg:px-6 lg:text-left">{hook.note}</p>
      )}
    </div>
  );
}

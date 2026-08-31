"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBet } from "@/components/BetProvider";
import { useWallet } from "@/components/WalletProvider";
import { formatCents, formatSignedCents } from "@/lib/money";
import { IconPlay } from "@/components/Icons";
import BetControls from "@/components/BetControls";
import { PLAYABLE } from "@/lib/games/registry";

const AUTOPLAY_COUNTS = [10, 25, 50, 100] as const;
/** Pause between autoplay spins so the previous result is readable. */
const AUTOPLAY_GAP_MS = 450;

/**
 * The persistent, bet-slip-style control bar. It docks to the bottom of every
 * page so the stake and the primary action stay reachable while you browse.
 * On a game page the game takes it over; elsewhere it offers a quick jump into
 * the last-styled game with the stake already set.
 *
 * Also owns two cross-game conveniences that plug into whatever hook is
 * currently registered: a spacebar shortcut for the primary action, and an
 * Autoplay loop for games that opt in (see `BetSlipHook.autoplay`).
 */
export default function BetSlipBar() {
  const { hook, effectiveBet, betError, flash } = useBet();
  const { balanceCents } = useWallet();
  const [open, setOpen] = useState(true);
  const [shownFlash, setShownFlash] = useState<typeof flash>(null);
  const [autoplayLeft, setAutoplayLeft] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!flash) return;
    setShownFlash(flash);
    const t = setTimeout(() => setShownFlash(null), 3200);
    return () => clearTimeout(t);
  }, [flash]);

  const fallback = PLAYABLE[0];
  const canAfford = balanceCents !== null && effectiveBet > 0 && !betError;
  const autoplaySupported = hook?.autoplay !== false;
  const autoplayRunning = autoplayLeft !== null;

  const stopAutoplay = useCallback(() => setAutoplayLeft(null), []);

  // Stop the moment the hook disappears (navigated away, or opted out).
  useEffect(() => {
    if (!hook || hook.autoplay === false) stopAutoplay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hook?.slug, hook?.autoplay]);

  // The autoplay loop itself: whenever a spin finishes (hook.busy -> false)
  // and spins remain, wait a beat so the result is readable, then fire the
  // next one. Stops on its own if the stake stops being affordable or the
  // hook stops being ready — never overrides what the server allows.
  useEffect(() => {
    if (autoplayLeft === null) return;
    if (!hook || hook.busy) return;
    if (autoplayLeft <= 0 || !hook.ready || !canAfford) {
      setAutoplayLeft(null);
      return;
    }
    const t = setTimeout(() => {
      hook.run();
      setAutoplayLeft((n) => (n === null ? null : n - 1));
    }, AUTOPLAY_GAP_MS);
    return () => clearTimeout(t);
  }, [autoplayLeft, hook, canAfford]);

  const startAutoplay = useCallback(
    (count: number) => {
      setPickerOpen(false);
      setAutoplayLeft(count);
    },
    [],
  );

  // Close the autoplay count picker on an outside click.
  useEffect(() => {
    if (!pickerOpen) return;
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  // Spacebar fires the primary action, same as clicking it — skipped while
  // typing anywhere (the bet amount field included) so it never steals a
  // literal space from an input.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!hook || hook.busy || !hook.ready || !canAfford) return;
      e.preventDefault();
      hook.run();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hook, canAfford]);

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

      {autoplayRunning && (
        <div className="flex items-center justify-center gap-3 border-b border-volt/20 bg-volt/10 px-4 py-1.5 text-[12px] font-bold text-volt">
          <span className="uppercase tracking-wide">Autoplay</span>
          <span className="num">{autoplayLeft} left</span>
          <button type="button" onClick={stopAutoplay} className="rounded-full bg-volt/20 px-2.5 py-0.5 hover:bg-volt/30">
            Stop
          </button>
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
            <BetControls compact disabled={(hook?.busy ?? false) || autoplayRunning} />
          </div>

          {hook ? (
            <div className="flex items-stretch gap-1.5">
              <button
                type="button"
                onClick={hook.run}
                disabled={!hook.ready || hook.busy || !canAfford || autoplayRunning}
                className="btn-primary h-[42px] min-w-[130px] shadow-volt"
                title="Spacebar also works"
              >
                <IconPlay className="h-4 w-4" />
                {hook.busy ? "Working…" : hook.actionLabel}
              </button>

              {autoplaySupported && (
                <div ref={pickerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => (autoplayRunning ? stopAutoplay() : setPickerOpen((v) => !v))}
                    disabled={!autoplayRunning && (!hook.ready || !canAfford)}
                    className={`h-[42px] rounded-xl border px-3 text-[12px] font-bold transition disabled:opacity-40 ${
                      autoplayRunning
                        ? "border-loss/50 bg-loss/10 text-loss"
                        : "border-white/10 text-slate-300 hover:border-volt/50 hover:text-volt"
                    }`}
                  >
                    {autoplayRunning ? "Stop" : "Auto"}
                  </button>

                  {pickerOpen && !autoplayRunning && (
                    <div className="absolute bottom-[calc(100%+6px)] right-0 z-40 flex flex-col gap-1 rounded-xl border border-white/10 bg-base-800 p-1.5 shadow-tile">
                      {AUTOPLAY_COUNTS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => startAutoplay(n)}
                          className="whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-[12px] font-bold text-slate-200 hover:bg-white/10"
                        >
                          {n} spins
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <Link href={`/game/${fallback.slug}`} className="btn-primary h-[42px] min-w-[150px] justify-center">
              <IconPlay className="h-4 w-4" />
              Play {fallback.name}
            </Link>
          )}
        </div>
      </div>

      {hook?.note && !autoplayRunning && (
        <p className="px-4 pb-2 text-center text-[11px] text-slate-500 lg:px-6 lg:text-left">{hook.note}</p>
      )}
    </div>
  );
}

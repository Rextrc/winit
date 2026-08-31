"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_MAX_BET_CENTS, MIN_BET_CENTS, clampBet } from "@/lib/money";
import { useWallet } from "@/components/WalletProvider";

/**
 * The bet slip. The stake lives above the page tree so it survives navigation
 * — that's what lets the docked control bar stay usable while you browse.
 */

export type BetSlipHook = {
  slug: string;
  name: string;
  /** Label for the primary button, e.g. "Spin" / "Deal". */
  actionLabel: string;
  /** False while a spin is resolving or the stake is unusable. */
  ready: boolean;
  busy: boolean;
  run: () => void;
  /** Optional extra line shown in the bar, e.g. "Hand in play". */
  note?: string;
};

export type BetResultFlash = {
  id: number;
  game: string;
  netCents: number;
  summary: string;
} | null;

type BetContext = {
  betCents: number;
  /** The player's personal table limit, in cents. */
  maxBetCents: number;
  setBetCents: (cents: number) => void;
  halve: () => void;
  double: () => void;
  max: () => void;
  /** Bet clamped to balance + table limits; what the server will accept. */
  effectiveBet: number;
  betError: string | null;
  hook: BetSlipHook | null;
  setHook: (hook: BetSlipHook | null) => void;
  flash: BetResultFlash;
  pushFlash: (game: string, netCents: number, summary: string) => void;
};

const Ctx = createContext<BetContext | null>(null);
const STORAGE_KEY = "winit.bet";
const DEFAULT_BET = 1_000; // 10.00

export function BetProvider({ children }: { children: React.ReactNode }) {
  const { balanceCents, progression } = useWallet();
  const [betCents, setBetRaw] = useState(DEFAULT_BET);
  const [hook, setHook] = useState<BetSlipHook | null>(null);
  const [flash, setFlash] = useState<BetResultFlash>(null);
  const [flashId, setFlashId] = useState(0);

  // The player's personal table limit. Falls back to the base limit until the
  // session loads; the server revalidates every bet against the real one.
  const maxBet = progression?.maxBetCents ?? DEFAULT_MAX_BET_CENTS;

  // Remember the stake between visits — a convenience only, the server still
  // revalidates every bet against the live balance.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const n = Number(saved);
        if (Number.isInteger(n) && n >= MIN_BET_CENTS) setBetRaw(n);
      }
    } catch {
      /* storage blocked — the default stake is fine */
    }
  }, []);

  const setBetCents = useCallback((cents: number) => {
    const next = Math.max(Math.round(cents), 0);
    setBetRaw(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  }, []);

  const ceiling = Math.min(maxBet, balanceCents ?? maxBet);

  const halve = useCallback(
    () => setBetCents(Math.max(MIN_BET_CENTS, Math.floor(betCents / 2))),
    [betCents, setBetCents],
  );
  const double = useCallback(
    () => setBetCents(Math.min(ceiling, betCents * 2)),
    [betCents, ceiling, setBetCents],
  );
  const max = useCallback(() => setBetCents(ceiling), [ceiling, setBetCents]);

  const effectiveBet = clampBet(betCents, balanceCents ?? 0, maxBet);

  let betError: string | null = null;
  if (betCents < MIN_BET_CENTS) betError = "Below the minimum stake.";
  else if (betCents > maxBet) betError = "Above your table limit.";
  else if (balanceCents !== null && betCents > balanceCents) betError = "More than your balance.";

  const pushFlash = useCallback(
    (game: string, netCents: number, summary: string) => {
      setFlashId((id) => {
        const next = id + 1;
        setFlash({ id: next, game, netCents, summary });
        return next;
      });
    },
    [],
  );

  const value = useMemo<BetContext>(
    () => ({
      betCents,
      maxBetCents: maxBet,
      setBetCents,
      halve,
      double,
      max,
      effectiveBet,
      betError,
      hook,
      setHook,
      flash,
      pushFlash,
    }),
    [betCents, maxBet, setBetCents, halve, double, max, effectiveBet, betError, hook, flash, pushFlash],
  );

  // `flashId` is only used to mint monotonic ids.
  void flashId;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBet(): BetContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBet must be used inside <BetProvider>");
  return ctx;
}

/** Games call this to take over the persistent control bar while mounted. */
export function useBetSlipHook(hook: BetSlipHook | null) {
  const { setHook } = useBet();
  const { slug, name, actionLabel, ready, busy, note } = hook ?? {};
  const run = hook?.run;

  useEffect(() => {
    if (!slug || !name || !actionLabel || !run) {
      setHook(null);
      return;
    }
    setHook({ slug, name, actionLabel, ready: !!ready, busy: !!busy, run, note });
    return () => setHook(null);
  }, [slug, name, actionLabel, ready, busy, note, run, setHook]);
}

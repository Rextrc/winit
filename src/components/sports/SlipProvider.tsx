"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { legId, type SlipLeg } from "@/lib/sports/types";

export type SlipMode = "single" | "multi";

type Slip = {
  legs: SlipLeg[];
  mode: SlipMode;
  /** Per-leg stake text for singles, keyed by legId. */
  stakes: Record<string, string>;
  multiStake: string;
  open: boolean;
  /** Legs whose price just moved, with the direction, for the flash. */
  moved: Record<string, "up" | "down">;
  has: (id: string) => boolean;
  toggle: (leg: SlipLeg) => void;
  remove: (id: string) => void;
  clear: () => void;
  setMode: (m: SlipMode) => void;
  setStake: (id: string, v: string) => void;
  setMultiStake: (v: string) => void;
  setOpen: (open: boolean) => void;
  applyPrices: (changes: { index: number; price: number }[]) => void;
};

const SlipContext = createContext<Slip | null>(null);
const STORAGE_KEY = "winit.sportsSlip";
const DEFAULT_STAKE = "10.00";
const MAX_LEGS = 12;

/** Wide enough for the slip to sit beside the board instead of over it. */
function docksBeside(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches;
}

export default function SlipProvider({ children }: { children: React.ReactNode }) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [mode, setMode] = useState<SlipMode>("single");
  const [stakes, setStakes] = useState<Record<string, string>>({});
  const [multiStake, setMultiStake] = useState(DEFAULT_STAKE);
  const [open, setOpen] = useState(false);
  const [moved, setMoved] = useState<Record<string, "up" | "down">>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { legs?: SlipLeg[]; mode?: SlipMode; stakes?: Record<string, string>; multiStake?: string };
        const now = Date.now();
        // Drop anything that has kicked off since the slip was saved.
        const kept = (saved.legs ?? []).filter((l) => new Date(l.commenceTime).getTime() > now);
        setLegs(kept);
        if (kept.length > 0 && docksBeside()) setOpen(true);
        if (saved.mode) setMode(saved.mode);
        if (saved.stakes) setStakes(saved.stakes);
        if (saved.multiStake) setMultiStake(saved.multiStake);
      }
    } catch {
      /* a broken or blocked store just means an empty slip */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ legs, mode, stakes, multiStake }));
    } catch {
      /* ignore */
    }
  }, [loaded, legs, mode, stakes, multiStake]);

  const has = useCallback((id: string) => legs.some((l) => legId(l) === id), [legs]);

  const toggle = useCallback((leg: SlipLeg) => {
    const id = legId(leg);
    setLegs((prev) => {
      if (prev.some((l) => legId(l) === id)) {
        const next = prev.filter((l) => legId(l) !== id);
        if (next.length === 0) setOpen(false);
        return next;
      }
      if (prev.length >= MAX_LEGS) return prev;
      return [...prev, leg];
    });
    setStakes((s) => (s[id] ? s : { ...s, [id]: DEFAULT_STAKE }));
    // On a phone the slip would cover the board — the pill's count is enough.
    if (docksBeside()) setOpen(true);
  }, []);

  const remove = useCallback((id: string) => {
    setLegs((prev) => {
      const next = prev.filter((l) => legId(l) !== id);
      if (next.length === 0) setOpen(false);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setLegs([]);
    setStakes({});
    setMoved({});
  }, []);

  const setStake = useCallback((id: string, v: string) => setStakes((s) => ({ ...s, [id]: v })), []);

  const applyPrices = useCallback((changes: { index: number; price: number }[]) => {
    setLegs((prev) => {
      const next = [...prev];
      const flash: Record<string, "up" | "down"> = {};
      for (const c of changes) {
        const leg = next[c.index];
        if (!leg) continue;
        flash[legId(leg)] = c.price > leg.price ? "up" : "down";
        next[c.index] = { ...leg, price: c.price };
      }
      setMoved(flash);
      return next;
    });
  }, []);

  // A single selection can't be a multi.
  useEffect(() => {
    if (legs.length < 2 && mode === "multi") setMode("single");
  }, [legs.length, mode]);

  const value = useMemo<Slip>(
    () => ({
      legs,
      mode,
      stakes,
      multiStake,
      open,
      moved,
      has,
      toggle,
      remove,
      clear,
      setMode,
      setStake,
      setMultiStake,
      setOpen,
      applyPrices,
    }),
    [legs, mode, stakes, multiStake, open, moved, has, toggle, remove, clear, setStake, applyPrices],
  );

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip(): Slip {
  const ctx = useContext(SlipContext);
  if (!ctx) throw new Error("useSlip must be used inside <SlipProvider>");
  return ctx;
}

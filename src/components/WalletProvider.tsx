"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { BonusStatus } from "@/lib/bonus";

type LastDelta = { id: number; netCents: number } | null;

type Wallet = {
  balanceCents: number | null;
  bonus: BonusStatus | null;
  loading: boolean;
  lastDelta: LastDelta;
  /** Applies a balance returned by a game endpoint, with an optional flash. */
  applyResult: (balanceCents: number, netCents?: number) => void;
  refresh: () => Promise<void>;
  claimBonus: () => Promise<{ ok: boolean; error?: string; amountCents?: number }>;
  claiming: boolean;
};

const WalletContext = createContext<Wallet | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [bonus, setBonus] = useState<BonusStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [lastDelta, setLastDelta] = useState<LastDelta>(null);
  const deltaId = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) {
        setBalanceCents(null);
        setBonus(null);
        return;
      }
      const data = await res.json();
      setBalanceCents(data.balanceCents);
      setBonus(data.bonus);
    } catch {
      /* offline — keep the last known balance rather than blanking the header */
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch whenever the session appears: signing in is a client-side
  // transition, so the provider never remounts and would otherwise keep the
  // 401 it got while the visitor was still on the login page.
  useEffect(() => {
    if (status === "loading") return;
    if (status === "unauthenticated") {
      setBalanceCents(null);
      setBonus(null);
      setLoading(false);
      return;
    }
    void refresh();
  }, [status, refresh]);

  // Keep the bonus countdown ticking without hammering the server.
  useEffect(() => {
    if (!bonus || bonus.claimable) return;
    const timer = setInterval(() => {
      setBonus((b) => {
        if (!b) return b;
        const msRemaining = Math.max(0, b.msRemaining - 1000);
        return { ...b, msRemaining, claimable: msRemaining === 0 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [bonus]);

  const applyResult = useCallback((next: number, netCents?: number) => {
    setBalanceCents(next);
    if (typeof netCents === "number") {
      deltaId.current += 1;
      setLastDelta({ id: deltaId.current, netCents });
    }
  }, []);

  const claimBonus = useCallback(async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/bonus", { method: "POST" });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error ?? "Couldn't claim right now." };
      setBalanceCents(data.balanceCents);
      setBonus(data.bonus);
      deltaId.current += 1;
      setLastDelta({ id: deltaId.current, netCents: data.amountCents });
      return { ok: true, amountCents: data.amountCents as number };
    } catch {
      return { ok: false, error: "Network error." };
    } finally {
      setClaiming(false);
    }
  }, []);

  const value = useMemo<Wallet>(
    () => ({ balanceCents, bonus, loading, lastDelta, applyResult, refresh, claimBonus, claiming }),
    [balanceCents, bonus, loading, lastDelta, applyResult, refresh, claimBonus, claiming],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): Wallet {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

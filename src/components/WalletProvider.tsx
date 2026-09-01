"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { BonusStatus } from "@/lib/bonus";
import type { Progression } from "@/lib/progression";
import type { CareerState } from "@/lib/life/career";
import type { PendingEventView, ProgressionExtras } from "@/lib/life/advance";
import type { ProgressUpdate } from "@/lib/ledger";

type LastDelta = { id: number; netCents: number } | null;

export type LevelUpToast = { id: number; update: ProgressUpdate } | null;

/** Raised the moment a settled bet ends the career. */
export type DeathToast = { id: number; cause: "RUIN" | "OLD_AGE"; ageAtEnd: number; epitaph: string } | null;

/** Anything worth celebrating that is not a level-up or a big win. */
export type Award =
  | { id: number; kind: "achievement"; name: string; description: string; tier: string }
  | { id: number; kind: "vip"; name: string; colour: string }
  | { id: number; kind: "reputation"; name: string; blurb: string }
  | { id: number; kind: "challenge"; name: string; period: string };

type Wallet = {
  balanceCents: number | null;
  bonus: BonusStatus | null;
  progression: Progression | null;
  career: CareerState | null;
  loading: boolean;
  lastDelta: LastDelta;
  /** Applies a balance returned by a game endpoint, with an optional flash. */
  applyResult: (balanceCents: number, netCents?: number) => void;
  /** Applies the progression returned by a settled bet, raising a toast on a level-up. */
  applyProgress: (update: ProgressUpdate) => void;
  levelUp: LevelUpToast;
  dismissLevelUp: () => void;
  death: DeathToast;
  dismissDeath: () => void;
  /** A choice event waiting on the player, if any. */
  pendingEvent: PendingEventView | null;
  clearPendingEvent: () => void;
  /** Queue of achievement / VIP / reputation / challenge celebrations. */
  awards: Award[];
  dismissAward: (id: number) => void;
  refresh: () => Promise<void>;
  claimBonus: () => Promise<{ ok: boolean; error?: string; amountCents?: number }>;
  claiming: boolean;
};

const WalletContext = createContext<Wallet | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [bonus, setBonus] = useState<BonusStatus | null>(null);
  const [progression, setProgression] = useState<Progression | null>(null);
  const [career, setCareer] = useState<CareerState | null>(null);
  const [levelUp, setLevelUp] = useState<LevelUpToast>(null);
  const levelUpId = useRef(0);
  const [death, setDeath] = useState<DeathToast>(null);
  const deathId = useRef(0);
  const [pendingEvent, setPendingEvent] = useState<PendingEventView | null>(null);
  const [awards, setAwards] = useState<Award[]>([]);
  const awardId = useRef(0);
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
        setProgression(null);
        setCareer(null);
        return;
      }
      const data = await res.json();
      setBalanceCents(data.balanceCents);
      setBonus(data.bonus);
      setProgression(data.progression ?? null);
      setCareer(data.career ?? null);
      // An event left PENDING by a previous session is still owed a decision.
      try {
        const ev = await fetch("/api/life/event", { cache: "no-store" });
        if (ev.ok) {
          const evData = await ev.json();
          if (evData.event) setPendingEvent(evData.event as PendingEventView);
        }
      } catch {
        /* the next settled bet will surface it again */
      }
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
      setProgression(null);
      setCareer(null);
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

  const applyProgress = useCallback((update: ProgressUpdate) => {
    setProgression(update.progression);
    setCareer(update.career);
    if (update.levelUps.length > 0) {
      levelUpId.current += 1;
      setLevelUp({ id: levelUpId.current, update });
    }
    // Everything the progression pass turned up, queued as celebrations.
    const extras = update.extras as ProgressionExtras | undefined;
    if (extras) {
      const queued: Award[] = [];
      for (const a of extras.achievements) {
        awardId.current += 1;
        queued.push({
          id: awardId.current,
          kind: "achievement",
          name: a.name,
          description: a.description,
          tier: a.tier,
        });
      }
      if (extras.vipPromotion) {
        awardId.current += 1;
        queued.push({
          id: awardId.current,
          kind: "vip",
          name: extras.vipPromotion.name,
          colour: extras.vipPromotion.colour,
        });
      }
      if (extras.repTierUp) {
        awardId.current += 1;
        queued.push({
          id: awardId.current,
          kind: "reputation",
          name: extras.repTierUp.name,
          blurb: extras.repTierUp.blurb,
        });
      }
      for (const c of extras.challengesCompleted) {
        awardId.current += 1;
        queued.push({ id: awardId.current, kind: "challenge", name: c.name, period: c.period });
      }
      if (queued.length > 0) setAwards((a) => [...a, ...queued]);

      // An instant event has already moved the balance server-side.
      if (extras.resolvedEvent) {
        awardId.current += 1;
        setAwards((a) => [
          ...a,
          {
            id: awardId.current,
            kind: "achievement",
            name: extras.resolvedEvent!.title,
            description: extras.resolvedEvent!.outcomeText,
            tier: "secret",
          },
        ]);
      }
      if (extras.pendingEvent) setPendingEvent(extras.pendingEvent);
    }

    // A comeback quietly changed the balance behind the game's own result, so
    // take the career layer's figure as the authoritative one.
    for (const ev of update.careerEvents) {
      if (ev.kind === "COMEBACK") setBalanceCents(ev.balanceCents);
      if (ev.kind === "DEATH") {
        deathId.current += 1;
        setDeath({ id: deathId.current, cause: ev.cause, ageAtEnd: ev.ageAtEnd, epitaph: ev.epitaph });
      }
    }
  }, []);

  const dismissLevelUp = useCallback(() => setLevelUp(null), []);
  const dismissDeath = useCallback(() => setDeath(null), []);
  const clearPendingEvent = useCallback(() => setPendingEvent(null), []);
  const dismissAward = useCallback((id: number) => setAwards((a) => a.filter((x) => x.id !== id)), []);

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
    () => ({
      balanceCents,
      bonus,
      progression,
      career,
      loading,
      lastDelta,
      applyResult,
      applyProgress,
      levelUp,
      dismissLevelUp,
      death,
      dismissDeath,
      pendingEvent,
      clearPendingEvent,
      awards,
      dismissAward,
      refresh,
      claimBonus,
      claiming,
    }),
    [
      balanceCents,
      bonus,
      progression,
      career,
      loading,
      lastDelta,
      applyResult,
      applyProgress,
      levelUp,
      dismissLevelUp,
      death,
      dismissDeath,
      pendingEvent,
      clearPendingEvent,
      awards,
      dismissAward,
      refresh,
      claimBonus,
      claiming,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): Wallet {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

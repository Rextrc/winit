"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { formatCents } from "@/lib/money";
import { UNLOCK_LABELS } from "@/lib/progression";

/**
 * Fires when a settled bet pushed the player up one or more levels. Shows the
 * highest level reached, what it paid and anything it unlocked.
 */
export default function LevelUpToast() {
  const { levelUp, dismissLevelUp } = useWallet();

  useEffect(() => {
    if (!levelUp) return;
    const timer = setTimeout(dismissLevelUp, 7000);
    return () => clearTimeout(timer);
  }, [levelUp, dismissLevelUp]);

  if (!levelUp) return null;

  const ups = levelUp.update.levelUps;
  const top = ups[ups.length - 1];
  const unlocks = ups.flatMap((u) => u.unlocked);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4">
      <div className="animate-pop-in pointer-events-auto w-full max-w-sm rounded-2xl border border-volt/50 bg-base-900/95 p-4 shadow-volt backdrop-blur">
        <div className="flex items-start gap-3">
          <span className="num grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-volt text-base-900 text-lg font-black">
            {top.level}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-volt">
              {ups.length > 1 ? `${ups.length} levels up` : "Level up"}
            </p>
            <p className="text-[15px] font-black tracking-tight text-white">{top.stage.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
              Paid{" "}
              <span className="num font-bold text-win">
                {formatCents(levelUp.update.rewardCents)}
              </span>{" "}
              · table limit now{" "}
              <span className="num font-bold text-slate-200">{formatCents(top.maxBetCents)}</span>
            </p>

            {unlocks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {unlocks.map((u) => (
                  <li key={u} className="text-[11px] font-bold text-fuchsia-300">
                    Unlocked — {UNLOCK_LABELS[u]}
                  </li>
                ))}
              </ul>
            )}

            <Link
              href="/life"
              onClick={dismissLevelUp}
              className="mt-2 inline-block text-[11px] font-bold text-volt hover:underline"
            >
              View career →
            </Link>
          </div>

          <button
            type="button"
            onClick={dismissLevelUp}
            className="shrink-0 text-slate-500 transition hover:text-white"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

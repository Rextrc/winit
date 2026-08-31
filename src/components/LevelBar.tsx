"use client";

import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";

/**
 * The career chip in the header: level, life stage and progress to the next
 * level. Doubles as the link into /life.
 */
export default function LevelBar({ compact = false }: { compact?: boolean }) {
  const { progression } = useWallet();
  if (!progression) return null;

  const { level, stage, progress, xp, xpToNext, rebirths } = progression;
  const maxed = xpToNext === 0;

  return (
    <Link
      href="/life"
      className="group hidden items-center gap-2.5 rounded-xl border border-white/10 px-2.5 py-1.5 transition hover:border-volt/50 sm:flex"
      title={maxed ? "Max level — rebirth available" : `${xp.toLocaleString()} / ${xpToNext.toLocaleString()} XP`}
    >
      <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-volt/15 text-[12px] font-black text-volt">
        {level}
      </span>

      {!compact && (
        <span className="hidden min-w-0 sm:block">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-[11px] font-bold text-slate-200">{stage.title}</span>
            {rebirths > 0 && (
              <span className="num shrink-0 rounded bg-fuchsia-400/15 px-1 text-[9px] font-black text-fuchsia-300">
                R{rebirths}
              </span>
            )}
          </span>
          <span className="mt-1 block h-1 w-24 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full bg-volt transition-[width] duration-500"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </span>
        </span>
      )}
    </Link>
  );
}

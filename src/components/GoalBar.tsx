"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";

/**
 * The always-visible next goal.
 *
 * The career page already lists every open goal; this is the same data — from
 * the same nextGoals() call, delivered on the same /api/me response the header
 * balance uses — reduced to the single nearest one and kept on screen
 * everywhere. A player should never have to go looking for what they are
 * working toward.
 *
 * It hides itself on /life, where the full list is already on the page.
 */
export default function GoalBar() {
  const { goal, loading } = useWallet();
  const pathname = usePathname();

  if (loading || !goal || pathname === "/life") return null;

  const pct = Math.round(Math.max(0, Math.min(1, goal.progress)) * 100);

  return (
    <Link
      href={goal.href}
      className="group flex items-center gap-3 border-b border-white/5 bg-base-900/60 px-4 py-2 transition hover:bg-base-900 lg:px-6"
    >
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
        Next goal
      </span>

      <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">
        <span className="font-bold text-white">{goal.title}</span>
        <span className="text-slate-500"> — {goal.detail}</span>
      </span>

      <span className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-white/10 sm:block">
        <span
          className="block h-full rounded-full bg-volt transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="num hidden shrink-0 text-[11px] font-black text-volt sm:block">{pct}%</span>
    </Link>
  );
}

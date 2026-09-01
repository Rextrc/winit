"use client";

import Link from "next/link";
import { formatCents } from "@/lib/money";

export type RepFeed = {
  points: number;
  tier: { from: number; name: string; blurb: string };
  next: { from: number; name: string; blurb: string } | null;
  progress: number;
};

export type VipFeed = {
  lifetimeWageredCents: number;
  tier: { level: number; name: string; colour: string; blurb: string; limitMultiplier: number; bonusMultiplier: number };
  next: { level: number; name: string; from: number } | null;
  progress: number;
};

/**
 * The three tracks that run alongside the level ladder, and what each one
 * actually gets you. Reputation is per-life and can fall; VIP is banked
 * against lifetime volume and no reset ever clears it.
 */
export default function TrackBars({
  reputation,
  vip,
  achievements,
}: {
  reputation: RepFeed;
  vip: VipFeed;
  achievements: { unlocked: number; total: number };
}) {
  const repPct = Math.round(Math.max(0, Math.min(1, reputation.progress)) * 100);
  const vipPct = Math.round(Math.max(0, Math.min(1, vip.progress)) * 100);
  const achPct = Math.round((achievements.unlocked / Math.max(1, achievements.total)) * 100);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Reputation */}
      <div className="panel p-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-volt">Reputation</p>
          <span className="num text-[11px] text-slate-500">{reputation.points.toLocaleString()}</span>
        </div>
        <p className="font-display mt-1 text-xl font-black tracking-tight text-white">
          {reputation.tier.name}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{reputation.tier.blurb}</p>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-volt transition-[width] duration-700" style={{ width: `${repPct}%` }} />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-600">
          {reputation.next
            ? `${(reputation.next.from - reputation.points).toLocaleString()} to ${reputation.next.name}`
            : "Top of the ladder"}
        </p>
        <p className="mt-2 text-[10px] leading-snug text-slate-600">
          Earned on how much of your limit you push, not raw money — and events can take it back.
        </p>
      </div>

      {/* VIP */}
      <div className="panel p-5">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className="text-[10px] font-black uppercase tracking-[0.18em]"
            style={{ color: vip.tier.colour }}
          >
            VIP
          </p>
          <span className="num text-[11px] text-slate-500">
            {formatCents(vip.lifetimeWageredCents)} staked
          </span>
        </div>
        <p className="font-display mt-1 text-xl font-black tracking-tight text-white">
          {vip.tier.name}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{vip.tier.blurb}</p>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${vipPct}%`, background: vip.tier.colour }}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-600">
          {vip.next ? `${formatCents(vip.next.from - vip.lifetimeWageredCents)} more to ${vip.next.name}` : "No tier above this one"}
        </p>
        <p className="mt-2 text-[10px] leading-snug text-slate-600">
          ×{vip.tier.limitMultiplier} table limit, ×{vip.tier.bonusMultiplier} daily bonus. Never the odds.
        </p>
      </div>

      {/* Achievements */}
      <Link href="/achievements" className="panel p-5 transition-all duration-200 hover:-translate-y-px">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f0c75e]">
            Achievements
          </p>
          <span className="num text-[11px] text-slate-500">
            {achievements.unlocked}/{achievements.total}
          </span>
        </div>
        <p className="font-display mt-1 text-xl font-black tracking-tight text-white">{achPct}%</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">
          Re-checked against your real statistics after every bet.
        </p>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#f0c75e] transition-[width] duration-700"
            style={{ width: `${achPct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-600">Open the full list →</p>
      </Link>
    </div>
  );
}

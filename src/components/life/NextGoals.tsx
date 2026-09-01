"use client";

import Link from "next/link";

export type GoalRow = {
  kind: string;
  title: string;
  detail: string;
  progress: number;
  href: string;
};

const KIND_COLOURS: Record<string, string> = {
  level: "#2e8bff",
  reputation: "#2ee6b8",
  vip: "#f0c75e",
  venue: "#c98bff",
  achievement: "#ff8ad4",
};

const KIND_LABELS: Record<string, string> = {
  level: "Ladder",
  reputation: "Reputation",
  vip: "VIP",
  venue: "The circuit",
  achievement: "Achievement",
};

/**
 * The answer to "what am I working toward". Sorted nearest-first, because the
 * goal you are most likely to finish next is the one worth showing.
 */
export default function NextGoals({ goals }: { goals: GoalRow[] }) {
  if (goals.length === 0) return null;

  return (
    <div className="panel p-6">
      <h3 className="text-[13px] font-black tracking-tight text-white">What&apos;s next</h3>
      <p className="mt-1 text-[11px] text-slate-500">
        Every open track at once, closest first.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {goals.map((g) => {
          const colour = KIND_COLOURS[g.kind] ?? "#2e8bff";
          const pct = Math.round(Math.max(0, Math.min(1, g.progress)) * 100);
          return (
            <Link
              key={`${g.kind}-${g.title}`}
              href={g.href}
              className="rounded-xl border border-white/10 p-3.5 transition-all duration-200 hover:-translate-y-px hover:border-white/20"
            >
              <p
                className="text-[9px] font-black uppercase tracking-[0.18em]"
                style={{ color: colour }}
              >
                {KIND_LABELS[g.kind] ?? g.kind}
              </p>
              <p className="mt-1 truncate text-[13px] font-bold text-white">{g.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{g.detail}</p>

              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${pct}%`, background: colour }}
                  />
                </div>
                <span className="num shrink-0 text-[10px] font-bold text-slate-400">{pct}%</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

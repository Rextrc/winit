"use client";

import { useCallback, useEffect, useState } from "react";
import { TIER_COLOURS, TIER_LABELS, type AchievementTier } from "@/lib/life/achievements";

type Row = {
  key: string;
  name: string;
  description: string;
  tier: AchievementTier;
  category: string;
  secret: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: number | null;
};

const CATEGORIES = ["All", "Career", "Money", "Games", "Risk", "Reputation", "Endgame"];

export default function AchievementsPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/life/achievements", { cache: "no-store" });
      if (!res.ok) {
        setError("Couldn't load achievements.");
        return;
      }
      const data = await res.json();
      setRows(data.achievements as Row[]);
    } catch {
      setError("Network error.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!rows) return <p className="text-sm text-slate-500">Loading…</p>;

  const shown = rows.filter((r) => (filter === "All" ? true : r.category === filter));
  const unlockedCount = rows.filter((r) => r.unlocked).length;

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[13px] font-black text-white">
            {unlockedCount} of {rows.length} unlocked
          </p>
          <p className="num text-[12px] text-slate-500">
            {Math.round((unlockedCount / rows.length) * 100)}% complete
          </p>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-volt transition-[width] duration-700"
            style={{ width: `${(unlockedCount / rows.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition ${
              filter === c ? "bg-volt text-white" : "bg-white/5 text-slate-400 hover:text-slate-100"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((a) => {
          // A locked secret keeps its name and its description hidden — that is
          // the whole point of it being secret.
          const hidden = a.secret && !a.unlocked;
          const colour = TIER_COLOURS[a.tier];
          return (
            <div
              key={a.key}
              className={`panel p-4 transition ${a.unlocked ? "" : "opacity-70"}`}
              style={a.unlocked ? { boxShadow: `inset 0 0 0 1px ${colour}44` } : undefined}
            >
              <div className="flex items-start gap-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[15px] font-black"
                  style={{
                    background: a.unlocked ? `${colour}22` : "rgba(255,255,255,0.05)",
                    color: a.unlocked ? colour : "#475569",
                  }}
                  aria-hidden="true"
                >
                  {hidden ? "?" : a.unlocked ? "★" : "☆"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-black text-white">
                    {hidden ? "Secret achievement" : a.name}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
                    {hidden ? "Unlocks itself when you do something unusual." : a.description}
                  </p>

                  {!a.unlocked && a.progress !== null && a.progress > 0 && (
                    <div className="mt-2">
                      <div className="h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-volt/70"
                          style={{ width: `${Math.round(a.progress * 100)}%` }}
                        />
                      </div>
                      <p className="num mt-1 text-[10px] text-slate-600">
                        {Math.round(a.progress * 100)}%
                      </p>
                    </div>
                  )}

                  <p
                    className="mt-1.5 text-[9px] font-black uppercase tracking-[0.16em]"
                    style={{ color: a.unlocked ? colour : "#475569" }}
                  >
                    {TIER_LABELS[a.tier]}
                    {a.unlocked && a.unlockedAt
                      ? ` · ${new Date(a.unlockedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

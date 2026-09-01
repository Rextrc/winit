"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

type Challenge = {
  key: string;
  name: string;
  description: string;
  kind: "VOLUME" | "OUTCOME";
  target: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  reward: { xp: number; reputation: number; cents: number };
};

type Board = { period: "daily" | "weekly"; periodKey: string; challenges: Challenge[] };

export default function ChallengesPanel({ onClaimed }: { onClaimed?: () => void | Promise<void> }) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/life/challenges", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setBoards(data.boards as Board[]);
    } catch {
      /* keep whatever is on screen */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = useCallback(
    async (period: string, key: string) => {
      setBusy(`${period}:${key}`);
      setError(null);
      try {
        const res = await fetch("/api/life/challenges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ period, key }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't claim that.");
          return;
        }
        await load();
        await onClaimed?.();
      } catch {
        setError("Network error — nothing was claimed.");
      } finally {
        setBusy(null);
      }
    },
    [load, onClaimed],
  );

  if (!boards) return null;

  return (
    <div className="panel p-6">
      <h3 className="text-[13px] font-black tracking-tight text-white">Challenges</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Volume challenges pay XP and reputation only. Currency comes solely from the outcome ones,
        because paying cash for volume would be free money bought by betting enough — the same
        exploit level-up rewards were removed for.
      </p>

      {error && <p className="mt-3 text-[12px] font-semibold text-loss">{error}</p>}

      <div className="mt-4 space-y-5">
        {boards.map((board) => (
          <div key={board.period}>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                {board.period === "daily" ? "Today" : "This week"}
              </p>
              <p className="num text-[10px] text-slate-600">{board.periodKey}</p>
            </div>

            <ul className="space-y-2">
              {board.challenges.map((c) => {
                const pct = Math.round((c.progress / c.target) * 100);
                const id = `${board.period}:${c.key}`;
                return (
                  <li
                    key={c.key}
                    className={`rounded-xl border px-3.5 py-3 ${
                      c.claimed
                        ? "border-white/5 opacity-60"
                        : c.complete
                          ? "border-win/40 bg-win/5"
                          : "border-white/10"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] font-bold text-slate-100">{c.name}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                          c.kind === "OUTCOME" ? "bg-volt/15 text-volt" : "bg-white/10 text-slate-400"
                        }`}
                      >
                        {c.kind === "OUTCOME" ? "Pays cash" : "XP + rep"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">{c.description}</p>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full transition-[width] duration-700 ${
                            c.complete ? "bg-win" : "bg-volt"
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <span className="num shrink-0 text-[10px] font-bold text-slate-400">
                        {c.progress.toLocaleString()} / {c.target.toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="num text-[10px] text-slate-500">
                        {c.reward.xp.toLocaleString()} XP · {c.reward.reputation} rep
                        {c.reward.cents > 0 ? ` · ${formatCents(c.reward.cents)}` : ""}
                      </span>
                      {c.claimed ? (
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                          Claimed
                        </span>
                      ) : c.complete ? (
                        <button
                          type="button"
                          onClick={() => claim(board.period, c.key)}
                          disabled={busy === id}
                          className="btn-primary px-3 py-1 text-[11px]"
                        >
                          {busy === id ? "Claiming…" : "Claim"}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

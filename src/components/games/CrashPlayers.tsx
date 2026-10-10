"use client";

import { formatCents } from "@/lib/money";

export type LivePlayer = {
  username: string;
  betCents: number;
  status: "ACTIVE" | "CASHED" | "LOST";
  cashedAt: number | null;
  payoutCents: number;
  isMe: boolean;
};

function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/** Everyone with a real bet on the current shared round. */
export default function CrashPlayers({ players, flying }: { players: LivePlayer[]; flying: boolean }) {
  const totalCents = players.reduce((s, p) => s + p.betCents, 0);

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-base-900/60 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${flying ? "animate-pulse bg-win" : "bg-slate-600"}`} />
          {players.length} {players.length === 1 ? "player" : "players"}
        </span>
        {players.length > 0 && <span className="num normal-case tracking-normal">{formatCents(totalCents)} wagered</span>}
      </div>

      {players.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-slate-500">No bets on this round yet — be the first in.</p>
      ) : (
        <ul className="space-y-1">
          {players.map((p) => {
            const h = hue(p.username);
            const out = p.status === "CASHED";
            const bust = p.status === "LOST";
            return (
              <li
                key={p.username}
                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                  out ? "bg-win/[0.07]" : bust ? "bg-loss/[0.06]" : ""
                } ${p.isMe ? "ring-1 ring-volt/40" : ""}`}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-black text-base-900"
                  style={{ background: `linear-gradient(140deg, hsl(${h} 70% 62%), hsl(${(h + 48) % 360} 70% 45%))` }}
                >
                  {p.username.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">
                  {p.username}
                  {p.isMe && <span className="ml-1.5 text-[11px] font-bold text-volt">you</span>}
                </span>
                <span className="num w-16 text-right text-slate-400 sm:w-20">{formatCents(p.betCents)}</span>
                <span className="num w-12 text-right font-bold sm:w-14">
                  {out ? <span className="text-win">{p.cashedAt?.toFixed(2)}x</span> : bust ? <span className="text-loss">—</span> : <span className="text-slate-600">…</span>}
                </span>
                <span className="num w-[72px] text-right font-bold sm:w-24">
                  {out ? (
                    <span className="text-win">+{formatCents(p.payoutCents - p.betCents)}</span>
                  ) : bust ? (
                    <span className="text-loss">-{formatCents(p.betCents)}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

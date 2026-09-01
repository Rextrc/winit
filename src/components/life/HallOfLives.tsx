"use client";

import { formatCents } from "@/lib/money";
import { venueById } from "@/lib/life/venues";

export type LifeRow = {
  id: string;
  ordinal: number;
  cause: string;
  ageAtEnd: number;
  level: number;
  rebirths: number;
  venueId: string;
  epitaph: string;
  betsPlaced: number;
  peakBalanceCents: number;
  lifetimeWageredCents: number;
  biggestWinCents: number;
};

/** The careers already finished on this account. Gravestones, not state. */
export default function HallOfLives({ lives }: { lives: LifeRow[] }) {
  return (
    <div className="panel p-6">
      <h3 className="text-[13px] font-black tracking-tight text-white">Hall of lives</h3>
      <p className="mt-1 text-[11px] text-slate-500">
        Every career this account has burned through. Each one makes the next 25% quicker to climb —
        which is the only thing an heir inherits.
      </p>

      {lives.length === 0 ? (
        <p className="mt-4 text-[12px] text-slate-500">
          Nobody has died here yet. Your first career is still running.
        </p>
      ) : (
        <ol className="mt-4 space-y-2">
          {lives.map((l) => {
            const ruin = l.cause === "RUIN";
            return (
              <li
                key={l.id}
                className={`rounded-xl border px-3.5 py-3 ${
                  ruin ? "border-loss/25 bg-loss/5" : "border-white/10"
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[13px] font-black text-white">
                    Life {l.ordinal}
                    <span className="ml-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      {ruin ? "Ruined" : "Retired"} at {l.ageAtEnd}
                    </span>
                  </span>
                  <span className="num text-[11px] text-slate-400">
                    Level {l.level}
                    {l.rebirths > 0 && ` · ${l.rebirths} rebirth${l.rebirths === 1 ? "" : "s"}`}
                  </span>
                </div>

                <p className="mt-1 text-[12px] italic leading-snug text-slate-300">
                  &ldquo;{l.epitaph}&rdquo;
                </p>

                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                  <Pair k="Peak" v={formatCents(l.peakBalanceCents)} />
                  <Pair k="Best win" v={formatCents(l.biggestWinCents)} />
                  <Pair k="Staked" v={formatCents(l.lifetimeWageredCents)} />
                  <Pair k="Bets" v={l.betsPlaced.toLocaleString()} />
                  <Pair k="Last seen" v={venueById(l.venueId).name} />
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="num font-bold text-slate-200">{v}</dd>
    </div>
  );
}

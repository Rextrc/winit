"use client";

import { formatCents } from "@/lib/money";
import {
  BETS_PER_LIFE,
  COMEBACKS_PER_LIFE,
  DAYS_PER_BET,
  END_AGE,
  START_AGE,
  type CareerState,
} from "@/lib/life/career";

/** The one number a career actually runs on: how much of it is left. */
export default function CareerClock({
  career,
  stageTitle,
  balanceCents,
}: {
  career: CareerState;
  stageTitle: string;
  balanceCents: number;
}) {
  const pct = Math.round(career.progress * 100);
  const years = END_AGE - START_AGE;

  return (
    <div className="panel overflow-hidden">
      <div
        className={`border-b border-white/5 p-6 ${
          career.over
            ? "bg-gradient-to-r from-loss/12 via-transparent to-transparent"
            : "bg-gradient-to-r from-volt/10 via-transparent to-transparent"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-volt">
              Life {career.livesLived + 1}
              {career.livesLived > 0 && ` · ${career.livesLived} behind you`}
            </p>
            <h2 className="font-display mt-1 text-3xl font-black tracking-tight text-white">
              {career.over ? "Career over" : `${stageTitle}, ${career.age}`}
            </h2>
            <p className="mt-1 text-[13px] text-slate-400">
              {career.over
                ? career.deathCause === "RUIN"
                  ? "Broke, out of comebacks, and done."
                  : "The clock ran out."
                : `Playing ${career.venueName}, ${career.venueCity}.`}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Bets left in this life
            </p>
            <p className={`num text-2xl font-black ${career.over ? "text-loss" : "text-white"}`}>
              {career.over ? "0" : career.betsRemaining.toLocaleString()}
            </p>
            <p className="num mt-0.5 text-[11px] text-slate-500">
              of {BETS_PER_LIFE.toLocaleString()} a life gets
            </p>
          </div>
        </div>

        {/* the clock */}
        <div className="mt-5">
          <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
            <span className="font-bold uppercase tracking-wide text-slate-500">
              Age {START_AGE} → {END_AGE}
            </span>
            <span className="num text-slate-400">
              {career.age} · {pct}% spent
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${
                career.over ? "bg-loss" : career.progress > 0.75 ? "bg-amber-400" : "bg-volt"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
            Every settled bet costs {DAYS_PER_BET} days, win or lose, at every table in the app — so a
            life is a budget of about {BETS_PER_LIFE.toLocaleString()} bets across {years} years, and
            nothing you can do buys more of them.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
        <Cell label="Bankroll" value={formatCents(balanceCents)} />
        <Cell label="Peak this life" value={formatCents(career.peakBalanceCents)} tone="text-win" />
        <Cell
          label="Comebacks left"
          value={`${career.comebacksLeft} of ${COMEBACKS_PER_LIFE}`}
          tone={career.comebacksLeft === 0 ? "text-loss" : ""}
        />
        <Cell label="Table minimum" value={formatCents(career.tableMinCents)} />
      </div>
    </div>
  );
}

function Cell({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-base-800/80 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`num mt-1 text-base font-black text-white ${tone}`}>{value}</p>
    </div>
  );
}

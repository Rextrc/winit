"use client";

import { periodsFor, surfaceFor, teamAbbr } from "@/lib/sports/meta";
import type { SportEvent } from "@/lib/sports/types";
import TeamBadge from "@/components/sports/TeamBadge";
import FieldArt from "@/components/sports/FieldArt";
import { Wordmark } from "@/components/Wordmark";
import { formatKickoff, useNow } from "@/components/sports/StartTime";

function startWord(group: string): string {
  if (group === "Soccer" || group === "American Football" || group === "Rugby League" || group === "Rugby Union") return "Kickoff time";
  if (group === "Basketball") return "Tip-off";
  if (group === "Ice Hockey") return "Face-off";
  if (group === "Baseball") return "First pitch";
  return "Start time";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export default function Scoreboard({ event }: { event: SportEvent }) {
  const now = useNow(1000);
  const start = new Date(event.commenceTime);
  const left = Math.max(0, start.getTime() - now);
  const live = left === 0;
  const periods = periodsFor(event.group);
  const home = teamAbbr(event.homeTeam, event.awayTeam);
  const away = teamAbbr(event.awayTeam, event.homeTeam);

  const days = Math.floor(left / 86_400_000);
  const hrs = Math.floor((left % 86_400_000) / 3_600_000);
  const mins = Math.floor((left % 3_600_000) / 60_000);
  const secs = Math.floor((left % 60_000) / 1000);

  const pill = `${start.getDate()} ${start.toLocaleString(undefined, { month: "short" }).toUpperCase()} | ${pad(start.getHours())}:${pad(start.getMinutes())}`;

  return (
    <section className="overflow-hidden rounded-2xl bg-[#1a1c23]">
      <div className="relative px-5 pb-4 pt-6">
        <span className="absolute left-1/2 top-0 -translate-x-1/2 rounded-b-md border border-t-0 border-white/15 px-2 py-0.5 text-[11px] text-slate-300">
          {pill}
        </span>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5 text-[17px] font-black text-white">
            <TeamBadge team={event.homeTeam} className="h-[22px] w-[32px]" />
            {home}
          </span>
          <span className="flex items-center gap-2.5 text-[17px] font-black text-white">
            {away}
            <TeamBadge team={event.awayTeam} className="h-[22px] w-[32px]" />
          </span>
        </div>
      </div>

      {periods && (
        <div className="border-t border-white/[0.08] px-5 pb-3 pt-3">
          <div className="grid grid-cols-[40px_1fr] text-[11px] text-slate-300">
            <span className="font-black text-white">{home}</span>
            <div className="relative flex justify-between">
              <span />
              {periods.halfway !== undefined && (
                <span className="absolute left-1/2 -translate-x-1/2">HT</span>
              )}
              <span>{periods.note}</span>
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-[40px_1fr]">
            <span />
            <div className="relative h-12 border-y border-white/10">
              <div className="absolute inset-0 flex">
                {periods.marks.map((m) => (
                  <span key={m} className="flex-1 border-l border-white/10" />
                ))}
                <span className="border-l border-white/10" />
              </div>
              <div className="absolute inset-x-0 top-1/2 border-t border-white/[0.06]" />
            </div>
          </div>
          <div className="mt-1.5 grid grid-cols-[40px_1fr] text-[11px] text-slate-300">
            <span className="font-black text-white">{away}</span>
            <div className="flex">
              {periods.marks.map((m) => (
                <span key={m} className="flex-1 text-right">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="relative h-[250px]">
        <FieldArt surface={surfaceFor(event.group)} />
        <div className="absolute inset-x-5 bottom-4 top-6 flex flex-col items-center justify-center rounded-xl border border-white/15 bg-[#1f3a22]/80 px-4 text-center backdrop-blur-[2px]">
          {live ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-loss px-2.5 py-1 text-[12px] font-black uppercase tracking-wide text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                In play
              </span>
              <p className="mt-2 text-[13px] text-white/80">Started {formatKickoff(event.commenceTime)}</p>
            </>
          ) : (
            <>
              <p className="text-[13px] font-bold text-white">{startWord(event.group)}</p>
              <div className="mt-2 flex gap-2">
                {[
                  [days, "Days"],
                  [hrs, "Hrs"],
                  [mins, "Mins"],
                  [secs, "Secs"],
                ].map(([v, label], i) => (
                  <div key={label as string} className="flex flex-col items-center">
                    <span className="num grid h-9 min-w-[42px] place-items-center rounded-md bg-white px-1.5 text-[18px] font-black text-black">
                      {i === 0 ? v : pad(v as number)}
                    </span>
                    <span className="mt-1 text-[11px] text-white/85">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="my-3 h-px w-full bg-white/20" />
          <p className="text-[12px] text-white/85">
            <span className="font-bold text-white">{event.leagueTitle}</span> · priced from {event.bookmakers} bookmaker
            {event.bookmakers === 1 ? "" : "s"}
          </p>
          <div className="my-3 h-px w-full bg-white/20" />
          <Wordmark />
        </div>
      </div>
    </section>
  );
}

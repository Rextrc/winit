"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { iconForGroup } from "@/lib/sports/meta";
import type { Catalog, League, SportEvent } from "@/lib/sports/types";
import SportIcon from "@/components/sports/SportIcon";
import SportRail from "@/components/sports/SportRail";
import LeaguePanel from "@/components/sports/LeaguePanel";
import TrendingCarousel from "@/components/sports/TrendingCarousel";
import MyBets from "@/components/sports/MyBets";

type Tab = "featured" | "upcoming" | "live" | "mybets" | "all";

type LobbyData = {
  catalog: Catalog;
  liveCount: number;
  trending?: SportEvent[];
  leagues: { league: League; events: SportEvent[] | null }[];
};

const TABS: { key: Tab; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "upcoming", label: "Upcoming" },
  { key: "live", label: "Live" },
  { key: "mybets", label: "My Bets" },
  { key: "all", label: "All Sports" },
];

function Chevron() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m8 4.5 5.5 5.5L8 15.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionHeading({ group, link = true }: { group: string; link?: boolean }) {
  const inner = (
    <>
      <SportIcon sport={iconForGroup(group)} className="h-7 w-7 text-[#9d7aff]" />
      <span className="font-display text-[22px] font-black tracking-tight text-white">{group}</span>
      {link && <span className="text-white">{<Chevron />}</span>}
    </>
  );
  return link ? (
    <Link href={`/sports?sport=${encodeURIComponent(group)}`} className="mb-4 inline-flex items-center gap-3 hover:opacity-90">
      {inner}
    </Link>
  ) : (
    <h2 className="mb-4 flex items-center gap-3">{inner}</h2>
  );
}

/** League panels grouped under one heading per sport, in rail order. */
function GroupedLeagues({ data, emptyText }: { data: LobbyData; emptyText: string }) {
  const order = data.catalog.groups.map((g) => g.name);
  const groups = Array.from(new Set(data.leagues.map((l) => l.league.group))).sort((a, b) => order.indexOf(a) - order.indexOf(b));

  if (data.leagues.length === 0) {
    return <div className="rounded-2xl bg-[#1a1c23] px-6 py-14 text-center text-[14px] text-slate-400">{emptyText}</div>;
  }
  return (
    <div className="space-y-10">
      {groups.map((g) => (
        <section key={g}>
          <SectionHeading group={g} />
          <div className="space-y-4">
            {data.leagues
              .filter((l) => l.league.group === g)
              .map((l) => (
                <LeaguePanel key={l.league.key} league={l.league} events={l.events} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-[#1a1c23] px-6 py-14 text-center">
      <SportIcon sport="popular" className="mx-auto h-10 w-10 text-[#9d7aff]" />
      <p className="mt-3 text-[16px] font-black text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

export default function SportsLobby() {
  const params = useSearchParams();
  const sport = params.get("sport");
  const tab = ((params.get("tab") as Tab | null) ?? "featured") as Tab;
  const view = sport ? "group" : tab === "mybets" || tab === "all" ? "featured" : tab;

  const [data, setData] = useState<LobbyData | null>(null);
  const [error, setError] = useState<{ message: string; setup: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const qs = new URLSearchParams({ view });
    if (sport) qs.set("group", sport);
    fetch(`/api/sports/lobby?${qs}`)
      .then(async (r) => {
        const d = await r.json();
        if (cancelled) return;
        if (!r.ok) setError({ message: d.error ?? "Couldn't load the board.", setup: Boolean(d.setup) });
        else setData(d);
      })
      .catch(() => !cancelled && setError({ message: "Network error loading the board.", setup: false }));
    return () => {
      cancelled = true;
    };
  }, [view, sport]);

  // Jump to a league linked by hash once its panel exists.
  useEffect(() => {
    if (!data || typeof window === "undefined" || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data]);

  const activeTab: Tab = sport ? "featured" : tab;
  const showRail = activeTab !== "mybets" && activeTab !== "all";

  return (
    <div className="space-y-7 pb-24">
      <nav className="flex gap-1 overflow-x-auto border-b border-white/[0.08] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const on = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={t.key === "featured" ? "/sports" : `/sports?tab=${t.key}`}
              className={`relative flex shrink-0 items-center gap-2 px-5 pb-3 pt-1 text-[16px] transition-colors ${
                on ? "font-bold text-[#9d7aff]" : "text-slate-200 hover:text-white"
              }`}
            >
              {t.label}
              {t.key === "live" && data && data.liveCount > 0 && (
                <span className="rounded-md bg-[#1f8f3f] px-1.5 py-0.5 text-[12px] font-black text-white">{data.liveCount}</span>
              )}
              {on && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-[#8f6bff]" />}
            </Link>
          );
        })}
      </nav>

      {showRail && <SportRail catalog={data?.catalog ?? null} active={sport} />}

      {error && (
        <Notice
          title={error.setup ? "Sports is almost ready" : "The board is unavailable"}
          body={
            error.setup
              ? "The odds feed hasn't been connected yet. Once an ODDS_API_KEY is added to the server, real matches and prices appear here."
              : error.message
          }
        />
      )}

      {!error && activeTab === "mybets" && <MyBets />}

      {!error && !data && activeTab !== "mybets" && (
        <div className="space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-[#1a1c23]" />
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[280px] animate-pulse rounded-2xl bg-[#1a1c23]" />
            ))}
          </div>
        </div>
      )}

      {data && !sport && activeTab === "featured" && (
        <>
          <TrendingCarousel events={data.trending ?? []} />
          <GroupedLeagues data={data} emptyText="No fixtures priced right now — check back soon." />
        </>
      )}

      {data && sport && (
        <section>
          <SectionHeading group={sport} link={false} />
          <div className="space-y-4">
            {data.leagues.map((l, i) => (
              <LeaguePanel key={l.league.key} league={l.league} events={l.events} defaultOpen={i < 2} />
            ))}
          </div>
        </section>
      )}

      {data && activeTab === "upcoming" && <GroupedLeagues data={data} emptyText="Nothing kicks off in the next 48 hours." />}

      {data && activeTab === "live" && (
        <>
          <p className="-mt-2 text-[13px] text-slate-400">
            Matches in play. Betting closes at kick-off, so in-play prices are shown for reference only.
          </p>
          <GroupedLeagues data={data} emptyText="Nothing is in play right now." />
        </>
      )}

      {data && activeTab === "all" && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.catalog.groups.map((g) => (
            <section key={g.name} className="rounded-2xl bg-[#1a1c23] p-5">
              <Link href={`/sports?sport=${encodeURIComponent(g.name)}`} className="flex items-center gap-3 hover:opacity-90">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#2a2c33] text-white">
                  <SportIcon sport={iconForGroup(g.name)} className="h-6 w-6" />
                </span>
                <span>
                  <span className="block text-[16px] font-black text-white">{g.name}</span>
                  <span className="block text-[12px] text-slate-400">
                    {g.leagues.length} competition{g.leagues.length === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
              <ul className="mt-4 space-y-1">
                {g.leagues.slice(0, 8).map((l) => (
                  <li key={l.key}>
                    <Link
                      href={`/sports?sport=${encodeURIComponent(g.name)}#league-${l.key}`}
                      className="block truncate rounded-lg px-2 py-1.5 text-[14px] text-[#9d7aff] hover:bg-white/5 hover:text-[#b49bff]"
                    >
                      {l.title}
                    </Link>
                  </li>
                ))}
                {g.leagues.length > 8 && (
                  <li>
                    <Link href={`/sports?sport=${encodeURIComponent(g.name)}`} className="block px-2 py-1.5 text-[13px] text-slate-400 hover:text-white">
                      +{g.leagues.length - 8} more
                    </Link>
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { iconForGroup, leagueRegion, marketLabel, marketTab, orderH2h, selectionLabel } from "@/lib/sports/meta";
import type { League, Market, SportEvent } from "@/lib/sports/types";
import HeroArt from "@/components/sports/HeroArt";
import TeamBadge from "@/components/sports/TeamBadge";
import OddsButton from "@/components/sports/OddsButton";
import Scoreboard from "@/components/sports/Scoreboard";
import SportIcon from "@/components/sports/SportIcon";
import StartTime from "@/components/sports/StartTime";

const REFRESH_MS = 60_000;

function TeamBlock({ team }: { team: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="grid h-[68px] w-[68px] place-items-center rounded-2xl bg-[#1a1b22] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)] sm:h-[100px] sm:w-[100px]">
        <TeamBadge team={team} className="h-8 w-11 sm:h-[46px] sm:w-[64px]" />
      </div>
      <p className="max-w-[160px] text-center text-[14px] font-black leading-tight text-white sm:text-[18px]">{team}</p>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-5 w-5 shrink-0 text-white transition-transform ${open ? "" : "rotate-180"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m5 12.5 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MarketBlock({
  event,
  market,
  open,
  onToggle,
  filter,
  disabled,
}: {
  event: SportEvent;
  market: Market;
  open: boolean;
  onToggle: () => void;
  filter: string;
  disabled: boolean;
}) {
  const title = marketLabel(market.key, event.group);
  const titleHit = !filter || title.toLowerCase().includes(filter);
  const lines = market.lines
    .map((line) => ({
      ...line,
      outcomes:
        market.key === "h2h" ? orderH2h(line.outcomes, event.homeTeam, event.awayTeam) : line.outcomes,
    }))
    .filter(
      (line) => titleHit || line.outcomes.some((o) => selectionLabel(market.key, o.name, o.point).toLowerCase().includes(filter)),
    );
  if (lines.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl bg-[#1a1c23]">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-5 py-4 text-left" aria-expanded={open}>
        <span className="text-[16px] font-black text-white">{title}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-white/[0.06] px-3.5 pb-4 pt-4 sm:px-4">
          {market.key === "h2h"
            ? lines[0].outcomes.map((o) => (
                <OddsButton
                  key={o.name}
                  layout="row"
                  event={event}
                  market="h2h"
                  name={o.name}
                  point={null}
                  price={o.price}
                  label={o.name}
                  badge={o.name === "Draw" ? undefined : o.name}
                  disabled={disabled}
                />
              ))
            : lines.map((line) => (
                <div key={String(line.point)} className="grid grid-cols-2 gap-2">
                  {line.outcomes.map((o) => (
                    <OddsButton
                      key={o.name}
                      layout="row"
                      event={event}
                      market={market.key}
                      name={o.name}
                      point={o.point}
                      price={o.price}
                      label={selectionLabel(market.key, o.name, o.point)}
                      disabled={disabled}
                    />
                  ))}
                </div>
              ))}
        </div>
      )}
    </section>
  );
}

export default function MatchView({ sportKey, eventId }: { sportKey: string; eventId: string }) {
  const [event, setEvent] = useState<SportEvent | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"top" | Market["key"]>("top");
  const [filter, setFilter] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/sports/event/${encodeURIComponent(sportKey)}/${encodeURIComponent(eventId)}`)
        .then(async (r) => {
          const d = await r.json();
          if (cancelled) return;
          if (!r.ok) setError(d.error ?? "Couldn't load this match.");
          else {
            setEvent(d.event);
            setLeague(d.league);
            setError(null);
          }
        })
        .catch(() => !cancelled && setError("Network error loading this match."));
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sportKey, eventId]);

  const markets = useMemo(
    () => (event ? event.markets.filter((m) => tab === "top" || m.key === tab) : []),
    [event, tab],
  );

  if (error && !event) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl bg-[#1a1c23] px-6 py-14 text-center">
        <p className="text-[16px] font-black text-white">{error}</p>
        <Link href="/sports" className="btn-primary mt-5 inline-flex px-6 py-2.5 text-sm">
          Back to Sports
        </Link>
      </div>
    );
  }

  if (!event || !league) {
    return (
      <div className="space-y-5">
        <div className="h-[340px] animate-pulse rounded-2xl bg-[#1a1c23]" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="h-[400px] animate-pulse rounded-2xl bg-[#1a1c23]" />
          <div className="h-[400px] animate-pulse rounded-2xl bg-[#1a1c23]" />
        </div>
      </div>
    );
  }

  const started = new Date(event.commenceTime).getTime() <= Date.now();
  const region = leagueRegion(league.key);
  const allOpen = markets.every((m) => !closed.has(m.key));
  const q = filter.trim().toLowerCase();

  return (
    <div className="space-y-5 pb-24">
      <nav className="flex items-center gap-2 text-[13px] text-slate-400">
        <Link href="/sports" className="hover:text-white">
          Sports
        </Link>
        <span>/</span>
        <Link href={`/sports?sport=${encodeURIComponent(league.group)}`} className="hover:text-white">
          {league.group}
        </Link>
        <span>/</span>
        <Link href={`/sports?sport=${encodeURIComponent(league.group)}#league-${league.key}`} className="truncate text-[#9d7aff] hover:text-[#b49bff]">
          {region.name} · {league.title}
        </Link>
      </nav>

      <div className="overflow-hidden rounded-2xl">
        <div className="relative h-[260px] sm:h-[300px]">
          <HeroArt sport={iconForGroup(event.group)} />
          <div className="relative flex h-full flex-col justify-center px-4 sm:px-10">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <TeamBlock team={event.homeTeam} />
              <div className="flex flex-col items-center text-center">
                <span className="font-display text-[40px] font-black italic leading-none tracking-tighter text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] sm:text-[56px]">
                  VS
                </span>
                <StartTime iso={event.commenceTime} onHero className="mt-3 hidden justify-center whitespace-nowrap sm:inline-flex" />
              </div>
              <TeamBlock team={event.awayTeam} />
            </div>
            <div className="mt-4 flex justify-center sm:hidden">
              <StartTime iso={event.commenceTime} onHero className="whitespace-nowrap" />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 bg-[#1a1c23] px-4 py-3.5 text-[13px] text-slate-300">
          <SportIcon sport={iconForGroup(event.group)} className="h-4 w-4 text-[#9d7aff]" />
          {started ? "In play — betting on this match is closed" : "Pre-match · betting closes at kick-off"}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4 lg:order-1">
          <div className="flex gap-1 overflow-x-auto rounded-2xl bg-[#1a1c23] p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(["top", ...event.markets.map((m) => m.key)] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`shrink-0 rounded-xl px-5 py-2.5 text-[15px] transition-colors ${
                  tab === k ? "bg-[#2e323c] font-bold text-white" : "text-slate-300 hover:text-white"
                }`}
              >
                {k === "top" ? "Top Markets" : marketTab(k)}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <label className="flex h-12 flex-1 items-center gap-3 rounded-xl border border-white/10 bg-[#0c0d10] px-4 focus-within:border-brand/60">
              <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="9" cy="9" r="6" />
                <path d="m13.5 13.5 4 4" strokeLinecap="round" />
              </svg>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter markets"
                className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-slate-500"
              />
            </label>
            <button
              type="button"
              onClick={() => setClosed(allOpen ? new Set(markets.map((m) => m.key)) : new Set())}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#1a1c23] text-white hover:bg-[#23262e]"
              aria-label={allOpen ? "Collapse all markets" : "Expand all markets"}
              title={allOpen ? "Collapse all" : "Expand all"}
            >
              <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                {allOpen ? (
                  <path d="m6 3.5 4 4 4-4M6 16.5l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="m6 7.5 4-4 4 4M6 12.5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          </div>

          {markets.map((m) => (
            <MarketBlock
              key={m.key}
              event={event}
              market={m}
              open={!closed.has(m.key)}
              filter={q}
              disabled={started}
              onToggle={() =>
                setClosed((prev) => {
                  const next = new Set(prev);
                  if (next.has(m.key)) next.delete(m.key);
                  else next.add(m.key);
                  return next;
                })
              }
            />
          ))}
          {q && markets.every((m) => !marketLabel(m.key, event.group).toLowerCase().includes(q) && !m.lines.some((l) => l.outcomes.some((o) => selectionLabel(m.key, o.name, o.point).toLowerCase().includes(q)))) && (
            <p className="rounded-2xl bg-[#1a1c23] px-5 py-8 text-center text-[14px] text-slate-400">No markets match “{filter}”.</p>
          )}
        </div>

        <div className="lg:sticky lg:top-20 lg:order-2">
          <Scoreboard event={event} />
        </div>
      </div>
    </div>
  );
}

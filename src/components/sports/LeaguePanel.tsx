"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { extraSelections, iconForGroup, leagueRegion, mainMarket, marketLabel, orderH2h } from "@/lib/sports/meta";
import { flagUrl } from "@/lib/sports/flags";
import type { League, SportEvent } from "@/lib/sports/types";
import SportIcon from "@/components/sports/SportIcon";
import TeamBadge from "@/components/sports/TeamBadge";
import StartTime from "@/components/sports/StartTime";
import OddsButton from "@/components/sports/OddsButton";

const PAGE = 5;

export function Globe({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="#2f9be6" />
      <path d="M5 4.5c1.6.4 2.2 1.6 1.7 2.7-.5 1 .3 1.9 1.4 2 1.3.2 1.6 1.5.9 2.6-.6 1 0 2.4.8 3.4-3-.3-5.6-3-5.8-6.2.1-1.8.4-3.3 1-4.5ZM12.3 2.3c.3 1.2 1.3 1.6 2.3 1.4 1.2-.2 2.4 1.2 2.9 2.9-1 .4-2.2.2-2.9 1-.8 1 .3 2.4-.3 3.6-.5 1-1.6.8-2 2 1.6.4 3.1-.4 4.5-1.3" fill="#3cc46b" />
    </svg>
  );
}

export function PlusBadge({ n, href }: { n: number; href: string }) {
  if (n <= 0) return null;
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="rounded-md bg-brand px-2 py-0.5 text-[12px] font-black text-white hover:bg-brand-400"
    >
      +{n}
    </Link>
  );
}

export function eventHref(e: Pick<SportEvent, "sportKey" | "id">): string {
  return `/sports/${encodeURIComponent(e.sportKey)}/${encodeURIComponent(e.id)}`;
}

export function MatchRow({ event }: { event: SportEvent }) {
  const market = mainMarket(event);
  const outcomes = market ? orderH2h(market.lines[0].outcomes, event.homeTeam, event.awayTeam) : [];
  const started = new Date(event.commenceTime).getTime() <= Date.now();
  const href = eventHref(event);

  return (
    <div className="group relative rounded-xl bg-[#23262e] px-4 pb-4 pt-3.5 transition-colors hover:bg-[#2e323c]">
      <Link href={href} className="absolute inset-0 rounded-xl" aria-label={`${event.homeTeam} vs ${event.awayTeam}`} />
      <div className="pointer-events-none relative flex items-center justify-between gap-3">
        <StartTime iso={event.commenceTime} />
        <span className="pointer-events-auto">
          <PlusBadge n={extraSelections(event)} href={href} />
        </span>
      </div>

      <div className="pointer-events-none relative mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)] md:items-center">
        <div className="space-y-3">
          {[event.homeTeam, event.awayTeam].map((t) => (
            <p key={t} className="flex items-center gap-3 text-[15px] font-bold text-white transition-colors group-hover:text-[#b49bff]">
              <TeamBadge team={t} className="h-[18px] w-[26px]" />
              <span className="truncate">{t}</span>
            </p>
          ))}
        </div>
        <div
          className="pointer-events-auto grid gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(outcomes.length, 1)}, minmax(0, 1fr))` }}
        >
          {outcomes.map((o) => (
            <OddsButton
              key={o.name}
              event={event}
              market="h2h"
              name={o.name}
              point={null}
              price={o.price}
              label={o.name}
              disabled={started}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * "International / UEFA Nations League" — a collapsible league block with its
 * main-market column heading and a paged list of fixtures. Events can arrive
 * with the page, or be fetched the first time the panel is opened.
 */
export default function LeaguePanel({
  league,
  events: initial,
  defaultOpen = true,
}: {
  league: League;
  events: SportEvent[] | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [events, setEvents] = useState<SportEvent[] | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const region = leagueRegion(league.key);

  useEffect(() => setEvents(initial), [initial]);

  // A link straight to this league opens it even if it starts collapsed.
  useEffect(() => {
    if (window.location.hash === `#league-${league.key}`) setOpen(true);
  }, [league.key]);

  useEffect(() => {
    if (!open || events !== null) return;
    let cancelled = false;
    fetch(`/api/sports/league/${encodeURIComponent(league.key)}`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (!r.ok) setError(data.error ?? "Couldn't load this league.");
        else setEvents(data.events);
      })
      .catch(() => !cancelled && setError("Couldn't load this league."));
    return () => {
      cancelled = true;
    };
  }, [open, events, league.key]);

  return (
    <section id={`league-${league.key}`} className="overflow-hidden rounded-2xl bg-[#1a1c23]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-5 py-4 text-left text-[15px]"
        aria-expanded={open}
      >
        {region.flag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flagUrl(region.flag)} alt="" className="h-5 w-5 rounded-full object-cover" />
        ) : (
          <Globe />
        )}
        <span className="text-white">{region.name}</span>
        <span className="text-slate-500">/</span>
        <SportIcon sport={iconForGroup(league.group)} className="h-[18px] w-[18px] text-[#9d7aff]" />
        <span className="truncate text-[#9d7aff]">{league.title}</span>
        <svg
          viewBox="0 0 20 20"
          className={`ml-auto h-5 w-5 shrink-0 text-white transition-transform ${open ? "" : "rotate-180"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m5 12.5 5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-3.5 pb-4 sm:px-4">
          <div className="hidden py-2.5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
            <span />
            <span className="text-center text-[12px] text-slate-400">{marketLabel("h2h", league.group)}</span>
          </div>
          <div className="h-3 md:hidden" />

          {error && <p className="px-1 py-4 text-sm text-slate-400">{error}</p>}
          {!error && events === null && (
            <div className="space-y-2.5">
              {[0, 1].map((i) => (
                <div key={i} className="h-[132px] animate-pulse rounded-xl bg-[#23262e]" />
              ))}
            </div>
          )}
          {events && events.length === 0 && (
            <p className="px-1 py-4 text-sm text-slate-400">No fixtures priced right now.</p>
          )}

          {events && events.length > 0 && (
            <div className="space-y-2.5">
              {events.slice(0, shown).map((e) => (
                <MatchRow key={e.id} event={e} />
              ))}
            </div>
          )}
          {events && events.length > shown && (
            <button
              type="button"
              onClick={() => setShown((s) => s + PAGE)}
              className="mt-4 px-1 text-[15px] font-semibold text-[#9d7aff] hover:text-[#b49bff]"
            >
              Load more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

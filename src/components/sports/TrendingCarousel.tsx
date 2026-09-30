"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { extraSelections, iconForGroup, mainMarket, orderH2h } from "@/lib/sports/meta";
import type { SportEvent } from "@/lib/sports/types";
import SportIcon from "@/components/sports/SportIcon";
import TeamBadge from "@/components/sports/TeamBadge";
import HeroArt from "@/components/sports/HeroArt";
import OddsButton from "@/components/sports/OddsButton";
import StartTime from "@/components/sports/StartTime";
import { PlusBadge, eventHref } from "@/components/sports/LeaguePanel";

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={dir === "left" ? "m12 4.5-5.5 5.5 5.5 5.5" : "m8 4.5 5.5 5.5L8 15.5"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendingCard({ event, width }: { event: SportEvent; width: string }) {
  const market = mainMarket(event);
  const outcomes = market ? orderH2h(market.lines[0].outcomes, event.homeTeam, event.awayTeam) : [];
  const href = eventHref(event);

  return (
    <article style={{ width }} className="flex shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-[#23262e]">
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <SportIcon sport={iconForGroup(event.group)} className="h-[20px] w-[20px] shrink-0 text-[#9d7aff]" />
        <Link href={`/sports?sport=${encodeURIComponent(event.group)}#league-${event.sportKey}`} className="flex min-w-0 items-center gap-1.5 text-[15px] text-white hover:text-[#b49bff]">
          <span className="truncate">{event.leagueTitle}</span>
          <Arrow dir="right" />
        </Link>
        <span className="ml-auto shrink-0">
          <PlusBadge n={extraSelections(event)} href={href} />
        </span>
      </div>

      <Link href={href} className="relative block h-[118px]">
        <HeroArt sport={iconForGroup(event.group)} />
        <div className="relative grid h-full grid-cols-[60px_1fr_60px] items-center gap-2 px-4">
          <TeamBadge team={event.homeTeam} className="h-[34px] w-[48px] justify-self-start" />
          <div className="min-w-0 text-center">
            <p className="text-[15px] font-black leading-snug text-white">
              <span className="block truncate">{event.homeTeam} vs.</span>
              <span className="block truncate">{event.awayTeam}</span>
            </p>
            <p className="mt-0.5 flex justify-center truncate text-[12px]">
              <StartTime iso={event.commenceTime} onHero />
            </p>
          </div>
          <TeamBadge team={event.awayTeam} className="h-[34px] w-[48px] justify-self-end" />
        </div>
      </Link>

      <div
        className="grid flex-1 gap-2 p-4"
        style={{ gridTemplateColumns: `repeat(${Math.max(outcomes.length, 1)}, minmax(0, 1fr))` }}
      >
        {outcomes.map((o) => (
          <OddsButton key={o.name} event={event} market="h2h" name={o.name} point={null} price={o.price} label={o.name} />
        ))}
      </div>
    </article>
  );
}

export default function TrendingCarousel({ events }: { events: SportEvent[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [perView, setPerView] = useState(3);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      setPerView(w >= 1000 ? 3 : w >= 600 ? 2 : 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = perView === 1 ? "86%" : `calc((100% - ${(perView - 1) * 16}px) / ${perView})`;

  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + 16), behavior: "smooth" });
  };

  if (events.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <SportIcon sport="popular" className="h-7 w-7 text-[#9d7aff]" />
        <h2 className="font-display text-[22px] font-black tracking-tight text-white">Trending Now</h2>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#23262e] text-slate-300 hover:bg-[#2e323c] hover:text-white"
            aria-label="Previous"
          >
            <Arrow dir="left" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#2e323c] text-white hover:bg-[#383c47]"
            aria-label="Next"
          >
            <Arrow dir="right" />
          </button>
        </div>
      </div>
      <div ref={track} className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {events.map((e) => (
          <TrendingCard key={e.id} event={e} width={width} />
        ))}
      </div>
    </section>
  );
}

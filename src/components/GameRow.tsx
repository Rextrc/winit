"use client";

import Link from "next/link";
import { useRef } from "react";
import type { GameDef } from "@/lib/games/registry";
import GameTile from "@/components/GameTile";
import { IconChevronLeft, IconChevronRight } from "@/components/Icons";

/** A horizontally scrolling category row with arrow controls. */
export default function GameRow({
  title,
  games,
  href,
  subtitle,
}: {
  title: string;
  games: GameDef[];
  href?: string;
  subtitle?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);

  const nudge = (dir: -1 | 1) => {
    rail.current?.scrollBy({ left: dir * Math.max(320, rail.current.clientWidth * 0.8), behavior: "smooth" });
  };

  if (games.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-black tracking-tight text-white">{title}</h2>
          {subtitle && <p className="truncate text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {href && (
            <Link href={href} className="mr-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-volt">
              See all
            </Link>
          )}
          <button
            type="button"
            onClick={() => nudge(-1)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-volt/40 hover:text-volt"
            aria-label={`Scroll ${title} left`}
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-volt/40 hover:text-volt"
            aria-label={`Scroll ${title} right`}
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={rail} className="rail">
        {games.map((g) => (
          <GameTile key={g.slug} game={g} />
        ))}
      </div>
    </section>
  );
}

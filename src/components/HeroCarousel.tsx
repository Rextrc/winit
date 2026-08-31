"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PLAYABLE } from "@/lib/games/registry";
import { IconChevronLeft, IconChevronRight, IconPlay } from "@/components/Icons";

const SLIDE_MS = 7000;

/** Featured-game carousel. Auto-advances, pauses on hover, dot + arrow nav. */
export default function HeroCarousel() {
  const slides = PLAYABLE;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [paused, slides.length]);

  const game = slides[index];

  return (
    <section
      className="relative mb-8 overflow-hidden rounded-3xl border border-white/10"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Featured games"
    >
      <div className={`relative bg-gradient-to-br ${game.art} transition-colors duration-500`}>
        <div
          className="absolute inset-0 opacity-[0.13]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.65) 1px, transparent 0)",
            backgroundSize: "18px 18px",
          }}
        />
        <div className="relative flex flex-col gap-6 p-6 sm:p-9 lg:flex-row lg:items-center lg:justify-between">
          <div key={game.slug} className="max-w-xl animate-pop-in">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-volt">Featured</p>
            <h1 className="font-display text-3xl font-black leading-none tracking-tight text-white sm:text-5xl">
              {game.name}
            </h1>
            <p className="mt-3 max-w-md text-sm text-slate-200/90">{game.tagline}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="num rounded-lg bg-black/40 px-2.5 py-1 text-xs font-bold text-volt">
                RTP {game.rtp === null ? "—" : `${(game.rtp * 100).toFixed(2)}%`}
              </span>
              {game.tags.map((t) => (
                <span key={t} className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-slate-200">
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href={`/game/${game.slug}`} className="btn-primary shadow-volt">
                <IconPlay className="h-4 w-4" />
                Play now
              </Link>
              <Link href="/rewards" className="btn-ghost">
                Claim daily bonus
              </Link>
            </div>
          </div>

          <div
            key={`art-${game.slug}`}
            className="hidden animate-pop-in select-none text-[160px] font-black leading-none text-white/15 lg:block"
            aria-hidden="true"
          >
            {game.glyph}
          </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 sm:bottom-6 sm:right-6">
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="grid h-8 w-8 place-items-center rounded-lg bg-black/40 text-white/80 transition hover:bg-black/60"
            aria-label="Previous featured game"
          >
            <IconChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="grid h-8 w-8 place-items-center rounded-lg bg-black/40 text-white/80 transition hover:bg-black/60"
            aria-label="Next featured game"
          >
            <IconChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="absolute bottom-6 left-6 flex gap-1.5 sm:bottom-8 sm:left-9">
          {slides.map((s, i) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-7 bg-volt" : "w-3 bg-white/30 hover:bg-white/50"
              }`}
              aria-label={`Show ${s.name}`}
              aria-current={i === index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PLAYABLE } from "@/lib/games/registry";
import { IconChevronLeft, IconChevronRight, IconPlay } from "@/components/Icons";

const SLIDE_MS = 7000;
const FEATURED_COUNT = 3;
const DAY_MS = 86_400_000;

/** Three games, picked by the UTC date so everyone sees the same trio and it rotates at midnight UTC. */
function featuredForDay(day: number) {
  let seed = day * 2654435761;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pool = [...PLAYABLE];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, FEATURED_COUNT);
}

/** Featured-game carousel. Auto-advances, pauses on hover, dot + arrow nav. */
export default function HeroCarousel() {
  const day = Math.floor(Date.now() / DAY_MS);
  const slides = useMemo(() => featuredForDay(day), [day]);
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
      <div className={`relative overflow-hidden bg-base-900 ${game.cover ? "" : `bg-gradient-to-br ${game.art}`}`}>
        {game.cover ? (
          // The cover is portrait tile art, so stretching it across a wide
          // banner just blurs it and exposes its frame. Instead it's used
          // twice: heavily blurred as an ambient colour wash, and crisp as
          // a tilted card on the right.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`bg-${game.slug}`}
            src={game.cover}
            alt=""
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-3xl saturate-150"
            aria-hidden="true"
          />
        ) : (
          <div
            className="absolute inset-0 opacity-[0.13]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.65) 1px, transparent 0)",
              backgroundSize: "18px 18px",
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-base-900 via-base-900/80 to-base-900/20" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />

        {game.cover && (
          <div className="pointer-events-none absolute inset-y-0 right-24 hidden items-center sm:flex lg:right-36">
            <div className="absolute right-0 h-72 w-72 rounded-full bg-volt/25 blur-[90px]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`card-${game.slug}`}
              src={game.cover}
              alt=""
              aria-hidden="true"
              className="relative h-[230px] w-auto translate-y-3 rotate-[6deg] animate-pop-in rounded-2xl shadow-[0_30px_60px_-20px_rgba(0,0,0,0.9)] ring-1 ring-white/15 lg:h-[270px]"
            />
          </div>
        )}

        <div className="relative flex min-h-[200px] flex-col gap-6 px-6 pb-4 pt-6 sm:min-h-[250px] sm:px-9 sm:pt-10 lg:flex-row lg:items-center lg:justify-between">
          <div key={game.slug} className="max-w-xl animate-pop-in">
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-volt/30 bg-volt/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-volt"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-volt" />Featured today</p>
            <h1 className="font-display text-3xl font-black leading-none tracking-tight text-white sm:text-5xl [text-shadow:0_2px_16px_rgba(0,0,0,0.6)]">
              {game.name}
            </h1>
            <p className="mt-2.5 max-w-md text-sm text-slate-300/90 sm:text-[15px]">{game.tagline}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {game.rtp !== null && (
                <span className="num rounded-lg border border-volt/30 bg-volt/10 px-2.5 py-1 text-xs font-bold text-volt">
                  RTP {(game.rtp * 100).toFixed(2)}%
                </span>
              )}
              {game.tags.map((t) => (
                <span key={t} className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-slate-200">
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2.5 sm:mt-6">
              <Link href={`/game/${game.slug}`} className="btn-primary shadow-volt">
                <IconPlay className="h-4 w-4" />
                Play now
              </Link>
              <Link href="/rewards" className="btn-ghost hidden backdrop-blur-sm sm:inline-flex">
                Claim daily bonus
              </Link>
            </div>
          </div>
        </div>

        {/* Controls sit in their own row so they never cover the buttons. */}
        <div className="relative flex items-center justify-between px-6 pb-5 sm:px-9 sm:pb-6">
          <div className="flex gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-8 bg-volt" : "w-4 bg-white/30 hover:bg-white/50"
                }`}
                aria-label={`Show ${s.name}`}
                aria-current={i === index}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
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
        </div>
      </div>
    </section>
  );
}

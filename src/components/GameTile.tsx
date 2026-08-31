"use client";

import Link from "next/link";
import { useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import { IconPlay } from "@/components/Icons";

/**
 * Hover-preview tile: the art lifts, a play affordance slides in and the RTP
 * plate is revealed. Keyboard focus gets the same preview.
 */
export default function GameTile({ game, wide = false }: { game: GameDef; wide?: boolean }) {
  const [hover, setHover] = useState(false);
  const href = game.playable ? `/game/${game.slug}` : "#";

  const body = (
    <>
      <div
        className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-gradient-to-br ${game.art} ring-1 ring-white/10 transition duration-300 ${
          hover ? "ring-volt/50" : ""
        }`}
      >
        {/* Original generated art: layered glyph + grid, no external assets. */}
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <span
          className={`absolute inset-0 grid place-items-center text-[86px] font-black text-white/80 transition-transform duration-500 ${
            hover ? "scale-110" : "scale-100"
          }`}
          aria-hidden="true"
        >
          {game.glyph}
        </span>

        {game.new && (
          <span className="absolute left-2.5 top-2.5 rounded-md bg-volt px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-base-900">
            New
          </span>
        )}
        {!game.playable && (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
            Soon
          </span>
        )}

        {/* Preview overlay */}
        <div
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-base-900 via-base-900/85 to-transparent p-3 transition-all duration-300 ${
            hover ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <p className="mb-2 line-clamp-2 text-[11px] leading-snug text-slate-300">{game.tagline}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="num rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-volt">
              {game.rtp === null ? "RTP —" : `RTP ${(game.rtp * 100).toFixed(2)}%`}
            </span>
            {game.playable && (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-volt text-base-900">
                <IconPlay className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2">
        <p className="truncate text-[13px] font-bold text-slate-100">{game.name}</p>
        <p className="truncate text-[11px] text-slate-500">{game.tags.join(" · ")}</p>
      </div>
    </>
  );

  const className = `group block shrink-0 ${wide ? "w-[220px]" : "w-[152px]"} ${
    game.playable ? "" : "cursor-not-allowed opacity-70"
  }`;

  return game.playable ? (
    <Link
      href={href}
      className={className}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      {body}
    </Link>
  ) : (
    <div
      className={className}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-disabled="true"
    >
      {body}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { GameDef } from "@/lib/games/registry";
import { CATEGORY_LABELS } from "@/lib/games/registry";
import { IconPlay } from "@/components/Icons";

/**
 * Hover-preview tile. A colour ribbon names the category the way a provider
 * badge does on a real lobby, the game's own name sits directly on the art in
 * a bold wordmark rather than in a caption underneath, and the art itself
 * lifts and darkens toward the bottom on hover to reveal the RTP and a play
 * affordance — all still original generated art, no external assets.
 */
export default function GameTile({ game, wide = false }: { game: GameDef; wide?: boolean }) {
  const [hover, setHover] = useState(false);
  const href = game.playable ? `/game/${game.slug}` : "#";

  const body = (
    <div
      className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-gradient-to-br ${game.art} shadow-tile ring-1 ring-white/10 transition duration-300 ${
        hover ? "-translate-y-1 ring-volt/60" : ""
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

      {/* Category ribbon — the "provider badge" strip real lobbies use. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-black/35 px-2 py-1 backdrop-blur-sm">
        <span className="text-[9px] font-black uppercase tracking-[0.14em] text-white/85">
          {CATEGORY_LABELS[game.category]}
        </span>
        {game.new && (
          <span className="rounded bg-volt px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-base-900">
            New
          </span>
        )}
        {!game.playable && (
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-200">
            Soon
          </span>
        )}
      </div>

      <span
        className={`absolute inset-0 grid place-items-center text-[86px] font-black text-white/25 transition-transform duration-500 ${
          hover ? "scale-110" : "scale-100"
        }`}
        aria-hidden="true"
      >
        {game.glyph}
      </span>

      {/* The game's name, as a bold wordmark sitting directly on the art. */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2.5 pb-2.5 pt-8">
        <p className="font-display truncate text-[15px] font-black uppercase leading-none tracking-tight text-white drop-shadow">
          {game.name}
        </p>

        {/* Preview overlay: RTP + play affordance, revealed on hover. */}
        <div
          className={`mt-1.5 flex items-center justify-between gap-2 overflow-hidden transition-all duration-300 ${
            hover ? "max-h-8 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <span className="num rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-volt">
            {game.rtp === null ? "RTP —" : `RTP ${(game.rtp * 100).toFixed(2)}%`}
          </span>
          {game.playable && (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-volt text-base-900">
              <IconPlay className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>
    </div>
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

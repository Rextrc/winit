"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GAMES, CATEGORY_LABELS } from "@/lib/games/registry";
import { IconSearch } from "@/components/Icons";

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return GAMES.filter(
      (g) =>
        g.name.toLowerCase().includes(needle) ||
        g.tagline.toLowerCase().includes(needle) ||
        g.tags.some((t) => t.toLowerCase().includes(needle)),
    ).slice(0, 6);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const first = results[0];
          if (first?.playable) {
            router.push(`/game/${first.slug}`);
            setOpen(false);
            setQ("");
          }
        }}
      >
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search games"
          aria-label="Search games"
          className="field !py-2 pl-9 text-[13px]"
        />
      </form>

      {open && q.trim() && (
        <div className="panel absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden p-1.5 shadow-tile">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">No games match “{q.trim()}”.</p>
          ) : (
            results.map((g) => (
              <Link
                key={g.slug}
                href={g.playable ? `/game/${g.slug}` : "/"}
                onClick={() => {
                  setOpen(false);
                  setQ("");
                }}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-white/5"
              >
                <span
                  className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br text-lg ${g.art}`}
                  aria-hidden="true"
                >
                  {g.glyph}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-100">{g.name}</span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {CATEGORY_LABELS[g.category]} · {g.playable ? g.tagline : "Coming soon"}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

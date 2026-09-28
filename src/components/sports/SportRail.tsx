"use client";

import Link from "next/link";
import { iconForGroup } from "@/lib/sports/meta";
import type { Catalog } from "@/lib/sports/types";
import SportIcon from "@/components/sports/SportIcon";

/** Square sport tiles — "Popular" first, then every sport with a live board. */
export default function SportRail({
  catalog,
  active,
  counts = {},
}: {
  catalog: Catalog | null;
  active: string | null;
  counts?: Record<string, number>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tiles = [
    { key: "popular", label: "Popular", href: "/sports", icon: "popular" as const, on: active === null, count: total },
    ...(catalog?.groups ?? []).map((g) => ({
      key: g.name,
      label: g.name,
      href: `/sports?sport=${encodeURIComponent(g.name)}`,
      icon: iconForGroup(g.name),
      on: active === g.name,
      count: counts[g.name] ?? 0,
    })),
  ];

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tiles.map((t) => (
        <Link key={t.key} href={t.href} className="group flex w-[68px] shrink-0 flex-col items-center gap-2" title={t.label}>
          <span
            className={`relative grid h-[52px] w-[52px] place-items-center rounded-xl border-2 transition-colors ${
              t.on
                ? "border-[#8f6bff] bg-[#8f6bff]/15 text-[#9d7aff]"
                : "border-transparent bg-[#2a2c33] text-white group-hover:bg-[#33363f]"
            }`}
          >
            <SportIcon sport={t.icon} className="h-[24px] w-[24px]" />
            {t.count > 0 && (
              <span
                className={`absolute -right-2 -top-2 min-w-[22px] rounded-md px-1 text-center text-[11px] font-black leading-[18px] text-white ${
                  t.on ? "bg-brand" : "bg-[#3a3d47]"
                }`}
              >
                {t.count}
              </span>
            )}
          </span>
          <span
            className={`w-full truncate text-center text-[12px] ${t.on ? "font-bold text-[#9d7aff]" : "text-slate-300 group-hover:text-white"}`}
          >
            {t.label}
          </span>
        </Link>
      ))}
    </div>
  );
}

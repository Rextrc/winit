"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORY_LABELS, type Category } from "@/lib/games/registry";
import { IconHome, IconLive, IconOriginals, IconSlots, IconTable } from "@/components/Icons";

const TABS: { href: string; label: string; Icon: typeof IconHome; category?: Category }[] = [
  { href: "/", label: "Lobby", Icon: IconHome },
  { href: "/category/slots", label: CATEGORY_LABELS.slots, Icon: IconSlots, category: "slots" },
  { href: "/category/table", label: CATEGORY_LABELS.table, Icon: IconTable, category: "table" },
  { href: "/category/live", label: CATEGORY_LABELS.live, Icon: IconLive, category: "live" },
  { href: "/category/originals", label: CATEGORY_LABELS.originals, Icon: IconOriginals, category: "originals" },
];

/**
 * The horizontal pill row under the hero — a quick jump into a category
 * without going back to the sidebar. Mirrors the vertical BROWSE section,
 * just laid out the way most lobby homepages surface it.
 */
export default function CategoryTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex gap-2 overflow-x-auto pb-1" aria-label="Game categories">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-bold transition ${
              active
                ? "border-volt/50 bg-volt/10 text-volt"
                : "border-white/10 text-slate-300 hover:border-white/20 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Capability } from "@/lib/admin/roles";

const TABS: { href: string; label: string; needs: Capability }[] = [
  { href: "/admin", label: "Overview", needs: "analytics.view" },
  { href: "/admin/accounts", label: "Accounts", needs: "accounts.view" },
  { href: "/admin/games", label: "Games", needs: "games.config" },
  { href: "/admin/site", label: "Site", needs: "site.config" },
  { href: "/admin/audit", label: "Audit", needs: "audit.view" },
];

/**
 * Only shows tabs the role can actually use. This is a convenience, not a
 * control — the pages and the APIs behind them each re-check independently.
 */
export default function AdminNav({ capabilities }: { capabilities: Capability[] }) {
  const pathname = usePathname();
  const allowed = TABS.filter((t) => capabilities.includes(t.needs));

  return (
    <nav className="flex flex-wrap gap-1">
      {allowed.map((t) => {
        const active = t.href === "/admin" ? pathname === "/admin" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-3 py-1.5 text-[12px] font-bold transition ${
              active ? "bg-volt/15 text-volt" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

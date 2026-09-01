"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconHistory,
  IconHome,
  IconLive,
  IconOriginals,
  IconLife,
  IconRewards,
  IconSettings,
  IconSlots,
  IconTable,
} from "@/components/Icons";

type NavItem = {
  href: string;
  label: string;
  Icon: (p: { className?: string }) => JSX.Element;
};

const BROWSE: NavItem[] = [{ href: "/", label: "Home", Icon: IconHome }];

const CATEGORIES: NavItem[] = [
  { href: "/category/slots", label: "Slots", Icon: IconSlots },
  { href: "/category/table", label: "Table Games", Icon: IconTable },
  { href: "/category/live", label: "Live", Icon: IconLive },
  { href: "/category/originals", label: "Originals", Icon: IconOriginals },
];

const ACCOUNT: NavItem[] = [
  { href: "/life", label: "Life", Icon: IconLife },
  { href: "/rewards", label: "Rewards", Icon: IconRewards },
  { href: "/history", label: "History", Icon: IconHistory },
];

const STORAGE_KEY = "winit.sidebar";

export default function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const { status } = useSession();
  const signedOut = status === "unauthenticated";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const Section = ({ title, items, collapsed }: { title: string; items: NavItem[]; collapsed: boolean }) => (
    <div className="px-3">
      {!collapsed && (
        <p className="px-2 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </p>
      )}
      {collapsed && <div className="my-3 border-t border-white/5" />}
      <ul className="space-y-1">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                title={collapsed ? label : undefined}
                className={[
                  "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition",
                  active
                    ? "bg-volt/12 text-volt shadow-[inset_0_0_0_1px_rgba(46,139,255,0.28)]"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                  collapsed ? "justify-center" : "",
                ].join(" ")}
              >
                <Icon className={`h-5 w-5 shrink-0 ${active ? "text-volt" : ""}`} />
                {!collapsed && <span className="truncate">{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const panel = (collapsed: boolean) => (
    <div className="flex h-full flex-col">
      <div className={`flex items-center gap-2 px-4 py-4 ${collapsed ? "justify-center px-2" : ""}`}>
        <Link href="/" className="flex items-center" aria-label="WinIt home">
          <Wordmark compact={collapsed} />
        </Link>
        <button
          type="button"
          onClick={onCloseMobile}
          className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <IconClose />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto pb-4">
        <Section title="Browse" items={BROWSE} collapsed={collapsed} />
        <Section title="Games" items={CATEGORIES} collapsed={collapsed} />
        {signedOut ? (
          !collapsed && (
            <div className="px-3">
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-[12px] font-bold text-slate-200">Playing anonymously</p>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Browse every game for free. Sign in to place a bet.
                </p>
                <Link href="/signup" className="btn-primary mt-2.5 block py-1.5 text-center text-xs">
                  Sign up — it&apos;s free
                </Link>
              </div>
            </div>
          )
        ) : (
          <Section title="Account" items={ACCOUNT} collapsed={collapsed} />
        )}
      </nav>

      <div className="border-t border-white/5 px-3 py-3">
        <Link
          href="/settings"
          title={collapsed ? "Settings" : undefined}
          className={[
            "flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-semibold transition",
            isActive("/settings")
              ? "bg-volt/12 text-volt"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <IconSettings className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>

        <button
          type="button"
          onClick={toggle}
          className={`mt-1 hidden w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-white/5 hover:text-slate-200 lg:flex ${
            collapsed ? "justify-center" : ""
          }`}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
          {!collapsed && <span>Collapse</span>}
        </button>

        {!collapsed && (
          <p className="px-2.5 pb-1 pt-3 text-[10px] leading-relaxed text-slate-600">
            Play money only. No deposits, no withdrawals, no real-money path.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-white/5 bg-base-800/60 backdrop-blur transition-[width] duration-200 lg:block ${
          collapsed ? "w-[76px]" : "w-[248px]"
        }`}
      >
        {panel(collapsed)}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-black/70 transition-opacity ${mobileOpen ? "opacity-100" : "opacity-0"}`}
          onClick={onCloseMobile}
        />
        <div
          className={`absolute left-0 top-0 h-full w-[264px] border-r border-white/10 bg-base-800 transition-transform duration-200 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {panel(false)}
        </div>
      </div>
    </>
  );
}

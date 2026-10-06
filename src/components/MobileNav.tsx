"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IconChat, IconClose, IconHome, IconMenu, IconRewards, IconSearch, IconSports } from "@/components/Icons";
import SearchBox from "@/components/SearchBox";

/** Fired on window to open/close lobby chat from outside the Chat component. */
export const TOGGLE_CHAT_EVENT = "winit:toggle-chat";

/**
 * Phone-only bottom tab bar — the thumb-reach navigation every mobile casino
 * lobby uses. Hidden from lg up, where the sidebar and header do this job.
 * Publishes its own height as --mobilenav-h so the page and every other fixed
 * bar can sit above it instead of underneath.
 */
export default function MobileNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname() ?? "/";
  const ref = useRef<HTMLElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () =>
      document.documentElement.style.setProperty("--mobilenav-h", `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    window.addEventListener("resize", publish);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--mobilenav-h");
    };
  }, []);

  useEffect(() => setSearchOpen(false), [pathname]);

  const item = "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-bold tracking-wide";
  const on = "text-white";
  const off = "text-slate-500 active:text-slate-200";

  return (
    <>
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-base-900/98 backdrop-blur-md lg:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex items-center gap-2 border-b border-white/5 p-3">
            <div className="flex-1">
              <SearchBox autoFocus />
            </div>
            <button type="button" onClick={() => setSearchOpen(false)} className="rounded-lg p-2 text-slate-300" aria-label="Close search">
              <IconClose className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <nav
        ref={ref}
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-base-800/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <button type="button" onClick={onOpenMenu} className={`${item} ${off}`}>
          <IconMenu className="h-5 w-5" />
          Menu
        </button>
        <Link href="/" className={`${item} ${pathname === "/" ? on : off}`}>
          <IconHome className="h-5 w-5" />
          Casino
        </Link>
        <button type="button" onClick={() => setSearchOpen(true)} className={`${item} ${searchOpen ? on : off}`}>
          <IconSearch className="h-5 w-5" />
          Search
        </button>
        <Link href="/sports" className={`${item} ${pathname.startsWith("/sports") ? on : off}`}>
          <IconSports className="h-5 w-5" />
          Sports
        </Link>
        <Link href="/rewards" className={`${item} ${pathname.startsWith("/rewards") ? on : off}`}>
          <IconRewards className="h-5 w-5" />
          Rewards
        </Link>
        <button type="button" onClick={() => window.dispatchEvent(new Event(TOGGLE_CHAT_EVENT))} className={`${item} ${off}`}>
          <IconChat className="h-5 w-5" />
          Chat
        </button>
      </nav>
    </>
  );
}

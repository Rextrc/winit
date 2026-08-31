"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { IconHistory, IconLogout, IconRewards, IconSettings } from "@/components/Icons";
import { formatCents } from "@/lib/money";
import { useWallet } from "@/components/WalletProvider";

/** Deterministic hue from the username so every avatar is stable but distinct. */
function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export default function AvatarMenu() {
  const { data: session } = useSession();
  const { balanceCents } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const username = session?.user?.username ?? "player";
  const hue = hueFor(username);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-sm font-black text-base-900 transition hover:border-volt/40"
        style={{ background: `linear-gradient(140deg, hsl(${hue} 70% 62%), hsl(${(hue + 48) % 360} 70% 45%))` }}
        aria-label="Account menu"
        aria-expanded={open}
      >
        {username.slice(0, 2).toUpperCase()}
      </button>

      {open && (
        <div className="panel absolute right-0 top-[calc(100%+10px)] z-40 w-60 overflow-hidden p-1.5 shadow-tile">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-bold text-white">{username}</p>
            <p className="num mt-0.5 text-xs text-slate-400">
              {balanceCents === null ? "—" : formatCents(balanceCents)} play credits
            </p>
          </div>
          <div className="my-1 border-t border-white/5" />
          {[
            { href: "/rewards", label: "Rewards", Icon: IconRewards },
            { href: "/history", label: "Transaction log", Icon: IconHistory },
            { href: "/settings", label: "Settings", Icon: IconSettings },
          ].map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-white/5" />
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
          >
            <IconLogout className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

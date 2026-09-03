"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

type Data = {
  code: string;
  invited: { username: string; at: string | null }[];
  count: number;
  earnedCents: number;
  referrerBonusCents: number;
  refereeBonusCents: number;
  referredBy: string | null;
};

export default function ReferralPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/referral", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      // Leave the panel in its loading state rather than showing a wrong code.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function copy(what: "code" | "link", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard access can be refused; the code is on screen to read anyway.
    }
  }

  if (!data) return null;

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/signup?ref=${data.code}`;

  return (
    <div className="panel p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-volt">Invite a friend</p>
      <p className="mt-2 text-sm text-slate-400">
        They start with {formatCents(data.refereeBonusCents)} extra on top of the welcome grant, and
        you get {formatCents(data.referrerBonusCents)} the moment they sign up.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="num rounded-xl border border-volt/30 bg-volt/10 px-4 py-2.5 text-lg font-black tracking-[0.2em] text-volt">
          {data.code}
        </code>
        <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => copy("code", data.code)}>
          {copied === "code" ? "Copied" : "Copy code"}
        </button>
        <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => copy("link", link)}>
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/5 bg-base-900/60 p-3">
          <p className="label mb-0">Friends joined</p>
          <p className="num text-xl font-black text-white">{data.count}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-base-900/60 p-3">
          <p className="label mb-0">Earned from referrals</p>
          <p className="num text-xl font-black text-win">{formatCents(data.earnedCents)}</p>
        </div>
      </div>

      {data.referredBy && (
        <p className="mt-3 text-[11px] text-slate-500">
          You joined with <span className="font-bold text-slate-300">{data.referredBy}</span>&apos;s code.
        </p>
      )}

      {data.invited.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {data.invited.map((i) => (
            <li key={i.username} className="num rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300">
              {i.username}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

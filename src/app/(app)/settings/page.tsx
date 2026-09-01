import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SignOutButton from "@/components/SignOutButton";
import { PLAYABLE } from "@/lib/games/registry";
import {
  BASE_TABLE_LIMIT_CENTS,
  MIN_BET_CENTS,
  STARTING_BALANCE_CENTS,
  formatCents,
} from "@/lib/money";
import { fromDb } from "@/lib/bigmoney";
import { MAX_LEVEL, MAX_REBIRTHS, maxBetCents } from "@/lib/progression";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await currentUser();
  // The lobby and every game are open to anyone; this page has nothing to
  // show without an account, so it gates itself here instead.
  if (!user) redirect("/login?callbackUrl=/settings");

  const betCount = await prisma.transaction.count({ where: { userId: user.id, kind: "BET" } });

  const rows: [string, string][] = [
    ["Username", user.username],
    ["Email", user.email ?? "not set"],
    ["Member since", user.createdAt.toLocaleDateString()],
    ["Balance", `${formatCents(fromDb(user.balanceCents))} play credits`],
    ["Bets placed", betCount.toLocaleString()],
    ["Bonus streak", `${user.bonusStreak} day${user.bonusStreak === 1 ? "" : "s"}`],
  ];

  return (
    <>
      <header className="mb-6">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Your account and the house numbers behind it.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-6">
          <h2 className="text-[13px] font-black tracking-tight text-white">Account</h2>
          <dl className="mt-4 space-y-2.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-2.5">
                <dt className="text-[12px] uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="num text-right text-sm font-semibold text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5">
            <SignOutButton />
          </div>
        </div>

        <div className="panel p-6">
          <h2 className="text-[13px] font-black tracking-tight text-white">House limits &amp; odds</h2>

          <dl className="mt-4 space-y-2.5">
            {[
              ["Starting balance", formatCents(STARTING_BALANCE_CENTS)],
              ["Minimum bet", formatCents(MIN_BET_CENTS)],
              ["Base table limit", `${formatCents(BASE_TABLE_LIMIT_CENTS)} per bet`],
              ["Your table limit", `${formatCents(maxBetCents(user.level, user.rebirths))} per bet`],
              ["Ceiling at max rebirth", `${formatCents(maxBetCents(MAX_LEVEL, MAX_REBIRTHS))} per bet`],
              ["Randomness", "Node crypto CSPRNG"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b border-white/5 pb-2.5">
                <dt className="text-[12px] uppercase tracking-wide text-slate-500">{k}</dt>
                <dd className="num text-right text-sm font-semibold text-slate-100">{v}</dd>
              </div>
            ))}
          </dl>

          <h3 className="mt-5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Published RTP
          </h3>
          <ul className="mt-2 space-y-2">
            {PLAYABLE.map((g) => (
              <li key={g.slug} className="rounded-xl border border-white/5 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-bold text-slate-100">{g.name}</span>
                  <span className="num text-sm font-black text-volt">
                    {g.rtp === null ? "—" : `${(g.rtp * 100).toFixed(2)}%`}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{g.rtpNote}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel mt-4 p-6">
        <h2 className="text-[13px] font-black tracking-tight text-white">About this build</h2>
        <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-slate-400">
          WinIt is a portfolio project that simulates a casino end to end. Balances are integers in a
          local SQLite database and mean nothing outside this app. There is no payment processing, no
          deposit path, no withdrawal path and no conversion to real money anywhere in the codebase.
          Credit enters an account in exactly two ways — the sign-up grant and the daily bonus —
          and both are hard-coded constants the app mints for itself. Leveling and rebirth raise
          your table limit and unlock features, but pay no currency of their own.
        </p>
        <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-slate-400">
          If real gambling is causing you or someone you know harm, support is available — in the US,
          the National Problem Gambling Helpline is 1-800-522-4700.
        </p>
      </div>
    </>
  );
}

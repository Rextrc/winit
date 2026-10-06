"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCents } from "@/lib/money";

const NAMES = [
  "jaxon_22", "mikeyb", "Sarahh", "dlowe", "kingkobe", "TTrev", "lexi.m", "gr1ndset", "omarr",
  "nate_w", "BigCal", "jenn44", "Rico", "ashh_", "zayy", "tomkat", "mars.v", "kellz", "dante07",
  "bree", "Hollis", "smokeyjoe", "valx", "luca.r", "PJ", "monyb", "kev_in", "rayray", "elle9",
  "cash_carl", "noahh", "Tinaa", "frosty", "deshawn3", "milo", "Quinn", "bennyg", "yasi", "coop",
];
const HUES = [262, 200, 150, 30, 340, 190, 280, 10, 120, 50];

type Bot = { name: string; hue: number; betCents: number; target: number };

/** Picks a realistic stake: lots of small ones, the odd chunky one. */
function stake(): number {
  const r = Math.random();
  const dollars = r < 0.55 ? [1, 2, 5, 5, 10, 10, 20][Math.floor(Math.random() * 7)]
    : r < 0.9 ? [25, 40, 50, 75, 100][Math.floor(Math.random() * 5)]
    : [150, 250, 500, 1000][Math.floor(Math.random() * 4)];
  return dollars * 100;
}

/** Most people bail early; a few hold on for a moonshot. */
function target(): number {
  const r = Math.random();
  const t = r < 0.45 ? 1.15 + Math.random() * 0.75 : r < 0.85 ? 1.9 + Math.random() * 2.2 : 4 + Math.random() * 16;
  return Math.round(t * 100) / 100;
}

function pickBots(): Bot[] {
  // Usually 3–5 people; now and then a busier round.
  const n = Math.random() < 0.82 ? 3 + Math.floor(Math.random() * 3) : 6 + Math.floor(Math.random() * 3);
  const pool = [...NAMES].sort(() => Math.random() - 0.5).slice(0, n);
  return pool.map((name, i) => ({ name, hue: HUES[(name.length * 7 + i) % HUES.length], betCents: stake(), target: target() }));
}

/**
 * The other people in the round. Each has a stake and a secret cash-out
 * point; as the live multiplier passes it they cash out, and anyone still
 * in when it crashes goes down with it.
 */
export default function CrashPlayers({
  roundKey,
  display,
  phase,
}: {
  roundKey: number;
  display: number;
  phase: "idle" | "flying" | "crashed" | "cashed";
}) {
  const [bots, setBots] = useState<Bot[]>([]);
  const [peak, setPeak] = useState(1);

  useEffect(() => {
    setBots(pickBots());
    setPeak(1);
  }, [roundKey]);

  useEffect(() => {
    if (phase !== "idle") setPeak((p) => Math.max(p, display));
  }, [display, phase]);

  // If the player cashes out early the round keeps "going" for everyone else
  // in principle, but we stop the clock there — so treat a cashed round as
  // over at the displayed point too, without busting anyone who's still in.
  const over = phase === "crashed" || phase === "cashed";

  const rows = useMemo(
    () =>
      bots
        .map((b) => {
          const out = phase !== "idle" && peak >= b.target;
          const bust = phase === "crashed" && !out;
          return { ...b, out, bust };
        })
        .sort((a, b) => b.betCents - a.betCents),
    [bots, peak, phase],
  );

  if (rows.length === 0) return null;
  const totalCents = rows.reduce((s, r) => s + r.betCents, 0);

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-base-900/60 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${phase === "flying" ? "animate-pulse bg-win" : "bg-slate-600"}`} />
          {rows.length} playing
        </span>
        <span className="num normal-case tracking-normal">{formatCents(totalCents)} wagered</span>
      </div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li
            key={r.name}
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
              r.out ? "bg-win/[0.07]" : r.bust ? "bg-loss/[0.06]" : ""
            }`}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-black text-base-900"
              style={{ background: `linear-gradient(140deg, hsl(${r.hue} 70% 62%), hsl(${(r.hue + 48) % 360} 70% 45%))` }}
            >
              {r.name.replace(/[^a-z]/gi, "").slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">{r.name}</span>
            <span className="num w-16 text-right text-slate-400 sm:w-20">{formatCents(r.betCents)}</span>
            <span className="num w-12 text-right font-bold sm:w-14">
              {r.out ? <span className="text-win">{r.target.toFixed(2)}x</span> : r.bust ? <span className="text-loss">—</span> : <span className="text-slate-600">…</span>}
            </span>
            <span className="num w-[72px] text-right font-bold sm:w-24">
              {r.out ? (
                <span className="text-win">+{formatCents(Math.round(r.betCents * r.target) - r.betCents)}</span>
              ) : r.bust ? (
                <span className="text-loss">-{formatCents(r.betCents)}</span>
              ) : over ? (
                <span className="text-slate-500">in play</span>
              ) : (
                <span className="text-slate-600" />
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

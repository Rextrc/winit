"use client";

import { useState } from "react";
import { formatCents } from "@/lib/money";

export type VenueRow = {
  id: string;
  name: string;
  city: string;
  blurb: string;
  art: string;
  minLevel: number;
  minBankrollCents: number;
  tableMinCents: number;
  travelCostCents: number;
  here: boolean;
  open: boolean;
  closedReason: string | null;
  affordable: boolean;
};

/**
 * The circuit. Rooms are strictly a floor, a door and a fare — never odds, so
 * the copy here says so out loud rather than letting anyone assume the high
 * rooms pay better.
 */
export default function VenueMap({
  venues,
  frozen,
  onTravelled,
}: {
  venues: VenueRow[];
  frozen: boolean;
  onTravelled: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const travel = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/life/travel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That trip didn't happen.");
        return;
      }
      await onTravelled();
    } catch {
      setError("Network error — you didn't go anywhere.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel p-6">
      <h3 className="text-[13px] font-black tracking-tight text-white">The circuit</h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        Every room deals the same games at the same published RTP — a bigger room does not pay
        better and never will. What changes is the smallest bet the floor will take, which is the
        real cost of moving up.
      </p>

      {error && <p className="mt-3 text-[12px] font-semibold text-loss">{error}</p>}

      <ol className="mt-4 space-y-2">
        {venues.map((v) => {
          const canGo = !frozen && v.open && v.affordable && !v.here;
          return (
            <li
              key={v.id}
              className={`overflow-hidden rounded-xl border transition ${
                v.here ? "border-volt bg-volt/10" : v.open ? "border-white/10" : "border-white/5 opacity-60"
              }`}
            >
              <div className={`flex flex-wrap items-start gap-3 bg-gradient-to-r ${v.art} p-3.5`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[14px] font-black tracking-tight text-white">{v.name}</span>
                    <span className="text-[11px] text-slate-400">{v.city}</span>
                    {v.here && (
                      <span className="rounded-full bg-volt px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                        You are here
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-400">{v.blurb}</p>

                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                    <Pair k="Min bet" v={formatCents(v.tableMinCents)} />
                    <Pair k="Door" v={`Level ${v.minLevel}`} />
                    <Pair k="Bankroll" v={formatCents(v.minBankrollCents)} />
                    <Pair k="Fare" v={v.travelCostCents === 0 ? "free" : formatCents(v.travelCostCents)} />
                  </dl>

                  {!v.open && v.closedReason && (
                    <p className="mt-1.5 text-[10px] font-semibold text-loss">{v.closedReason}</p>
                  )}
                  {v.open && !v.affordable && !v.here && (
                    <p className="mt-1.5 text-[10px] font-semibold text-amber-400">
                      The door is open but you cannot cover the fare.
                    </p>
                  )}
                </div>

                {!v.here && (
                  <button
                    type="button"
                    onClick={() => travel(v.id)}
                    disabled={!canGo || busy !== null}
                    className="btn-ghost shrink-0 px-3 py-1.5 text-[11px]"
                  >
                    {busy === v.id ? "Travelling…" : "Travel"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className="num font-bold text-slate-200">{v}</dd>
    </div>
  );
}

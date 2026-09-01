"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

type Row = {
  slug: string; name: string; enabled: boolean;
  minBetCentsOverride: number | null; maxBetCentsOverride: number | null;
  disabledNote: string | null;
};

export default function GameConfigPanel({ role }: { role: string | null }) {
  const reasonOptional = role === "OWNER";
  const [games, setGames] = useState<Row[] | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/games", { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't load game configuration.");
        return;
      }
      setGames((await res.json()).games as Row[]);
      setError(null);
    } catch {
      setError("Network error.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(
    async (payload: Record<string, unknown>) => {
      // An owner may leave the reason blank; the API records "no reason given"
      // in the audit entry rather than refusing the change. Everyone else has
      // to state one, and the API enforces that independently of this check.
      if (!reasonOptional && reason.trim().length < 3) {
        setError("Enter a reason — every configuration change is recorded with one.");
        return;
      }
      setBusy(String(payload.slug));
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/admin/games", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, reason }),
        });
        const d = await res.json();
        if (!res.ok) { setError(d.error ?? "That change failed."); return; }
        setGames(d.games as Row[]);
        setNotice(`Updated ${payload.slug}.`);
        setReason("");
      } catch {
        setError("Network error — nothing changed.");
      } finally {
        setBusy(null);
      }
    },
    [reason, reasonOptional],
  );

  if (!games) return <p className="text-sm text-slate-500">{error ?? "Loading…"}</p>;

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="game-reason">Reason {reasonOptional ? "(optional for owners)" : "(required for any change)"}</label>
        <input id="game-reason" className="field max-w-xl" value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="e.g. closing while the paytable retune ships" />
      </div>

      {notice && <p className="text-[12px] font-semibold text-win">{notice}</p>}
      {error && <p className="text-[12px] font-semibold text-loss">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-2.5 font-bold">Game</th>
              <th className="px-4 py-2.5 font-bold">State</th>
              <th className="px-4 py-2.5 font-bold">Min override</th>
              <th className="px-4 py-2.5 font-bold">Max override</th>
              <th className="px-4 py-2.5 text-right font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {games.map((g) => (
              <tr key={g.slug} className={g.enabled ? "" : "bg-loss/5"}>
                <td className="px-4 py-2.5">
                  <span className="font-bold text-slate-100">{g.name}</span>
                  <span className="block text-[10px] text-slate-600">{g.slug}</span>
                </td>
                <td className="px-4 py-2.5">
                  {g.enabled ? <span className="text-win">Open</span> : <span className="text-loss">Closed</span>}
                </td>
                <td className="num px-4 py-2.5 text-slate-300">
                  {g.minBetCentsOverride === null ? "—" : formatCents(g.minBetCentsOverride)}
                </td>
                <td className="num px-4 py-2.5 text-slate-300">
                  {g.maxBetCentsOverride === null ? "—" : formatCents(g.maxBetCentsOverride)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button type="button" disabled={busy === g.slug}
                    className={`btn-ghost px-3 py-1.5 text-[11px] ${g.enabled ? "text-loss" : "text-win"}`}
                    onClick={() => save({ slug: g.slug, enabled: !g.enabled })}>
                    {busy === g.slug ? "…" : g.enabled ? "Close table" : "Reopen"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type Entry = {
  id: string; actorUsername: string; actorRole: string; action: string;
  targetUsername: string | null; field: string | null;
  oldValue: string | null; newValue: string | null; reason: string; createdAt: string;
};

export default function AuditPanel() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [actions, setActions] = useState<{ action: string; count: number }[]>([]);
  const [filter, setFilter] = useState({ actor: "", target: "", action: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter.actor) params.set("actor", filter.actor);
      if (filter.target) params.set("target", filter.target);
      if (filter.action) params.set("action", filter.action);
      const res = await fetch(`/api/admin/audit?${params}`, { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't load the audit log.");
        return;
      }
      const data = await res.json();
      setEntries(data.entries as Entry[]);
      setActions(data.actions);
      setError(null);
    } catch {
      setError("Network error.");
    }
  }, [filter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className="field max-w-[200px]" placeholder="Actor" value={filter.actor}
          onChange={(e) => setFilter({ ...filter, actor: e.target.value })} />
        <input className="field max-w-[200px]" placeholder="Target" value={filter.target}
          onChange={(e) => setFilter({ ...filter, target: e.target.value })} />
        <select className="field max-w-[240px]" value={filter.action}
          onChange={(e) => setFilter({ ...filter, action: e.target.value })}>
          <option value="">Every action</option>
          {actions.map((a) => <option key={a.action} value={a.action}>{a.action} ({a.count})</option>)}
        </select>
      </div>

      {error && <p className="text-[12px] font-semibold text-loss">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-2.5 font-bold">When</th>
              <th className="px-4 py-2.5 font-bold">Who</th>
              <th className="px-4 py-2.5 font-bold">Action</th>
              <th className="px-4 py-2.5 font-bold">Target</th>
              <th className="px-4 py-2.5 font-bold">Change</th>
              <th className="px-4 py-2.5 font-bold">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(entries ?? []).map((e) => (
              <tr key={e.id} className="hover:bg-white/[0.03]">
                <td className="whitespace-nowrap px-4 py-2.5 text-[11px] text-slate-500">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2.5">
                  <span className="font-bold text-slate-100">{e.actorUsername}</span>
                  <span className="ml-1.5 text-[10px] font-black uppercase text-volt">{e.actorRole}</span>
                </td>
                <td className="px-4 py-2.5 font-semibold text-volt">{e.action}</td>
                <td className="px-4 py-2.5 text-slate-300">{e.targetUsername ?? "—"}</td>
                <td className="num px-4 py-2.5 text-slate-400">
                  {e.field ? <>{e.field}: {e.oldValue ?? "—"} → {e.newValue ?? "—"}</> : "—"}
                </td>
                <td className="px-4 py-2.5 text-slate-400">{e.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries !== null && entries.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No entries match.</p>
        )}
        {entries === null && <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>}
      </div>
    </div>
  );
}

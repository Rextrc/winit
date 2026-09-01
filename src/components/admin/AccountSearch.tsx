"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

type Row = {
  id: string; username: string; email: string | null; balanceCents: number;
  level: number; rebirths: number; reputation: number; repTier: string; vip: string;
  adminRole: string | null; suspended: boolean; deleted: boolean;
  lastSeenAt: string | null; createdAt: string; betsThisLife: number; careerOver: boolean;
};

export default function AccountSearch() {
  const [q, setQ] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", reason: "", testAccount: true });
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ q, ...(includeDeleted ? { deleted: "1" } : {}) });
      const res = await fetch(`/api/admin/accounts?${params}`, { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't search.");
        return;
      }
      const data = await res.json();
      setRows(data.accounts as Row[]);
      setError(null);
    } catch {
      setError("Network error.");
    }
  }, [q, includeDeleted]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const create = useCallback(async () => {
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create that account.");
        return;
      }
      setNotice(
        `Created ${data.account.username}${form.testAccount ? " — loaded test account" : ""}. ` +
          `Balance ${formatCents(data.account.balanceCents)}, level ${data.account.level}.`,
      );
      setForm({ username: "", password: "", reason: "", testAccount: true });
      setCreating(false);
      await load();
    } catch {
      setError("Network error.");
    }
  }, [form, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="field max-w-sm"
          placeholder="Username, email or id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-[12px] text-slate-400">
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
          Include deleted
        </label>
        <button type="button" onClick={() => setCreating((c) => !c)} className="btn-ghost ml-auto px-3 py-2 text-xs">
          {creating ? "Cancel" : "Create account"}
        </button>
      </div>

      {creating && (
        <div className="panel space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="new-username">Username</label>
              <input id="new-username" className="field" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="new-password">Password</label>
              <input id="new-password" type="password" className="field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="new-reason">Reason</label>
              <input id="new-reason" className="field" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-slate-300">
            <input type="checkbox" checked={form.testAccount} onChange={(e) => setForm({ ...form, testAccount: e.target.checked })} />
            Loaded test account — 1,000,000.00, level 50, Black VIP, every room visited
          </label>
          <button type="button" onClick={create} className="btn-primary px-4 py-2 text-sm">Create</button>
        </div>
      )}

      {notice && <p className="text-[12px] font-semibold text-win">{notice}</p>}
      {error && <p className="text-[12px] font-semibold text-loss">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="px-4 py-2.5 font-bold">Account</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 text-right font-bold">Balance</th>
              <th className="px-4 py-2.5 text-right font-bold">Level</th>
              <th className="px-4 py-2.5 font-bold">Reputation</th>
              <th className="px-4 py-2.5 font-bold">VIP</th>
              <th className="px-4 py-2.5 text-right font-bold">Bets</th>
              <th className="px-4 py-2.5 font-bold">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(rows ?? []).map((r) => (
              <tr key={r.id} className="hover:bg-white/[0.03]">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/accounts/${r.id}`} className="font-bold text-volt hover:underline">
                    {r.username}
                  </Link>
                  {r.adminRole && (
                    <span className="ml-2 rounded bg-loss/20 px-1.5 py-0.5 text-[9px] font-black uppercase text-loss">
                      {r.adminRole}
                    </span>
                  )}
                  {r.email && <span className="block text-[10px] text-slate-600">{r.email}</span>}
                </td>
                <td className="px-4 py-2.5">
                  {r.deleted ? (
                    <span className="text-loss">Deleted</span>
                  ) : r.suspended ? (
                    <span className="text-amber-400">Suspended</span>
                  ) : r.careerOver ? (
                    <span className="text-slate-400">Career over</span>
                  ) : (
                    <span className="text-win">Active</span>
                  )}
                </td>
                <td className="num px-4 py-2.5 text-right text-slate-200">{formatCents(r.balanceCents)}</td>
                <td className="num px-4 py-2.5 text-right text-slate-300">
                  {r.level}
                  {r.rebirths > 0 && <span className="ml-1 text-[10px] text-fuchsia-300">R{r.rebirths}</span>}
                </td>
                <td className="px-4 py-2.5 text-slate-400">{r.repTier}</td>
                <td className="px-4 py-2.5 text-slate-400">{r.vip}</td>
                <td className="num px-4 py-2.5 text-right text-slate-400">{r.betsThisLife.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-[11px] text-slate-500">
                  {r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString() : "never"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows !== null && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No accounts matched.</p>
        )}
        {rows === null && <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>}
      </div>
    </div>
  );
}

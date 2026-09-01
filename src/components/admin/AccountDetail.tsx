"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatCents, formatSignedCents } from "@/lib/money";
import { ROLES } from "@/lib/admin/roles";
import type { Capability } from "@/lib/admin/roles";

type Detail = {
  viewerCapabilities: Capability[];
  account: {
    id: string; username: string; email: string | null; createdAt: string; lastSeenAt: string | null;
    adminRole: string | null; suspended: boolean; suspendedReason: string | null; deleted: boolean;
    balanceCents: number; peakBalanceCents: number; lifetimeWageredCents: number;
    lifetimeWonCents: number; biggestWinCents: number; bestMultiplier: number;
    progression: { level: number; xp: number; xpToNext: number; rebirths: number; maxBetCents: number; stage: { title: string } };
    career: { age: number; over: boolean; deathCause: string | null; venueName: string; betsThisLife: number; comebacksLeft: number; livesLived: number };
    reputation: { points: number; tier: { name: string } };
    vip: { tier: { name: string; level: number } };
    venuesVisited: string[];
    bonusStreak: number;
  };
  gameStats: { game: string; bets: number; wins: number; wageredCents: number; wonCents: number; biggestWinCents: number }[];
  achievements: { key: string; unlockedAt: string }[];
  transactions: { id: string; game: string; kind: string; betCents: number; payoutCents: number; netCents: number; summary: string; balanceAfterCents: number; createdAt: string }[];
  events: { id: string; key: string; status: string; outcomeText: string | null; netCents: number; createdAt: string }[];
  lives: { ordinal: number; cause: string; ageAtEnd: number; epitaph: string }[];
  activeRounds: { id: string; game: string; betCents: number }[];
  staffActions: { id: string; actorUsername: string; actorRole: string; action: string; field: string | null; oldValue: string | null; newValue: string | null; reason: string; createdAt: string }[];
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="num mt-0.5 text-[13px] font-bold text-slate-100">{value}</p>
    </div>
  );
}

export default function AccountDetail({ id, role, viewerId }: { id: string; role: string | null; viewerId: string | null }) {
  const reasonOptional = role === "OWNER";
  const isSelf = viewerId != null && viewerId === id;
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/accounts/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't load that account.");
        return;
      }
      setData((await res.json()) as Detail);
      setError(null);
    } catch {
      setError("Network error.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Every mutation goes through here so the reason is always attached and the
   * result is always reloaded from the server rather than patched locally —
   * what the screen shows is what the database says.
   */
  const act = useCallback(
    async (payload: Record<string, unknown>, confirmMessage?: string) => {
      // An owner may leave the reason blank; the API records "no reason given"
      // in the audit entry rather than refusing the change. Everyone else has
      // to state one, and the API enforces that independently of this check.
      if (!reasonOptional && reason.trim().length < 3) {
        setError("Enter a reason first — every staff action is recorded with one.");
        return;
      }
      if (confirmMessage && !window.confirm(`${confirmMessage}\n\nReason: ${reason}`)) return;

      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/admin/accounts/${id}/mutate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, reason }),
        });
        const d = await res.json();
        if (!res.ok) {
          setError(d.error ?? "That action failed.");
          return;
        }
        setNotice(`Done: ${String(payload.action)}`);
        setReason("");
        await load();
      } catch {
        setError("Network error — nothing changed.");
      } finally {
        setBusy(false);
      }
    },
    [id, reason, reasonOptional, load],
  );

  if (error && !data) return <p className="text-sm text-loss">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const a = data.account;
  const caps = data.viewerCapabilities;
  const has = (c: Capability) => caps.includes(c);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/accounts" className="text-[11px] font-semibold text-slate-500 hover:text-volt">
            ← All accounts
          </Link>
          <h1 className="font-display mt-1 text-2xl font-black tracking-tight text-white">
            {a.username}
            {isSelf && (
              <span className="ml-2 rounded bg-volt/20 px-2 py-0.5 align-middle text-[10px] font-black uppercase text-volt">
                You
              </span>
            )}
            {a.adminRole && (
              <span className="ml-2 rounded bg-loss/20 px-2 py-0.5 align-middle text-[10px] font-black uppercase text-loss">
                {a.adminRole}
              </span>
            )}
          </h1>
          <p className="text-[12px] text-slate-500">
            {a.id} · joined {new Date(a.createdAt).toLocaleDateString()} ·{" "}
            {a.lastSeenAt ? `last seen ${new Date(a.lastSeenAt).toLocaleString()}` : "never seen"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.deleted && <span className="rounded-lg bg-loss/15 px-3 py-1.5 text-[11px] font-black uppercase text-loss">Deleted</span>}
          {a.suspended && <span className="rounded-lg bg-amber-400/15 px-3 py-1.5 text-[11px] font-black uppercase text-amber-400">Suspended</span>}
          {a.career.over && <span className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase text-slate-300">Career over</span>}
        </div>
      </div>

      {a.suspended && a.suspendedReason && (
        <p className="panel border-amber-400/30 bg-amber-400/5 p-3 text-[12px] text-amber-200">
          Suspension reason: {a.suspendedReason}
        </p>
      )}

      <div className="panel grid grid-cols-2 gap-4 p-5 lg:grid-cols-6">
        <Field label="Balance" value={formatCents(a.balanceCents)} />
        <Field label="Peak" value={formatCents(a.peakBalanceCents)} />
        <Field label="Level" value={`${a.progression.level}${a.progression.rebirths ? ` · R${a.progression.rebirths}` : ""}`} />
        <Field label="Reputation" value={`${a.reputation.points.toLocaleString()} · ${a.reputation.tier.name}`} />
        <Field label="VIP" value={a.vip.tier.name} />
        <Field label="Table limit" value={formatCents(a.progression.maxBetCents)} />
        <Field label="Age" value={`${a.career.age}`} />
        <Field label="Room" value={a.career.venueName} />
        <Field label="Bets this life" value={a.career.betsThisLife.toLocaleString()} />
        <Field label="Comebacks left" value={`${a.career.comebacksLeft}`} />
        <Field label="Lives lived" value={`${a.career.livesLived}`} />
        <Field label="Lifetime staked" value={formatCents(a.lifetimeWageredCents)} />
      </div>

      {/* ------------------------------------------------------------- actions */}
      <div className="panel p-5">
        <h3 className="text-[13px] font-black text-white">Actions</h3>
        <p className="mt-1 text-[11px] text-slate-500">
          Every action below is recorded in the audit log with your name, the old and new value, and
          this reason. The server re-checks your role on each one.
        </p>

        <div className="mt-3">
          <label className="label" htmlFor="reason">Reason {reasonOptional ? "(optional for owners)" : "(required)"}</label>
          <input
            id="reason"
            className="field"
            placeholder="e.g. compensating for a stuck round reported in ticket 412"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        {notice && <p className="mt-3 text-[12px] font-semibold text-win">{notice}</p>}
        {error && <p className="mt-3 text-[12px] font-semibold text-loss">{error}</p>}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {has("accounts.economy") && (
            <ActionGroup title="Money">
              <AmountAction label="Grant" placeholder="e.g. 500.00" busy={busy}
                onRun={(v) => act({ action: "balance.grant", cents: Math.round(v * 100) })} />
              <AmountAction label="Remove" placeholder="e.g. 250.00" busy={busy}
                onRun={(v) => act({ action: "balance.grant", cents: -Math.round(v * 100) })} />
              <AmountAction label="Set exactly" placeholder="e.g. 1000.00" busy={busy} danger
                onRun={(v) => act({ action: "balance.set", cents: Math.round(v * 100), confirm: true }, `Set ${a.username}'s balance to ${v.toFixed(2)}?`)} />
            </ActionGroup>
          )}

          {has("accounts.progression") && (
            <ActionGroup title="Progression">
              <AmountAction label="Grant XP" placeholder="e.g. 5000" busy={busy} integer
                onRun={(v) => act({ action: "xp.grant", xp: Math.round(v) })} />
              <AmountAction label="Set level" placeholder="1-50" busy={busy} integer
                onRun={(v) => act({ action: "level.set", level: Math.round(v) })} />
              <AmountAction label="Set reputation" placeholder="e.g. 20000" busy={busy} integer
                onRun={(v) => act({ action: "reputation.set", points: Math.round(v) })} />
              <AmountAction label="Set VIP tier" placeholder="0-6" busy={busy} integer
                onRun={(v) => act({ action: "vip.set", level: Math.round(v) })} />
              <AmountAction label="Set prestige" placeholder="0-10" busy={busy} integer
                onRun={(v) => act({ action: "prestige.set", rebirths: Math.round(v) })} />
              <button type="button" disabled={busy} className="btn-ghost w-full py-2 text-xs text-loss"
                onClick={() => act({ action: "progression.reset", confirm: true }, `Wipe ${a.username}'s progression? Money is not touched.`)}>
                Reset progression
              </button>
            </ActionGroup>
          )}

          {has("accounts.unlocks") && (
            <ActionGroup title="Unlocks">
              <TextAction label="Grant achievement" placeholder="achievement key" busy={busy}
                onRun={(v) => act({ action: "achievement.grant", key: v })} />
              <TextAction label="Revoke achievement" placeholder="achievement key" busy={busy}
                onRun={(v) => act({ action: "achievement.revoke", key: v })} />
              <TextAction label="Unlock room" placeholder="venue id, e.g. the-vault" busy={busy}
                onRun={(v) => act({ action: "venue.unlock", venueId: v })} />
            </ActionGroup>
          )}

          {has("accounts.suspend") && (
            <ActionGroup title="Moderation">
              {a.suspended ? (
                <button type="button" disabled={busy} className="btn-ghost w-full py-2 text-xs"
                  onClick={() => act({ action: "unsuspend" })}>Unsuspend</button>
              ) : (
                <button type="button" disabled={busy} className="btn-ghost w-full py-2 text-xs text-amber-400"
                  onClick={() => act({ action: "suspend" })}>Suspend</button>
              )}
            </ActionGroup>
          )}

          {has("accounts.delete") && (
            <ActionGroup title="Lifecycle">
              {a.deleted ? (
                <button type="button" disabled={busy} className="btn-ghost w-full py-2 text-xs"
                  onClick={() => act({ action: "restore" })}>Restore</button>
              ) : (
                <button type="button" disabled={busy} className="btn-ghost w-full py-2 text-xs text-loss"
                  onClick={() => act({ action: "delete", confirm: true }, `Soft-delete ${a.username}? History is kept and it can be restored.`)}>
                  Delete
                </button>
              )}
            </ActionGroup>
          )}

          {has("roles.manage") && (
            <ActionGroup title="Staff role">
              <select
                className="field"
                defaultValue={a.adminRole ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const v = e.target.value === "" ? null : e.target.value;
                  void act({ action: "role.set", role: v, confirm: true }, `Set ${a.username}'s role to ${v ?? "none"}?`);
                }}
              >
                <option value="">No role (player)</option>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </ActionGroup>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="text-[13px] font-black text-white">Per-game record</h3>
          <table className="mt-3 w-full text-left text-[12px]">
            <thead><tr className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
              <th className="py-1 font-bold">Game</th><th className="py-1 text-right font-bold">Bets</th>
              <th className="py-1 text-right font-bold">Wins</th><th className="py-1 text-right font-bold">Staked</th>
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {data.gameStats.map((g) => (
                <tr key={g.game}>
                  <td className="py-1.5 text-slate-200">{g.game}</td>
                  <td className="num py-1.5 text-right text-slate-300">{g.bets}</td>
                  <td className="num py-1.5 text-right text-slate-300">{g.wins}</td>
                  <td className="num py-1.5 text-right text-slate-300">{formatCents(g.wageredCents)}</td>
                </tr>
              ))}
              {data.gameStats.length === 0 && <tr><td colSpan={4} className="py-3 text-slate-500">No bets yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="panel p-5">
          <h3 className="text-[13px] font-black text-white">Staff actions on this account</h3>
          <ul className="mt-3 space-y-2">
            {data.staffActions.map((s) => (
              <li key={s.id} className="border-l-2 border-volt/40 pl-2.5 text-[12px]">
                <span className="font-bold text-slate-100">{s.actorUsername}</span>
                <span className="ml-1.5 text-volt">{s.action}</span>
                {s.field && (
                  <span className="ml-1.5 num text-slate-400">
                    {s.oldValue ?? "—"} → {s.newValue ?? "—"}
                  </span>
                )}
                <span className="block text-[11px] text-slate-500">{s.reason}</span>
                <span className="block text-[10px] text-slate-600">{new Date(s.createdAt).toLocaleString()}</span>
              </li>
            ))}
            {data.staffActions.length === 0 && <li className="text-[12px] text-slate-500">None.</li>}
          </ul>
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="text-[13px] font-black text-white">Recent transactions</h3>
        <table className="mt-3 w-full text-left text-[12px]">
          <thead><tr className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
            <th className="py-1 font-bold">When</th><th className="py-1 font-bold">Kind</th>
            <th className="py-1 font-bold">Summary</th><th className="py-1 text-right font-bold">Net</th>
            <th className="py-1 text-right font-bold">Balance</th>
          </tr></thead>
          <tbody className="divide-y divide-white/5">
            {data.transactions.map((t) => (
              <tr key={t.id}>
                <td className="py-1.5 text-[11px] text-slate-500">{new Date(t.createdAt).toLocaleTimeString()}</td>
                <td className="py-1.5"><span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{t.kind}</span></td>
                <td className="py-1.5 text-slate-400">{t.summary}</td>
                <td className={`num py-1.5 text-right ${t.netCents > 0 ? "text-win" : t.netCents < 0 ? "text-loss" : "text-slate-400"}`}>
                  {formatSignedCents(t.netCents)}
                </td>
                <td className="num py-1.5 text-right text-slate-300">{formatCents(t.balanceAfterCents)}</td>
              </tr>
            ))}
            {data.transactions.length === 0 && <tr><td colSpan={5} className="py-3 text-slate-500">Nothing yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ActionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 p-3.5">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AmountAction({
  label, placeholder, onRun, busy, danger = false, integer = false,
}: {
  label: string; placeholder: string; onRun: (value: number) => void;
  busy: boolean; danger?: boolean; integer?: boolean;
}) {
  const [value, setValue] = useState("");
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(n) && n >= 0 && (!integer || Number.isInteger(n));

  return (
    <div className="flex gap-1.5">
      <input
        className="field flex-1 py-1.5 text-[12px]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
      />
      <button
        type="button"
        disabled={busy || !valid}
        onClick={() => { onRun(n); setValue(""); }}
        className={`btn-ghost shrink-0 px-2.5 py-1.5 text-[11px] ${danger ? "text-loss" : ""}`}
      >
        {label}
      </button>
    </div>
  );
}

function TextAction({
  label, placeholder, onRun, busy,
}: { label: string; placeholder: string; onRun: (value: string) => void; busy: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-1.5">
      <input className="field flex-1 py-1.5 text-[12px]" placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="button" disabled={busy || value.trim() === ""} onClick={() => { onRun(value.trim()); setValue(""); }}
        className="btn-ghost shrink-0 px-2.5 py-1.5 text-[11px]">
        {label}
      </button>
    </div>
  );
}

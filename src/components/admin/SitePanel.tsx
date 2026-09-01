"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";
import { GRANT_KINDS, MONEY_GRANTS, XP_GRANTS, type GrantKind } from "@/lib/admin/grants";

type Flag = { key: string; value: string; updatedAt: string };
type Promo = {
  id: string; code: string; grantCents: number; grantXp: number;
  maxRedemptions: number; redeemedCount: number; active: boolean; createdBy: string;
};
type Announcement = { id: string; title: string; body: string; level: string; targetId: string | null; active: boolean; createdBy: string; createdAt: string };

const MAINTENANCE = "site.maintenance";

export default function SitePanel({ role }: { role: string | null }) {
  const reasonOptional = role === "OWNER";
  const [flags, setFlags] = useState<Flag[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [flagForm, setFlagForm] = useState({ key: "", value: "" });
  // The two amounts are held as strings so the field can be typed into freely.
  // The preset dropdowns just write into them; whatever ends up in the box is
  // what gets sent, and the API bounds it either way.
  const [promoForm, setPromoForm] = useState<{
    code: string; kind: GrantKind; grant: string; xp: string; max: string;
  }>({ code: "", kind: "money", grant: String(MONEY_GRANTS[1]), xp: String(XP_GRANTS[1]), max: "0" });
  const [annForm, setAnnForm] = useState({ title: "", body: "", targetUsername: "" });

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch("/api/admin/flags", { cache: "no-store" }),
      fetch("/api/admin/promo", { cache: "no-store" }),
      fetch("/api/admin/announcements", { cache: "no-store" }),
    ]);
    if (results[0].status === "fulfilled" && results[0].value.ok) {
      setFlags((await results[0].value.json()).flags);
    }
    if (results[1].status === "fulfilled" && results[1].value.ok) {
      setPromos((await results[1].value.json()).codes);
    }
    if (results[2].status === "fulfilled" && results[2].value.ok) {
      setAnnouncements((await results[2].value.json()).announcements);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const post = useCallback(
    async (url: string, payload: Record<string, unknown>, confirmMessage?: string) => {
      // An owner may leave the reason blank; the API records "no reason given"
      // in the audit entry rather than refusing the change. Everyone else has
      // to state one, and the API enforces that independently of this check.
      if (!reasonOptional && reason.trim().length < 3) {
        setError("Enter a reason — every change here is recorded with one.");
        return false;
      }
      if (confirmMessage && !window.confirm(`${confirmMessage}\n\nReason: ${reason}`)) return false;
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, reason }),
        });
        const d = await res.json();
        if (!res.ok) { setError(d.error ?? "That change failed."); return false; }
        setNotice("Saved.");
        setReason("");
        await load();
        return true;
      } catch {
        setError("Network error — nothing changed.");
        return false;
      }
    },
    [reason, reasonOptional, load],
  );

  const maintenanceOn = flags.find((f) => f.key === MAINTENANCE)?.value === "true";

  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="site-reason">Reason {reasonOptional ? "(optional for owners)" : "(required for any change)"}</label>
        <input id="site-reason" className="field max-w-xl" value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="e.g. deploying the tournament build" />
      </div>
      {notice && <p className="text-[12px] font-semibold text-win">{notice}</p>}
      {error && <p className="text-[12px] font-semibold text-loss">{error}</p>}

      <div className={`panel p-5 ${maintenanceOn ? "border-loss/40 bg-loss/5" : ""}`}>
        <h3 className="text-[13px] font-black text-white">Maintenance mode</h3>
        <p className="mt-1 text-[12px] text-slate-400">
          Closes the floor to every player at once. Staff are deliberately let through, so the app can
          be checked before it reopens.
        </p>
        <p className="num mt-2 text-[13px] font-black">
          Currently: <span className={maintenanceOn ? "text-loss" : "text-win"}>{maintenanceOn ? "ON" : "off"}</span>
        </p>
        <button type="button" className={`btn-ghost mt-3 px-4 py-2 text-xs ${maintenanceOn ? "text-win" : "text-loss"}`}
          onClick={() => post("/api/admin/flags", { key: MAINTENANCE, value: maintenanceOn ? "false" : "true", confirm: true },
            maintenanceOn ? "Reopen the site to players?" : "Close the site to ALL players?")}>
          {maintenanceOn ? "Reopen the site" : "Enter maintenance mode"}
        </button>
      </div>

      <div className="panel p-5">
        <h3 className="text-[13px] font-black text-white">Feature flags</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="field max-w-[240px]" placeholder="flag key" value={flagForm.key}
            onChange={(e) => setFlagForm({ ...flagForm, key: e.target.value })} />
          <input className="field max-w-[240px]" placeholder="value" value={flagForm.value}
            onChange={(e) => setFlagForm({ ...flagForm, value: e.target.value })} />
          <button type="button" className="btn-ghost px-3 py-2 text-xs"
            onClick={async () => { if (await post("/api/admin/flags", flagForm)) setFlagForm({ key: "", value: "" }); }}>
            Set flag
          </button>
        </div>
        <ul className="mt-3 space-y-1">
          {flags.map((f) => (
            <li key={f.key} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="num text-slate-300">{f.key}</span>
              <span className="num font-bold text-volt">{f.value}</span>
            </li>
          ))}
          {flags.length === 0 && <li className="text-[12px] text-slate-500">No flags set — everything is at its default.</li>}
        </ul>
      </div>

      <div className="panel p-5">
        <h3 className="text-[13px] font-black text-white">Promo codes</h3>
        <p className="mt-1 text-[12px] text-slate-400">
          Players redeem these on the Rewards page. Choose what the code hands out and type any
          amount — the presets are just shortcuts. The grant goes through the ledger like any other
          credit.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="promo-code">Code</label>
            <input id="promo-code" className="field" placeholder="WELCOME2026" value={promoForm.code}
              onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} />
          </div>

          <div>
            <label className="label" htmlFor="promo-kind">Grants</label>
            <select id="promo-kind" className="field" value={promoForm.kind}
              onChange={(e) => setPromoForm({ ...promoForm, kind: e.target.value as GrantKind })}>
              {GRANT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>

          {promoForm.kind !== "xp" && (
            <div>
              <label className="label" htmlFor="promo-money">Credits</label>
              <input id="promo-money" className="field num" inputMode="decimal" placeholder="e.g. 2500"
                value={promoForm.grant}
                onChange={(e) => setPromoForm({ ...promoForm, grant: e.target.value })} />
              <select className="field mt-1 !py-1.5 text-[11px]" value=""
                aria-label="Preset credit amounts"
                onChange={(e) => e.target.value && setPromoForm({ ...promoForm, grant: e.target.value })}>
                <option value="">Preset…</option>
                {MONEY_GRANTS.map((v) => (
                  <option key={v} value={v}>{formatCents(v * 100)}</option>
                ))}
              </select>
            </div>
          )}

          {promoForm.kind !== "money" && (
            <div>
              <label className="label" htmlFor="promo-xp">XP</label>
              <input id="promo-xp" className="field num" inputMode="numeric" placeholder="e.g. 500"
                value={promoForm.xp}
                onChange={(e) => setPromoForm({ ...promoForm, xp: e.target.value })} />
              <select className="field mt-1 !py-1.5 text-[11px]" value=""
                aria-label="Preset XP amounts"
                onChange={(e) => e.target.value && setPromoForm({ ...promoForm, xp: e.target.value })}>
                <option value="">Preset…</option>
                {XP_GRANTS.map((v) => (
                  <option key={v} value={v}>{v.toLocaleString()} XP</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="promo-max">Max uses</label>
            <input id="promo-max" className="field" placeholder="0 = unlimited" value={promoForm.max}
              onChange={(e) => setPromoForm({ ...promoForm, max: e.target.value })} />
          </div>
        </div>
        <button type="button" className="btn-ghost mt-3 px-3 py-2 text-xs"
          onClick={async () => {
            const money = Math.round((Number(promoForm.grant) || 0) * 100);
            const xp = Math.round(Number(promoForm.xp) || 0);
            if (promoForm.kind !== "xp" && money <= 0) {
              setError("Enter how many credits the code grants.");
              return;
            }
            if (promoForm.kind !== "money" && xp <= 0) {
              setError("Enter how much XP the code grants.");
              return;
            }
            const ok = await post("/api/admin/promo", {
              op: "create",
              code: promoForm.code,
              grantCents: promoForm.kind === "xp" ? 0 : money,
              grantXp: promoForm.kind === "money" ? 0 : xp,
              maxRedemptions: Math.max(0, Math.round(Number(promoForm.max) || 0)),
            });
            if (ok) {
              setPromoForm({ code: "", kind: "money", grant: String(MONEY_GRANTS[1]), xp: String(XP_GRANTS[1]), max: "0" });
            }
          }}>
          Create code
        </button>
        <ul className="mt-3 space-y-1">
          {promos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 text-[12px]">
              <span>
                <span className="num font-black text-slate-100">{p.code}</span>
                <span className="ml-2 text-slate-400">
                  {formatCents(p.grantCents)}{p.grantXp > 0 ? ` + ${p.grantXp} XP` : ""} ·{" "}
                  {p.redeemedCount}/{p.maxRedemptions === 0 ? "∞" : p.maxRedemptions} used
                </span>
                {!p.active && <span className="ml-2 text-[10px] font-black uppercase text-loss">revoked</span>}
              </span>
              {p.active && (
                <button type="button" className="btn-ghost px-2 py-1 text-[10px] text-loss"
                  onClick={() => post("/api/admin/promo", { op: "revoke", id: p.id })}>
                  Revoke
                </button>
              )}
            </li>
          ))}
          {promos.length === 0 && <li className="text-[12px] text-slate-500">No codes yet.</li>}
        </ul>
      </div>

      <div className="panel p-5">
        <h3 className="text-[13px] font-black text-white">Announcements</h3>
        <p className="mt-1 text-[11px] text-slate-500">Leave the username blank to broadcast to everyone.</p>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input className="field max-w-[240px]" placeholder="Title" value={annForm.title}
              onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} />
            <input className="field max-w-[200px]" placeholder="Username (optional)" value={annForm.targetUsername}
              onChange={(e) => setAnnForm({ ...annForm, targetUsername: e.target.value })} />
          </div>
          <textarea className="field" rows={2} placeholder="Message" value={annForm.body}
            onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })} />
          <button type="button" className="btn-ghost px-3 py-2 text-xs"
            onClick={async () => {
              const ok = await post("/api/admin/announcements", {
                op: "create", title: annForm.title, body: annForm.body, level: "INFO",
                targetUsername: annForm.targetUsername.trim() === "" ? null : annForm.targetUsername.trim(),
              });
              if (ok) setAnnForm({ title: "", body: "", targetUsername: "" });
            }}>
            Send
          </button>
        </div>
        <ul className="mt-3 space-y-1.5">
          {announcements.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="min-w-0">
                <span className="font-bold text-slate-100">{a.title}</span>
                <span className="ml-2 text-slate-500">{a.targetId ? "direct" : "broadcast"}</span>
                <span className="block truncate text-[11px] text-slate-500">{a.body}</span>
              </span>
              {a.active && (
                <button type="button" className="btn-ghost shrink-0 px-2 py-1 text-[10px]"
                  onClick={() => post("/api/admin/announcements", { op: "retire", id: a.id })}>
                  Retire
                </button>
              )}
            </li>
          ))}
          {announcements.length === 0 && <li className="text-[12px] text-slate-500">Nothing sent yet.</li>}
        </ul>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCents } from "@/lib/money";

type Flag = { key: string; value: string; updatedAt: string };
type Promo = {
  id: string; code: string; grantCents: number; grantXp: number;
  maxRedemptions: number; redeemedCount: number; active: boolean; createdBy: string;
};
type Announcement = { id: string; title: string; body: string; level: string; targetId: string | null; active: boolean; createdBy: string; createdAt: string };

const MAINTENANCE = "site.maintenance";

export default function SitePanel() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [flagForm, setFlagForm] = useState({ key: "", value: "" });
  const [promoForm, setPromoForm] = useState({ code: "", grant: "", xp: "", max: "0" });
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
      if (reason.trim().length < 3) {
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
    [reason, load],
  );

  const maintenanceOn = flags.find((f) => f.key === MAINTENANCE)?.value === "true";

  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="site-reason">Reason (required for any change)</label>
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
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="field max-w-[160px]" placeholder="CODE" value={promoForm.code}
            onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase() })} />
          <input className="field max-w-[140px]" placeholder="grant (e.g. 500)" value={promoForm.grant}
            onChange={(e) => setPromoForm({ ...promoForm, grant: e.target.value })} />
          <input className="field max-w-[120px]" placeholder="XP" value={promoForm.xp}
            onChange={(e) => setPromoForm({ ...promoForm, xp: e.target.value })} />
          <input className="field max-w-[140px]" placeholder="max uses (0 = ∞)" value={promoForm.max}
            onChange={(e) => setPromoForm({ ...promoForm, max: e.target.value })} />
          <button type="button" className="btn-ghost px-3 py-2 text-xs"
            onClick={async () => {
              const ok = await post("/api/admin/promo", {
                op: "create",
                code: promoForm.code,
                grantCents: Math.round(Number(promoForm.grant || 0) * 100),
                grantXp: Math.round(Number(promoForm.xp || 0)),
                maxRedemptions: Math.round(Number(promoForm.max || 0)),
              });
              if (ok) setPromoForm({ code: "", grant: "", xp: "", max: "0" });
            }}>
            Create code
          </button>
        </div>
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

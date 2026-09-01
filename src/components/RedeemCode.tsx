"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";

/**
 * Redeems a promo code created in the staff dashboard. Every rule that decides
 * whether the code pays — active, unexpired, uses remaining, not already used
 * by this account — lives in /api/promo and is re-checked inside the
 * transaction; this form only reports what the server decided.
 */
export default function RedeemCode() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [won, setWon] = useState<{ cents: number; xp: number } | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    setWon(null);
    try {
      const res = await fetch("/api/promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "That code could not be redeemed.");
      } else {
        setWon({ cents: data.grantCents ?? 0, xp: data.grantXp ?? 0 });
        setCode("");
        // The balance and level live in the server-rendered shell.
        router.refresh();
      }
    } catch {
      setError("Network error — nothing was redeemed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-volt">Promo code</p>
      <p className="mt-2 text-sm text-slate-400">
        Got a code? Redeem it here. Each code works once per account.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          className="field num uppercase"
          placeholder="ENTER CODE"
          value={code}
          maxLength={32}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          aria-label="Promo code"
        />
        <button type="submit" className="btn-primary shrink-0 px-5 py-2 text-sm" disabled={busy || !code.trim()}>
          {busy ? "…" : "Redeem"}
        </button>
      </div>

      {error && <p className="mt-2 text-[12px] font-semibold text-loss">{error}</p>}
      {won && (
        <p className="mt-2 text-[12px] font-semibold text-win">
          Redeemed —{" "}
          {[won.cents > 0 ? formatCents(won.cents) : null, won.xp > 0 ? `${won.xp.toLocaleString()} XP` : null]
            .filter(Boolean)
            .join(" and ")}{" "}
          added.
        </p>
      )}
    </form>
  );
}

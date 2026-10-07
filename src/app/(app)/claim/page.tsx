"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { formatCents } from "@/lib/money";

export default function ClaimPage() {
  const router = useRouter();
  const { progression, balanceCents, refresh } = useWallet();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guest/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save your account.");
      await signIn("credentials", { username: data.username, password, signupGrant: data.signupGrant, redirect: false });
      await refresh();
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your account.");
      setBusy(false);
    }
  }

  if (progression && !progression.isGuest) {
    return <p className="py-16 text-center text-slate-400">Your account is already saved.</p>;
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="panel p-6">
        <h1 className="font-display text-2xl font-black tracking-tight text-white">Save your account</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Keep your {balanceCents !== null ? formatCents(balanceCents) : ""} and everything you&apos;ve unlocked, lift
          the {formatCents(30_000)} bet cap, unlock chat and the leaderboard — plus{" "}
          <span className="font-bold text-volt">{formatCents(10_000_000)} bonus credits</span>.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label className="label" htmlFor="claim-username">Username</label>
            <input id="claim-username" className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label className="label" htmlFor="claim-password">Password</label>
            <input id="claim-password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <p className="text-sm font-semibold text-loss">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full py-3">
            {busy ? "Saving…" : "Save & claim credits"}
          </button>
        </form>
      </div>
    </div>
  );
}

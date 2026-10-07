"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** One tap into a throwaway account: 1,000 credits, $300 max bet. */
export default function GuestButton({ className = "btn-ghost", label = "Play as guest" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guest", { method: "POST" });
      const data = await res.json();
      if (res.status === 403) {
        router.push("/signup");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Couldn't start a guest session.");
      const r = await signIn("credentials", {
        username: data.username,
        password: data.password,
        signupGrant: data.signupGrant,
        redirect: false,
      });
      if (r?.error) throw new Error("Couldn't start a guest session.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start a guest session.");
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={go} disabled={busy} className={className}>
        {busy ? "Starting…" : label}
      </button>
      {error && <p className="text-[11px] font-semibold text-loss">{error}</p>}
    </>
  );
}

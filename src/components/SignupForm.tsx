"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/** Only ever follow a same-app path — never an absolute or external URL. */
function safeCallback(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default function SignupForm() {
  const router = useRouter();
  const callbackUrl = safeCallback(useSearchParams().get("callbackUrl"));
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't create that account.");
        setBusy(false);
        return;
      }

      const signInRes = await signIn("credentials", { username, password, redirect: false });
      if (signInRes?.error) {
        router.push(`/login${callbackUrl !== "/" ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`);
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="signup-username">
          Username
        </label>
        <input
          id="signup-username"
          className="field"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="3–20 letters, numbers or _"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="signup-email">
          Email <span className="normal-case text-slate-600">(optional)</span>
        </label>
        <input
          id="signup-email"
          type="email"
          className="field"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="signup-password">
          Password
        </label>
        <input
          id="signup-password"
          type="password"
          className="field"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
          minLength={8}
        />
      </div>

      {error && <p className="text-sm font-semibold text-loss">{error}</p>}

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/** Only ever follow a same-app path — never an absolute or external URL. */
function safeCallback(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default function LoginForm() {
  const router = useRouter();
  const callbackUrl = safeCallback(useSearchParams().get("callbackUrl"));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await signIn("credentials", { username, password, redirect: false });

    if (res?.error) {
      setError("That username and password don't match.");
      setBusy(false);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="login-username">
          Username
        </label>
        <input
          id="login-username"
          className="field"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          className="field"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-sm font-semibold text-loss">{error}</p>}

      <button type="submit" className="btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

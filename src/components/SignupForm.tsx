"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { formatCents } from "@/lib/money";
import { REFEREE_BONUS_CENTS, REFERRER_BONUS_CENTS } from "@/lib/referral";
import { TURNSTILE_ENABLED } from "@/lib/turnstile";
import Turnstile from "@/components/Turnstile";

/** Only ever follow a same-app path — never an absolute or external URL. */
function safeCallback(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

export default function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeCallback(params.get("callbackUrl"));
  // A shared link carries the code in ?ref=, so the field arrives filled in.
  const [referralCode, setReferralCode] = useState((params.get("ref") ?? "").toUpperCase());
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [unlimitedBets, setUnlimitedBets] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      setError("You need to confirm you're 18+ and agree to the Terms before signing up.");
      return;
    }
    if (TURNSTILE_ENABLED && !turnstileToken) {
      setError("Verification isn't complete yet — give it a second and try again.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, email, referralCode, turnstileToken, unlimitedBets }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't create that account.");
        setBusy(false);
        // A rejected request still spends the widget's one-time token.
        setTurnstileToken(null);
        setTurnstileNonce((n) => n + 1);
        return;
      }

      const signInRes = await signIn("credentials", {
        username,
        password,
        signupGrant: data.signupGrant,
        redirect: false,
      });
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

      <div>
        <label className="label" htmlFor="signup-referral">
          Referral code <span className="normal-case text-slate-600">(optional)</span>
        </label>
        <input
          id="signup-referral"
          className="field num uppercase"
          value={referralCode}
          maxLength={32}
          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
          placeholder="A friend's code"
        />
        <p className="mt-1.5 text-[11px] text-slate-500">
          Start with {formatCents(REFEREE_BONUS_CENTS)} extra, and they get{" "}
          {formatCents(REFERRER_BONUS_CENTS)}.
        </p>
      </div>

      <div>
        <p className="label">Table limit</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setUnlimitedBets(false)}
            className={`rounded-xl border p-3 text-left transition ${
              !unlimitedBets ? "border-volt bg-volt/10" : "border-white/10 bg-base-900 hover:border-white/20"
            }`}
          >
            <span className="block text-[13px] font-bold text-white">Standard</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
              Start small, level up to raise your table limit. The usual way to play.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setUnlimitedBets(true)}
            className={`rounded-xl border p-3 text-left transition ${
              unlimitedBets ? "border-volt bg-volt/10" : "border-white/10 bg-base-900 hover:border-white/20"
            }`}
          >
            <span className="block text-[13px] font-bold text-white">No limits</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
              Bet any amount you can afford from the start — no level-gated cap, ever.
            </span>
          </button>
        </div>
        {unlimitedBets && (
          <p className="mt-2 rounded-lg border border-volt/30 bg-volt/5 px-3 py-2 text-[11px] leading-relaxed text-slate-300">
            This can&apos;t be switched back later. You still keep everything else: levels still unlock
            every game and feature, achievements and rewards still work, and the Life career ladder —
            including rebirth — plays exactly the same. You&apos;ll also get a No Limits badge next to
            your name.
          </p>
        )}
      </div>

      <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-400">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-base-900 text-volt accent-volt"
        />
        <span>
          I&apos;m 18 or older and agree to the{" "}
          <Link href="/legal/terms" target="_blank" className="text-volt hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" target="_blank" className="text-volt hover:underline">
            Privacy Policy
          </Link>
          . I understand WinIt balances have no cash value.
        </span>
      </label>

      {TURNSTILE_ENABLED && (
        <Turnstile key={turnstileNonce} onVerify={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
      )}

      {error && <p className="text-sm font-semibold text-loss">{error}</p>}

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={busy || !agreed || (TURNSTILE_ENABLED && !turnstileToken)}
      >
        {busy ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}

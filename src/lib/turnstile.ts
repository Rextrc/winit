/**
 * Cloudflare Turnstile — a mostly-invisible CAPTCHA on signup and login, so
 * scripted account creation (farming referral bonuses, the daily bonus) has
 * a real cost, without putting a puzzle in front of anyone just browsing.
 *
 * Both the site key and secret key come from the same Cloudflare Turnstile
 * dashboard entry. Until both are set, Turnstile is off everywhere: the
 * widget doesn't render (no site key) and the server doesn't ask for a token
 * (no secret key) — so a fresh checkout of this repo keeps working with zero
 * configuration, the same pattern as ODDS_API_KEY.
 */

/** Client-readable — safe to ship to the browser. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

type SiteverifyResponse = { success: boolean; ["error-codes"]?: string[] };

/**
 * Verifies a widget token server-side. Returns true when Turnstile isn't
 * configured (TURNSTILE_SECRET_KEY unset) — the widget won't have rendered
 * on the client either, so there's nothing to check.
 */
// --- Post-signup auto-login -------------------------------------------------
// SignupForm verifies Turnstile once against /api/signup, then immediately
// calls signIn() to log the new account straight in. A Turnstile token is
// single-use, so that second call can't present a fresh one without another
// round trip through the widget. Instead, /api/signup mints a one-time grant
// tied to the username, and authorize() accepts it in place of a token for
// just that one follow-up call. In-memory and short-lived is fine here the
// same way the sports odds cache is: WinIt runs as a single Node process.

const SIGNUP_GRANT_TTL_MS = 60_000;
const signupGrants = new Map<string, { code: string; expires: number }>();

export function issueSignupGrant(username: string): string {
  const code = crypto.randomUUID();
  signupGrants.set(username, { code, expires: Date.now() + SIGNUP_GRANT_TTL_MS });
  return code;
}

/** Single-use: valid once, for a little while, then gone either way. */
export function consumeSignupGrant(username: string, grant: string | undefined | null): boolean {
  const entry = signupGrants.get(username);
  if (!entry) return false;
  signupGrants.delete(username);
  return Boolean(grant) && entry.code === grant && entry.expires > Date.now();
}

export async function verifyTurnstile(token: string | undefined | null, remoteip?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as SiteverifyResponse;
    return data.success === true;
  } catch {
    // Cloudflare unreachable: fail closed — better a retry prompt than a
    // silent bypass of the one thing protecting signup from bots.
    return false;
  }
}

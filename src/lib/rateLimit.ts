/**
 * Fixed-window rate limiter held in process memory. Runs in the edge-safe
 * middleware, so it has no dependencies. One counter set per server process:
 * with several instances each enforces the limit on its own, which is still
 * enough to stop scripted abuse — move to a shared store (Redis) only if the
 * app is scaled out and exact global limits matter.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export type Limit = { name: string; max: number; windowMs: number };

export function hit(key: string, limit: Limit, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  const id = `${limit.name}:${key}`;
  let b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + limit.windowMs };
    buckets.set(id, b);
  }
  b.count++;
  return { ok: b.count <= limit.max, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

const MIN = 60_000;

/** Which limit applies to a request, or null for none. Per IP. */
export function limitFor(method: string, path: string): Limit | null {
  if (path === "/api/health" || path.startsWith("/api/admin")) return null;

  // Credential guessing and account farming.
  if (path.startsWith("/api/auth/callback/credentials")) return { name: "login", max: 10, windowMs: MIN };
  if (path === "/api/signup") return { name: "signup", max: 5, windowMs: 10 * MIN };
  if (path.startsWith("/api/guest")) return { name: "guest", max: 10, windowMs: 10 * MIN };
  if (path === "/api/promo") return { name: "promo", max: 10, windowMs: MIN };

  if (method === "GET" || method === "HEAD") {
    // Live views (crash, chat) poll several times a second.
    return { name: "read", max: 900, windowMs: MIN };
  }
  if (path.startsWith("/api/games/")) return { name: "bet", max: 150, windowMs: MIN };
  return { name: "write", max: 60, windowMs: MIN };
}

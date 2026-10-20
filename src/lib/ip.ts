/**
 * The client address for a request, for abuse limits (one guest per
 * connection, no self-referral) — never as proof of who someone is.
 *
 * Behind N trusted proxies, each appends the address it saw to the RIGHT of
 * x-forwarded-for, so the only entries a client cannot forge are the last N.
 * The real client is therefore the Nth from the right — NOT the leftmost,
 * which is whatever the client chose to send. Set TRUSTED_PROXY_HOPS to the
 * number of proxies in front of the app (default 1: Vercel, Cloudflare, a
 * single load balancer). With none, any header can be forged by the client.
 */
function hops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 1;
}

export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    const picked = parts[Math.max(0, parts.length - hops())];
    const ip = picked ? normaliseIp(picked) : null;
    if (ip) return ip;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return normaliseIp(real.trim());
  return null;
}

/** IPv6-mapped IPv4 ("::ffff:1.2.3.4") is stored as the plain v4 address. */
function normaliseIp(raw: string): string | null {
  const v4 = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const ip = (v4 ? v4[1] : raw).slice(0, 64);
  return /^[0-9a-f:.]+$/i.test(ip) ? ip.toLowerCase() : null;
}

/**
 * The key a "one guest per connection" rule is held to. IPv6 users rotate
 * through a whole /64 on their own, so that prefix — fully expanded, so `::`
 * shorthand can't produce two spellings of the same network — is the
 * connection. Returns null for anything that isn't a valid address.
 */
export function connectionKey(ip: string | null): string | null {
  if (!ip) return null;
  if (!ip.includes(":")) return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;

  const [head, tail, extra] = ip.split("::");
  if (extra !== undefined) return null;
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  if (tail === undefined ? a.length !== 8 : a.length + b.length > 7) return null;
  const groups = tail === undefined ? a : [...a, ...Array(8 - a.length - b.length).fill("0"), ...b];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":") + "/64";
}

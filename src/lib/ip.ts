/**
 * The client address for a request.
 *
 * Behind a proxy the socket address is the proxy's, so the client is read from
 * the forwarding headers instead. Those headers are set by whatever sits in
 * front of the app and can be forged by a client talking to the app directly —
 * so this is a signal, never proof of identity. It is used here only to refuse
 * a referral bonus, which is the right weight for evidence of this strength;
 * nothing that grants access is decided by it.
 *
 * The leftmost entry of x-forwarded-for is the original client as reported by
 * the first proxy that saw it.
 */
export function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return normaliseIp(first);
  }
  const real = req.headers.get("x-real-ip");
  if (real) return normaliseIp(real.trim());
  return null;
}

/** IPv6-mapped IPv4 ("::ffff:1.2.3.4") is stored as the plain v4 address. */
function normaliseIp(raw: string): string {
  const v4 = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return (v4 ? v4[1] : raw).slice(0, 64);
}

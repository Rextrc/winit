/**
 * The public origin of the site — what link previews, canonical URLs, the
 * sitemap and robots.txt are built from.
 *
 * Set NEXT_PUBLIC_SITE_URL at build time (it's inlined into the bundle). A
 * production build never uses a localhost value, even if one slips into the
 * environment: link previews would otherwise point every crawler at a
 * machine it can't reach.
 */
const FALLBACK = "https://winit.one";

export function siteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (!raw) return FALLBACK;
  if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(raw)) return FALLBACK;
  return raw;
}

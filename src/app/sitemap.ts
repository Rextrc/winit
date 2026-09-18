import type { MetadataRoute } from "next";
import { CATEGORY_LABELS, PLAYABLE } from "@/lib/games/registry";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Every URL here is genuinely public and content-bearing: the lobby, each
 * category, every playable game's own page (each with its own rules and
 * published RTP), sign-up and login. Anything behind a session — rewards,
 * history, settings, life, achievements — is left out, along with the two
 * "not built yet" live tiles, which have nothing for a crawler to index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = Object.keys(CATEGORY_LABELS).map((category) => ({
    url: `${base}/category/${category}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const gameRoutes: MetadataRoute.Sitemap = PLAYABLE.map((g) => ({
    url: `${base}/game/${g.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...categoryRoutes, ...gameRoutes];
}

import type { Metadata } from "next";

/**
 * A per-page title and description that actually reaches a link preview.
 *
 * The root layout declares an explicit `openGraph`/`twitter` block (needed so
 * the site itself has a real share card). Once a parent layout does that,
 * Next.js metadata merging inherits the *entire* openGraph object on any
 * child page that doesn't supply its own — a child's plain `title` alone is
 * not enough to override it. Without this, every page would render its own
 * correct <title> while Discord, Slack and Twitter all show the generic
 * site-wide card regardless of which page was actually shared. Use this
 * wherever a page sets a custom title, not just `{ title }`.
 */
export function pageMetadata(title: string, description?: string): Metadata {
  return {
    title,
    description,
    openGraph: { title, description },
    // `card` is repeated here for the same reason `title`/`description` are:
    // a child page's `twitter` object replaces the root's whole one rather
    // than merging into it, so leaving `card` out would silently downgrade
    // every page's preview from a large image card to a small "summary" one.
    twitter: { card: "summary_large_image", title, description },
  };
}

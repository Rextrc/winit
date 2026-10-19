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
export function pageMetadata(
  title: string,
  description?: string,
  /** Set for a route with its own opengraph-image file, so that one is used. */
  { ownImage = false }: { ownImage?: boolean } = {},
): Metadata {
  const images = ownImage ? {} : { images: [{ url: "/opengraph-image", width: 1200, height: 630 }] };
  return {
    title,
    description,
    // The child object replaces the root one wholesale, so the site's share
    // image has to be named again or the preview loses its picture.
    openGraph: { title, description, ...images },
    // `card` is repeated here for the same reason `title`/`description` are:
    // a child page's `twitter` object replaces the root's whole one rather
    // than merging into it, so leaving `card` out would silently downgrade
    // every page's preview from a large image card to a small "summary" one.
    twitter: { card: "summary_large_image", title, description, ...(ownImage ? {} : { images: ["/opengraph-image"] }) },
  };
}

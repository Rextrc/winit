import { siteUrl } from "@/lib/site";
import type { MetadataRoute } from "next";


export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The dashboard has no reason to appear in search results, and staff
        // it's meant for reach it by a direct URL, not a search engine.
        disallow: ["/admin", "/api"],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

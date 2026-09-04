import type { MetadataRoute } from "next";

import { PUBLIC_SITE_ORIGIN } from "@/lib/public/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/catalog", "/catalog/", "/product", "/product/"],
        disallow: [
          "/admin",
          "/account",
          "/api",
          "/auth",
          "/booking/complete",
          "/driver",
          "/time-clock",
          "/notifications",
        ],
      },
    ],
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
    host: PUBLIC_SITE_ORIGIN,
  };
}

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/account/", "/driver/", "/api/", "/book/", "/booking/"],
    },
    sitemap: "https://bouncepartyla.com/sitemap.xml",
  };
}

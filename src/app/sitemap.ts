import type { MetadataRoute } from "next";

import {
  getPublicCatalogCategories,
  getPublicCatalogProducts,
} from "@/lib/customer/public-catalog";
import { canonicalUrl } from "@/lib/public/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];

  function pushEntry(entry: MetadataRoute.Sitemap[number]) {
    if (!seen.has(entry.url)) {
      seen.add(entry.url);
      entries.push(entry);
    }
  }

  pushEntry({
    url: canonicalUrl("/"),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 1,
  });

  pushEntry({
    url: canonicalUrl("/catalog"),
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.9,
  });

  try {
    const [categories, products] = await Promise.all([
      getPublicCatalogCategories(),
      getPublicCatalogProducts(),
    ]);

    for (const category of categories) {
      pushEntry({
        url: canonicalUrl(`/catalog/${encodeURIComponent(category.slug)}`),
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }

    for (const product of products) {
      const slug = String(product.public_slug || product.slug || "").trim();
      if (!slug) continue;

      pushEntry({
        url: canonicalUrl(`/product/${encodeURIComponent(slug)}`),
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch (error) {
    console.error("Could not build full public sitemap", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }

  return entries;
}

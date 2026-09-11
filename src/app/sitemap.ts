import type { MetadataRoute } from "next";

import {
  getPublicCatalogCategories,
  getPublicCatalogProducts,
} from "@/lib/customer/public-catalog";

const BASE_URL = "https://bouncepartyla.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, products] = await Promise.all([
    getPublicCatalogCategories().catch(() => []),
    getPublicCatalogProducts().catch(() => []),
  ]);

  return [
    { url: BASE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/catalog`, changeFrequency: "weekly", priority: 0.9 },
    ...categories.map((category) => ({
      url: `${BASE_URL}/catalog/${category.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((product) => ({
      url: `${BASE_URL}/product/${product.public_slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}

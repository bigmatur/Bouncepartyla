import type { Metadata } from "next";

export const PUBLIC_SITE_ORIGIN = "https://bouncepartyla.com";
export const PUBLIC_SITE_NAME = "Bounce Party LA";
export const PUBLIC_DEFAULT_DESCRIPTION =
  "Modern bounce house, bubble house, and soft play rentals in Los Angeles with professional delivery and setup.";

function normalizePath(path: string) {
  const value = String(path || "").trim();

  if (!value || value === "/") {
    return "/";
  }

  return value.startsWith("/") ? value : `/${value}`;
}

export function canonicalUrl(path: string) {
  return new URL(normalizePath(path), PUBLIC_SITE_ORIGIN).toString();
}

function resolveImageUrl(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  return canonicalUrl(raw);
}

export function buildPublicMetadata(params: {
  title: string;
  description?: string;
  path: string;
  index?: boolean;
  image?: string | null;
}): Metadata {
  const title = String(params.title || "").trim() || PUBLIC_SITE_NAME;
  const description =
    String(params.description || "").trim() || PUBLIC_DEFAULT_DESCRIPTION;
  const canonical = canonicalUrl(params.path);
  const index = params.index !== false;
  const image = resolveImageUrl(params.image);

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    robots: {
      index,
      follow: index,
    },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: PUBLIC_SITE_NAME,
      title,
      description,
      images: image
        ? [
            {
              url: image,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

import type { Metadata } from "next";
import "./globals.css";
import {
  PUBLIC_DEFAULT_DESCRIPTION,
  PUBLIC_SITE_NAME,
  PUBLIC_SITE_ORIGIN,
} from "@/lib/public/seo";

export const metadata: Metadata = {
  metadataBase: new URL(PUBLIC_SITE_ORIGIN),
  title: PUBLIC_SITE_NAME,
  description: PUBLIC_DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: PUBLIC_SITE_NAME,
    title: PUBLIC_SITE_NAME,
    description: PUBLIC_DEFAULT_DESCRIPTION,
    url: PUBLIC_SITE_ORIGIN,
  },
  twitter: {
    card: "summary_large_image",
    title: PUBLIC_SITE_NAME,
    description: PUBLIC_DEFAULT_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

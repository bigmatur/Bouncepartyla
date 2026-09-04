import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bouncepartyla.com"),
  title: {
    default: "Bounce Party LA | Modern Party Rentals",
    template: "%s | Bounce Party LA",
  },
  description:
    "Modern bounce houses, soft play, bubble houses and party rentals in Los Angeles.",
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

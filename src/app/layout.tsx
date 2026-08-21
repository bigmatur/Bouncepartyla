import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bounce Party LA - Admin Booking",
  description: "Admin panel for Bounce Party LA booking system",
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

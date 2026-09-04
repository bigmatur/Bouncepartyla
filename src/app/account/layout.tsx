import type { Metadata } from "next";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customer Account | Bounce Party LA",
  description: "Private customer account for bookings, profile, and notifications.",
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    title: "Customer Account | Bounce Party LA",
    description: "Private customer account for bookings, profile, and notifications.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Customer Account | Bounce Party LA",
    description: "Private customer account for bookings, profile, and notifications.",
  },
};

export default function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
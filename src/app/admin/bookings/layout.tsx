import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/require-admin";

export default async function BookingsLayout({ children }: { children: ReactNode }) {
  const { access } = await requireAdminUser();

  if (!access.can("bookings.view") && !access.can("bookings.create")) {
    redirect("/unauthorized");
  }

  return children;
}

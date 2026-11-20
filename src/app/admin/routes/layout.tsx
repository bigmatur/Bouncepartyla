import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth/require-admin";

export default async function RoutesLayout({ children }: { children: ReactNode }) {
  const { access } = await requireAdminUser();

  const canViewRoutes =
    access.can("routes.view") ||
    (access.role !== "driver" && access.can("preview.driver"));

  if (!canViewRoutes) {
    redirect("/unauthorized");
  }

  return children;
}

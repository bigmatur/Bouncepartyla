import type { ReactNode } from "react";
import { requireAdminPermission } from "@/lib/auth/require-admin";

export default async function CatalogLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminPermission("catalog.view");

  return <div className="admin-ipad-page admin-ipad-catalog">{children}</div>;
}

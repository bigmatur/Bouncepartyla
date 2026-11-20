import type { ReactNode } from "react";
import { requireAdminPermission } from "@/lib/auth/require-admin";

export default async function ProductsLayout({ children }: { children: ReactNode }) {
  await requireAdminPermission("catalog.view");
  return children;
}

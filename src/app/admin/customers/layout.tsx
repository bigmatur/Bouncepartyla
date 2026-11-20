import type { ReactNode } from "react";
import { requireAdminPermission } from "@/lib/auth/require-admin";

export default async function CustomersLayout({ children }: { children: ReactNode }) {
  await requireAdminPermission("customers.view");
  return children;
}

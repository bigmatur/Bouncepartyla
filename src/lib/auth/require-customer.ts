import "server-only";

import { redirect } from "next/navigation";

import { getUnifiedAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export async function requireCustomerAccess() {
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user) {
    redirect("/account/login");
  }

  const canPreviewCustomer = access.role !== "customer" && access.can("preview.customer");

  if (!access.isActive || (access.role !== "customer" && !canPreviewCustomer)) {
    redirect("/unauthorized");
  }

  return {
    supabase,
    access,
    canPreviewCustomer,
  };
}

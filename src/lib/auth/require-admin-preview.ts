import "server-only";

import { redirect } from "next/navigation";

import { getUnifiedAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminPreviewUser() {
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user) redirect("/login");

  if (!access.isActive || !access.can("preview.customer")) {
    redirect("/unauthorized");
  }

  return {
    supabase,
    user: access.user,
    profile: {
      id: access.profileId,
      role: access.role,
      is_active: access.isActive,
    },
    access,
  };
}

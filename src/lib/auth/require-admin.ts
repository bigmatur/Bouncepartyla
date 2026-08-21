import "server-only";

import { redirect } from "next/navigation";

import { getUnifiedAccess, isStaffRole, type AppPermission } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminUser() {
  const supabase = await createClient();

  const access = await getUnifiedAccess(supabase);

  if (!access.user) {
    redirect("/login");
  }

  if (!access.isActive || !isStaffRole(access.role)) {
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

export async function requireAdminPermission(permission: AppPermission) {
  const context = await requireAdminUser();

  if (!context.access.can(permission)) {
    redirect("/unauthorized");
  }

  return context;
}

export async function requireAdminPreviewUser() {
  const context = await requireAdminUser();

  if (!context.access.can("preview.driver")) {
    redirect("/unauthorized");
  }

  return context;
}
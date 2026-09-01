import type { User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

export type MobileInterface = "admin" | "driver";

export type MobileAccess = {
  interface: MobileInterface;
  role: string;
  displayName: string;
};

const ADMIN_ROLES = new Set([
  "super_admin",
  "admin",
  "manager",
  "dispatcher",
  "cashier",
  "warehouse",
  "content_manager",
]);

type ProfileRow = {
  role?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

export async function loadMobileAccess(user: User): Promise<MobileAccess> {
  const profileResult = await supabase
    .from("profiles")
    .select("role, first_name, last_name")
    .eq("auth_user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (profileResult.error) {
    console.warn(
      "[mobileAccess] Failed to load profile:",
      profileResult.error.message,
    );
  }

  const profile = profileResult.data as ProfileRow | null;

  const role = String(profile?.role || "").trim().toLowerCase();
  const hasAdminRole = ADMIN_ROLES.has(role);

  const profileName = [profile?.first_name, profile?.last_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  const displayName = String(
    profileName ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.user_metadata?.display_name ||
      user.email ||
      "Staff account",
  );

  return {
    interface: hasAdminRole ? "admin" : "driver",
    role: role || "driver",
    displayName,
  };
}

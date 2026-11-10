import type { User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

export type MobileInterface = "admin" | "driver";

export type MobileAccess = {
  interface: MobileInterface;
  role: string;
  displayName: string;
  grantedPermissions: string[];
  availableInterfaces: MobileInterface[];
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

const DEFAULT_APP_URL = "https://bounceparty.us";

function appUrl() {
  return String(process.env.EXPO_PUBLIC_APP_URL || DEFAULT_APP_URL)
    .trim()
    .replace(/\/+$/, "");
}

async function loadServerAccess(): Promise<MobileAccess | null> {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;
  if (!token) return null;

  try {
    const response = await fetch(`${appUrl()}/api/admin/mobile/access`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;

    const body = await response.json() as {
      success?: boolean;
      data?: Partial<MobileAccess>;
    };
    const data = body.data;
    const interfaceKey = data?.interface === "admin" ? "admin" : data?.interface === "driver" ? "driver" : null;
    if (!body.success || !interfaceKey) return null;

    return {
      interface: interfaceKey,
      role: String(data?.role || "driver"),
      displayName: String(data?.displayName || "Staff account"),
      grantedPermissions: Array.isArray(data?.grantedPermissions)
        ? data.grantedPermissions.map((permission) => String(permission || "")).filter(Boolean)
        : [],
      availableInterfaces: Array.isArray(data?.availableInterfaces)
        ? data.availableInterfaces.filter(
            (value): value is MobileInterface => value === "admin" || value === "driver",
          )
        : [interfaceKey],
    };
  } catch {
    return null;
  }
}

export async function loadMobileAccess(user: User): Promise<MobileAccess> {
  const serverAccess = await loadServerAccess();
  if (serverAccess) return serverAccess;

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
    // Backwards-compatible fallback for an older deployed server. The server
    // response above is always preferred because it includes custom roles.
    grantedPermissions: [],
    availableInterfaces: [hasAdminRole ? "admin" : "driver"],
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { assertStaffPermission } from "@/lib/staff-access";
import { parseStaffMeta } from "@/lib/admin/access-management";
import { getAuthRequestOrigin } from "@/lib/auth/request-origin";

function createStaffRecoveryClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

const META_START = "[[STAFF_META]]";
const META_END = "[[/STAFF_META]]";

const permissionKeys = [
  "dashboard.view",
  "bookings.view",
  "bookings.create",
  "bookings.edit",
  "bookings.cancel",
  "bookings.delete",
  "bookings.archive",
  "bookings.restore",
  "bookings.view_financials",
  "bookings.view_internal_notes",
  "routes.view",
  "routes.create",
  "routes.edit",
  "routes.assign_driver",
  "routes.reorder",
  "routes.delete",
  "customers.view",
  "customers.edit",
  "customers.view_contact_data",
  "payments.view",
  "payments.create",
  "payments.edit",
  "payments.refund",
  "contracts.view",
  "contracts.edit",
  "contracts.send",
  "catalog.view",
  "catalog.create",
  "catalog.edit",
  "catalog.publish",
  "catalog.delete",
  "inventory.view",
  "inventory.edit",
  "inventory.mark_dirty",
  "inventory.mark_damaged",
  "inventory.mark_missing",
  "staff.view",
  "staff.create",
  "staff.edit",
  "staff.disable",
  "roles.view",
  "roles.edit",
  "roles.assign",
  "reports.view",
  "reports.financial",
  "preview.customer",
  "preview.driver",
  "settings.view",
  "settings.edit",
] as const;

const ROLE_DEFAULT_INTERFACE: Record<string, "admin" | "driver" | "customer"> = {
  customer: "customer",
  driver: "driver",
};

const LEGACY_PERMISSION_GROUPS = {
  routes_board: ["routes.view", "routes.edit", "routes.assign_driver", "preview.driver", "dashboard.view"],
  driver_checklists: ["routes.view", "preview.driver"],
  bookings: ["bookings.view", "bookings.create", "bookings.edit", "customers.view"],
  catalog: ["catalog.view", "catalog.edit", "catalog.publish"],
  inventory: ["inventory.view", "inventory.edit", "inventory.mark_dirty", "inventory.mark_damaged", "inventory.mark_missing"],
  reports: ["reports.view", "reports.financial"],
  settings: ["settings.view", "settings.edit", "staff.view", "staff.create", "staff.edit", "roles.view"],
} satisfies Record<string, string[]>;

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = getString(formData, key);

  if (!value) return fallback;

  const parsed = Number(value.replace(",", "."));

  return Number.isNaN(parsed) ? fallback : parsed;
}

type StaffMeta = {
  role: string;
  permissions: string[];
  appPermissions?: string[];
  deniedPermissions?: string[];
  defaultInterface?: "admin" | "driver" | "customer";
};

function deriveLegacyPermissions(grantedPermissions: string[]) {
  return Object.entries(LEGACY_PERMISSION_GROUPS)
    .filter(([, permissions]) => permissions.some((permission) => grantedPermissions.includes(permission)))
    .map(([key]) => key);
}

function buildNotes(staffMeta: StaffMeta, plainNotes: string | null) {
  const metaBlock = `${META_START}${JSON.stringify(staffMeta)}${META_END}`;
  const notes = String(plainNotes || "").trim();

  return notes ? `${metaBlock}\n\n${notes}` : metaBlock;
}

function revalidateStaffPages() {
  revalidatePath("/admin");
  revalidatePath("/admin/staff");
  revalidatePath("/admin/staff/time");
  revalidatePath("/admin/routes");
  revalidatePath("/admin/routes/driver");
}

function cleanUuid(value: string | null) {
  if (!value) return null;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  return uuidPattern.test(value) ? value : null;
}

function getDefaultInterface(role: string, explicitValue: string) {
  if (explicitValue === "driver" || explicitValue === "customer") {
    return explicitValue;
  }

  return ROLE_DEFAULT_INTERFACE[role] || "admin";
}

export async function createOrUpdateStaffAction(formData: FormData) {
  const supabase = await createClient();

  await assertStaffPermission(supabase, "settings");

  const driverId = cleanUuid(getNullableString(formData, "driverId"));
  const name = getString(formData, "name");
  const phone = getNullableString(formData, "phone");
  const accountEmail =
    getNullableString(formData, "accountEmail")?.toLowerCase() || null;
  const rawAuthUserId = getNullableString(formData, "authUserId");
  const authUserId = cleanUuid(rawAuthUserId);
  const color = getString(formData, "color") || "#23313f";
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const role = getString(formData, "role") || "driver";
  const plainNotes = getNullableString(formData, "plainNotes");
  const defaultInterface = getDefaultInterface(
    role,
    getString(formData, "defaultInterface")
  );

  const grantedPermissions = permissionKeys.filter(
    (key) => getString(formData, `grant_${key}`) === "on"
  );
  const deniedPermissions = permissionKeys.filter(
    (key) => getString(formData, `deny_${key}`) === "on"
  );
  const permissions = deriveLegacyPermissions(grantedPermissions);

  if (!name) {
    throw new Error("Name is required.");
  }

  if (rawAuthUserId && !authUserId) {
    throw new Error("Auth user id must be a valid UUID.");
  }

  const notes = buildNotes(
    {
      role,
      permissions,
      appPermissions: grantedPermissions,
      deniedPermissions,
      defaultInterface,
    },
    plainNotes
  );

  const { data, error } = await supabase.rpc("admin_save_staff_member", {
    p_route_driver_id: driverId,
    p_name: name,
    p_phone: phone,
    p_account_email: accountEmail,
    p_explicit_auth_user_id: authUserId,
    p_color: color,
    p_sort_order: sortOrder,
    p_notes: notes,
    p_role: role,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object") {
    throw new Error("Staff member was not saved correctly.");
  }

  revalidateStaffPages();
}

export async function deactivateStaffAction(formData: FormData) {
  const supabase = await createClient();

  await assertStaffPermission(supabase, "settings");

  const driverId = getString(formData, "driverId");

  if (!driverId) {
    throw new Error("Missing staff id.");
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("route_drivers")
    .update({
      active: false,
      deleted_at: now,
      updated_at: now,
    })
    .eq("id", driverId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateStaffPages();
}

export async function sendStaffPasswordResetAction(formData: FormData) {
  const supabase = await createClient();

  await assertStaffPermission(supabase, "settings");

  const driverId = cleanUuid(getNullableString(formData, "driverId"));

  if (!driverId) {
    throw new Error("Missing staff id.");
  }

  const { data: staffMember, error: staffError } = await supabase
    .from("route_drivers")
    .select("id, name, phone, account_email, auth_user_id, color, sort_order, notes")
    .eq("id", driverId)
    .is("deleted_at", null)
    .maybeSingle();

  if (staffError) {
    throw new Error(staffError.message);
  }

  if (!staffMember) {
    throw new Error("Staff member not found.");
  }

  const accountEmail = String(staffMember.account_email || "")
    .trim()
    .toLowerCase();

  if (!accountEmail) {
    throw new Error("Account email is required to create staff login.");
  }

  const staffMeta = parseStaffMeta(staffMember.notes);
  const role = staffMeta.role || "driver";

  const { data: identityResult, error: identityError } = await supabase.rpc(
    "admin_save_staff_member",
    {
      p_route_driver_id: driverId,
      p_name: String(staffMember.name || "").trim(),
      p_phone: staffMember.phone || null,
      p_account_email: accountEmail,
      p_explicit_auth_user_id: null,
      p_color: staffMember.color || "#23313f",
      p_sort_order: staffMember.sort_order ?? 100,
      p_notes: staffMember.notes || null,
      p_role: role,
    }
  );

  if (identityError) {
    throw new Error(identityError.message);
  }

  const origin = await getAuthRequestOrigin();
  const inviteRedirectTo = new URL(
    "/auth/reset-password/callback",
    origin,
  ).toString();
  const recoveryRedirectTo = new URL(
    "/reset-password",
    origin,
  ).toString();

  if (!identityResult || typeof identityResult !== "object") {
    throw new Error("Staff identity was not resolved correctly.");
  }

  const resolvedIdentity = identityResult as {
    linked?: boolean;
    auth_user_id?: string | null;
    reason?: string;
  };

  let authUserId = cleanUuid(resolvedIdentity.auth_user_id || null);

  if (resolvedIdentity.linked === true && !authUserId) {
    throw new Error("Staff identity is linked but Auth user id is missing.");
  }

  if (
    resolvedIdentity.linked !== true &&
    resolvedIdentity.reason !== "no_auth_account"
  ) {
    throw new Error("Staff login identity could not be resolved.");
  }

  let createdAuthUser = false;

  if (!authUserId) {
    const service = createServiceClient();
    const { data: inviteResult, error: inviteError } =
      await service.auth.admin.inviteUserByEmail(accountEmail, {
        redirectTo: inviteRedirectTo,
        data: {
          staff_name: String(staffMember.name || "").trim(),
        },
      });

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    authUserId = cleanUuid(inviteResult.user?.id || null);

    if (!authUserId) {
      throw new Error("Supabase Auth did not return the invited user id.");
    }

    createdAuthUser = true;
  }

  if (!createdAuthUser) {
    const recoveryClient = createStaffRecoveryClient();
    const { error: resetError } = await recoveryClient.auth.resetPasswordForEmail(
      accountEmail,
      { redirectTo: recoveryRedirectTo }
    );

    if (resetError) {
      throw new Error(resetError.message);
    }
  }

  if (createdAuthUser) {
    const { data: linkResult, error: linkError } = await supabase.rpc(
      "admin_save_staff_member",
      {
        p_route_driver_id: driverId,
        p_name: String(staffMember.name || "").trim(),
        p_phone: staffMember.phone || null,
        p_account_email: accountEmail,
        p_explicit_auth_user_id: authUserId,
        p_color: staffMember.color || "#23313f",
        p_sort_order: staffMember.sort_order ?? 100,
        p_notes: staffMember.notes || null,
        p_role: role,
      }
    );

    if (linkError) {
      throw new Error(linkError.message);
    }

    if (!linkResult || typeof linkResult !== "object") {
      throw new Error("Staff login was created but could not be linked.");
    }

    if ((linkResult as { linked?: boolean }).linked !== true) {
      throw new Error("Staff login was created but could not be linked.");
    }
  }

  revalidateStaffPages();
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getUnifiedAccess, isStaffRole, isSystemRole, type AppPermission, type InterfaceKey } from "@/lib/auth/access";
import {
  ACCESS_MATRIX_ROLES,
  buildStaffNotes,
  fetchManagedRoles,
  fetchManagedUsers,
  parseStaffMeta,
} from "@/lib/admin/access-management";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function slugifyRoleKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePermissions(values: string[]) {
  return Array.from(new Set(values)) as AppPermission[];
}

function normalizeInterfaces(values: string[]) {
  return Array.from(
    new Set(
      values.filter(
        (value): value is InterfaceKey =>
          value === "admin" || value === "driver" || value === "customer"
      )
    )
  );
}

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    code === "42883" ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("function")
  );
}

async function assertCanManageRoles(supabase: any) {
  const access = await getUnifiedAccess(supabase);

  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("roles.edit")) {
    throw new Error("Access denied. Missing roles.edit permission.");
  }

  return access;
}

async function assertCanAssignRoles(supabase: any) {
  const access = await getUnifiedAccess(supabase);

  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("roles.assign")) {
    throw new Error("Access denied. Missing roles.assign permission.");
  }

  return access;
}

async function writeAuditEntries(
  supabase: any,
  entries: Array<{
    actorName: string;
    actorEmail: string | null;
    targetName: string;
    targetEmail: string | null;
    targetRole: string | null;
    action: string;
    permissionKey?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
  }>
) {
  if (entries.length === 0) {
    return;
  }

  const { error } = await supabase.from("access_audit_log").insert(
    entries.map((entry) => ({
      actor_name: entry.actorName,
      actor_email: entry.actorEmail,
      target_name: entry.targetName,
      target_email: entry.targetEmail,
      target_role: entry.targetRole,
      action: entry.action,
      permission_key: entry.permissionKey || null,
      old_value: entry.oldValue || null,
      new_value: entry.newValue || null,
    }))
  );

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }
}

async function upsertRoleRecord(supabase: any, payload: {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: AppPermission[];
  interfaces: InterfaceKey[];
}) {
  const { error } = await supabase.from("app_roles").upsert(
    {
      key: payload.key,
      name: payload.name,
      description: payload.description,
      is_system: payload.isSystem,
      permissions: payload.permissions,
      interfaces: payload.interfaces,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("Apply the latest Supabase migration to store custom roles and audit history.");
    }

    throw new Error(error.message);
  }
}

async function syncRouteDriverMeta(params: {
  supabase: any;
  driverId: string | null;
  authUserId: string | null;
  primaryRole: string;
  additionalRoles: string[];
  grantedPermissions: AppPermission[];
  deniedPermissions: AppPermission[];
  defaultInterface: InterfaceKey;
  plainNotes: string | null;
}) {
  let driver = null as any;

  if (params.driverId) {
    const result = await params.supabase
      .from("route_drivers")
      .select("id, notes")
      .eq("id", params.driverId)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    driver = result.data || null;
  } else if (params.authUserId) {
    const result = await params.supabase
      .from("route_drivers")
      .select("id, notes")
      .eq("auth_user_id", params.authUserId)
      .maybeSingle();

    if (result.error && !isMissingTableError(result.error)) {
      throw new Error(result.error.message);
    }

    driver = result.data || null;
  }

  if (!driver?.id) {
    return;
  }

  const existingMeta = parseStaffMeta(driver.notes);
  const nextNotes = buildStaffNotes(
    {
      role: params.primaryRole,
      additionalRoles: params.additionalRoles,
      permissions: [],
      appPermissions: params.grantedPermissions,
      deniedPermissions: params.deniedPermissions,
      defaultInterface: params.defaultInterface,
    },
    params.plainNotes ?? existingMeta.plainNotes
  );

  const { error } = await params.supabase
    .from("route_drivers")
    .update({
      notes: nextNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", driver.id);

  if (error) {
    throw new Error(error.message);
  }
}

async function upsertProfileAccess(params: {
  supabase: any;
  authUserId: string | null;
  primaryRole: string;
  additionalRoles: string[];
  grantedPermissions: AppPermission[];
  deniedPermissions: AppPermission[];
  defaultInterface: InterfaceKey;
  isActive: boolean;
}) {
  if (!params.authUserId) {
    return;
  }

  const existing = await params.supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", params.authUserId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  const payload = {
    auth_user_id: params.authUserId,
    role: params.primaryRole,
    additional_roles: params.additionalRoles,
    default_interface: params.defaultInterface,
    permissions: params.grantedPermissions,
    denied_permissions: params.deniedPermissions,
    is_active: params.isActive,
    updated_at: new Date().toISOString(),
  };

  if (existing.data?.id) {
    const { error } = await params.supabase
      .from("profiles")
      .update(payload)
      .eq("id", existing.data.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await params.supabase.from("profiles").insert(payload);

  if (error) {
    throw new Error(error.message);
  }
}

function revalidateAccessPages() {
  revalidatePath("/admin/access");
  revalidatePath("/admin/staff");
  revalidatePath("/admin");
  revalidatePath("/driver");
  revalidatePath("/account");
}

function redirectToTab(tab: string) {
  redirect(`/admin/access?tab=${encodeURIComponent(tab)}`);
}

export async function upsertRoleAction(formData: FormData) {
  const supabase = await createClient();
  const access = await assertCanManageRoles(supabase);
  const tab = getString(formData, "tab") || "roles";
  const originalKey = getString(formData, "originalKey");
  const isSystem = getString(formData, "isSystem") === "true";
  const key = slugifyRoleKey(getString(formData, "roleKey") || originalKey);
  const name = getString(formData, "roleName");
  const description = getString(formData, "roleDescription");
  const permissions = normalizePermissions(getStringList(formData, "permissions"));
  const interfaces = normalizeInterfaces(getStringList(formData, "interfaces"));

  if (!key || !name) {
    throw new Error("Role key and role name are required.");
  }

  if (interfaces.length === 0) {
    interfaces.push("admin");
  }

  const roles = await fetchManagedRoles(supabase);
  const previous = roles.find((role) => role.key === key || role.key === originalKey) || null;

  if (originalKey && originalKey !== key) {
    throw new Error("Role keys are immutable after creation. Clone the role to use a new key.");
  }

  await upsertRoleRecord(supabase, {
    key,
    name,
    description,
    isSystem,
    permissions,
    interfaces,
  });

  const addedPermissions = permissions.filter(
    (permission) => !previous?.permissions.includes(permission)
  );
  const removedPermissions = (previous?.permissions || []).filter(
    (permission) => !permissions.includes(permission)
  );

  await writeAuditEntries(supabase, [
    {
      actorName: access.displayName,
      actorEmail: access.user.email || null,
      targetName: name,
      targetEmail: null,
      targetRole: key,
      action: previous ? "role_updated" : "role_created",
      oldValue: previous ? JSON.stringify(previous.permissions) : null,
      newValue: JSON.stringify(permissions),
    },
    ...addedPermissions.map((permission) => ({
      actorName: access.displayName,
      actorEmail: access.user.email || null,
      targetName: name,
      targetEmail: null,
      targetRole: key,
      action: "permission_added",
      permissionKey: permission,
      oldValue: "off",
      newValue: "on",
    })),
    ...removedPermissions.map((permission) => ({
      actorName: access.displayName,
      actorEmail: access.user.email || null,
      targetName: name,
      targetEmail: null,
      targetRole: key,
      action: "permission_removed",
      permissionKey: permission,
      oldValue: "on",
      newValue: "off",
    })),
  ]);

  revalidateAccessPages();
  redirectToTab(tab);
}

export async function cloneRoleAction(formData: FormData) {
  const supabase = await createClient();
  const access = await assertCanManageRoles(supabase);
  const tab = getString(formData, "tab") || "roles";
  const sourceKey = getString(formData, "sourceKey");
  const clonedKey = slugifyRoleKey(getString(formData, "clonedRoleKey"));
  const clonedName = getString(formData, "clonedRoleName");

  if (!sourceKey || !clonedKey || !clonedName) {
    throw new Error("Source role, clone key and clone name are required.");
  }

  const roles = await fetchManagedRoles(supabase);
  const sourceRole = roles.find((role) => role.key === sourceKey);

  if (!sourceRole) {
    throw new Error("Source role not found.");
  }

  await upsertRoleRecord(supabase, {
    key: clonedKey,
    name: clonedName,
    description: `${sourceRole.description} (Cloned from ${sourceRole.name})`,
    isSystem: false,
    permissions: sourceRole.permissions,
    interfaces: sourceRole.interfaces,
  });

  await writeAuditEntries(supabase, [
    {
      actorName: access.displayName,
      actorEmail: access.user.email || null,
      targetName: clonedName,
      targetEmail: null,
      targetRole: clonedKey,
      action: "role_cloned",
      oldValue: sourceRole.key,
      newValue: clonedKey,
    },
  ]);

  revalidateAccessPages();
  redirectToTab(tab);
}

export async function deleteRoleAction(formData: FormData) {
  const supabase = await createClient();
  const access = await assertCanManageRoles(supabase);
  const tab = getString(formData, "tab") || "roles";
  const key = getString(formData, "roleKey");

  if (!key) {
    throw new Error("Role key is required.");
  }

  if (isSystemRole(key)) {
    throw new Error("System roles cannot be deleted.");
  }

  const [roles, users] = await Promise.all([fetchManagedRoles(supabase), fetchManagedUsers(supabase)]);
  const role = roles.find((item) => item.key === key);

  if (!role) {
    throw new Error("Role not found.");
  }

  if (role.userCount > 0 || users.some((user) => user.primaryRole === key || user.additionalRoles.includes(key))) {
    throw new Error("Remove this role from assigned users before deleting it.");
  }

  const { error } = await supabase.from("app_roles").delete().eq("key", key);

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error("Apply the latest Supabase migration to delete stored custom roles.");
    }

    throw new Error(error.message);
  }

  await writeAuditEntries(supabase, [
    {
      actorName: access.displayName,
      actorEmail: access.user.email || null,
      targetName: role.name,
      targetEmail: null,
      targetRole: key,
      action: "role_deleted",
      oldValue: key,
      newValue: null,
    },
  ]);

  revalidateAccessPages();
  redirectToTab(tab);
}

export async function updateUserAccessAction(formData: FormData) {
  const supabase = await createClient();
  const access = await assertCanAssignRoles(supabase);
  const tab = getString(formData, "tab") || "users";
  const authUserId = getString(formData, "authUserId") || null;
  const driverId = getString(formData, "driverId") || null;
  const name = getString(formData, "name") || "Staff account";
  const email = getString(formData, "email") || null;
  const primaryRole = getString(formData, "primaryRole") || "driver";
  const additionalRoles = getStringList(formData, "additionalRoles").filter(
    (roleKey) => roleKey !== primaryRole
  );
  const grantedPermissions = normalizePermissions(getStringList(formData, "permissions"));
  const deniedPermissions = normalizePermissions(getStringList(formData, "deniedPermissions"));
  const defaultInterface = normalizeInterfaces([getString(formData, "defaultInterface")])[0] || "admin";
  const isActive = getString(formData, "isActive") === "true";
  const plainNotes = getString(formData, "plainNotes") || null;

  if (!driverId && !authUserId) {
    throw new Error("The selected employee is not linked to a staff or auth record.");
  }

  const users = await fetchManagedUsers(supabase);
  const previous = users.find(
    (user) =>
      (authUserId && user.authUserId === authUserId) ||
      (driverId && user.driverId === driverId)
  );

  await upsertProfileAccess({
    supabase,
    authUserId,
    primaryRole,
    additionalRoles,
    grantedPermissions,
    deniedPermissions,
    defaultInterface,
    isActive,
  });

  await syncRouteDriverMeta({
    supabase,
    driverId,
    authUserId,
    primaryRole,
    additionalRoles,
    grantedPermissions,
    deniedPermissions,
    defaultInterface,
    plainNotes,
  });

  const auditEntries = [
    previous?.primaryRole !== primaryRole
      ? {
          actorName: access.displayName,
          actorEmail: access.user.email || null,
          targetName: name,
          targetEmail: email,
          targetRole: primaryRole,
          action: "primary_role_changed",
          oldValue: previous?.primaryRole || null,
          newValue: primaryRole,
        }
      : null,
    JSON.stringify(previous?.additionalRoles || []) !== JSON.stringify(additionalRoles)
      ? {
          actorName: access.displayName,
          actorEmail: access.user.email || null,
          targetName: name,
          targetEmail: email,
          targetRole: primaryRole,
          action: "additional_roles_changed",
          oldValue: JSON.stringify(previous?.additionalRoles || []),
          newValue: JSON.stringify(additionalRoles),
        }
      : null,
    previous?.defaultInterface !== defaultInterface
      ? {
          actorName: access.displayName,
          actorEmail: access.user.email || null,
          targetName: name,
          targetEmail: email,
          targetRole: primaryRole,
          action: "default_interface_changed",
          oldValue: previous?.defaultInterface || null,
          newValue: defaultInterface,
        }
      : null,
    previous?.isActive !== isActive
      ? {
          actorName: access.displayName,
          actorEmail: access.user.email || null,
          targetName: name,
          targetEmail: email,
          targetRole: primaryRole,
          action: "status_changed",
          oldValue: previous?.isActive ? "active" : "disabled",
          newValue: isActive ? "active" : "disabled",
        }
      : null,
    ...grantedPermissions
      .filter((permission) => !(previous?.grantedPermissions || []).includes(permission))
      .map((permission) => ({
        actorName: access.displayName,
        actorEmail: access.user.email || null,
        targetName: name,
        targetEmail: email,
        targetRole: primaryRole,
        action: "permission_added",
        permissionKey: permission,
        oldValue: "off",
        newValue: "on",
      })),
    ...(previous?.grantedPermissions || [])
      .filter((permission) => !grantedPermissions.includes(permission))
      .map((permission) => ({
        actorName: access.displayName,
        actorEmail: access.user.email || null,
        targetName: name,
        targetEmail: email,
        targetRole: primaryRole,
        action: "permission_removed",
        permissionKey: permission,
        oldValue: "on",
        newValue: "off",
      })),
  ].filter(Boolean) as Array<{
    actorName: string;
    actorEmail: string | null;
    targetName: string;
    targetEmail: string | null;
    targetRole: string | null;
    action: string;
    permissionKey?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
  }>;

  await writeAuditEntries(supabase, auditEntries);

  revalidateAccessPages();
  redirectToTab(tab);
}

export async function updatePermissionMatrixAction(formData: FormData) {
  const supabase = await createClient();
  const access = await assertCanManageRoles(supabase);
  const tab = getString(formData, "tab") || "matrix";
  const roles = await fetchManagedRoles(supabase);

  for (const roleKey of ACCESS_MATRIX_ROLES) {
    const existingRole = roles.find((role) => role.key === roleKey);

    if (!existingRole) {
      continue;
    }

    const nextPermissions = normalizePermissions(
      Array.from(formData.keys())
        .filter((key) => key.startsWith(`matrix:${roleKey}:`))
        .map((key) => key.replace(`matrix:${roleKey}:`, ""))
    );

    await upsertRoleRecord(supabase, {
      key: roleKey,
      name: existingRole.name,
      description: existingRole.description,
      isSystem: true,
      permissions: nextPermissions,
      interfaces: existingRole.interfaces,
    });

    const addedPermissions = nextPermissions.filter(
      (permission) => !existingRole.permissions.includes(permission)
    );
    const removedPermissions = existingRole.permissions.filter(
      (permission) => !nextPermissions.includes(permission)
    );

    await writeAuditEntries(supabase, [
      ...addedPermissions.map((permission) => ({
        actorName: access.displayName,
        actorEmail: access.user.email || null,
        targetName: existingRole.name,
        targetEmail: null,
        targetRole: roleKey,
        action: "permission_added",
        permissionKey: permission,
        oldValue: "off",
        newValue: "on",
      })),
      ...removedPermissions.map((permission) => ({
        actorName: access.displayName,
        actorEmail: access.user.email || null,
        targetName: existingRole.name,
        targetEmail: null,
        targetRole: roleKey,
        action: "permission_removed",
        permissionKey: permission,
        oldValue: "on",
        newValue: "off",
      })),
    ]);
  }

  revalidateAccessPages();
  redirectToTab(tab);
}
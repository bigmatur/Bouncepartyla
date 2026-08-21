import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  STAFF_ROLES,
  SYSTEM_PERMISSIONS,
  getAvailableInterfacesForAccess,
  getRoleBasePermissions,
  isSystemRole,
  type AppPermission,
  type InterfaceKey,
  type RoleKey,
} from "@/lib/auth/access";

const META_START = "[[STAFF_META]]";
const META_END = "[[/STAFF_META]]";

export const ACCESS_MATRIX_ROLES = [
  "super_admin",
  "admin",
  "manager",
  "dispatcher",
  "cashier",
  "warehouse",
  "content_manager",
  "driver",
] as const;

export type ManagedRole = {
  key: RoleKey;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: AppPermission[];
  interfaces: InterfaceKey[];
  userCount: number;
};

export type ManagedUser = {
  profileId: string | null;
  driverId: string | null;
  authUserId: string | null;
  name: string;
  email: string | null;
  primaryRole: RoleKey;
  additionalRoles: RoleKey[];
  status: string;
  defaultInterface: InterfaceKey;
  lastLoginAt: string | null;
  grantedPermissions: AppPermission[];
  deniedPermissions: AppPermission[];
  isActive: boolean;
  plainNotes: string;
};

export type AccessAuditEntry = {
  id: string;
  actorName: string;
  actorEmail: string | null;
  targetName: string;
  targetEmail: string | null;
  targetRole: string | null;
  action: string;
  permissionKey: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

type StaffMeta = {
  role: string;
  additionalRoles?: string[];
  permissions: string[];
  appPermissions?: string[];
  deniedPermissions?: string[];
  defaultInterface?: InterfaceKey;
};

export function getRoleLabel(roleKey: string | null | undefined) {
  if (!roleKey) {
    return "Unassigned";
  }

  if (isSystemRole(roleKey)) {
    return ROLE_LABELS[roleKey];
  }

  return roleKey
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getRoleDescription(roleKey: RoleKey, description?: string | null) {
  if (description && description.trim()) {
    return description.trim();
  }

  if (isSystemRole(roleKey)) {
    return ROLE_DESCRIPTIONS[roleKey];
  }

  return "Custom permission bundle for staff access and interface switching.";
}

export function getPermissionLabel(permission: AppPermission) {
  const [scope, action] = permission.split(".");

  return `${scope.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())} ${action
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

function defaultInterfaceForRole(role: string) {
  if (role === "driver") {
    return "driver";
  }

  if (role === "customer") {
    return "customer";
  }

  return "admin";
}

function isMissingColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return code === "42703" || (message.includes("column") && message.includes("does not exist"));
}

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    code === "42883" ||
    message.includes("relation") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("function")
  );
}

function normalizePermissionList(values: unknown) {
  if (!Array.isArray(values)) {
    return [] as AppPermission[];
  }

  return values
    .map((value) => String(value || ""))
    .filter((value): value is AppPermission => SYSTEM_PERMISSIONS.includes(value as AppPermission));
}

function normalizeInterfaceList(values: unknown) {
  if (!Array.isArray(values)) {
    return [] as InterfaceKey[];
  }

  return values
    .map((value) => String(value || ""))
    .filter((value): value is InterfaceKey => value === "admin" || value === "driver" || value === "customer");
}

function normalizeRoleList(values: unknown) {
  if (!Array.isArray(values)) {
    return [] as RoleKey[];
  }

  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

export function parseStaffMeta(notes: string | null | undefined) {
  const raw = String(notes || "");
  const start = raw.indexOf(META_START);
  const end = raw.indexOf(META_END);

  if (start === -1 || end === -1 || end < start) {
    return {
      role: "driver",
      additionalRoles: [] as string[],
      appPermissions: [] as AppPermission[],
      deniedPermissions: [] as AppPermission[],
      defaultInterface: "driver" as InterfaceKey,
      plainNotes: raw,
    };
  }

  const rawJson = raw.slice(start + META_START.length, end);
  const before = raw.slice(0, start).trim();
  const after = raw.slice(end + META_END.length).trim();

  try {
    const parsed = JSON.parse(rawJson);

    return {
      role: typeof parsed?.role === "string" && parsed.role.trim() ? parsed.role.trim() : "driver",
      additionalRoles: normalizeRoleList(parsed?.additionalRoles),
      appPermissions: normalizePermissionList(parsed?.appPermissions),
      deniedPermissions: normalizePermissionList(parsed?.deniedPermissions),
      defaultInterface:
        parsed?.defaultInterface === "admin" ||
        parsed?.defaultInterface === "driver" ||
        parsed?.defaultInterface === "customer"
          ? parsed.defaultInterface
          : "driver",
      plainNotes: [before, after].filter(Boolean).join("\n\n"),
    };
  } catch {
    return {
      role: "driver",
      additionalRoles: [] as string[],
      appPermissions: [] as AppPermission[],
      deniedPermissions: [] as AppPermission[],
      defaultInterface: "driver" as InterfaceKey,
      plainNotes: [before, after].filter(Boolean).join("\n\n"),
    };
  }
}

export function buildStaffNotes(staffMeta: StaffMeta, plainNotes: string | null) {
  const metaBlock = `${META_START}${JSON.stringify(staffMeta)}${META_END}`;
  const cleanNotes = String(plainNotes || "").trim();

  return cleanNotes ? `${metaBlock}\n\n${cleanNotes}` : metaBlock;
}

async function fetchProfileRows(supabase: any) {
  const selectVariants = [
    "id, auth_user_id, role, additional_roles, is_active, default_interface, permissions, denied_permissions",
    "id, auth_user_id, role, is_active, default_interface, permissions, denied_permissions",
    "id, auth_user_id, role, is_active, permissions, denied_permissions",
    "id, auth_user_id, role, is_active",
  ];

  for (const selectClause of selectVariants) {
    const result = await supabase.from("profiles").select(selectClause);

    if (!result.error) {
      return result.data || [];
    }

    if (!isMissingColumnError(result.error)) {
      throw new Error(result.error.message);
    }
  }

  return [];
}

async function fetchDriverRows(supabase: any) {
  const selectVariants = [
    "id, name, account_email, auth_user_id, notes, active",
    "id, name, account_email, auth_user_id, notes",
    "id, name, account_email, notes",
    "id, name, notes",
  ];

  for (const selectClause of selectVariants) {
    const result = await supabase
      .from("route_drivers")
      .select(selectClause)
      .order("name", { ascending: true });

    if (!result.error) {
      return result.data || [];
    }

    if (!isMissingColumnError(result.error)) {
      throw new Error(result.error.message);
    }
  }

  return [];
}

async function fetchDirectoryRows(supabase: any) {
  const result = await supabase.rpc("admin_access_user_directory");

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return [];
    }

    throw new Error(result.error.message);
  }

  return result.data || [];
}

async function fetchStoredRoles(supabase: any) {
  const result = await supabase
    .from("app_roles")
    .select("key, name, description, is_system, permissions, interfaces")
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return [];
    }

    throw new Error(result.error.message);
  }

  return result.data || [];
}

export async function fetchManagedUsers(supabase: any): Promise<ManagedUser[]> {
  const [profileRows, driverRows, directoryRows] = await Promise.all([
    fetchProfileRows(supabase),
    fetchDriverRows(supabase),
    fetchDirectoryRows(supabase),
  ]);

  const profilesByAuthUserId = new Map<string, any>();
  const driversByAuthUserId = new Map<string, any>();
  const directoryByAuthUserId = new Map<string, any>();

  profileRows.forEach((profile: any) => {
    if (profile?.auth_user_id) {
      profilesByAuthUserId.set(String(profile.auth_user_id), profile);
    }
  });

  driverRows.forEach((driver: any) => {
    if (driver?.auth_user_id) {
      driversByAuthUserId.set(String(driver.auth_user_id), driver);
    }
  });

  directoryRows.forEach((item: any) => {
    if (item?.auth_user_id) {
      directoryByAuthUserId.set(String(item.auth_user_id), item);
    }
  });

  const seenKeys = new Set<string>();
  const users: ManagedUser[] = [];

  const pushUser = (key: string, profile: any | null, driver: any | null, directory: any | null) => {
    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);

    const meta = parseStaffMeta(driver?.notes || null);
    const primaryRole = String(profile?.role || meta.role || "driver").trim() || "driver";
    const additionalRoles = normalizeRoleList(profile?.additional_roles || meta.additionalRoles).filter(
      (roleKey) => roleKey !== primaryRole
    );
    const grantedPermissions = normalizePermissionList(profile?.permissions || meta.appPermissions);
    const deniedPermissions = normalizePermissionList(profile?.denied_permissions || meta.deniedPermissions);
    const defaultInterface = normalizeInterfaceList([profile?.default_interface || meta.defaultInterface])[0] || defaultInterfaceForRole(primaryRole);
    const isActive = profile?.is_active === undefined
      ? driver?.active === undefined
        ? true
        : Boolean(driver.active)
      : Boolean(profile.is_active);

    users.push({
      profileId: typeof profile?.id === "string" ? profile.id : null,
      driverId: typeof driver?.id === "string" ? driver.id : null,
      authUserId: typeof profile?.auth_user_id === "string"
        ? profile.auth_user_id
        : typeof driver?.auth_user_id === "string"
          ? driver.auth_user_id
          : typeof directory?.auth_user_id === "string"
            ? directory.auth_user_id
            : null,
      name:
        String(
          driver?.name ||
            directory?.full_name ||
            directory?.email ||
            "Staff account"
        ) || "Staff account",
      email:
        typeof driver?.account_email === "string"
          ? driver.account_email
          : typeof directory?.email === "string"
            ? directory.email
            : null,
      primaryRole,
      additionalRoles,
      status: isActive ? "Active" : "Disabled",
      defaultInterface,
      lastLoginAt:
        typeof directory?.last_sign_in_at === "string" ? directory.last_sign_in_at : null,
      grantedPermissions,
      deniedPermissions,
      isActive,
      plainNotes: meta.plainNotes,
    });
  };

  Array.from(
    new Set([
      ...profileRows.map((item: any) => String(item?.auth_user_id || item?.id || "")).filter(Boolean),
      ...driverRows.map((item: any) => String(item?.auth_user_id || item?.id || "")).filter(Boolean),
      ...directoryRows.map((item: any) => String(item?.auth_user_id || "")).filter(Boolean),
    ])
  ).forEach((key) => {
    pushUser(
      key,
      profilesByAuthUserId.get(key) || profileRows.find((item: any) => String(item?.id || "") === key) || null,
      driversByAuthUserId.get(key) || driverRows.find((item: any) => String(item?.id || "") === key) || null,
      directoryByAuthUserId.get(key) || null
    );
  });

  return users.sort((left, right) => left.name.localeCompare(right.name));
}

export async function fetchManagedRoles(supabase: any, users?: ManagedUser[]): Promise<ManagedRole[]> {
  const [storedRoles, managedUsers] = await Promise.all([
    fetchStoredRoles(supabase),
    users ? Promise.resolve(users) : fetchManagedUsers(supabase),
  ]);

  const userCounts = new Map<string, number>();

  managedUsers.forEach((user) => {
    const keys = [user.primaryRole, ...user.additionalRoles].filter(Boolean);

    keys.forEach((key) => {
      userCounts.set(key, (userCounts.get(key) || 0) + 1);
    });
  });

  const systemRoles = ACCESS_MATRIX_ROLES.map((roleKey) => {
    const permissions = getRoleBasePermissions(roleKey);
    const defaultInterface = defaultInterfaceForRole(roleKey);

    return {
      key: roleKey,
      name: ROLE_LABELS[roleKey],
      description: ROLE_DESCRIPTIONS[roleKey],
      isSystem: true,
      permissions,
      interfaces: getAvailableInterfacesForAccess({
        role: roleKey,
        grantedPermissions: permissions,
        defaultInterface,
      }),
      userCount: userCounts.get(roleKey) || 0,
    } satisfies ManagedRole;
  });

  const roleMap = new Map<string, ManagedRole>(systemRoles.map((role) => [role.key, role]));

  storedRoles.forEach((row: any) => {
    const key = String(row?.key || "").trim();

    if (!key) {
      return;
    }

    const permissions = normalizePermissionList(row?.permissions);
    const interfaces = normalizeInterfaceList(row?.interfaces);
    const nextRole: ManagedRole = {
      key,
      name: String(row?.name || getRoleLabel(key)),
      description: getRoleDescription(key, row?.description),
      isSystem: Boolean(row?.is_system) || isSystemRole(key),
      permissions,
      interfaces:
        interfaces.length > 0
          ? interfaces
          : getAvailableInterfacesForAccess({
              role: key,
              grantedPermissions: permissions,
              defaultInterface: defaultInterfaceForRole(key),
            }),
      userCount: userCounts.get(key) || 0,
    };

    roleMap.set(key, nextRole);
  });

  return Array.from(roleMap.values()).sort((left, right) => {
    if (left.isSystem !== right.isSystem) {
      return left.isSystem ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export async function fetchAccessAuditLog(supabase: any): Promise<AccessAuditEntry[]> {
  const result = await supabase
    .from("access_audit_log")
    .select(
      "id, actor_name, actor_email, target_name, target_email, target_role, action, permission_key, old_value, new_value, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) {
    if (isMissingTableError(result.error)) {
      return [];
    }

    throw new Error(result.error.message);
  }

  return (result.data || []).map((row: any) => ({
    id: String(row.id),
    actorName: String(row.actor_name || "Unknown actor"),
    actorEmail: typeof row.actor_email === "string" ? row.actor_email : null,
    targetName: String(row.target_name || "Unknown user"),
    targetEmail: typeof row.target_email === "string" ? row.target_email : null,
    targetRole: typeof row.target_role === "string" ? row.target_role : null,
    action: String(row.action || "updated"),
    permissionKey: typeof row.permission_key === "string" ? row.permission_key : null,
    oldValue: row.old_value === null || row.old_value === undefined ? null : String(row.old_value),
    newValue: row.new_value === null || row.new_value === undefined ? null : String(row.new_value),
    createdAt: String(row.created_at || new Date().toISOString()),
  }));
}

export function getAllRoleOptions(roles: ManagedRole[]) {
  return roles.map((role) => ({
    value: role.key,
    label: role.name,
  }));
}

export const ACCESS_ROLE_OPTIONS = STAFF_ROLES.map((roleKey) => ({
  value: roleKey,
  label: ROLE_LABELS[roleKey],
}));
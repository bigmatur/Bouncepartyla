import "server-only";
import {
  SYSTEM_ROLES,
  SYSTEM_PERMISSIONS,
  defaultInterfaceForRole,
  getAvailableInterfacesForAccess,
  getBasePermissionsForRoleKey,
  isInterfaceKey,
  isStaffRole,
  isSystemRole,
  type AppPermission,
  type AppRole,
  type InterfaceKey,
  type RoleKey,
} from "./access-shared";

export * from "./access-shared";

const META_START = "[[STAFF_META]]";
const META_END = "[[/STAFF_META]]";

const LEGACY_PERMISSION_MAP: Record<string, AppPermission[]> = {
  routes_board: [
    "dashboard.view",
    "routes.view",
    "routes.edit",
    "routes.assign_driver",
    "preview.driver",
  ],
  driver_checklists: ["routes.view", "preview.driver"],
  bookings: [
    "bookings.view",
    "bookings.create",
    "bookings.edit",
    "customers.view",
  ],
  catalog: ["catalog.view", "catalog.edit"],
  inventory: ["inventory.view", "inventory.edit"],
  reports: ["reports.view"],
  settings: ["settings.view", "settings.edit", "staff.view", "staff.edit"],
};


export type UnifiedAccess = {
  user: any;
  profileId: string | null;
  role: RoleKey | null;
  additionalRoles: RoleKey[];
  isActive: boolean;
  customerId: string | null;
  driverId: string | null;
  driverName: string | null;
  displayName: string;
  defaultInterface: InterfaceKey;
  availableInterfaces: InterfaceKey[];
  grantedPermissions: AppPermission[];
  deniedPermissions: AppPermission[];
  can: (permission: AppPermission) => boolean;
};

function isMissingColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return code === "42703" || (message.includes("column") && message.includes("does not exist"));
}

function isRole(value: unknown): value is AppRole {
  return isSystemRole(value);
}

function isPermission(value: unknown): value is AppPermission {
  return typeof value === "string" && SYSTEM_PERMISSIONS.includes(value as AppPermission);
}

function normalizePermissionList(values: unknown): AppPermission[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => String(value || "")).filter(isPermission);
}

function normalizeRoleList(values: unknown): RoleKey[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function getDisplayName(user: any, routeDriver: any) {
  const userMetadataName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.display_name ||
    null;

  return String(
    routeDriver?.name ||
      userMetadataName ||
      user?.email ||
      "Staff account"
  );
}

function parseLegacyStaffMeta(notes: string | null | undefined) {
  const raw = String(notes || "");
  const start = raw.indexOf(META_START);
  const end = raw.indexOf(META_END);

  const fallback = {
    role: "driver",
    permissions: ["routes_board", "driver_checklists"],
    appPermissions: [] as AppPermission[],
    deniedPermissions: [] as AppPermission[],
    defaultInterface: null as InterfaceKey | null,
  };

  if (start === -1 || end === -1 || end < start) {
    return fallback;
  }

  const jsonStart = start + META_START.length;
  const rawJson = raw.slice(jsonStart, end);

  try {
    const parsed = JSON.parse(rawJson);
    const role = typeof parsed?.role === "string" ? parsed.role : fallback.role;
    const permissions = Array.isArray(parsed?.permissions)
      ? parsed.permissions.map((item: any) => String(item || "")).filter(Boolean)
      : fallback.permissions;

    return {
      role,
      permissions,
      appPermissions: normalizePermissionList(parsed?.appPermissions),
      deniedPermissions: normalizePermissionList(parsed?.deniedPermissions),
      defaultInterface: isInterfaceKey(parsed?.defaultInterface)
        ? parsed.defaultInterface
        : null,
    };
  } catch {
    return fallback;
  }
}

async function getProfileRecord(supabase: any, userId: string) {
  const selectVariants = [
    "id, role, additional_roles, is_active, customer_id, default_interface, permissions, denied_permissions",
    "id, role, additional_roles, is_active, customer_id, permissions, denied_permissions",
    "id, role, is_active, customer_id, default_interface, permissions, denied_permissions",
    "id, role, is_active, customer_id, permissions, denied_permissions",
    "id, role, is_active, customer_id",
    "id, role, is_active",
  ];

  for (const selectClause of selectVariants) {
    const result = await supabase
      .from("profiles")
      .select(selectClause)
      .eq("auth_user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!result.error) {
      return result.data || null;
    }

    if (!isMissingColumnError(result.error)) {
      return null;
    }
  }

  return null;
}

async function getRouteDriverRecord(supabase: any, user: any) {
  const email = String(user?.email || "").toLowerCase();
  const userId = String(user?.id || "");

  if (!email && !userId) {
    return null;
  }

  const selectVariants = [
    "id, name, notes, account_email, auth_user_id, active, deleted_at",
    "id, name, notes, account_email, auth_user_id",
    "id, name, notes, account_email",
    "id, name, notes",
    "id, name",
  ];

  for (const selectClause of selectVariants) {
    let result;

    if (email && userId) {
      result = await supabase
        .from("route_drivers")
        .select(selectClause)
        .or(`auth_user_id.eq.${userId},account_email.eq.${email}`)
        .limit(1)
        .maybeSingle();
    } else if (userId) {
      result = await supabase
        .from("route_drivers")
        .select(selectClause)
        .eq("auth_user_id", userId)
        .limit(1)
        .maybeSingle();
    } else {
      result = await supabase
        .from("route_drivers")
        .select(selectClause)
        .eq("account_email", email)
        .limit(1)
        .maybeSingle();
    }

    if (!result.error) {
      return result.data || null;
    }

    if (!isMissingColumnError(result.error)) {
      return null;
    }
  }

  return null;
}

async function getCustomRolesByKeys(supabase: any, roleKeys: string[]) {
  if (roleKeys.length === 0) {
    return {} as Record<string, { permissions: AppPermission[]; interfaces: InterfaceKey[] }>;
  }

  const result = await supabase
    .from("app_roles")
    .select("key, permissions, interfaces")
    .in("key", roleKeys);

  if (result.error) {
    const message = String(result.error?.message || "").toLowerCase();
    const code = String(result.error?.code || "").toLowerCase();

    if (
      code === "42p01" ||
      message.includes("relation") ||
      message.includes("schema cache") ||
      message.includes("could not find the table")
    ) {
      return {} as Record<string, { permissions: AppPermission[]; interfaces: InterfaceKey[] }>;
    }

    throw new Error(result.error.message);
  }

  return Object.fromEntries(
    (result.data || []).map((item: any) => [
      String(item.key || ""),
      {
        permissions: normalizePermissionList(item.permissions),
        interfaces: Array.isArray(item.interfaces)
          ? item.interfaces.map((value: any) => String(value || "")).filter(isInterfaceKey)
          : [],
      },
    ])
  ) as Record<string, { permissions: AppPermission[]; interfaces: InterfaceKey[] }>;
}

function buildGrantedPermissions(
  role: RoleKey,
  additionalRoles: RoleKey[],
  granted: AppPermission[],
  denied: AppPermission[],
  customRolePermissions: Record<string, AppPermission[]>
) {
  const permissions = new Set<AppPermission>(
    getBasePermissionsForRoleKey(role, customRolePermissions)
  );

  additionalRoles.forEach((additionalRole) => {
    getBasePermissionsForRoleKey(additionalRole, customRolePermissions).forEach((permission) => {
      permissions.add(permission);
    });
  });

  granted.forEach((permission) => permissions.add(permission));
  denied.forEach((permission) => permissions.delete(permission));

  return Array.from(permissions);
}

function getLegacyGrantedPermissions(metaPermissions: string[]) {
  const permissions = new Set<AppPermission>();

  metaPermissions.forEach((legacyPermission) => {
    (LEGACY_PERMISSION_MAP[legacyPermission] || []).forEach((permission) => {
      permissions.add(permission);
    });
  });

  return Array.from(permissions);
}

export async function getUnifiedAccess(supabase: any): Promise<UnifiedAccess> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      profileId: null,
      role: null,
      additionalRoles: [],
      isActive: false,
      customerId: null,
      driverId: null,
      driverName: null,
      displayName: "Guest",
      defaultInterface: "admin",
      availableInterfaces: ["admin"],
      grantedPermissions: [],
      deniedPermissions: [],
      can: () => false,
    };
  }

  const [profile, routeDriver] = await Promise.all([
    getProfileRecord(supabase, user.id),
    getRouteDriverRecord(supabase, user),
  ]);

  const legacyMeta = parseLegacyStaffMeta(routeDriver?.notes || null);
  const profileRole = typeof profile?.role === "string" && profile.role.trim() ? profile.role.trim() : null;
  const legacyRole = typeof legacyMeta.role === "string" && legacyMeta.role.trim()
    ? legacyMeta.role.trim()
    : null;
  const role = profileRole || legacyRole;
  const additionalRoles = normalizeRoleList(profile?.additional_roles).filter(
    (candidate) => candidate !== role && candidate !== "customer"
  );
  const isActive = profile?.is_active === undefined ? true : profile?.is_active === true;
  const customerId = typeof profile?.customer_id === "string" ? profile.customer_id : null;

  const profileHasDefaultInterface = Boolean(
    profile && Object.prototype.hasOwnProperty.call(profile, "default_interface")
  );
  const profileHasPermissions = Boolean(
    profile && Object.prototype.hasOwnProperty.call(profile, "permissions")
  );
  const profileHasDeniedPermissions = Boolean(
    profile && Object.prototype.hasOwnProperty.call(profile, "denied_permissions")
  );

  const defaultInterfaceCandidate = profileHasDefaultInterface
    ? profile?.default_interface
    : legacyMeta.defaultInterface;
  const deniedPermissions = profileHasDeniedPermissions
    ? normalizePermissionList(profile?.denied_permissions)
    : legacyMeta.deniedPermissions;
  const explicitPermissions = profileHasPermissions
    ? normalizePermissionList(profile?.permissions)
    : legacyMeta.appPermissions;
  const legacyPermissions = getLegacyGrantedPermissions(legacyMeta.permissions || []);
  const customRoles = await getCustomRolesByKeys(
    supabase,
    [role, ...additionalRoles]
      .filter((value): value is string => Boolean(value) && !isSystemRole(value))
  );
  const customRolePermissions = Object.fromEntries(
    Object.entries(customRoles).map(([key, value]) => [key, value.permissions])
  ) as Record<string, AppPermission[]>;
  const customRoleInterfaces = Object.fromEntries(
    Object.entries(customRoles).map(([key, value]) => [key, value.interfaces])
  ) as Record<string, InterfaceKey[]>;
  const grantedPermissions = role
    ? buildGrantedPermissions(
        role,
        additionalRoles,
        [...legacyPermissions, ...explicitPermissions],
        deniedPermissions,
        customRolePermissions
      )
    : [];
  const defaultInterface = isInterfaceKey(defaultInterfaceCandidate)
    ? defaultInterfaceCandidate
    : defaultInterfaceForRole(role);
  const availableInterfaces = getAvailableInterfacesForAccess({
    role,
    additionalRoles,
    grantedPermissions,
    defaultInterface,
    customRoleInterfaces,
  });

  return {
    user,
    profileId: typeof profile?.id === "string" ? profile.id : null,
    role,
    additionalRoles,
    isActive,
    customerId,
    driverId: typeof routeDriver?.id === "string" ? routeDriver.id : null,
    driverName: typeof routeDriver?.name === "string" ? routeDriver.name : null,
    displayName: getDisplayName(user, routeDriver),
    defaultInterface,
    availableInterfaces,
    grantedPermissions,
    deniedPermissions,
    can: (permission: AppPermission) => grantedPermissions.includes(permission),
  };
}

export function safeNextPath(value: string | FormDataEntryValue | null | undefined) {
  const path = String(value || "").trim();

  if (!path.startsWith("/") || path.startsWith("//")) {
    return null;
  }

  if (
    path.startsWith("/admin") ||
    path.startsWith("/account") ||
    path.startsWith("/driver")
  ) {
    return path;
  }

  return null;
}

export function getDefaultInterfacePath(access: Pick<UnifiedAccess, "defaultInterface">) {
  if (access.defaultInterface === "customer") {
    return "/account";
  }

  if (access.defaultInterface === "driver") {
    return "/driver";
  }

  return "/admin";
}

export function isAllowedPathForAccess(access: UnifiedAccess, path: string) {
  if (path.startsWith("/account")) {
    return access.role === "customer" || access.can("preview.customer");
  }

  if (path.startsWith("/driver")) {
    return access.role === "driver" || access.can("preview.driver");
  }

  if (path.startsWith("/admin")) {
    return isStaffRole(access.role);
  }

  return false;
}

export function resolvePostLoginPath(access: UnifiedAccess, nextPath?: string | null) {
  const safePath = safeNextPath(nextPath);

  if (safePath && isAllowedPathForAccess(access, safePath)) {
    return safePath;
  }

  return getDefaultInterfacePath(access);
}
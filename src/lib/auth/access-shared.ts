export const SYSTEM_ROLES = [
  "super_admin",
  "admin",
  "manager",
  "dispatcher",
  "cashier",
  "warehouse",
  "content_manager",
  "driver",
  "customer",
] as const;

export const STAFF_ROLES = SYSTEM_ROLES.filter(
  (role) => role !== "customer"
) as Exclude<(typeof SYSTEM_ROLES)[number], "customer">[];

export const SYSTEM_PERMISSIONS = [
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

export type AppRole = (typeof SYSTEM_ROLES)[number];
export type AppPermission = (typeof SYSTEM_PERMISSIONS)[number];
export type InterfaceKey = "admin" | "driver" | "customer";
export type RoleKey = string;

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  dispatcher: "Dispatcher",
  cashier: "Cashier",
  warehouse: "Warehouse",
  content_manager: "Content Manager",
  driver: "Driver",
  customer: "Customer",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  super_admin: "Full platform control, security settings, role assignments and interface switching.",
  admin: "Operational admin access across bookings, routes, inventory, reports and settings.",
  manager: "Supervises bookings, routes, inventory and customer operations without role assignment.",
  dispatcher: "Runs day-to-day scheduling, routing and customer coordination.",
  cashier: "Handles payments, contracts and finance-facing booking details.",
  warehouse: "Controls stock movement, condition tracking and warehouse operations.",
  content_manager: "Maintains catalog content, publishing and linked inventory data.",
  driver: "Uses the driver interface and route previews for assigned stops.",
  customer: "Uses the customer account interface and booking preview.",
};

export const INTERFACE_LABELS: Record<InterfaceKey, string> = {
  admin: "Admin interface",
  driver: "Driver interface",
  customer: "Customer interface",
};

const ROLE_PERMISSION_MAP: Record<AppRole, AppPermission[]> = {
  super_admin: [...SYSTEM_PERMISSIONS],
  admin: SYSTEM_PERMISSIONS.filter(
    (permission) => !["roles.edit", "roles.assign"].includes(permission)
  ) as AppPermission[],
  manager: [
    "dashboard.view",
    "bookings.view",
    "bookings.create",
    "bookings.edit",
    "bookings.cancel",
    "bookings.archive",
    "bookings.restore",
    "bookings.view_financials",
    "bookings.view_internal_notes",
    "routes.view",
    "routes.create",
    "routes.edit",
    "routes.assign_driver",
    "routes.reorder",
    "customers.view",
    "customers.edit",
    "customers.view_contact_data",
    "catalog.view",
    "catalog.edit",
    "inventory.view",
    "inventory.edit",
    "reports.view",
    "preview.customer",
    "preview.driver",
  ],
  dispatcher: [
    "dashboard.view",
    "bookings.view",
    "bookings.edit",
    "bookings.archive",
    "routes.view",
    "routes.create",
    "routes.edit",
    "routes.assign_driver",
    "routes.reorder",
    "customers.view",
    "customers.view_contact_data",
    "preview.driver",
    "preview.customer",
  ],
  cashier: [
    "dashboard.view",
    "bookings.view",
    "bookings.view_financials",
    "customers.view",
    "payments.view",
    "payments.create",
    "payments.edit",
    "contracts.view",
    "contracts.send",
    "reports.view",
    "preview.customer",
  ],
  warehouse: [
    "inventory.view",
    "inventory.edit",
    "inventory.mark_dirty",
    "inventory.mark_damaged",
    "inventory.mark_missing",
    "bookings.view",
    "routes.view",
  ],
  content_manager: [
    "catalog.view",
    "catalog.create",
    "catalog.edit",
    "catalog.publish",
    "catalog.delete",
    "inventory.view",
  ],
  driver: ["routes.view", "preview.driver"],
  customer: ["preview.customer"],
};

export function isSystemRole(value: unknown): value is AppRole {
  return typeof value === "string" && SYSTEM_ROLES.includes(value as AppRole);
}

function isRole(value: unknown): value is AppRole {
  return isSystemRole(value);
}

export function isInterfaceKey(value: unknown): value is InterfaceKey {
  return value === "admin" || value === "driver" || value === "customer";
}

export function isStaffRole(role: RoleKey | null) {
  return !!role && role !== "customer";
}

export function getBasePermissionsForRoleKey(
  roleKey: RoleKey | null,
  customRolePermissions: Record<string, AppPermission[]> = {}
) {
  if (!roleKey) {
    return [];
  }

  if (isRole(roleKey)) {
    return ROLE_PERMISSION_MAP[roleKey] || [];
  }

  return customRolePermissions[roleKey] || [];
}

export function getRoleBasePermissions(role: RoleKey | null) {
  return getBasePermissionsForRoleKey(role);
}

export function defaultInterfaceForRole(role: RoleKey | null): InterfaceKey {
  if (role === "customer") {
    return "customer";
  }

  if (role === "driver") {
    return "driver";
  }

  return "admin";
}

export function getAvailableInterfacesForAccess(params: {
  role: RoleKey | null;
  additionalRoles?: RoleKey[];
  grantedPermissions: AppPermission[];
  defaultInterface: InterfaceKey;
  customRoleInterfaces?: Record<string, InterfaceKey[]>;
}) {
  const interfaces = new Set<InterfaceKey>();

  const addRoleInterfaces = (roleKey: RoleKey | null) => {
    if (!roleKey) {
      return;
    }

    if (isStaffRole(roleKey)) {
      interfaces.add("admin");
    }

    (params.customRoleInterfaces?.[roleKey] || []).forEach((value) => {
      if (isInterfaceKey(value)) {
        interfaces.add(value);
      }
    });
  };

  addRoleInterfaces(params.role);
  (params.additionalRoles || []).forEach(addRoleInterfaces);

  if (params.role === "driver" || params.grantedPermissions.includes("preview.driver")) {
    interfaces.add("driver");
  }

  if (params.role === "customer" || params.grantedPermissions.includes("preview.customer")) {
    interfaces.add("customer");
  }

  interfaces.add(params.defaultInterface);

  return Array.from(interfaces);
}
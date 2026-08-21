import { getUnifiedAccess, type AppPermission } from "@/lib/auth/access";

type StaffPermission =
  | "routes_board"
  | "driver_checklists"
  | "bookings"
  | "catalog"
  | "inventory"
  | "reports"
  | "settings";

type StaffAccess = {
  enforceRbac: boolean;
  isAuthenticated: boolean;
  role: string;
  permissions: StaffPermission[];
  driverName: string | null;
  can: (permission: StaffPermission) => boolean;
};

const LEGACY_PERMISSION_MAP: Record<StaffPermission, AppPermission[]> = {
  routes_board: ["dashboard.view", "routes.view", "routes.edit", "routes.assign_driver", "preview.driver"],
  driver_checklists: ["routes.view", "preview.driver"],
  bookings: ["bookings.view", "bookings.create", "bookings.edit", "customers.view"],
  catalog: ["catalog.view", "catalog.edit"],
  inventory: ["inventory.view", "inventory.edit"],
  reports: ["reports.view"],
  settings: ["settings.view", "settings.edit", "staff.view", "staff.edit"],
};

export async function getCurrentStaffAccess(supabase: any): Promise<StaffAccess> {
  const enforceRbac = process.env.ENFORCE_STAFF_RBAC === "true";

  const access = await getUnifiedAccess(supabase);
  const user = access.user || null;

  if (!user) {
    return {
      enforceRbac,
      isAuthenticated: false,
      role: "admin",
      permissions: [],
      driverName: null,
      can: (_permission: StaffPermission) => !enforceRbac,
    };
  }

  const can = (permission: StaffPermission) => {
    if (!enforceRbac) {
      return true;
    }

    return (LEGACY_PERMISSION_MAP[permission] || []).some((mappedPermission) => access.can(mappedPermission));
  };

  return {
    enforceRbac,
    isAuthenticated: true,
    role: access.role || "admin",
    permissions: (Object.keys(LEGACY_PERMISSION_MAP) as StaffPermission[]).filter(can),
    driverName: access.driverName,
    can,
  };
}

export async function assertStaffPermission(
  supabase: any,
  permission: StaffPermission
) {
  const access = await getCurrentStaffAccess(supabase);

  if (!access.can(permission)) {
    throw new Error(`Access denied. Missing permission: ${permission}`);
  }

  return access;
}

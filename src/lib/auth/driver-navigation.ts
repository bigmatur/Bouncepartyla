import type { AppPermission } from "@/lib/auth/access-shared";

export type DriverNavItem = {
  label: string;
  href: string;
  icon: string;
  permission?: AppPermission;
};

const DRIVER_NAV_ITEMS: DriverNavItem[] = [
  { label: "Dashboard", href: "/driver", icon: "⌂", permission: "dashboard.view" },
  { label: "Route board", href: "/driver/routes", icon: "▧", permission: "routes.view" },
  { label: "Driver view", href: "/driver/routes/view", icon: "▸", permission: "routes.view" },
  { label: "Driver checklist", href: "/driver/routes/checklists", icon: "☑", permission: "routes.view" },
  { label: "My Time", href: "/driver/time", icon: "◴" },
];

const DRIVER_QUICK_TABS: Array<{
  href: string;
  label: string;
  permission?: AppPermission;
}> = [
  { href: "/driver", label: "Dashboard", permission: "dashboard.view" },
  { href: "/driver/routes", label: "Route board", permission: "routes.view" },
  { href: "/driver/routes/view", label: "Driver view", permission: "routes.view" },
  { href: "/driver/routes/checklists", label: "Checklist", permission: "routes.view" },
  { href: "/driver/time", label: "My Time" },
];

function hasPermission(grantedPermissions: AppPermission[], permission?: AppPermission) {
  if (!permission) {
    return true;
  }

  return grantedPermissions.includes(permission);
}

export function filterDriverNavItems(grantedPermissions: AppPermission[]) {
  return DRIVER_NAV_ITEMS.filter((item) => hasPermission(grantedPermissions, item.permission));
}

export function filterDriverQuickTabs(grantedPermissions: AppPermission[]) {
  return DRIVER_QUICK_TABS.filter((tab) => hasPermission(grantedPermissions, tab.permission));
}

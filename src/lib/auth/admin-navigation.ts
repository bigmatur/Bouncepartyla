import type { AppPermission } from "@/lib/auth/access-shared";

export type AdminNavChild = {
  label: string;
  href: string;
  icon?: string;
  permission?: AppPermission;
};

export type AdminNavItem = {
  label: string;
  href: string;
  icon: string;
  permission?: AppPermission;
  children?: AdminNavChild[];
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: "⌂", permission: "dashboard.view" },
  { label: "Business Intelligence", href: "/admin/business-intelligence", icon: "◫", permission: "dashboard.view" },
  { label: "Calendar", href: "/admin/calendar", icon: "◷", permission: "bookings.view" },
  {
    label: "CRM",
    href: "/admin/crm",
    icon: "✉",
    permission: "customers.view",
    children: [
      { label: "Overview", href: "/admin/crm", icon: "◫", permission: "customers.view" },
      { label: "Inbox", href: "/admin/crm/inbox", icon: "✉", permission: "customers.view" },
      { label: "Events", href: "/admin/leads", icon: "◇", permission: "customers.view" },
      { label: "Tasks", href: "/admin/tasks", icon: "✓", permission: "dashboard.view" },
    ],
  },
  { label: "Customers", href: "/admin/customers", icon: "◎", permission: "customers.view" },
  {
    label: "Bookings",
    href: "/admin/bookings",
    icon: "▦",
    permission: "bookings.view",
    children: [
      { label: "Active bookings", href: "/admin/bookings", icon: "▦", permission: "bookings.view" },
      { label: "Archive", href: "/admin/bookings/archive", icon: "🗂", permission: "bookings.view" },
    ],
  },
  {
    label: "Routes",
    href: "/admin/routes",
    icon: "▧",
    permission: "routes.view",
    children: [
      { label: "Route board", href: "/admin/routes", icon: "▧", permission: "routes.view" },
      { label: "Driver view", href: "/admin/routes/driver", icon: "▸", permission: "routes.view" },
      { label: "Driver checklist", href: "/admin/routes/driver/checklists", icon: "☑", permission: "routes.view" },
    ],
  },
  { label: "Photos", href: "/admin/photos", icon: "▥", permission: "bookings.view" },
  {
    label: "Staff",
    href: "/admin/staff",
    icon: "☻",
    permission: "staff.view",
    children: [
      { label: "Employees", href: "/admin/staff", icon: "☻", permission: "staff.view" },
      { label: "Working Time", href: "/admin/staff/time", icon: "◷", permission: "staff.view" },
    ],
  },
  { label: "My Time", href: "/admin/my-time", icon: "◴" },
  { label: "Roles & Access", href: "/admin/access", icon: "☰", permission: "roles.view" },
  {
    label: "Catalog",
    href: "/admin/catalog",
    icon: "◈",
    permission: "catalog.view",
    children: [
      { label: "Catalog overview", href: "/admin/catalog", icon: "◈", permission: "catalog.view" },
      { label: "Modifier Groups", href: "/admin/catalog/modifier-groups", icon: "◉", permission: "catalog.view" },
      { label: "Inventory links", href: "/admin/catalog/inventory-links", icon: "↔", permission: "catalog.view" },
    ],
  },
  {
    label: "Inventory",
    href: "/admin/inventory/operations",
    icon: "▣",
    permission: "inventory.view",
    children: [
      { label: "Warehouse Ops", href: "/admin/inventory/operations", icon: "▨", permission: "inventory.view" },
      { label: "Warehouse Picking", href: "/admin/inventory/picking", icon: "☑", permission: "inventory.view" },
      { label: "Items & Stock", href: "/admin/inventory", icon: "□", permission: "inventory.view" },
      { label: "Reservation Integrity", href: "/admin/inventory/integrity", icon: "◎", permission: "inventory.view" },
      { label: "Receive Stock", href: "/admin/inventory/receive", icon: "＋", permission: "inventory.view" },
      { label: "Supplies", href: "/admin/inventory/supplies", icon: "▤", permission: "inventory.view" },
      { label: "Returns", href: "/admin/inventory/returns", icon: "↩", permission: "inventory.view" },
      { label: "Damages", href: "/admin/inventory/damages", icon: "!", permission: "inventory.view" },
      { label: "Write-offs", href: "/admin/inventory/write-offs", icon: "−", permission: "inventory.view" },
      { label: "Movements", href: "/admin/inventory/movements", icon: "⇄", permission: "inventory.view" },
      { label: "Categories", href: "/admin/inventory/categories", icon: "≡", permission: "inventory.view" },
      { label: "Locations", href: "/admin/inventory/locations", icon: "⌖", permission: "inventory.view" },
      { label: "Counts", href: "/admin/inventory/counts", icon: "✓", permission: "inventory.view" },
    ],
  },
  { label: "Cleaning", href: "/admin/inventory/cleaning", icon: "✦", permission: "inventory.view" },
  {
  label: "Handovers",
  href: "/admin/handovers",
  icon: "✓",
  permission: "routes.view",
},
  { label: "Reports", href: "/admin/reports", icon: "▤", permission: "reports.view" },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: "⚙",
    permission: "settings.view",
    children: [
      { label: "Settings", href: "/admin/settings", icon: "⚙", permission: "settings.view" },
      { label: "System Docs", href: "/admin/system/docs", icon: "◇", permission: "settings.view" },
    ],
  },
];

export const ADMIN_QUICK_TABS: Array<{
  href: string;
  label: string;
  permission?: AppPermission;
}> = [
  { href: "/admin/calendar", label: "Calendar", permission: "bookings.view" },
  { href: "/admin/catalog", label: "Catalog", permission: "catalog.view" },
  { href: "/admin/bookings/new", label: "New Booking", permission: "bookings.create" },
  { href: "/admin/bookings", label: "Bookings", permission: "bookings.view" },
  { href: "/admin/crm", label: "CRM", permission: "customers.view" },
  { href: "/admin/routes", label: "Routes", permission: "routes.view" },
  { href: "/admin/staff", label: "Staff", permission: "staff.view" },
  { href: "/admin/access", label: "Access", permission: "roles.view" },
];

function hasPermission(grantedPermissions: AppPermission[], permission?: AppPermission) {
  if (!permission) return true;
  return grantedPermissions.includes(permission);
}

export function filterAdminNavItems(grantedPermissions: AppPermission[]) {
  return ADMIN_NAV_ITEMS.map((item) => {
    const visibleChildren = (item.children || []).filter((child) =>
      hasPermission(grantedPermissions, child.permission),
    );
    const itemVisible =
      hasPermission(grantedPermissions, item.permission) ||
      visibleChildren.length > 0;

    if (!itemVisible) return null;

    return {
      ...item,
      children: visibleChildren,
    };
  }).filter(Boolean) as AdminNavItem[];
}

export function filterAdminQuickTabs(grantedPermissions: AppPermission[]) {
  return ADMIN_QUICK_TABS.filter((tab) =>
    hasPermission(grantedPermissions, tab.permission),
  );
}

import type { AppPermission } from "@/lib/auth/access-shared";

export type CustomerNavItem = {
  label: string;
  href: string;
  permission?: AppPermission;
};

export const CUSTOMER_NAV_ITEMS: CustomerNavItem[] = [
  { label: "Overview", href: "/account", permission: "preview.customer" },
  { label: "My Bookings", href: "/account?view=bookings", permission: "preview.customer" },
  { label: "Catalog", href: "/account/catalog", permission: "preview.customer" },
  { label: "Book Now", href: "/account/book-now", permission: "preview.customer" },
  { label: "Profile", href: "/account/profile", permission: "preview.customer" },
  { label: "Notifications", href: "/account/notifications", permission: "preview.customer" },
  { label: "Help", href: "/account/help", permission: "preview.customer" },
];

export function filterCustomerNavItems(grantedPermissions: AppPermission[]) {
  return CUSTOMER_NAV_ITEMS.filter((item) => {
    if (!item.permission) {
      return true;
    }

    return grantedPermissions.includes(item.permission);
  });
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { filterAdminQuickTabs } from "@/lib/auth/admin-navigation";
import { filterDriverQuickTabs } from "@/lib/auth/driver-navigation";
import { ROLE_LABELS, isSystemRole, type AppPermission, type RoleKey } from "@/lib/auth/access-shared";

function formatRoleLabel(role: RoleKey | null) {
  if (!role) {
    return "Staff account";
  }

  if (isSystemRole(role)) {
    return ROLE_LABELS[role];
  }

  return role
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getPageTitle(pathname: string) {
  if (pathname === "/driver") {
    return "Driver dashboard";
  }

  if (pathname === "/driver/profile") {
    return "Profile";
  }

  if (pathname.startsWith("/driver/routes/checklists")) {
    return "Route checklists";
  }

  if (pathname.startsWith("/driver/routes")) {
    return "Driver routes";
  }

  if (pathname === "/admin") {
    return "Admin panel";
  }

  if (pathname.startsWith("/admin/bookings/new")) {
    return "New booking";
  }

  if (pathname.startsWith("/admin/bookings")) {
    return "Bookings";
  }

  if (pathname.startsWith("/admin/tasks")) {
    return "Tasks";
  }

  if (pathname.startsWith("/admin/calendar")) {
    return "Calendar";
  }

  if (pathname.startsWith("/admin/catalog")) {
    return "Catalog";
  }

  if (pathname.startsWith("/admin/customers")) {
    return "Customers";
  }

  if (pathname.startsWith("/admin/inventory/cleaning")) {
    return "Cleaning";
  }

  if (pathname.startsWith("/admin/inventory")) {
    return "Inventory";
  }

  if (pathname.startsWith("/admin/availability")) {
    return "Availability";
  }

  if (pathname.startsWith("/admin/routes")) {
    return "Routes";
  }

  if (pathname.startsWith("/admin/staff")) {
    return "Staff";
  }

  if (pathname.startsWith("/admin/access")) {
    return "Roles & access";
  }

  if (pathname.startsWith("/admin/system/docs")) {
    return "System Docs";
  }

  if (pathname.startsWith("/admin/settings")) {
    return "Settings";
  }

  return "Admin panel";
}

function isTabActive(pathname: string, href: string) {
  if (href === "/driver") {
    return pathname === "/driver";
  }

  if (href === "/driver/routes") {
    return pathname === "/driver/routes";
  }

  if (href === "/driver/routes/checklists") {
    return pathname === "/driver/routes/checklists";
  }

  if (href === "/driver/profile") {
    return pathname === "/driver/profile";
  }

  if (href === "/admin/bookings/new") {
    return pathname.startsWith("/admin/bookings/new");
  }

  if (href === "/admin/bookings") {
    return (
      pathname.startsWith("/admin/bookings") &&
      !pathname.startsWith("/admin/bookings/new")
    );
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminTopbar({
  displayName,
  userEmail,
  role,
  grantedPermissions,
  sidebarHidden,
  onToggleSidebar,
}: {
  displayName: string;
  userEmail?: string | null;
  role: RoleKey | null;
  grantedPermissions: AppPermission[];
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
}) {
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  const isDriverInterface = pathname.startsWith("/driver");
  const quickTabs = isDriverInterface
    ? filterDriverQuickTabs(grantedPermissions)
    : filterAdminQuickTabs(grantedPermissions);
  const canCreateBooking = grantedPermissions.includes("bookings.create");
  const pageTitle = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-black/5 bg-[#f5efe6]/90 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-4 lg:px-8">
        <div className="min-w-0">
          <div className="mb-2 hidden lg:block">
            <button
              type="button"
              onClick={onToggleSidebar}
              className="rounded-full border border-[#d9d0c6] bg-white px-3 py-1.5 text-xs font-semibold text-[#3a342d] transition hover:bg-[#f8f4ee]"
            >
              {sidebarHidden ? "Show menu" : "Hide menu"}
            </button>
          </div>

          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a7a49]">
            {isDriverInterface ? "Driver workspace" : "Bounce Party LA"}
          </div>

          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight text-[#1f1e1b]">
            {pageTitle}
          </h1>
        </div>

        <div className="hidden flex-wrap items-center gap-2 xl:flex">
          {quickTabs.map((tab) => {
            const active = isTabActive(pathname, tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  active
                    ? "bg-[#111111] text-white shadow-sm"
                    : "border border-[#d9d0c6] bg-white/80 text-[#3a342d] hover:bg-white",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canCreateBooking && (
            <Link
              href="/admin/bookings/new"
              className="rounded-full bg-[#c9964f] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#b78744] md:hidden"
            >
              + New
            </Link>
          )}

          <div className="hidden text-right md:block">
            <div className="max-w-[190px] truncate text-xs font-semibold text-[#3a342d]">
              {displayName || userEmail || "Staff account"}
            </div>

            <div className="text-[11px] text-[#8c8176]">
              {formatRoleLabel(role)}
            </div>
          </div>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-full border border-[#d9d0c6] bg-white px-3 py-2 text-xs font-semibold text-[#3a342d] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
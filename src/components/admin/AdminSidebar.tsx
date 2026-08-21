"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { filterAdminNavItems } from "@/lib/auth/admin-navigation";
import { filterDriverNavItems } from "@/lib/auth/driver-navigation";
import { INTERFACE_LABELS, type AppPermission, type InterfaceKey, type RoleKey } from "@/lib/auth/access-shared";

type AdminNavItem = ReturnType<typeof filterAdminNavItems>[number];
type DriverNavItem = ReturnType<typeof filterDriverNavItems>[number];
type NavItem = AdminNavItem | DriverNavItem;

function isItemActive(pathname: string, item: NavItem) {
  if (item.href === "/admin") {
    return pathname === "/admin";
  }

  if (item.href === "/driver") {
    return pathname === "/driver";
  }

  if (item.href === "/admin/inventory/operations") {
    return (
      (pathname === "/admin/inventory" || pathname.startsWith("/admin/inventory/")) &&
      !pathname.startsWith("/admin/inventory/cleaning") &&
      !pathname.startsWith("/admin/inventory/picking")
    );
  }

  if (item.href === "/admin/routes") {
    return pathname === "/admin/routes" || pathname.startsWith("/admin/routes/");
  }

  if (item.href === "/admin/catalog") {
    return pathname === "/admin/catalog" || pathname.startsWith("/admin/catalog/");
  }

  if (item.href === "/driver/routes") {
    return pathname === "/driver/routes" || pathname.startsWith("/driver/routes/");
  }

  if (item.href === "/admin/photos") {
    return pathname === "/admin/photos" || pathname.startsWith("/admin/photos/");
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function isChildActive(pathname: string, href: string) {
  if (href === "/driver/routes") {
    return pathname === "/driver/routes";
  }

  if (href === "/driver/routes/checklists") {
    return pathname === "/driver/routes/checklists";
  }

  if (href === "/admin/catalog") {
    return pathname === "/admin/catalog";
  }

  if (href === "/admin/inventory") {
    return pathname === "/admin/inventory";
  }

  if (href === "/admin/inventory/operations") {
    return pathname === "/admin/inventory/operations";
  }

  if (href === "/admin/inventory/picking") {
    return pathname === "/admin/inventory/picking";
  }

  if (href === "/admin/routes") {
    return pathname === "/admin/routes";
  }

  if (href === "/admin/routes/driver") {
    return pathname === "/admin/routes/driver";
  }

  if (href === "/admin/routes/driver/checklists") {
    return pathname === "/admin/routes/driver/checklists";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || "")
    .join("") || "BP";
}

const interfaceIcons: Record<InterfaceKey, string> = {
  admin: "⚙",
  driver: "🚚",
  customer: "◉",
};

const ACCOUNT_PANEL_STORAGE_KEY = "adminSidebarAccountPanelOpen";

function interfaceHref(interfaceKey: InterfaceKey) {
  if (interfaceKey === "customer") {
    return "/account";
  }

  if (interfaceKey === "driver") {
    return "/driver";
  }

  return "/admin";
}

export default function AdminSidebar({
  displayName,
  userEmail,
  role,
  defaultInterface,
  availableInterfaces,
  grantedPermissions,
  mobile = false,
}: {
  displayName: string;
  userEmail?: string | null;
  role: RoleKey | null;
  defaultInterface: InterfaceKey;
  availableInterfaces: InterfaceKey[];
  grantedPermissions: AppPermission[];
  mobile?: boolean;
}) {
  const pathname = usePathname();
  const isDriverInterface = pathname.startsWith("/driver");
  const isDriverRole = role === "driver";
  const navItems = isDriverInterface
    ? filterDriverNavItems(grantedPermissions)
    : filterAdminNavItems(grantedPermissions);
  const initials = getInitials(displayName || userEmail || "Bounce Party");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [expandedNavHrefs, setExpandedNavHrefs] = useState<string[]>([]);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const previousPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    setSwitcherOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountPanelOpen) {
      setSwitcherOpen(false);
    }
  }, [accountPanelOpen]);

  useEffect(() => {
    try {
      const savedState = window.localStorage.getItem(ACCOUNT_PANEL_STORAGE_KEY);
      if (savedState === "1") {
        setAccountPanelOpen(true);
      }
    } catch {
      // Ignore localStorage read issues.
    }
  }, []);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) {
      return;
    }

    previousPathnameRef.current = pathname;

    const activeGroup = navItems.find((item) => {
      const children =
        "children" in item && Array.isArray((item as any).children)
          ? (item as any).children
          : [];

      return children.length > 0 && isItemActive(pathname, item);
    });

    setExpandedNavHrefs((current) => {
      if (!activeGroup) {
        return [];
      }

      if (current.includes(activeGroup.href)) {
        return current;
      }

      return [activeGroup.href];
    });
  }, [pathname, navItems]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACCOUNT_PANEL_STORAGE_KEY, accountPanelOpen ? "1" : "0");
    } catch {
      // Ignore localStorage write issues.
    }
  }, [accountPanelOpen]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!switcherRef.current) {
        return;
      }

      if (!switcherRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSwitcherOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <aside
      className={
        mobile
          ? "block h-[100dvh] max-h-[100dvh] min-h-0 w-[min(86vw,320px)] shrink-0 overflow-hidden bg-[#23313f] text-white shadow-2xl"
          : "hidden min-h-screen w-[280px] shrink-0 border-r border-black/5 bg-[#23313f] text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block"
      }
    >
      <div className={mobile ? "flex h-[100dvh] min-h-0 flex-col overflow-hidden" : "sticky top-0 flex h-screen flex-col"}>
        <div className={mobile ? "shrink-0 border-b border-white/10 px-5 py-4" : "border-b border-white/10 px-6 py-6"}>
          <Link href={isDriverInterface ? "/driver" : "/admin"} className="block">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c9964f]">
              Bounce Party LA
            </div>

            <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
              {isDriverInterface ? "Driver" : "Admin"}
            </div>
          </Link>
        </div>

        <nav
          className={[
            "min-h-0 flex-1 overflow-y-auto px-4 py-5",
            mobile ? "overscroll-contain py-3 pb-6 touch-pan-y" : "py-5",
          ].join(" ")}
          style={mobile ? { WebkitOverflowScrolling: "touch" } : undefined}
        >
          <div className="space-y-2">
            {navItems.map((item) => {
              const active = isItemActive(pathname, item);
              const itemChildren: Array<{ href: string; label: string; icon?: string }> =
                "children" in item && Array.isArray((item as any).children)
                  ? (item as any).children
                  : [];
              const hasChildren = itemChildren.length > 0;
              const expanded =
                hasChildren && expandedNavHrefs.includes(item.href);

              return (
                <div key={item.href}>
                  <div
                    className={[
                      "flex items-center justify-between rounded-2xl pr-2 text-sm font-semibold transition",
                      active
                        ? "bg-white text-[#23313f] shadow-sm"
                        : "text-white/75 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    <Link href={item.href} className={["flex flex-1 items-center gap-3 px-4", mobile ? "py-2.5" : "py-3"].join(" ")}>
                      <span className="flex h-5 w-5 items-center justify-center text-base">
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>

                    {hasChildren && (
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={`Toggle ${item.label} submenu`}
                        onClick={() =>
                          setExpandedNavHrefs((current) =>
                            current.includes(item.href)
                              ? current.filter((href) => href !== item.href)
                              : [...current, item.href],
                          )
                        }
                        className={[
                          "rounded-lg px-2 py-1 text-sm transition",
                          active
                            ? "text-[#23313f] hover:bg-black/5"
                            : "text-white/45 hover:bg-white/10 hover:text-white",
                        ].join(" ")}
                      >
                        {expanded ? "▴" : "▾"}
                      </button>
                    )}
                  </div>

                  {expanded && (
                    <div className="mt-2 space-y-1 pl-4">
                      {itemChildren.map((child, index) => {
                        const childActive = isChildActive(pathname, child.href);

                        return (
                          <Link
                            key={`${item.href}-${index}`}
                            href={child.href}
                            className={[
                              "flex items-center gap-3 rounded-xl px-4 text-sm font-semibold transition",
                              mobile ? "py-2" : "py-2.5",
                              childActive
                                ? "bg-[#c9964f] text-white"
                                : "text-white/60 hover:bg-white/10 hover:text-white",
                            ].join(" ")}
                          >
                            <span className="flex h-4 w-4 items-center justify-center text-sm">
                              {child.icon || "•"}
                            </span>
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        <div
          className="shrink-0 border-t border-white/10 bg-[#23313f] p-4"
          style={mobile ? { paddingBottom: "max(1rem, env(safe-area-inset-bottom))" } : undefined}
        >
          <div className="rounded-[24px] bg-white/10 p-4">
            <button
              type="button"
              onClick={() => setAccountPanelOpen((value) => !value)}
              className="flex w-full items-start gap-3 rounded-2xl text-left transition hover:bg-white/5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#c9964f] text-sm font-semibold text-white">
                {initials}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                <div className="truncate text-xs text-white/65">{userEmail || "No email linked"}</div>
              </div>

              <span className="pt-1 text-xs text-white/60">{accountPanelOpen ? "▴" : "▾"}</span>
            </button>

            {accountPanelOpen && <div className="mt-4 space-y-2">
              <Link
                href={isDriverRole ? "/driver/profile" : "/admin/access?tab=users"}
                className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
              >
                <span>Profile</span>
                <span>↗</span>
              </Link>

              {!isDriverRole && (
                <div ref={switcherRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setSwitcherOpen((value) => !value)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white/85 transition hover:bg-white/10 hover:text-white"
                  >
                    <span className="flex items-center gap-2">
                      <span>{interfaceIcons[defaultInterface]}</span>
                      Switch interface
                    </span>
                    <span className="text-xs">{switcherOpen ? "▴" : "▾"}</span>
                  </button>

                  {switcherOpen && (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-40 rounded-2xl border border-white/15 bg-[#2f3d4c] p-2 shadow-[0_14px_30px_rgba(0,0,0,0.35)]">
                      <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                        Select interface
                      </div>

                      <div className="space-y-1">
                        {availableInterfaces.map((interfaceKey) => {
                          const href = interfaceHref(interfaceKey);
                          const active = pathname.startsWith(href);

                          return (
                            <Link
                              key={interfaceKey}
                              href={href}
                              className={[
                                "flex items-center justify-between rounded-xl px-3 py-2 text-sm font-semibold transition",
                                active
                                  ? "bg-white text-[#23313f]"
                                  : "text-white/75 hover:bg-white/10 hover:text-white",
                              ].join(" ")}
                            >
                              <span className="flex items-center gap-2">
                                <span>{interfaceIcons[interfaceKey]}</span>
                                {INTERFACE_LABELS[interfaceKey]}
                              </span>
                              <span>{active ? "•" : "→"}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-white/10 px-3 py-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  Active interface
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white/80">
                  <span>{interfaceIcons[defaultInterface]}</span>
                  {INTERFACE_LABELS[defaultInterface]}
                </div>
              </div>

              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="w-full rounded-2xl border border-white/10 px-4 py-3 text-left text-sm font-semibold text-white/85 transition hover:bg-red-500/15 hover:text-white"
                >
                  Log out
                </button>
              </form>
            </div>}
          </div>
        </div>
      </div>
    </aside>
  );
}

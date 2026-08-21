"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { filterCustomerNavItems } from "@/lib/auth/customer-navigation";
import {
  ROLE_LABELS,
  isSystemRole,
  type AppPermission,
  type InterfaceKey,
  type RoleKey,
} from "@/lib/auth/access-shared";

function getInitials(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((chunk) => chunk[0]?.toUpperCase() || "")
      .join("") || "BP"
  );
}

function roleLabel(role: RoleKey | null) {
  if (!role) {
    return "Account";
  }

  if (isSystemRole(role)) {
    return ROLE_LABELS[role];
  }

  return role
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const interfaceIcons: Record<InterfaceKey, string> = {
  admin: "⚙",
  driver: "🚚",
  customer: "◉",
};

const interfaceDisplayLabels: Record<InterfaceKey, string> = {
  admin: "Admin",
  driver: "Driver",
  customer: "Customer",
};

function interfaceHref(interfaceKey: InterfaceKey) {
  if (interfaceKey === "admin") {
    return "/admin";
  }

  if (interfaceKey === "driver") {
    return "/driver";
  }

  return "/account";
}

function isActive(pathname: string, href: string) {
  const [baseHref] = href.split("?");

  if (baseHref === "/account") {
    return pathname === "/account";
  }

  return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
}

export default function CustomerShell({
  children,
  displayName,
  userEmail,
  role,
  defaultInterface,
  availableInterfaces,
  grantedPermissions,
  previewMode,
}: {
  children: React.ReactNode;
  displayName: string;
  userEmail?: string | null;
  role: RoleKey | null;
  defaultInterface: InterfaceKey;
  availableInterfaces: InterfaceKey[];
  grantedPermissions: AppPermission[];
  previewMode?: boolean;
}) {
  const [pathname, setPathname] = useState("/account");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncPathname = () => {
      setPathname(window.location.pathname || "/account");
      setMobileMenuOpen(false);
    };

    syncPathname();
    window.addEventListener("popstate", syncPathname);

    return () => {
      window.removeEventListener("popstate", syncPathname);
    };
  }, []);

  const navItems = useMemo(
    () => filterCustomerNavItems(grantedPermissions),
    [grantedPermissions],
  );

  const visibleInterfaces = useMemo(() => {
    if (role === "customer") {
      return availableInterfaces.filter((item) => item === "customer");
    }

    return availableInterfaces;
  }, [availableInterfaces, role]);

  const initials = getInitials(displayName || userEmail || "Customer");

  return (
    <div className="min-h-screen bg-[#f5efe6] text-[#1d1d1b]">
      <div className="mx-auto flex w-full max-w-[1440px] gap-0 lg:gap-6">
        <aside className="hidden w-[290px] shrink-0 lg:block">
          <div className="sticky top-0 flex h-screen flex-col border-r border-black/5 bg-white">
            <div className="border-b border-black/6 px-6 py-6">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7a49]">
                Bounce Party LA
              </div>

              <div className="mt-2 text-2xl font-semibold tracking-tight text-[#1f1e1b]">
                Account
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-2">
                {navItems.map((item) => {
                  const active = isActive(pathname, item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition",
                        active
                          ? "bg-[#1d1d1b] text-white"
                          : "text-[#3a342d] hover:bg-black/[0.04]",
                      ].join(" ")}
                    >
                      <span>{item.label}</span>
                      <span className={active ? "text-white/70" : "text-black/35"}>
                        →
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="border-t border-black/6 p-4">
              <div className="rounded-[24px] bg-[#f8f3eb] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1d1d1b] text-sm font-semibold text-white">
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {displayName}
                    </div>

                    <div className="truncate text-xs text-black/55">
                      {userEmail || "No email linked"}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                      <span className="rounded-full bg-white px-2.5 py-1 text-black/70">
                        {roleLabel(role)}
                      </span>
                    </div>
                  </div>
                </div>

                {previewMode ? (
                  <div className="mt-3 rounded-xl border border-[#e8d9c2] bg-[#fff8ed] px-3 py-2 text-xs font-semibold text-[#8a6b20]">
                    Preview mode
                  </div>
                ) : null}

                <div className="mt-3 space-y-2">
                  <div className="grid gap-2">
                    {visibleInterfaces.map((interfaceKey) => (
                      <Link
                        key={interfaceKey}
                        href={interfaceHref(interfaceKey)}
                        className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-3 py-2 text-xs font-semibold text-[#3a342d] transition hover:bg-[#f5efe6]"
                      >
                        <span className="flex items-center gap-2">
                          <span>{interfaceIcons[interfaceKey]}</span>
                          {interfaceDisplayLabels[interfaceKey]}
                        </span>
                        <span>↗</span>
                      </Link>
                    ))}
                  </div>

                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-[#3a342d] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                    >
                      Log out
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-black/5 bg-[#f5efe6]/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7a49]">
                  Bounce Party LA
                </div>

                <div className="text-lg font-semibold">
                  Account
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((value) => !value)}
                aria-expanded={mobileMenuOpen}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold"
              >
                {mobileMenuOpen ? "Close" : "Menu"}
              </button>
            </div>

            {mobileMenuOpen && (
              <div className="mt-3 max-h-[calc(100vh-92px)] overflow-y-auto rounded-[22px] border border-black/8 bg-white p-3 shadow-[0_14px_35px_rgba(0,0,0,0.08)]">
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const active = isActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={[
                          "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                          active
                            ? "bg-[#1d1d1b] text-white"
                            : "text-[#3a342d] hover:bg-black/[0.04]",
                        ].join(" ")}
                      >
                        <span>{item.label}</span>
                        <span className={active ? "text-white/65" : "text-black/30"}>
                          →
                        </span>
                      </Link>
                    );
                  })}
                </nav>

                <div className="my-3 border-t border-black/8" />

                <div className="rounded-[18px] bg-[#f8f3eb] p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1d1d1b] text-xs font-semibold text-white">
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-[#1f1e1b]">
                        {displayName}
                      </div>

                      <div className="mt-0.5 truncate text-xs text-black/55">
                        {userEmail || "No email linked"}
                      </div>

                      <div className="mt-2">
                        <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black/65 ring-1 ring-black/5">
                          {roleLabel(role)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {previewMode ? (
                    <div className="mt-3 rounded-xl border border-[#e8d9c2] bg-[#fff8ed] px-3 py-2 text-xs font-semibold text-[#8a6b20]">
                      Preview mode
                    </div>
                  ) : null}

                  {visibleInterfaces.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {visibleInterfaces.map((interfaceKey) => (
                        <Link
                          key={`mobile-${interfaceKey}`}
                          href={interfaceHref(interfaceKey)}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center justify-between rounded-xl border border-black/8 bg-white px-3 py-2.5 text-xs font-semibold text-[#3a342d]"
                        >
                          <span className="flex items-center gap-2">
                            <span>{interfaceIcons[interfaceKey]}</span>
                            {interfaceDisplayLabels[interfaceKey]}
                          </span>
                          <span>↗</span>
                        </Link>
                      ))}
                    </div>
                  )}

                  <form
                    action="/auth/signout"
                    method="post"
                    className="mt-2"
                  >
                    <button
                      type="submit"
                      className="w-full rounded-xl border border-red-100 bg-white px-3 py-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                    >
                      Log out
                    </button>
                  </form>
                </div>
              </div>
            )}
          </header>

          <div className="pb-10 lg:pb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

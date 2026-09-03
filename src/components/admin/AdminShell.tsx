"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTopbar from "@/components/admin/AdminTopbar";
import type {
  AppPermission,
  InterfaceKey,
  RoleKey,
} from "@/lib/auth/access-shared";

function mobilePageTitle(pathname: string) {
  if (pathname.startsWith("/admin/business-intelligence")) return "Business Intelligence";
  if (pathname.startsWith("/admin/routes")) return "Route Board";
  if (pathname.startsWith("/admin/bookings")) return "Bookings";
  if (pathname.startsWith("/admin/customers")) return "Customers";
  if (pathname.startsWith("/admin/staff")) return "Staff";
  if (pathname.startsWith("/admin/payments")) return "Payments";
  if (pathname.startsWith("/admin/inventory")) return "Inventory";
  if (pathname.startsWith("/admin/settings")) return "Settings";
  if (pathname.startsWith("/admin/reports")) return "Reports";
  if (pathname.startsWith("/admin/catalog")) return "Catalog";
  if (pathname.startsWith("/admin/tasks")) return "Tasks";
  if (pathname.startsWith("/admin/access")) return "Access";
  if (pathname.startsWith("/admin")) return "Dashboard";
  if (pathname.startsWith("/driver")) return "Driver";

  return "Bounce Party LA";
}

export default function AdminShell({
  children,
  displayName,
  userEmail,
  role,
  defaultInterface,
  availableInterfaces,
  grantedPermissions,
}: {
  children: ReactNode;
  displayName: string;
  userEmail?: string | null;
  role: RoleKey | null;
  defaultInterface: InterfaceKey;
  availableInterfaces: InterfaceKey[];
  grantedPermissions: AppPermission[];
}) {
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileScrollDock, setShowMobileScrollDock] = useState(false);

  const pathname = usePathname();
  const router = useRouter();

  const pageTitle = mobilePageTitle(pathname);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleScroll = () => {
      setShowMobileScrollDock(window.scrollY > 320);
    };

    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowMobileScrollDock(window.scrollY > 320);
    };

    requestAnimationFrame(handleScroll);
  }, [pathname]);

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/admin");
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  return (
    <div className="flex min-h-screen min-w-0 overflow-x-hidden">
      {!sidebarHidden && (
        <AdminSidebar
          displayName={displayName}
          userEmail={userEmail}
          role={role}
          defaultInterface={defaultInterface}
          availableInterfaces={availableInterfaces}
          grantedPermissions={grantedPermissions}
        />
      )}

      <div className={`flex min-w-0 flex-1 flex-col ${sidebarHidden ? "" : "lg:ml-[280px]"}`}>
        <div className="hidden lg:block">
          <AdminTopbar
            displayName={displayName}
            userEmail={userEmail}
            role={role}
            grantedPermissions={grantedPermissions}
            sidebarHidden={sidebarHidden}
            onToggleSidebar={() => setSidebarHidden((value) => !value)}
          />
        </div>

        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-black/5 bg-[#f5efe6]/95 px-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-xl font-semibold text-[#23313f] shadow-sm ring-1 ring-black/5"
          >
            ‹
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold tracking-tight text-[#1f1e1b]">
              {pageTitle}
            </div>

            <div className="truncate text-[11px] font-medium text-[#8b8177]">
              Bounce Party LA
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu"
            className="flex h-10 min-w-10 items-center justify-center rounded-full bg-[#23313f] px-3 text-sm font-bold text-white shadow-sm"
          >
            ☰
          </button>
        </header>

        {mobileMenuOpen ? (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
            />

            <div className="absolute inset-y-0 right-0 flex max-w-full">
              <AdminSidebar
                displayName={displayName}
                userEmail={userEmail}
                role={role}
                defaultInterface={defaultInterface}
                availableInterfaces={availableInterfaces}
                grantedPermissions={grantedPermissions}
                mobile
              />
            </div>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 overflow-x-hidden px-3 pb-24 pt-3 sm:px-4 sm:pb-24 sm:pt-4 lg:px-8 lg:py-6">
          <div className="mx-auto min-w-0 w-full max-w-[1440px]">
            {children}
          </div>
        </main>

        {showMobileScrollDock && !mobileMenuOpen ? (
          <>
            <div className="fixed bottom-3 left-3 right-[4.25rem] z-50 lg:hidden">
              <div className="grid h-12 grid-cols-[48px_minmax(0,1fr)_48px] items-center overflow-hidden rounded-[18px] border border-black/10 bg-white/95 shadow-[0_10px_35px_rgba(0,0,0,0.16)] backdrop-blur">
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Go back"
                  className="flex h-full items-center justify-center text-xl font-semibold text-[#23313f] transition active:bg-[#f4ede2]"
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={scrollToTop}
                  aria-label="Scroll to top"
                  className="min-w-0 border-x border-black/5 px-2 text-center"
                >
                  <div className="truncate text-xs font-bold text-[#1f1e1b]">
                    {pageTitle}
                  </div>

                  <div className="mt-0.5 text-[10px] font-semibold text-[#9a7a49]">
                    Tap to top
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Open menu"
                  className="flex h-full items-center justify-center text-base font-bold text-[#23313f] transition active:bg-[#f4ede2]"
                >
                  ☰
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={scrollToTop}
              aria-label="Scroll to top"
              className="fixed bottom-3 right-3 z-50 flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#23313f] text-lg font-bold text-white shadow-[0_10px_30px_rgba(35,49,63,0.28)] lg:hidden"
            >
              ↑
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
import Link from "next/link";
import type { ReactNode } from "react";

const inventoryTabs = [
  {
    label: "Overview",
    href: "/admin/inventory",
  },
  {
    label: "Supplies",
    href: "/admin/inventory/supplies",
  },
  {
    label: "Receive",
    href: "/admin/inventory/receive",
  },
  {
    label: "Returns",
    href: "/admin/inventory/returns",
  },
  {
    label: "Picking",
    href: "/admin/inventory/picking",
  },
  {
    label: "Cleaning",
    href: "/admin/inventory/cleaning",
  },
  {
    label: "Damages",
    href: "/admin/inventory/damages",
  },
  {
    label: "Write-offs",
    href: "/admin/inventory/write-offs",
  },
  {
    label: "Movements",
    href: "/admin/inventory/movements",
  },
  {
    label: "Categories",
    href: "/admin/inventory/categories",
  },
  {
    label: "Locations",
    href: "/admin/inventory/locations",
  },
  {
    label: "Counts",
    href: "/admin/inventory/counts",
  },
];

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="rounded-[22px] border border-black/5 bg-white p-3.5 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[28px] sm:p-4 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex min-w-0 flex-col gap-3 sm:gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a723e] sm:text-xs sm:font-semibold">
              Warehouse module
            </div>

            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-[#1f1e1b] sm:mt-1 sm:text-2xl sm:font-semibold">
              Inventory Management
            </h1>
          </div>

          <nav className="grid min-w-0 grid-cols-3 gap-1.5 sm:gap-2 xl:flex xl:flex-wrap xl:justify-end">
            {inventoryTabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={[
                  "flex min-h-10 min-w-0 items-center justify-center rounded-xl px-2 py-2 text-center text-[11px] font-bold leading-tight transition",
                  "bg-[#f4ede2] text-[#6c6258] hover:bg-[#eadfce] hover:text-[#23313f]",
                  "sm:min-h-0 sm:rounded-full sm:px-4 sm:py-2 sm:text-sm sm:font-semibold",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {children}
    </div>
  );
}
import Link from "next/link";
import type { ReactNode } from "react";

const inventoryTabs = [
  {
    label: "Overview",
    href: "/admin/inventory",
  },
  {
    label: "Operations",
    href: "/admin/inventory/operations",
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
    <div className="space-y-5">
      <section className="rounded-[28px] border border-black/5 bg-white p-4 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse module
            </div>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1f1e1b]">
              Inventory Management
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {inventoryTabs.map((tab) => {
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    "bg-[#f4ede2] text-[#6c6258] hover:bg-[#eadfce] hover:text-[#23313f]",
                  ].join(" ")}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}
import Link from "next/link";

import {
  DriversTable,
  PerformanceFilterBar,
  PerformanceHero,
  PrimaryKpis,
  SecondaryKpis,
} from "@/components/admin/staff-performance/PerformanceWidgets";
import SectionCard from "@/components/admin/ui/SectionCard";
import { loadDriverPerformancePageData } from "@/lib/staff-performance/driver-performance";
import {
  periodQueryParams,
  resolveStaffPerformancePeriod,
  shiftResolvedPeriod,
} from "@/lib/staff-performance/period";
import { requireAdminPermission } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return String(value || "");
}

export default async function StaffPerformanceDriversPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const { supabase } = await requireAdminPermission("staff.view");
  const params = searchParams || {};

  let period = resolveStaffPerformancePeriod(params);
  const nav = firstValue(params.nav).toLowerCase();

  if (nav === "prev") {
    period = shiftResolvedPeriod(period, "previous");
  } else if (nav === "next") {
    period = shiftResolvedPeriod(period, "next");
  } else if (nav === "current") {
    const resetParams: SearchParams = { ...params };
    delete resetParams.anchor;
    delete resetParams.from;
    delete resetParams.to;
    period = resolveStaffPerformancePeriod(resetParams);
  }

  const selectedDriverKey = (() => {
    const raw = firstValue(params.driver);
    if (!raw || raw === "all") {
      return null;
    }

    return raw;
  })();

  const data = await loadDriverPerformancePageData({
    supabase,
    range: period.range,
    comparisonRange: period.comparisonRange,
    selectedDriverKey,
  });

  const snapshot = data.snapshot;
  const comparisonSnapshot = data.comparisonSnapshot;

  const baseQuery = periodQueryParams(period, {
    driver: selectedDriverKey || "all",
  });

  return (
    <div className="space-y-4 pb-24 sm:space-y-6 sm:pb-0">
      <PerformanceHero
        period={period}
        selectedDriverName={data.selectedDriver?.driver.name || null}
        staleShiftCount={data.staleShiftCount}
        unlinkedDriverShiftCount={data.unlinkedDriverShiftCount}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/staff/performance?${baseQuery}`}
          className="rounded-full border border-[#d9d0c6] bg-white px-4 py-2 text-xs font-semibold text-[#3a342d]"
        >
          Overview
        </Link>
        <Link
          href={`/admin/staff/performance/drivers?${baseQuery}`}
          className="rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white"
        >
          Drivers
        </Link>
      </div>

      <PerformanceFilterBar
        period={period}
        basePath="/admin/staff/performance/drivers"
        selectedDriverKey={selectedDriverKey}
        driverOptions={snapshot.drivers.map((driver) => ({
          key: driver.driverKey,
          label: driver.name,
        }))}
      />

      {period.errors.length > 0 ? (
        <SectionCard title="Period validation" subtitle="Adjust the selected date range.">
          <ul className="list-disc pl-5 text-sm text-red-700">
            {period.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <PrimaryKpis
        snapshot={snapshot}
        comparison={comparisonSnapshot}
        selectedDriver={data.selectedDriver}
        comparisonSelectedDriver={data.comparisonSelectedDriver}
      />

      <SecondaryKpis
        metrics={data.selectedDriver?.metrics || snapshot.teamMetrics}
        comparisonMetrics={data.comparisonSelectedDriver?.metrics || comparisonSnapshot?.teamMetrics || null}
      />

      <DriversTable
        snapshot={snapshot}
        comparison={comparisonSnapshot}
        detailBasePath="/admin/staff/performance/drivers"
        period={period}
      />
    </div>
  );
}

import Link from "next/link";

import {
  DailyPerformanceTable,
  DayTimelineSection,
  ExceptionsSection,
  EquipmentWorkloadSection,
  OperationalQualitySection,
  PerformanceFilterBar,
  PerformanceHero,
  PrimaryKpis,
  PunctualitySection,
  SecondaryKpis,
  StopVolumeChart,
  TimeUsageChart,
} from "@/components/admin/staff-performance/PerformanceWidgets";
import SectionCard from "@/components/admin/ui/SectionCard";
import { loadDriverPerformancePageData } from "@/lib/staff-performance/driver-performance";
import {
  periodQueryParams,
  resolveStaffPerformancePeriod,
  shiftResolvedPeriod,
  toBusinessDateLabel,
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

export default async function StaffPerformanceDriverDetailPage({
  params,
  searchParams,
}: {
  params: { driverKey: string };
  searchParams?: SearchParams;
}) {
  const { supabase } = await requireAdminPermission("staff.view");
  const query = searchParams || {};

  let period = resolveStaffPerformancePeriod(query);
  const nav = firstValue(query.nav).toLowerCase();

  if (nav === "prev") {
    period = shiftResolvedPeriod(period, "previous");
  } else if (nav === "next") {
    period = shiftResolvedPeriod(period, "next");
  } else if (nav === "current") {
    const resetParams: SearchParams = { ...query };
    delete resetParams.anchor;
    delete resetParams.from;
    delete resetParams.to;
    period = resolveStaffPerformancePeriod(resetParams);
  }

  const selectedDriverKey = params.driverKey;

  const data = await loadDriverPerformancePageData({
    supabase,
    range: period.range,
    comparisonRange: period.comparisonRange,
    selectedDriverKey,
  });

  const snapshot = data.snapshot;
  const selectedDriver = data.selectedDriver;
  const comparisonSelectedDriver = data.comparisonSelectedDriver;
  const activeDay = firstValue(query.day) || selectedDriver?.dayUsage[selectedDriver.dayUsage.length - 1]?.date || period.range.to;

  if (!selectedDriver) {
    const baseQuery = periodQueryParams(period, { driver: "all" });

    return (
      <div className="space-y-4">
        <SectionCard title="Driver not found" subtitle="The selected driver key is not available for this period.">
          <p className="text-sm text-[#6c6258]">
            Choose a different driver from the drivers overview page.
          </p>
          <div className="mt-3">
            <Link
              href={`/admin/staff/performance/drivers?${baseQuery}`}
              className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white"
            >
              Back to drivers
            </Link>
          </div>
        </SectionCard>
      </div>
    );
  }

  const baseQuery = periodQueryParams(period, {
    driver: selectedDriver.driver.driverKey,
  });

  const dayHref = (day: string) => {
    return `/admin/staff/performance/drivers/${encodeURIComponent(selectedDriver.driver.driverKey)}?${periodQueryParams(period, {
      driver: selectedDriver.driver.driverKey,
      day,
    })}`;
  };

  return (
    <div className="space-y-4 pb-24 sm:space-y-6 sm:pb-0">
      <PerformanceHero
        period={period}
        selectedDriverName={selectedDriver.driver.name}
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
          className="rounded-full border border-[#d9d0c6] bg-white px-4 py-2 text-xs font-semibold text-[#3a342d]"
        >
          Drivers
        </Link>
        <span className="rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white">Driver detail</span>
      </div>

      <PerformanceFilterBar
        period={period}
        basePath={`/admin/staff/performance/drivers/${encodeURIComponent(selectedDriver.driver.driverKey)}`}
        selectedDriverKey={selectedDriver.driver.driverKey}
        driverOptions={snapshot.drivers.map((driver) => ({
          key: driver.driverKey,
          label: driver.name,
        }))}
      />

      <PrimaryKpis
        snapshot={snapshot}
        comparison={data.comparisonSnapshot}
        selectedDriver={selectedDriver}
        comparisonSelectedDriver={comparisonSelectedDriver}
      />

      <SecondaryKpis
        metrics={selectedDriver.metrics}
        comparisonMetrics={comparisonSelectedDriver?.metrics || null}
      />

      <SectionCard
        title="Driver details"
        subtitle={`Selected date for timeline: ${toBusinessDateLabel(activeDay)}`}
      >
        <p className="text-sm text-[#5f554b]">
          Driver identity resolution is based on current staff profile display name and route driver name matching used by existing operational systems.
        </p>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <TimeUsageChart dayUsage={selectedDriver.dayUsage} />
        <StopVolumeChart dayStops={selectedDriver.dayStops} />
      </div>

      <PunctualitySection metrics={selectedDriver.metrics} />

      <div className="grid gap-4 xl:grid-cols-2">
        <EquipmentWorkloadSection
          categoryBreakdown={selectedDriver.categoryBreakdown}
          productsHandled={selectedDriver.metrics.productsHandled}
        />
        <OperationalQualitySection quality={selectedDriver.quality} />
      </div>

      <ExceptionsSection items={selectedDriver.exceptions} />

      <DailyPerformanceTable
        rows={selectedDriver.dayUsage}
        stopRows={selectedDriver.dayStops}
        activeDay={activeDay}
        dayHref={dayHref}
      />

      <DayTimelineSection detail={selectedDriver} day={activeDay} />
    </div>
  );
}

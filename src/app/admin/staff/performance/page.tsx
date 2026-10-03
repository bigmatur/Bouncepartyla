import Link from "next/link";

import {
  ComparisonBanner,
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
import {
  loadDriverPerformancePageData,
  formatPercent,
} from "@/lib/staff-performance/driver-performance";
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

export default async function StaffPerformancePage({
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

  const selectedDriver = data.selectedDriver;
  const comparisonSelectedDriver = data.comparisonSelectedDriver;
  const snapshot = data.snapshot;
  const comparisonSnapshot = data.comparisonSnapshot;

  const baseQuery = periodQueryParams(period, {
    driver: selectedDriverKey || "all",
  });

  return (
    <div className="space-y-4 pb-24 sm:space-y-6 sm:pb-0">
      <PerformanceHero
        period={period}
        selectedDriverName={selectedDriver?.driver.name || null}
        staleShiftCount={data.staleShiftCount}
        unlinkedDriverShiftCount={data.unlinkedDriverShiftCount}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/staff/performance?${baseQuery}`}
          className="rounded-full bg-[#111111] px-4 py-2 text-xs font-semibold text-white"
        >
          Overview
        </Link>
        <Link
          href={`/admin/staff/performance/drivers?${baseQuery}`}
          className="rounded-full border border-[#d9d0c6] bg-white px-4 py-2 text-xs font-semibold text-[#3a342d]"
        >
          Drivers
        </Link>
      </div>

      <PerformanceFilterBar
        period={period}
        basePath="/admin/staff/performance"
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
        selectedDriver={selectedDriver}
        comparisonSelectedDriver={comparisonSelectedDriver}
      />

      <SecondaryKpis
        metrics={selectedDriver?.metrics || snapshot.teamMetrics}
        comparisonMetrics={comparisonSelectedDriver?.metrics || comparisonSnapshot?.teamMetrics || null}
      />

      {comparisonSnapshot ? (
        <ComparisonBanner
          currentLabel={`${toBusinessDateLabel(period.range.from)} to ${toBusinessDateLabel(period.range.to)}`}
          previousLabel={`${toBusinessDateLabel(comparisonSnapshot.period.from)} to ${toBusinessDateLabel(comparisonSnapshot.period.to)}`}
          currentValue={selectedDriver?.metrics.onTimePercent ?? snapshot.teamMetrics.onTimePercent}
          previousValue={comparisonSelectedDriver?.metrics.onTimePercent ?? comparisonSnapshot.teamMetrics.onTimePercent}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <TimeUsageChart dayUsage={selectedDriver?.dayUsage || snapshot.teamDayUsage} />
        <StopVolumeChart dayStops={selectedDriver?.dayStops || snapshot.teamDayStops} />
      </div>

      <PunctualitySection metrics={selectedDriver?.metrics || snapshot.teamMetrics} />

      <div className="grid gap-4 xl:grid-cols-2">
        <EquipmentWorkloadSection
          categoryBreakdown={selectedDriver?.categoryBreakdown || snapshot.teamCategoryBreakdown}
          productsHandled={selectedDriver?.metrics.productsHandled || snapshot.teamMetrics.productsHandled}
        />
        <OperationalQualitySection quality={selectedDriver?.quality || snapshot.teamQuality} />
      </div>

      <ExceptionsSection items={selectedDriver?.exceptions || snapshot.teamExceptions} />

      <SectionCard title="Data notes" subtitle="Phase 1 operational boundaries and reliability language.">
        <ul className="space-y-1 text-sm text-[#5f554b]">
          {data.notes.map((note) => (
            <li key={note}>• {note}</li>
          ))}
          <li>
            • Between Stops and Unclassified are not canonical driving telemetry metrics.
          </li>
          <li>
            • On-Time rate shown here is {formatPercent(selectedDriver?.metrics.onTimePercent || snapshot.teamMetrics.onTimePercent)} for the selected scope.
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}

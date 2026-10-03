import Link from "next/link";

import PageHero from "@/components/admin/ui/PageHero";
import SectionCard from "@/components/admin/ui/SectionCard";
import StatCard from "@/components/admin/ui/StatCard";
import {
  DEFAULT_LATE_TOLERANCE_MINUTES,
  formatDateTimeLabel,
  formatDeltaCount,
  formatDeltaPercent,
  formatDeltaPoints,
  formatDuration,
  formatPercent,
} from "@/lib/staff-performance/driver-performance";
import { periodQueryParams, toBusinessDateLabel } from "@/lib/staff-performance/period";
import type { ResolvedPeriod } from "@/lib/staff-performance/types";
import type { DriverPerformanceDetail, DriverPerformanceSnapshot } from "@/lib/staff-performance/types";

function deltaTone(value: string) {
  if (value.startsWith("+")) return "text-emerald-700";
  if (value.startsWith("-")) return "text-red-700";
  return "text-[#81766c]";
}

function dateInput(value: string) {
  return value;
}

export function PerformanceFilterBar(props: {
  period: ResolvedPeriod;
  basePath: string;
  selectedDriverKey: string | null;
  driverOptions: Array<{ key: string; label: string }>;
}) {
  const prevHref = `${props.basePath}?${periodQueryParams(props.period, {
    anchor: "",
    from: props.period.preset === "custom" ? props.period.range.from : "",
    to: props.period.preset === "custom" ? props.period.range.to : "",
  })}`;

  const previousPeriod = props.period.preset === "custom"
    ? {
        ...props.period,
        range: props.period.comparisonRange || props.period.range,
      }
    : props.period;

  const previousQuery = periodQueryParams(previousPeriod, {
    nav: "prev",
    driver: props.selectedDriverKey || "all",
  });

  const nextQuery = periodQueryParams(props.period, {
    nav: "next",
    driver: props.selectedDriverKey || "all",
  });

  const currentQuery = periodQueryParams(props.period, {
    nav: "current",
    driver: props.selectedDriverKey || "all",
  });

  return (
    <SectionCard
      title="Filters"
      subtitle="Use business-local America/Los_Angeles date boundaries for all comparisons."
      className="rounded-[20px]"
    >
      <form method="get" action={props.basePath} className="grid gap-3 md:grid-cols-6">
        <label className="flex flex-col gap-1 text-xs font-semibold text-[#6c6258]">
          Driver
          <select
            name="driver"
            defaultValue={props.selectedDriverKey || "all"}
            className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm text-[#2b2621]"
          >
            <option value="all">All Drivers</option>
            {props.driverOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-[#6c6258]">
          Period
          <select
            name="period"
            defaultValue={props.period.preset}
            className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm text-[#2b2621]"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-[#6c6258]">
          Anchor
          <input
            type="date"
            name="anchor"
            defaultValue={dateInput(props.period.anchorDate)}
            className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm text-[#2b2621]"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-[#6c6258]">
          From
          <input
            type="date"
            name="from"
            defaultValue={dateInput(props.period.range.from)}
            className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm text-[#2b2621]"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-semibold text-[#6c6258]">
          To
          <input
            type="date"
            name="to"
            defaultValue={dateInput(props.period.range.to)}
            className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm text-[#2b2621]"
          />
        </label>

        <div className="flex flex-col justify-end gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#6c6258]">
            <input type="checkbox" name="compare" value="1" defaultChecked={props.period.compareWithPrevious} />
            Compare with previous period
          </label>
          <button
            type="submit"
            className="rounded-xl bg-[#23313f] px-3 py-2 text-sm font-semibold text-white"
          >
            Apply
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`${props.basePath}?${previousQuery}`}
          className="rounded-full border border-[#d9d0c6] bg-white px-3 py-1.5 text-xs font-semibold text-[#3a342d]"
        >
          Previous period
        </Link>
        <Link
          href={`${props.basePath}?${nextQuery}`}
          className="rounded-full border border-[#d9d0c6] bg-white px-3 py-1.5 text-xs font-semibold text-[#3a342d]"
        >
          Next period
        </Link>
        <Link
          href={`${props.basePath}?${currentQuery}`}
          className="rounded-full border border-[#d9d0c6] bg-white px-3 py-1.5 text-xs font-semibold text-[#3a342d]"
        >
          Current period
        </Link>
        <Link
          href={prevHref}
          className="rounded-full border border-[#d9d0c6] bg-white px-3 py-1.5 text-xs font-semibold text-[#3a342d]"
        >
          Reset query
        </Link>
      </div>
    </SectionCard>
  );
}

export function PerformanceHero(props: {
  period: ResolvedPeriod;
  selectedDriverName: string | null;
  staleShiftCount: number;
  unlinkedDriverShiftCount: number;
}) {
  return (
    <PageHero
      eyebrow="Staff"
      title="Staff Performance"
      description={
        <>
          Operational analytics for driver activity. Metrics are factual and non-scoring. Between Stops is derived from
          completion-to-arrival gaps and may include waiting, traffic, and other unclassified time.
        </>
      }
      stats={
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Scope"
            value={props.selectedDriverName || "All Drivers"}
            hint={`${toBusinessDateLabel(props.period.range.from)} to ${toBusinessDateLabel(props.period.range.to)}`}
            tone="plain"
          />
          <StatCard
            label="Stale Open Shifts"
            value={String(props.staleShiftCount)}
            hint="Open longer than 24h"
            tone={props.staleShiftCount > 0 ? "red" : "green"}
          />
          <StatCard
            label="Unlinked Driver Shifts"
            value={String(props.unlinkedDriverShiftCount)}
            hint="Requires identity review"
            tone={props.unlinkedDriverShiftCount > 0 ? "gold" : "plain"}
          />
        </div>
      }
    />
  );
}

export function PrimaryKpis(props: {
  snapshot: DriverPerformanceSnapshot;
  comparison: DriverPerformanceSnapshot | null;
  selectedDriver: DriverPerformanceDetail | null;
  comparisonSelectedDriver: DriverPerformanceDetail | null;
}) {
  const current = props.selectedDriver?.metrics || props.snapshot.teamMetrics;
  const previous = props.comparison
    ? (props.comparisonSelectedDriver?.metrics || props.comparison.teamMetrics)
    : null;

  const onTimeCurrent = current.onTimePercent;
  const onTimePrevious = previous?.onTimePercent ?? null;

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Working Time"
        value={formatDuration(current.workingMinutes)}
        hint={previous ? `${formatDuration(previous.workingMinutes)} previous · ${formatDeltaCount(current.workingMinutes, previous.workingMinutes)}` : "Paid working minutes from Working Time report"}
        tone="gold"
      />
      <StatCard
        label="Completed Stops"
        value={current.completedStops.toLocaleString("en-US")}
        hint={previous ? `${previous.completedStops.toLocaleString("en-US")} previous · ${formatDeltaCount(current.completedStops, previous.completedStops)}` : "Delivery + pickup stops with completed status"}
        tone="blue"
      />
      <StatCard
        label="On-Time %"
        value={formatPercent(onTimeCurrent)}
        hint={previous ? `${formatPercent(onTimePrevious)} previous · ${formatDeltaPoints(onTimeCurrent, onTimePrevious)}` : `Late if arrival exceeds planned window + ${DEFAULT_LATE_TOLERANCE_MINUTES} min`}
        tone="green"
      />
      <StatCard
        label="Exceptions"
        value={current.exceptions.toLocaleString("en-US")}
        hint={previous ? `${previous.exceptions.toLocaleString("en-US")} previous · ${formatDeltaCount(current.exceptions, previous.exceptions)}` : "Late, stale/open, missing proof, unfinished, invalid timing"}
        tone={current.exceptions > 0 ? "red" : "plain"}
      />
    </section>
  );
}

export function SecondaryKpis(props: {
  metrics: DriverPerformanceDetail["metrics"] | DriverPerformanceSnapshot["teamMetrics"];
  comparisonMetrics: DriverPerformanceDetail["metrics"] | DriverPerformanceSnapshot["teamMetrics"] | null;
}) {
  const current = props.metrics;
  const previous = props.comparisonMetrics;

  const cards = [
    {
      label: "Deliveries",
      value: current.deliveries.toLocaleString("en-US"),
      hint: previous ? formatDeltaCount(current.deliveries, previous.deliveries) : "Completed delivery stops",
    },
    {
      label: "Pickups",
      value: current.pickups.toLocaleString("en-US"),
      hint: previous ? formatDeltaCount(current.pickups, previous.pickups) : "Completed pickup stops",
    },
    {
      label: "Explicit Break Time",
      value: formatDuration(current.explicitBreakMinutes),
      hint: previous ? formatDeltaCount(current.explicitBreakMinutes, previous.explicitBreakMinutes) : "Derived from recorded break intervals",
    },
    {
      label: "Average On-Site Time",
      value: formatDuration(current.averageOnSiteMinutes),
      hint: current.onSiteCoverageLabel,
    },
    {
      label: "Products Handled",
      value: current.productsHandled.toLocaleString("en-US"),
      hint: "From booking items linked to completed stops",
    },
    {
      label: "Late Stops",
      value: current.lateStops.toLocaleString("en-US"),
      hint: previous ? formatDeltaCount(current.lateStops, previous.lateStops) : "Arrival outside planned window",
    },
    {
      label: "Between Stops",
      value: formatDuration(current.betweenStopsMinutes),
      hint: current.betweenStopsCoverageLabel,
    },
    {
      label: "Unclassified Time",
      value: formatDuration(current.unclassifiedMinutes),
      hint: "Working time that cannot be reliably classified",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} tone="plain" />
      ))}
    </section>
  );
}

export function TimeUsageChart(props: {
  dayUsage: DriverPerformanceDetail["dayUsage"] | DriverPerformanceSnapshot["teamDayUsage"];
}) {
  const rows = props.dayUsage;
  const max = Math.max(
    1,
    ...rows.map((row) => row.onSiteMinutes + row.betweenStopsMinutes + row.breakMinutes + row.unclassifiedMinutes),
  );

  return (
    <SectionCard
      title="Time Usage"
      subtitle="Derived from shift intervals and stop timestamps. Unclassified remains explicit when coverage is incomplete."
    >
      <div className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-[#81766c]">No timing records in selected period.</p>
        ) : null}

        {rows.map((row) => {
          const total = row.onSiteMinutes + row.betweenStopsMinutes + row.breakMinutes + row.unclassifiedMinutes;
          const onSiteWidth = (row.onSiteMinutes / max) * 100;
          const betweenWidth = (row.betweenStopsMinutes / max) * 100;
          const breakWidth = (row.breakMinutes / max) * 100;
          const unclassifiedWidth = (row.unclassifiedMinutes / max) * 100;

          return (
            <div key={row.date} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6c6258]">
                <span className="font-semibold text-[#3a342d]">{toBusinessDateLabel(row.date)}</span>
                <span>
                  Working {formatDuration(row.workingMinutes)} · On site {formatDuration(row.onSiteMinutes)} · Break {formatDuration(row.breakMinutes)}
                </span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-[#efe8dd]" title={row.timingCoverageLabel}>
                <div className="flex h-full w-full">
                  <div style={{ width: `${onSiteWidth}%` }} className="h-full bg-[#3b82f6]" aria-label="On site" />
                  <div style={{ width: `${betweenWidth}%` }} className="h-full bg-[#10b981]" aria-label="Between stops" />
                  <div style={{ width: `${breakWidth}%` }} className="h-full bg-[#f59e0b]" aria-label="Break" />
                  <div style={{ width: `${unclassifiedWidth}%` }} className="h-full bg-[#9ca3af]" aria-label="Unclassified" />
                </div>
              </div>
              <div className="text-[11px] text-[#81766c]">
                Between Stops: {formatDuration(row.betweenStopsMinutes)} · Unclassified: {formatDuration(row.unclassifiedMinutes)} · Total classified {formatDuration(total)}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

export function StopVolumeChart(props: {
  dayStops: DriverPerformanceDetail["dayStops"] | DriverPerformanceSnapshot["teamDayStops"];
}) {
  const rows = props.dayStops;
  const max = Math.max(1, ...rows.map((row) => Math.max(row.deliveries, row.pickups)));

  return (
    <SectionCard title="Stop Volume" subtitle="Business-local daily stop counts. Cancelled stops are never treated as completed workload.">
      {rows.length === 0 ? (
        <p className="text-sm text-[#81766c]">No route stops found in selected period.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.date} className="rounded-xl border border-[#eee5d9] bg-[#fbf9f6] px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#3a342d]">{toBusinessDateLabel(row.date)}</span>
                <span className="text-[#6c6258]">
                  Completed {row.completed} · Failed {row.failed} · Cancelled {row.cancelled}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-[11px] text-[#6c6258]">
                  <span className="w-16">Deliveries</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e5edf8]">
                    <div className="h-full rounded-full bg-[#3b82f6]" style={{ width: `${(row.deliveries / max) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right">{row.deliveries}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#6c6258]">
                  <span className="w-16">Pickups</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#dcf5ec]">
                    <div className="h-full rounded-full bg-[#10b981]" style={{ width: `${(row.pickups / max) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right">{row.pickups}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export function PunctualitySection(props: {
  metrics: DriverPerformanceDetail["metrics"] | DriverPerformanceSnapshot["teamMetrics"];
}) {
  const current = props.metrics;

  return (
    <SectionCard
      title="Punctuality"
      subtitle={`Late stop means arrival outside planned window plus ${DEFAULT_LATE_TOLERANCE_MINUTES} minute tolerance. This does not attribute fault.`}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="On-Time %" value={formatPercent(current.onTimePercent)} hint="Rate based on stops with valid arrival + planned window" tone="blue" />
        <StatCard label="On-Time Stops" value={current.onTimeStops.toLocaleString("en-US")} hint="Count" tone="green" />
        <StatCard label="Late Stops" value={current.lateStops.toLocaleString("en-US")} hint="Arrival outside planned window" tone={current.lateStops > 0 ? "red" : "plain"} />
        <StatCard label="Average Late Minutes" value={formatDuration(current.averageLateMinutes)} hint="Among late stops" tone="plain" />
        <StatCard label="Max Late Minutes" value={formatDuration(current.maxLateMinutes)} hint="Among late stops" tone="plain" />
      </div>
    </SectionCard>
  );
}

export function EquipmentWorkloadSection(props: {
  categoryBreakdown: Array<{ category: string; quantity: number }>;
  productsHandled: number;
}) {
  return (
    <SectionCard
      title="Equipment Workload"
      subtitle="Equipment workload reflects currently available booking and operational records and may be affected by later booking changes."
    >
      <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <StatCard
          label="Products Handled"
          value={props.productsHandled.toLocaleString("en-US")}
          hint="Aggregated booking item quantities for completed stops"
          tone="gold"
        />

        <div className="rounded-2xl border border-[#eadfd1] bg-[#fdfbf8] p-3">
          <div className="text-xs font-semibold text-[#5d5349]">Category breakdown</div>
          {props.categoryBreakdown.length === 0 ? (
            <p className="mt-2 text-sm text-[#81766c]">Insufficient data</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {props.categoryBreakdown.map((item) => (
                <div key={item.category} className="flex items-center justify-between text-sm">
                  <span className="text-[#3a342d]">{item.category}</span>
                  <span className="font-semibold text-[#3a342d]">{item.quantity.toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function OperationalQualitySection(props: {
  quality: DriverPerformanceDetail["quality"] | DriverPerformanceSnapshot["teamQuality"];
}) {
  const quality = props.quality;

  const proofCoverage = quality.requiredDeliveryProofCompleted > 0
    ? `${quality.requiredDeliveryProofUploaded}/${quality.requiredDeliveryProofCompleted}`
    : "No required delivery proof records";

  const checklistCoverage = quality.checklistExpectedChecks > 0
    ? `${quality.checklistCompletedChecks}/${quality.checklistExpectedChecks}`
    : "No checklist records";

  const signatureCoverage = quality.requiredDeliverySignatureStops > 0
    ? `${quality.requiredDeliverySignatureCompleted}/${quality.requiredDeliverySignatureStops}`
    : "No delivery signature records";

  const paymentCoverage = quality.paymentReportEligibleStops > 0
    ? `${quality.paymentReportedStops}/${quality.paymentReportEligibleStops}`
    : "No payment-report eligible stops";

  return (
    <SectionCard title="Operational Quality" subtitle="Coverage metrics only. Checklist remains non-blocking; optional pickup proof is never marked missing.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Required Delivery Proof" value={proofCoverage} hint="Completed delivery stops requiring proof" tone="plain" />
        <StatCard label="Checklist Coverage" value={checklistCoverage} hint="Expected checks completed" tone="plain" />
        <StatCard label="Delivery Signature Coverage" value={signatureCoverage} hint="Completed delivery stops with signed handover" tone="plain" />
        <StatCard label="Driver Payment Reports" value={paymentCoverage} hint="Stops with balance due and reported payment" tone="plain" />
      </div>
    </SectionCard>
  );
}

export function ExceptionsSection(props: {
  items: DriverPerformanceDetail["exceptions"] | DriverPerformanceSnapshot["teamExceptions"];
}) {
  return (
    <SectionCard title="Exceptions" subtitle="Factual operational exceptions. No fault attribution.">
      {props.items.length === 0 ? (
        <p className="text-sm text-[#81766c]">No exceptions found for this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7d7266]">
                <th className="border-b border-[#e8ddd1] px-2 py-2">Type</th>
                <th className="border-b border-[#e8ddd1] px-2 py-2">Date/Time</th>
                <th className="border-b border-[#e8ddd1] px-2 py-2">Driver</th>
                <th className="border-b border-[#e8ddd1] px-2 py-2">Reference</th>
                <th className="border-b border-[#e8ddd1] px-2 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {props.items.slice(0, 50).map((item) => (
                <tr key={item.id} className="text-[#3a342d]">
                  <td className="border-b border-[#f1e9df] px-2 py-2">{item.type.replaceAll("_", " ")}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatDateTimeLabel(item.dateTime)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{item.driverName}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">
                    {item.href ? (
                      <Link href={item.href} className="text-[#2f6bb3] underline">
                        {item.reference}
                      </Link>
                    ) : (
                      item.reference
                    )}
                  </td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

export function DriversTable(props: {
  snapshot: DriverPerformanceSnapshot;
  comparison: DriverPerformanceSnapshot | null;
  detailBasePath: string;
  period: ResolvedPeriod;
}) {
  return (
    <SectionCard title="Drivers" subtitle="Neutral default sort by driver name. Columns are factual operational metrics.">
      <div className="overflow-x-auto">
        <table className="min-w-[940px] w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7d7266]">
              <th className="border-b border-[#e8ddd1] px-2 py-2">Driver</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Working Time</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Completed Stops</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Deliveries</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Pickups</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">On-Time %</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Avg On-Site</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Products</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Exceptions</th>
            </tr>
          </thead>
          <tbody>
            {props.snapshot.perDriver.map((row) => {
              const previousRow = props.comparison?.perDriver.find(
                (item) => item.driver.driverKey === row.driver.driverKey,
              );

              const query = periodQueryParams(props.period, {
                driver: row.driver.driverKey,
              });

              const onTimeDelta = formatDeltaPoints(
                row.metrics.onTimePercent,
                previousRow?.metrics.onTimePercent ?? null,
              );

              return (
                <tr key={row.driver.driverKey} className="text-[#3a342d]">
                  <td className="border-b border-[#f1e9df] px-2 py-2 font-semibold">
                    <Link href={`${props.detailBasePath}/${encodeURIComponent(row.driver.driverKey)}?${query}`} className="text-[#2f6bb3] underline">
                      {row.driver.name}
                    </Link>
                  </td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatDuration(row.metrics.workingMinutes)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{row.metrics.completedStops.toLocaleString("en-US")}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{row.metrics.deliveries.toLocaleString("en-US")}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{row.metrics.pickups.toLocaleString("en-US")}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">
                    <div>{formatPercent(row.metrics.onTimePercent)}</div>
                    {props.comparison ? <div className={`text-[11px] ${deltaTone(onTimeDelta)}`}>{onTimeDelta}</div> : null}
                  </td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatDuration(row.metrics.averageOnSiteMinutes)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{row.metrics.productsHandled.toLocaleString("en-US")}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{row.metrics.exceptions.toLocaleString("en-US")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export function DailyPerformanceTable(props: {
  rows: DriverPerformanceDetail["dayUsage"];
  stopRows: DriverPerformanceDetail["dayStops"];
  activeDay: string;
  dayHref: (date: string) => string;
}) {
  const stopByDate = new Map(props.stopRows.map((row) => [row.date, row]));

  return (
    <SectionCard title="Daily Performance" subtitle="Textual daily view for accessibility and auditability.">
      <div className="overflow-x-auto">
        <table className="min-w-[1020px] w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.08em] text-[#7d7266]">
              <th className="border-b border-[#e8ddd1] px-2 py-2">Date</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Working</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Break</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">On Site</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Between Stops</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Unclassified</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Deliveries</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Pickups</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Completed</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Products</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">On-Time %</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Late</th>
              <th className="border-b border-[#e8ddd1] px-2 py-2">Exceptions</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => {
              const stop = stopByDate.get(row.date);
              const onTime = stop && stop.punctualityEligibleStops > 0
                ? (stop.onTimeStops / stop.punctualityEligibleStops) * 100
                : null;
              const selected = row.date === props.activeDay;

              return (
                <tr key={row.date} className={selected ? "bg-[#f4f7fb]" : ""}>
                  <td className="border-b border-[#f1e9df] px-2 py-2 font-semibold">
                    <Link href={props.dayHref(row.date)} className="text-[#2f6bb3] underline">
                      {toBusinessDateLabel(row.date)}
                    </Link>
                  </td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatDuration(row.workingMinutes)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatDuration(row.breakMinutes)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatDuration(row.onSiteMinutes)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatDuration(row.betweenStopsMinutes)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatDuration(row.unclassifiedMinutes)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{stop?.deliveries ?? 0}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{stop?.pickups ?? 0}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{stop?.completed ?? 0}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{stop?.productsHandled ?? 0}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{formatPercent(onTime)}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{stop?.lateStops ?? 0}</td>
                  <td className="border-b border-[#f1e9df] px-2 py-2">{stop?.exceptions ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export function DayTimelineSection(props: {
  detail: DriverPerformanceDetail;
  day: string;
}) {
  const timeline = props.detail.dayTimeline;

  if (!timeline || timeline.date !== props.day) {
    return (
      <SectionCard title="Day Timeline" subtitle="Select a day to review shift and stop intervals.">
        <p className="text-sm text-[#81766c]">No timeline intervals are available for this date.</p>
      </SectionCard>
    );
  }

  const totalMinutes = Math.max(1, timeline.segments.reduce((sum, segment) => sum + segment.minutes, 0));

  const colorByKind: Record<string, string> = {
    shift: "bg-[#d9dce3]",
    break: "bg-[#f59e0b]",
    on_site: "bg-[#3b82f6]",
    between_stops: "bg-[#10b981]",
    unclassified: "bg-[#9ca3af]",
  };

  return (
    <SectionCard
      title="Day Timeline"
      subtitle="Timeline classifications: Shift, Break, On Site, Between Stops, Unclassified. Between Stops is derived and not authoritative driving telemetry."
    >
      <div className="space-y-3">
        {timeline.segments.map((segment, index) => (
          <div key={`${segment.startAt}-${segment.kind}-${index}`} className="rounded-xl border border-[#e8ddd1] bg-[#fbf9f6] p-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#3a342d]">{segment.label}</span>
              <span className="text-[#6c6258]">{formatDuration(segment.minutes)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ece4d9]">
              <div
                className={`h-full ${colorByKind[segment.kind] || "bg-[#9ca3af]"}`}
                style={{ width: `${Math.max(2, (segment.minutes / totalMinutes) * 100)}%` }}
              />
            </div>
            <div className="mt-2 text-[11px] text-[#6c6258]">
              {formatDateTimeLabel(segment.startAt)} to {formatDateTimeLabel(segment.endAt)}
              {segment.stopId ? ` · Stop ${segment.stopId}` : ""}
            </div>
            {segment.stopId ? (
              <div className="mt-1 text-[11px] text-[#6c6258]">
                {segment.stopType || "Stop"}
                {segment.scheduledStartTime
                  ? ` · Planned ${segment.scheduledStartTime}${segment.scheduledEndTime ? `-${segment.scheduledEndTime}` : ""}`
                  : ""}
                {segment.arrivedAt ? ` · Arrived ${formatDateTimeLabel(segment.arrivedAt)}` : ""}
                {segment.completedAt ? ` · Completed ${formatDateTimeLabel(segment.completedAt)}` : ""}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export function ComparisonBanner(props: {
  currentLabel: string;
  previousLabel: string;
  currentValue: number | null;
  previousValue: number | null;
}) {
  const deltaPct = formatDeltaPercent(props.currentValue, props.previousValue);
  return (
    <div className="rounded-xl border border-[#e8ddd1] bg-[#fbf7f1] px-3 py-2 text-xs text-[#5f554b]">
      Compare {props.currentLabel} vs {props.previousLabel}: <span className={`font-semibold ${deltaTone(deltaPct)}`}>{deltaPct}</span>
    </div>
  );
}

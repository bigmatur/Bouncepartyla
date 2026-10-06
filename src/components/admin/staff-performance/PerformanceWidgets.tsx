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

type TimeUsageRow = DriverPerformanceDetail["dayUsage"][number] | DriverPerformanceSnapshot["teamDayUsage"][number];
type StopSummaryRow = DriverPerformanceDetail["dayStops"][number] | DriverPerformanceSnapshot["teamDayStops"][number];

type TimeUsageBucket = {
  key: string;
  label: string;
  detailLabel: string;
  workingMinutes: number;
  onSiteMinutes: number;
  betweenStopsMinutes: number;
  breakMinutes: number;
  unclassifiedMinutes: number;
  sampleCount: number;
};

type StopVolumeBucket = {
  key: string;
  label: string;
  detailLabel: string;
  deliveries: number;
  pickups: number;
  completed: number;
  failed: number;
  cancelled: number;
  onTimeStops: number;
  lateStops: number;
  punctualityEligibleStops: number;
  sampleCount: number;
};

const CUSTOM_WEEKLY_BUCKET_THRESHOLD_DAYS = 35;

function deltaTone(value: string) {
  if (value.startsWith("+")) return "text-emerald-700";
  if (value.startsWith("-")) return "text-red-700";
  return "text-[#81766c]";
}

function dateInput(value: string) {
  return value;
}

function parseDateKey(value: string) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatIsoDateUtc(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetweenInclusive(from: string, to: string) {
  const fromDate = parseDateKey(from);
  const toDate = parseDateKey(to);

  if (!fromDate || !toDate) {
    return 0;
  }

  return Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
}

function weekStartMonday(dateKey: string) {
  const date = parseDateKey(dateKey);

  if (!date) {
    return dateKey;
  }

  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return formatIsoDateUtc(date);
}

function shouldUseWeeklyAggregation(period: ResolvedPeriod) {
  if (period.preset !== "custom") {
    return false;
  }

  return daysBetweenInclusive(period.range.from, period.range.to) > CUSTOM_WEEKLY_BUCKET_THRESHOLD_DAYS;
}

function bucketLabel(key: string, mode: "day" | "week") {
  if (mode === "day") {
    return toBusinessDateLabel(key);
  }

  const start = parseDateKey(key);

  if (!start) {
    return key;
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const endKey = formatIsoDateUtc(end);
  return `${toBusinessDateLabel(key)} - ${toBusinessDateLabel(endKey)}`;
}

function shortBucketLabel(key: string, mode: "day" | "week") {
  const date = parseDateKey(key);

  if (!date) {
    return key;
  }

  if (mode === "week") {
    return `Wk ${String(date.getUTCMonth() + 1)}/${String(date.getUTCDate())}`;
  }

  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function buildTimeUsageBuckets(rows: ReadonlyArray<TimeUsageRow>, period: ResolvedPeriod): TimeUsageBucket[] {
  const mode: "day" | "week" = shouldUseWeeklyAggregation(period) ? "week" : "day";
  const grouped = new Map<string, TimeUsageBucket>();

  for (const row of rows) {
    const key = mode === "week" ? weekStartMonday(row.date) : row.date;

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: shortBucketLabel(key, mode),
        detailLabel: bucketLabel(key, mode),
        workingMinutes: 0,
        onSiteMinutes: 0,
        betweenStopsMinutes: 0,
        breakMinutes: 0,
        unclassifiedMinutes: 0,
        sampleCount: 0,
      });
    }

    const bucket = grouped.get(key)!;
    bucket.workingMinutes += row.workingMinutes;
    bucket.onSiteMinutes += row.onSiteMinutes;
    bucket.betweenStopsMinutes += row.betweenStopsMinutes;
    bucket.breakMinutes += row.breakMinutes;
    bucket.unclassifiedMinutes += row.unclassifiedMinutes;
    bucket.sampleCount += 1;
  }

  return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function buildStopVolumeBuckets(rows: ReadonlyArray<StopSummaryRow>, period: ResolvedPeriod): StopVolumeBucket[] {
  const mode: "day" | "week" = shouldUseWeeklyAggregation(period) ? "week" : "day";
  const grouped = new Map<string, StopVolumeBucket>();

  for (const row of rows) {
    const key = mode === "week" ? weekStartMonday(row.date) : row.date;

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        label: shortBucketLabel(key, mode),
        detailLabel: bucketLabel(key, mode),
        deliveries: 0,
        pickups: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        onTimeStops: 0,
        lateStops: 0,
        punctualityEligibleStops: 0,
        sampleCount: 0,
      });
    }

    const bucket = grouped.get(key)!;
    bucket.deliveries += row.deliveries;
    bucket.pickups += row.pickups;
    bucket.completed += row.completed;
    bucket.failed += row.failed;
    bucket.cancelled += row.cancelled;
    bucket.onTimeStops += row.onTimeStops;
    bucket.lateStops += row.lateStops;
    bucket.punctualityEligibleStops += row.punctualityEligibleStops;
    bucket.sampleCount += 1;
  }

  return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function chartCanvasWidth(bucketCount: number) {
  return Math.max(320, Math.min(980, bucketCount * 34 + 110));
}

function hourAxisLabel(minutes: number) {
  const hours = minutes / 60;
  return hours >= 1 ? `${hours.toFixed(hours >= 10 ? 0 : 1)}h` : `${Math.round(minutes)}m`;
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
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        label="Average On-Site"
        value={formatDuration(current.averageOnSiteMinutes)}
        hint={current.onSiteCoverageLabel}
        tone="blue"
      />
      <StatCard
        label="Needs Attention"
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
    <SectionCard
      title="Time & Workload"
      subtitle="Supporting operational counters. Between Stops is derived from completion-to-arrival gaps and is not GPS-measured driving time."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} tone="plain" />
        ))}
      </div>
    </SectionCard>
  );
}

export function TimeUsageChart(props: {
  dayUsage: DriverPerformanceDetail["dayUsage"] | DriverPerformanceSnapshot["teamDayUsage"];
  period: ResolvedPeriod;
}) {
  const buckets = buildTimeUsageBuckets(props.dayUsage, props.period);
  const width = chartCanvasWidth(buckets.length);
  const chartHeight = 270;
  const left = 44;
  const right = 20;
  const top = 16;
  const bottom = 56;
  const plotHeight = chartHeight - top - bottom;
  const availableWidth = width - left - right;
  const step = buckets.length > 0 ? availableWidth / buckets.length : availableWidth;
  const barWidth = Math.max(16, Math.min(32, step * 0.55));

  const maxWorking = Math.max(1, ...buckets.map((bucket) => bucket.workingMinutes));
  const maxClassified = Math.max(
    1,
    ...buckets.map((bucket) => bucket.onSiteMinutes + bucket.betweenStopsMinutes + bucket.breakMinutes + bucket.unclassifiedMinutes),
  );
  const yMax = Math.max(maxWorking, maxClassified);
  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  const legend = [
    { key: "on_site", label: "On-site", color: "#3b82f6" },
    { key: "between", label: "Between Stops (derived)", color: "#10b981" },
    { key: "break", label: "Explicit Break", color: "#f59e0b" },
    { key: "unclassified", label: "Unclassified", color: "#9ca3af" },
  ];

  return (
    <SectionCard
      title="Activity & Time Usage"
      subtitle="Working time composition by period bucket. Between Stops is derived from timestamps and may include waiting or traffic."
    >
      <div className="space-y-4">
        {buckets.length === 0 ? (
          <p className="text-sm text-[#81766c]">No timing records in selected period.</p>
        ) : null}

        <div className="flex flex-wrap gap-3 text-[11px] text-[#6c6258]">
          {legend.map((item) => (
            <div key={item.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        {buckets.length > 0 ? (
          <div className="overflow-x-auto pb-1">
            <svg
              width={width}
              height={chartHeight}
              role="img"
              aria-label="Time usage trend with stacked components by period bucket"
            >
              <rect x={0} y={0} width={width} height={chartHeight} fill="#fff" rx={12} />

              {gridFractions.map((fraction) => {
                const y = top + plotHeight - fraction * plotHeight;
                const value = Math.round(yMax * fraction);
                return (
                  <g key={`grid-${fraction}`}>
                    <line x1={left} x2={width - right} y1={y} y2={y} stroke="#ece4d9" strokeWidth={1} />
                    <text x={left - 6} y={y + 3} fontSize={10} textAnchor="end" fill="#8a7b6c">
                      {hourAxisLabel(value)}
                    </text>
                  </g>
                );
              })}

              {buckets.map((bucket, index) => {
                const xCenter = left + step * index + step / 2;
                const x = xCenter - barWidth / 2;

                const totalClassified =
                  bucket.onSiteMinutes + bucket.betweenStopsMinutes + bucket.breakMinutes + bucket.unclassifiedMinutes;

                const scaleY = (minutes: number) => (minutes / yMax) * plotHeight;
                const onSiteHeight = scaleY(bucket.onSiteMinutes);
                const betweenHeight = scaleY(bucket.betweenStopsMinutes);
                const breakHeight = scaleY(bucket.breakMinutes);
                const unclassifiedHeight = scaleY(bucket.unclassifiedMinutes);

                let cursorY = top + plotHeight;
                cursorY -= onSiteHeight;
                const onSiteY = cursorY;
                cursorY -= betweenHeight;
                const betweenY = cursorY;
                cursorY -= breakHeight;
                const breakY = cursorY;
                cursorY -= unclassifiedHeight;
                const unclassifiedY = cursorY;

                const workingY = top + plotHeight - scaleY(bucket.workingMinutes);

                const title = [
                  bucket.detailLabel,
                  `Working: ${formatDuration(bucket.workingMinutes)}`,
                  `On-site: ${formatDuration(bucket.onSiteMinutes)}`,
                  `Between Stops (derived): ${formatDuration(bucket.betweenStopsMinutes)}`,
                  `Break: ${formatDuration(bucket.breakMinutes)}`,
                  `Unclassified: ${formatDuration(bucket.unclassifiedMinutes)}`,
                  `Classified total: ${formatDuration(totalClassified)}`,
                ].join("\n");

                return (
                  <g key={bucket.key}>
                    <title>{title}</title>

                    <line
                      x1={x + barWidth + 2}
                      x2={x + barWidth + 2}
                      y1={top + plotHeight}
                      y2={workingY}
                      stroke="#b7aa9a"
                      strokeDasharray="2 2"
                    />

                    {unclassifiedHeight > 0 ? <rect x={x} y={unclassifiedY} width={barWidth} height={unclassifiedHeight} fill="#9ca3af" rx={2} /> : null}
                    {breakHeight > 0 ? <rect x={x} y={breakY} width={barWidth} height={breakHeight} fill="#f59e0b" rx={2} /> : null}
                    {betweenHeight > 0 ? <rect x={x} y={betweenY} width={barWidth} height={betweenHeight} fill="#10b981" rx={2} /> : null}
                    {onSiteHeight > 0 ? <rect x={x} y={onSiteY} width={barWidth} height={onSiteHeight} fill="#3b82f6" rx={2} /> : null}

                    <text x={xCenter} y={chartHeight - 20} fontSize={10} textAnchor="middle" fill="#7d7266">
                      {bucket.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : null}

        <p className="text-[11px] text-[#81766c]">
          Between Stops is derived from completion-to-arrival intervals and may include waiting, traffic, route adjustments, or other unclassified time.
        </p>
      </div>
    </SectionCard>
  );
}

export function TimeDistributionChart(props: {
  metrics: DriverPerformanceDetail["metrics"] | DriverPerformanceSnapshot["teamMetrics"];
}) {
  const values = [
    { key: "on_site", label: "On-site", color: "#3b82f6", minutes: Math.max(0, props.metrics.onSiteMinutes) },
    {
      key: "between",
      label: "Between Stops (derived)",
      color: "#10b981",
      minutes: Math.max(0, Number(props.metrics.betweenStopsMinutes || 0)),
    },
    { key: "break", label: "Explicit Break", color: "#f59e0b", minutes: Math.max(0, props.metrics.explicitBreakMinutes) },
    { key: "unclassified", label: "Unclassified", color: "#9ca3af", minutes: Math.max(0, props.metrics.unclassifiedMinutes) },
  ];

  const total = values.reduce((sum, item) => sum + item.minutes, 0);
  const radius = 56;
  const stroke = 18;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <SectionCard
      title="Time Distribution"
      subtitle="Distribution of classified working time for the selected scope."
    >
      {total <= 0 ? (
        <p className="text-sm text-[#81766c]">No classified time data in selected period.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
          <div className="mx-auto h-[150px] w-[150px]">
            <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label="Time distribution donut chart">
              <g transform="translate(75,75) rotate(-90)">
                <circle r={radius} cx={0} cy={0} fill="none" stroke="#efe7dd" strokeWidth={stroke} />
                {values.map((item) => {
                  if (item.minutes <= 0) {
                    return null;
                  }

                  const ratio = item.minutes / total;
                  const dash = ratio * circumference;
                  const segment = (
                    <circle
                      key={item.key}
                      r={radius}
                      cx={0}
                      cy={0}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={stroke}
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-offset}
                      strokeLinecap="butt"
                    />
                  );

                  offset += dash;
                  return segment;
                })}
              </g>
              <text x="75" y="70" textAnchor="middle" fontSize="11" fill="#7b6f63" fontWeight="700">
                Working
              </text>
              <text x="75" y="89" textAnchor="middle" fontSize="16" fill="#2b2621" fontWeight="800">
                {formatDuration(total)}
              </text>
            </svg>
          </div>

          <div className="space-y-2.5">
            {values.map((item) => {
              const ratio = total > 0 ? (item.minutes / total) * 100 : 0;

              return (
                <div key={item.key} className="rounded-xl border border-[#ece2d8] bg-[#fcfaf7] p-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="inline-flex items-center gap-2 font-semibold text-[#3a342d]">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.label}
                    </div>
                    <div className="text-[#655a50]">{ratio.toFixed(1)}%</div>
                  </div>
                  <div className="mt-1.5 text-sm font-semibold text-[#28231e]">{formatDuration(item.minutes)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function StopVolumeChart(props: {
  dayStops: DriverPerformanceDetail["dayStops"] | DriverPerformanceSnapshot["teamDayStops"];
  period: ResolvedPeriod;
}) {
  const rows = buildStopVolumeBuckets(props.dayStops, props.period);
  const maxCompleted = Math.max(1, ...rows.map((row) => row.completed));
  const width = chartCanvasWidth(rows.length);
  const chartHeight = 270;
  const left = 44;
  const right = 20;
  const top = 16;
  const bottom = 56;
  const plotHeight = chartHeight - top - bottom;
  const availableWidth = width - left - right;
  const step = rows.length > 0 ? availableWidth / rows.length : availableWidth;
  const barWidth = Math.max(16, Math.min(30, step * 0.56));

  const gridFractions = [0, 0.25, 0.5, 0.75, 1];

  return (
    <SectionCard title="Stops & Punctuality" subtitle="Completed stop volume with punctuality composition. No dual-axis scaling.">
      {rows.length === 0 ? (
        <p className="text-sm text-[#81766c]">No route stops found in selected period.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-[11px] text-[#6c6258]">
            <div className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#16a34a]" />
              <span>On-time completed</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
              <span>Late completed</span>
            </div>
            <div className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#9ca3af]" />
              <span>Completed (timing unavailable)</span>
            </div>
          </div>

          <div className="overflow-x-auto pb-1">
            <svg width={width} height={chartHeight} role="img" aria-label="Completed stop volume with on-time and late composition by period bucket">
              <rect x={0} y={0} width={width} height={chartHeight} fill="#fff" rx={12} />

              {gridFractions.map((fraction) => {
                const y = top + plotHeight - fraction * plotHeight;
                const value = Math.round(maxCompleted * fraction);
                return (
                  <g key={`grid-${fraction}`}>
                    <line x1={left} x2={width - right} y1={y} y2={y} stroke="#ece4d9" strokeWidth={1} />
                    <text x={left - 6} y={y + 3} fontSize={10} textAnchor="end" fill="#8a7b6c">
                      {value}
                    </text>
                  </g>
                );
              })}

              {rows.map((row, index) => {
                const xCenter = left + step * index + step / 2;
                const x = xCenter - barWidth / 2;
                const onTimeCompleted = Math.min(row.onTimeStops, row.completed);
                const lateCompleted = Math.min(row.lateStops, Math.max(0, row.completed - onTimeCompleted));
                const unmatchedCompleted = Math.max(0, row.completed - onTimeCompleted - lateCompleted);

                const onTimeHeight = (onTimeCompleted / maxCompleted) * plotHeight;
                const lateHeight = (lateCompleted / maxCompleted) * plotHeight;
                const unmatchedHeight = (unmatchedCompleted / maxCompleted) * plotHeight;
                const totalHeight = (row.completed / maxCompleted) * plotHeight;

                let cursorY = top + plotHeight;
                cursorY -= onTimeHeight;
                const onTimeY = cursorY;
                cursorY -= lateHeight;
                const lateY = cursorY;
                cursorY -= unmatchedHeight;
                const unmatchedY = cursorY;

                const title = [
                  row.detailLabel,
                  `Completed: ${row.completed}`,
                  `On-time completed: ${onTimeCompleted}`,
                  `Late completed: ${lateCompleted}`,
                  `Completed (timing unavailable): ${unmatchedCompleted}`,
                  `Deliveries: ${row.deliveries}`,
                  `Pickups: ${row.pickups}`,
                  `Failed: ${row.failed}`,
                  `Cancelled: ${row.cancelled}`,
                ].join("\n");

                return (
                  <g key={row.key}>
                    <title>{title}</title>

                    <rect
                      x={x}
                      y={top + plotHeight - totalHeight}
                      width={barWidth}
                      height={totalHeight}
                      fill="#f1ebe2"
                      rx={2}
                    />

                    <rect
                      x={x}
                      y={unmatchedY}
                      width={barWidth}
                      height={unmatchedHeight}
                      fill="#9ca3af"
                      rx={2}
                    />
                    <rect
                      x={x}
                      y={lateY}
                      width={barWidth}
                      height={lateHeight}
                      fill="#dc2626"
                      rx={2}
                    />
                    <rect
                      x={x}
                      y={onTimeY}
                      width={barWidth}
                      height={onTimeHeight}
                      fill="#16a34a"
                      rx={2}
                    />

                    <text x={xCenter} y={chartHeight - 20} fontSize={10} textAnchor="middle" fill="#7d7266">
                      {row.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-[#6c6258]">
            {rows.slice(-4).map((row) => (
              <div key={`meta-${row.key}`} className="rounded-lg border border-[#eee5d9] bg-[#fbf9f6] px-2 py-1.5">
                <span className="font-semibold text-[#3a342d]">{row.detailLabel}</span>
                <span>
                  {` · Completed ${row.completed} · On-time ${row.onTimeStops} · Late ${row.lateStops} · Del ${row.deliveries} · Pk ${row.pickups}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function PunctualityTrendChart(props: {
  dayStops: DriverPerformanceDetail["dayStops"] | DriverPerformanceSnapshot["teamDayStops"];
  period: ResolvedPeriod;
}) {
  const buckets = buildStopVolumeBuckets(props.dayStops, props.period);
  const width = chartCanvasWidth(buckets.length);
  const chartHeight = 250;
  const left = 44;
  const right = 20;
  const top = 16;
  const bottom = 56;
  const plotHeight = chartHeight - top - bottom;
  const availableWidth = width - left - right;
  const step = buckets.length > 0 ? availableWidth / buckets.length : availableWidth;
  const barWidth = Math.max(14, Math.min(24, step * 0.45));

  return (
    <SectionCard
      title="Punctuality Trend"
      subtitle={`On-Time % uses eligible stops only. Buckets with no eligible stops are shown as no data. Late threshold includes ${DEFAULT_LATE_TOLERANCE_MINUTES} minute tolerance.`}
    >
      {buckets.length === 0 ? (
        <p className="text-sm text-[#81766c]">No punctuality data in selected period.</p>
      ) : (
        <div className="space-y-3">
          <div className="overflow-x-auto pb-1">
            <svg width={width} height={chartHeight} role="img" aria-label="On-time percentage trend from 0 to 100 percent">
              <rect x={0} y={0} width={width} height={chartHeight} fill="#fff" rx={12} />

              {[0, 25, 50, 75, 100].map((value) => {
                const y = top + plotHeight - (value / 100) * plotHeight;
                return (
                  <g key={`grid-${value}`}>
                    <line x1={left} x2={width - right} y1={y} y2={y} stroke="#ece4d9" strokeWidth={1} />
                    <text x={left - 6} y={y + 3} fontSize={10} textAnchor="end" fill="#8a7b6c">
                      {value}%
                    </text>
                  </g>
                );
              })}

              {buckets.map((bucket, index) => {
                const xCenter = left + step * index + step / 2;
                const x = xCenter - barWidth / 2;
                const hasEligible = bucket.punctualityEligibleStops > 0;
                const onTimePercent = hasEligible
                  ? (bucket.onTimeStops / bucket.punctualityEligibleStops) * 100
                  : null;
                const barHeight = hasEligible ? (Number(onTimePercent) / 100) * plotHeight : 0;

                const title = [
                  bucket.detailLabel,
                  hasEligible ? `On-Time: ${formatPercent(onTimePercent)}` : "On-Time: No eligible data",
                  `Eligible stops: ${bucket.punctualityEligibleStops}`,
                  `On-time stops: ${bucket.onTimeStops}`,
                  `Late stops: ${bucket.lateStops}`,
                ].join("\n");

                return (
                  <g key={bucket.key}>
                    <title>{title}</title>
                    <rect x={x} y={top} width={barWidth} height={plotHeight} fill="#f2ece4" rx={2} />
                    {hasEligible ? (
                      <rect
                        x={x}
                        y={top + plotHeight - barHeight}
                        width={barWidth}
                        height={barHeight}
                        fill="#2563eb"
                        rx={2}
                      />
                    ) : (
                      <line
                        x1={x}
                        x2={x + barWidth}
                        y1={top + plotHeight - 2}
                        y2={top + 2}
                        stroke="#9ca3af"
                        strokeWidth={1.5}
                        strokeDasharray="3 2"
                      />
                    )}

                    <text x={xCenter} y={chartHeight - 20} fontSize={10} textAnchor="middle" fill="#7d7266">
                      {bucket.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-[#6c6258]">
            {buckets.slice(-4).map((bucket) => {
              const hasEligible = bucket.punctualityEligibleStops > 0;
              const onTimePercent = hasEligible
                ? (bucket.onTimeStops / bucket.punctualityEligibleStops) * 100
                : null;

              return (
                <div key={`pt-${bucket.key}`} className="rounded-lg border border-[#eee5d9] bg-[#fbf9f6] px-2 py-1.5">
                  <span className="font-semibold text-[#3a342d]">{bucket.detailLabel}</span>
                  <span>
                    {hasEligible
                      ? ` · ${formatPercent(onTimePercent)} (${bucket.onTimeStops}/${bucket.punctualityEligibleStops})`
                      : " · No eligible data"}
                  </span>
                </div>
              );
            })}
          </div>
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
  const labelForType = (type: DriverPerformanceDetail["exceptions"][number]["type"]) => {
    if (type === "late_stop") return "Late stop";
    if (type === "very_long_on_site") return "Very long on-site";
    if (type === "incomplete_route") return "Incomplete route";
    if (type === "stale_open_shift") return "Stale open shift";
    if (type === "missing_required_delivery_proof") return "Missing delivery proof";
    if (type === "invalid_arrival_completion_pair") return "Invalid timing pair";
    return String(type).replace(/_/g, " ");
  };

  const severityTone = (severity: DriverPerformanceDetail["exceptions"][number]["severity"]) => {
    if (severity === "critical") {
      return "border-red-200 bg-red-50/70";
    }

    if (severity === "warning") {
      return "border-amber-200 bg-amber-50/70";
    }

    return "border-[#e9dfd3] bg-[#fcfaf7]";
  };

  const severityBadge = (item: DriverPerformanceDetail["exceptions"][number]) => {
    if (item.type === "late_stop") {
      return item.lateMinutes != null
        ? `LATE +${Math.max(0, Math.round(item.lateMinutes))} min`
        : "LATE";
    }

    if (item.type === "very_long_on_site") {
      return item.onSiteMinutes != null
        ? `ON-SITE ${formatDuration(item.onSiteMinutes)}`
        : "LONG ON-SITE";
    }

    if (item.type === "incomplete_route") return "UNFINISHED";
    if (item.type === "stale_open_shift") return "STALE SHIFT";
    if (item.type === "missing_required_delivery_proof") return "MISSING PROOF";
    if (item.type === "invalid_arrival_completion_pair") return "TIMING REVIEW";
    return "REVIEW";
  };

  const badgeTone = (item: DriverPerformanceDetail["exceptions"][number]) => {
    if (item.severity === "critical") {
      return "bg-red-100 text-red-800";
    }

    if (item.severity === "warning") {
      return "bg-amber-100 text-amber-900";
    }

    return "bg-[#ece5dc] text-[#5f554b]";
  };

  return (
    <SectionCard title="Needs Attention" subtitle="Operational exceptions with context. No employee scoring or fault attribution.">
      {props.items.length === 0 ? (
        <p className="text-sm text-[#81766c]">No exceptions found for this period.</p>
      ) : (
        <div className="space-y-2.5">
          {props.items.slice(0, 60).map((item) => (
            <article
              key={item.id}
              className={[
                "rounded-2xl border p-3 sm:p-3.5",
                severityTone(item.severity),
              ].join(" ")}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={["rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]", badgeTone(item)].join(" ")}>
                      {severityBadge(item)}
                    </span>
                    <span className="text-sm font-semibold text-[#2f2924]">{labelForType(item.type)}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-[#6a5f54]">
                    {formatDateTimeLabel(item.dateTime)} · {item.driverName}
                    {item.stopType ? ` · ${String(item.stopType).replace(/_/g, " ")}` : ""}
                    {item.customerName ? ` · ${item.customerName}` : ""}
                  </div>
                </div>

                {item.href ? (
                  <Link
                    href={item.href}
                    className="rounded-full border border-[#d9cfc2] bg-white px-3 py-1.5 text-xs font-semibold text-[#2f6bb3]"
                  >
                    Inspect record
                  </Link>
                ) : null}
              </div>

              <p className="mt-2 text-sm text-[#3a342d]">{item.description}</p>

              <div className="mt-2 grid gap-1 text-[11px] text-[#6f6459] sm:grid-cols-2 lg:grid-cols-4">
                <div>Booking: {item.bookingId || "—"}</div>
                <div>Scheduled: {item.scheduledStartTime || "—"}{item.scheduledEndTime ? ` - ${item.scheduledEndTime}` : ""}</div>
                <div>Arrived: {item.arrivedAt ? formatDateTimeLabel(item.arrivedAt) : "—"}</div>
                <div>Completed: {item.completedAt ? formatDateTimeLabel(item.completedAt) : "—"}</div>
              </div>

              <div className="mt-1.5 text-[10px] text-[#8a7c6f]">
                Reference: {item.reference}
              </div>
            </article>
          ))}
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
      <div className="space-y-2 md:hidden">
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
            <article key={`mobile-${row.driver.driverKey}`} className="rounded-2xl border border-[#e9dfd3] bg-[#fcfaf7] p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`${props.detailBasePath}/${encodeURIComponent(row.driver.driverKey)}?${query}`} className="text-sm font-semibold text-[#2f6bb3] underline">
                    {row.driver.name}
                  </Link>
                  <div className="mt-1 text-xs text-[#6f6459]">
                    Working {formatDuration(row.metrics.workingMinutes)} · Completed {row.metrics.completedStops}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#2f2924]">{formatPercent(row.metrics.onTimePercent)}</div>
                  {props.comparison ? <div className={`text-[10px] ${deltaTone(onTimeDelta)}`}>{onTimeDelta}</div> : null}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#6a5f54]">
                <div>Del {row.metrics.deliveries}</div>
                <div>Pk {row.metrics.pickups}</div>
                <div>Avg on-site {formatDuration(row.metrics.averageOnSiteMinutes)}</div>
                <div>Exceptions {row.metrics.exceptions}</div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
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
      <div className="space-y-2 md:hidden">
        {props.rows.map((row) => {
          const stop = stopByDate.get(row.date);
          const onTime = stop && stop.punctualityEligibleStops > 0
            ? (stop.onTimeStops / stop.punctualityEligibleStops) * 100
            : null;
          const selected = row.date === props.activeDay;

          return (
            <article
              key={`mobile-${row.date}`}
              className={[
                "rounded-2xl border p-3",
                selected ? "border-[#b8d2ef] bg-[#f4f7fb]" : "border-[#e9dfd3] bg-[#fcfaf7]",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <Link href={props.dayHref(row.date)} className="text-sm font-semibold text-[#2f6bb3] underline">
                  {toBusinessDateLabel(row.date)}
                </Link>
                <div className="text-xs text-[#6d6258]">{selected ? "Selected" : ""}</div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-[#665b50]">
                <div>Working {formatDuration(row.workingMinutes)}</div>
                <div>On-site {formatDuration(row.onSiteMinutes)}</div>
                <div>Between {formatDuration(row.betweenStopsMinutes)}</div>
                <div>Break {formatDuration(row.breakMinutes)}</div>
                <div>Completed {stop?.completed ?? 0}</div>
                <div>On-time {formatPercent(onTime)}</div>
                <div>Late {stop?.lateStops ?? 0}</div>
                <div>Exceptions {stop?.exceptions ?? 0}</div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto md:block">
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

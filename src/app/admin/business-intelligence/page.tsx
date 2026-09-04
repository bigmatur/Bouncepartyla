import Link from "next/link";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { loadBusinessMarketing, loadBusinessOverview } from "@/lib/analytics/business/loader";

type PageProps = {
  searchParams?: {
    tab?: string;
    range?: string;
    from?: string;
    to?: string;
  };
};

type MetricTone = "plain" | "gold" | "green" | "blue" | "red";

type BiTabKey =
  | "overview"
  | "sales"
  | "marketing"
  | "products"
  | "customers"
  | "operations"
  | "ai-insights";

const BI_TABS: Array<{
  key: BiTabKey;
  label: string;
  enabled: boolean;
}> = [
  { key: "overview", label: "Overview", enabled: true },
  { key: "sales", label: "Sales", enabled: true },
  { key: "marketing", label: "Marketing", enabled: true },
  { key: "products", label: "Products", enabled: true },
  { key: "customers", label: "Customers", enabled: true },
  { key: "operations", label: "Operations", enabled: false },
  { key: "ai-insights", label: "AI Insights", enabled: false },
];

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function resolveRange(searchParams: PageProps["searchParams"]) {
  const now = new Date();
  const requestedRange = String(searchParams?.range || "month");

  if (requestedRange === "custom") {
    const customFrom = parseDateInput(searchParams?.from);
    const customTo = parseDateInput(searchParams?.to);

    if (customFrom && customTo && customFrom <= customTo) {
      return {
        key: "custom",
        from: toDateInput(customFrom),
        to: toDateInput(customTo),
      };
    }
  }

  if (requestedRange === "today") {
    const today = toDateInput(now);

    return {
      key: "today",
      from: today,
      to: today,
    };
  }

  if (requestedRange === "week") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);

    return {
      key: "week",
      from: toDateInput(from),
      to: toDateInput(now),
    };
  }

  if (requestedRange === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);

    return {
      key: "30d",
      from: toDateInput(from),
      to: toDateInput(now),
    };
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    key: "month",
    from: toDateInput(monthStart),
    to: toDateInput(now),
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function longDate(value: string) {
  const date = new Date(`${value}T12:00:00`);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function deltaLabel(value: number | null, digits = 1) {
  if (value === null) {
    return "No comparable baseline";
  }

  if (Math.abs(value) < 0.05) {
    return "No change vs previous period";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}% vs previous period`;
}

function deltaClass(value: number | null) {
  if (value === null) {
    return "text-[#81766c]";
  }

  if (value > 0) {
    return "text-emerald-700";
  }

  if (value < 0) {
    return "text-red-700";
  }

  return "text-[#81766c]";
}

function comparisonLabel(params: {
  currentValue: number;
  previousValue: number;
  deltaPct: number | null;
}) {
  if (params.previousValue === 0) {
    if (params.currentValue === 0) {
      return "No change vs previous period";
    }

    return "No comparable baseline";
  }

  return deltaLabel(params.deltaPct);
}

function comparisonClass(params: {
  currentValue: number;
  previousValue: number;
  deltaPct: number | null;
}) {
  if (params.previousValue === 0) {
    return "text-[#81766c]";
  }

  return deltaClass(params.deltaPct);
}

function pointsDeltaLabel(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} pts vs previous period`;
}

function metricDelta(currentValue: number, previousValue: number) {
  if (previousValue === 0) {
    if (currentValue === 0) {
      return 0;
    }

    return null;
  }

  return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
}

function percent(value: number, digits = 1) {
  return `${value.toFixed(digits)}%`;
}

function utilizationTone(statusKind: string) {
  if (statusKind === "high_pressure") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (statusKind === "review") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (statusKind === "low_utilization") {
    return "bg-slate-100 text-slate-700 ring-slate-200";
  }

  if (statusKind === "unsupported") {
    return "bg-[#f3efe9] text-[#7b6f63] ring-[#e3d7ca]";
  }

  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

function Metric({
  label,
  value,
  note,
  noteClassName,
  tone = "plain",
}: {
  label: string;
  value: string | number;
  note?: string;
  noteClassName?: string;
  tone?: MetricTone;
}) {
  const tones: Record<MetricTone, string> = {
    plain: "border-[#eadfd1] bg-white",
    gold: "border-[#ead2ae] bg-[#fffaf1]",
    green: "border-[#cfe2d0] bg-[#f4faf4]",
    blue: "border-[#cedce5] bg-[#f5f9fc]",
    red: "border-[#ead0cd] bg-[#fff7f6]",
  };

  return (
    <div
      className={`min-w-0 rounded-[18px] border p-4 shadow-[0_6px_20px_rgba(45,36,25,.035)] sm:rounded-[22px] sm:p-5 ${tones[tone]}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#81766c] sm:text-[11px]">
        {label}
      </div>

      <div className="mt-2 truncate text-xl font-bold tracking-tight text-[#28231f] sm:text-2xl">
        {value}
      </div>

      {note ? (
        <div className={`mt-1.5 text-xs font-medium ${noteClassName || "text-[#81766c]"}`}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

const RANGE_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "week", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
] as const;

function DriverRows({
  rows,
  money,
}: {
  rows: Array<{
    key: string;
    label: string;
    currentRevenue: number;
    currentBookings: number;
    deltaPct: number | null;
  }>;
  money: (value: number) => string;
}) {
  const maxRevenue = Math.max(1, ...rows.map((row) => row.currentRevenue));

  if (rows.length === 0) {
    return (
      <div className="rounded-xl bg-[#faf7f3] px-4 py-7 text-center text-sm font-medium text-[#81766c]">
        No data in selected period.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const width = Math.max(5, (row.currentRevenue / maxRevenue) * 100);

        return (
          <div key={row.key} className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-bold text-[#342e29] sm:text-sm">
                  {row.label}
                </div>

                <div className="mt-0.5 text-[10px] font-medium text-[#81766c]">
                  {row.currentBookings.toLocaleString("en-US")} bookings
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-xs font-bold text-[#28231f] sm:text-sm">
                  {money(row.currentRevenue)}
                </div>

                <div className={`text-[10px] font-semibold ${deltaClass(row.deltaPct)}`}>
                  {deltaLabel(row.deltaPct)}
                </div>
              </div>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eee7df]">
              <div className="h-full rounded-full bg-[#b88645]" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function BusinessIntelligencePage({
  searchParams,
}: PageProps) {
  const { supabase } = await requireAdminPermission("dashboard.view");

  const period = resolveRange(searchParams);
  const selectedTab = String(searchParams?.tab || "overview") as BiTabKey;
  const activeTab = BI_TABS.some((tab) => tab.key === selectedTab)
    ? selectedTab
    : "overview";

  const [snapshot, marketingSnapshot] = await Promise.all([
    loadBusinessOverview(supabase, {
      from: period.from,
      to: period.to,
    }),
    activeTab === "marketing"
      ? loadBusinessMarketing(supabase, { from: period.from, to: period.to })
      : Promise.resolve(null),
  ]);

  const metrics = snapshot.metrics;
  const comparison = snapshot.comparison;
  const cashFlow = snapshot.cashFlow;
  const trendComparison = snapshot.trendComparison;
  const signals = snapshot.signals;
  const productSnapshot = snapshot.products;
  const salesSnapshot = snapshot.salesInsights;
  const customerSnapshot = snapshot.customerInsights;

  const future30 = salesSnapshot.futureBookedRevenue.horizons.find((row: any) => row.days === 30) || {
    days: 30,
    bookingCount: 0,
    revenue: 0,
    averageBookingValue: 0,
  };

  const future60 = salesSnapshot.futureBookedRevenue.horizons.find((row: any) => row.days === 60) || {
    days: 60,
    bookingCount: 0,
    revenue: 0,
    averageBookingValue: 0,
  };

  const future90 = salesSnapshot.futureBookedRevenue.horizons.find((row: any) => row.days === 90) || {
    days: 90,
    bookingCount: 0,
    revenue: 0,
    averageBookingValue: 0,
  };

  const salesTrend = salesSnapshot.trend;
  const maxSalesTrendRevenue = Math.max(
    1,
    ...salesTrend.map((row: any) => Math.max(row.currentRevenue, row.previousRevenue)),
  );

  const activeSalesTrendRows = salesTrend.filter(
    (row: any) => row.currentRevenue > 0 || row.previousRevenue > 0 || row.currentBookings > 0 || row.previousBookings > 0,
  );

  const maxTrendRevenue = Math.max(
    1,
    ...trendComparison.map((row: any) => Math.max(row.currentRevenue, row.previousRevenue)),
  );

  const customerTopRows = customerSnapshot.topCustomers.slice(0, 10);
  const customerGeographyRows = customerSnapshot.geography.slice(0, 10);
  const customerLeadRows = customerSnapshot.leadSources.rows.slice(0, 10);
  const showLeadSourceSection =
    customerSnapshot.leadSources.coverage.adequate && customerLeadRows.length > 0;
  const unidentifiedRevenue = Math.max(
    0,
    customerSnapshot.identity.totalRevenue - customerSnapshot.identity.linkedRevenue,
  );
  const eventFirstDeltaPct = metricDelta(
    customerSnapshot.eventMix.current.firstEventCustomers,
    customerSnapshot.eventMix.previous.firstEventCustomers,
  );
  const eventReturningDeltaPct = metricDelta(
    customerSnapshot.eventMix.current.returningCustomers,
    customerSnapshot.eventMix.previous.returningCustomers,
  );
  const acquisitionNewDeltaPct = metricDelta(
    customerSnapshot.acquisition.current.newCustomers,
    customerSnapshot.acquisition.previous.newCustomers,
  );
  const customerAverageBookingValue =
    customerSnapshot.identity.linkedBookings > 0
      ? customerSnapshot.identity.linkedRevenue / customerSnapshot.identity.linkedBookings
      : null;

  return (
    <main className="min-w-0 space-y-4 pb-10 sm:space-y-5">
      <section className="overflow-hidden rounded-[22px] border border-[#e5d9cb] bg-white shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[28px]">
        <div className="border-b border-[#efe6dc] bg-[#f9f5ef] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a27742] sm:text-[11px]">
                Business Intelligence
              </div>

              <h1 className="mt-1 text-xl font-bold tracking-tight text-[#28231f] sm:text-2xl">
                Management intelligence
              </h1>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#81766c] sm:text-sm">
                Trend, comparison, and revenue-driver analysis built from
                bookings and payments already stored in Bounce Party LA.
              </p>
            </div>

            <div className="shrink-0 rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-[#6f655c] ring-1 ring-[#e6dbce]">
              {longDate(period.from)} — {longDate(period.to)}
              <div className="mt-1 text-[10px] text-[#8a7f75]">
                Previous: {longDate(snapshot.previousRange.from)} — {longDate(snapshot.previousRange.to)}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 sm:px-6 sm:py-5">
          <nav className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {BI_TABS.map((tab) => {
              const isActive = tab.key === activeTab;

              return tab.enabled ? (
                <Link
                  key={tab.key}
                  href={`/admin/business-intelligence?tab=${tab.key}&range=${period.key}&from=${period.from}&to=${period.to}`}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                    isActive
                      ? "bg-[#243342] text-white"
                      : "bg-[#f5f0e9] text-[#5f554c] hover:bg-[#eee6dc]"
                  }`}
                >
                  {tab.label}
                </Link>
              ) : (
                <span
                  key={tab.key}
                  className="shrink-0 rounded-full bg-[#f2ede6] px-4 py-2 text-xs font-bold text-[#9c8f82]"
                >
                  {tab.label}
                </span>
              );
            })}
          </nav>

          <nav className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {RANGE_OPTIONS.map((option) => (
              <Link
                key={option.key}
                href={`/admin/business-intelligence?tab=${activeTab}&range=${option.key}`}
                className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${
                  period.key === option.key
                    ? "bg-[#c9964f] text-white"
                    : "bg-[#f5f0e9] text-[#5f554c] hover:bg-[#eee6dc]"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </nav>

          <form
            method="get"
            className="grid min-w-0 grid-cols-1 gap-2 rounded-[18px] border border-[#e2d6c8] bg-[#f7f1ea] p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-3 sm:p-3"
          >
            <input type="hidden" name="tab" value={activeTab} />
            <input type="hidden" name="range" value="custom" />

            <div className="min-w-0">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7c685d]">
                From
              </div>

              <input
                type="date"
                name="from"
                defaultValue={period.from}
                className="h-11 w-full min-w-0 rounded-xl border border-[#d8c9b8] bg-white px-3 text-sm font-medium text-[#2d2a28] outline-none transition focus:border-[#c9964f]"
              />
            </div>

            <div className="min-w-0">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7c685d]">
                To
              </div>

              <input
                type="date"
                name="to"
                defaultValue={period.to}
                className="h-11 w-full min-w-0 rounded-xl border border-[#d8c9b8] bg-white px-3 text-sm font-medium text-[#2d2a28] outline-none transition focus:border-[#c9964f]"
              />
            </div>

            <button className="h-11 rounded-xl bg-[#243342] px-5 text-sm font-bold text-white transition hover:bg-[#1d2a36]">
              Apply dates
            </button>
          </form>
        </div>
      </section>

      {activeTab !== "overview" && activeTab !== "products" && activeTab !== "sales" && activeTab !== "customers" && activeTab !== "marketing" ? (
        <section className="rounded-[22px] border border-dashed border-[#d9c9b7] bg-[#faf7f3] p-5 sm:rounded-[26px] sm:p-6">
          <div className="text-sm font-bold text-[#3c342e]">
            {BI_TABS.find((tab) => tab.key === activeTab)?.label} module is planned next
          </div>

          <p className="mt-1 text-xs leading-5 text-[#81766c]">
            Phase 1 implements Overview only. The current tab scaffold is ready for independent Sales, Marketing,
            Products, Customers, Operations, and AI Insights modules.
          </p>
        </section>
      ) : null}

      {activeTab === "overview" ? (
        <>
      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <Metric
          label="Revenue"
          value={money(comparison.current.bookedRevenue)}
          note={comparisonLabel({
            currentValue: comparison.current.bookedRevenue,
            previousValue: comparison.previous.bookedRevenue,
            deltaPct: comparison.delta.bookedRevenuePct,
          })}
          noteClassName={comparisonClass({
            currentValue: comparison.current.bookedRevenue,
            previousValue: comparison.previous.bookedRevenue,
            deltaPct: comparison.delta.bookedRevenuePct,
          })}
          tone="gold"
        />

        <Metric
          label="Bookings"
          value={comparison.current.bookingCount.toLocaleString("en-US")}
          note={comparisonLabel({
            currentValue: comparison.current.bookingCount,
            previousValue: comparison.previous.bookingCount,
            deltaPct: comparison.delta.bookingCountPct,
          })}
          noteClassName={comparisonClass({
            currentValue: comparison.current.bookingCount,
            previousValue: comparison.previous.bookingCount,
            deltaPct: comparison.delta.bookingCountPct,
          })}
          tone="green"
        />

        <Metric
          label="Average Booking"
          value={money(comparison.current.averageBookingValue)}
          note={comparisonLabel({
            currentValue: comparison.current.averageBookingValue,
            previousValue: comparison.previous.averageBookingValue,
            deltaPct: comparison.delta.averageBookingValuePct,
          })}
          noteClassName={comparisonClass({
            currentValue: comparison.current.averageBookingValue,
            previousValue: comparison.previous.averageBookingValue,
            deltaPct: comparison.delta.averageBookingValuePct,
          })}
          tone="blue"
        />
      </section>

      <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">
          Executive signals
        </div>

        <h2 className="mt-1 text-lg font-bold text-[#28231f]">
          What changed and where to focus
        </h2>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {signals.map((signal: any) => {
            const severityClass =
              signal.severity === "positive"
                ? "border-emerald-200 bg-emerald-50"
                : signal.severity === "critical"
                  ? "border-red-200 bg-red-50"
                  : signal.severity === "warning"
                    ? "border-amber-200 bg-amber-50"
                    : "border-[#eee5dc] bg-[#fcfaf7]";

            return (
              <div key={signal.id} className={`rounded-xl border px-3 py-3 ${severityClass}`}>
                <div className="text-xs font-bold text-[#2d2a28]">{signal.title}</div>
                <div className="mt-1 text-[11px] leading-5 text-[#6f655c]">{signal.explanation}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0 rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">
                Sales
              </div>

              <h2 className="mt-1 text-lg font-bold text-[#28231f]">
                Revenue trend
              </h2>

              <p className="mt-1 text-xs leading-5 text-[#81766c]">
                Booked revenue by event date. Current period is compared to the immediately preceding equivalent period.
              </p>
            </div>

            <div className="shrink-0 rounded-xl bg-[#f7f1ea] px-3 py-2 text-right">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#81766c]">
                Current period
              </div>

              <div className="mt-0.5 text-sm font-bold text-[#28231f]">
                {trendComparison
                  .reduce((sum: number, row: any) => sum + row.currentBookings, 0)
                  .toLocaleString("en-US")}{" "}
                bookings
              </div>
            </div>
          </div>

          {trendComparison.length > 0 ? (
            <div className="mt-5 min-w-0">
              <div
                className="grid h-[190px] min-w-0 items-end gap-[2px] sm:gap-1"
                style={{
                  gridTemplateColumns: `repeat(${trendComparison.length}, minmax(0, 1fr))`,
                }}
              >
                {trendComparison.map((row: any, index: number) => {
                  const currentHeight = row.currentRevenue > 0
                    ? Math.max(8, (row.currentRevenue / maxTrendRevenue) * 125)
                    : 3;

                  const previousHeight = row.previousRevenue > 0
                    ? Math.max(8, (row.previousRevenue / maxTrendRevenue) * 125)
                    : 3;

                  const showDate =
                    index === 0 ||
                    index === trendComparison.length - 1 ||
                    trendComparison.length <= 12 ||
                    index % Math.ceil(trendComparison.length / 6) === 0;

                  return (
                    <div
                      key={`${row.label}-${index}`}
                      className="flex min-w-0 flex-col items-center justify-end"
                      title={`${row.label} | Current period: ${money(row.currentRevenue)} (${row.currentBookings.toLocaleString("en-US")} bookings) | Previous period: ${money(row.previousRevenue)} (${row.previousBookings.toLocaleString("en-US")} bookings)`}
                    >
                      <div className="mb-1 h-4 w-full min-w-0 truncate text-center text-[8px] font-bold leading-4 text-[#6f655c]">
                        {trendComparison.length <= 14 ? money(row.currentRevenue) : ""}
                      </div>

                      <div className="flex w-full max-w-[26px] items-end gap-[2px]">
                        <div
                          className="w-1/2 rounded-t-md bg-[#8aa2b8]"
                          style={{ height: `${previousHeight}px` }}
                        />

                        <div
                          className="w-1/2 rounded-t-md bg-[#c9964f]"
                          style={{ height: `${currentHeight}px` }}
                        />
                      </div>

                      <div className="mt-2 h-4 w-full min-w-0 text-center text-[8px] font-semibold leading-4 text-[#81766c]">
                        {showDate ? row.label : ""}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-[10px] font-semibold text-[#7e7368]">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-[#c9964f]" /> Current period</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-[#8aa2b8]" /> Previous period</span>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl bg-[#faf7f3] px-4 py-8 text-center text-sm font-medium text-[#81766c]">
              No booked revenue in this period.
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">
            Cash flow context
          </div>

          <h2 className="mt-1 text-lg font-bold text-[#28231f]">
            Collection intelligence
          </h2>

          <p className="mt-1 text-xs leading-5 text-[#81766c]">
            Cash metrics use payment date and are shown as context, not as booked-sales trend.
          </p>

          <div className="mt-4 space-y-2.5">
            <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Collected cash</div>
              <div className="mt-1 text-base font-bold text-[#2d2a28]">{money(cashFlow.currentCollected)}</div>
              <div className={`mt-0.5 text-[11px] font-semibold ${deltaClass(cashFlow.collectedDeltaPct)}`}>
                {deltaLabel(cashFlow.collectedDeltaPct)}
              </div>
            </div>

            <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Collection rate</div>
              <div className="mt-1 text-base font-bold text-[#2d2a28]">{metrics.bookingCollectionRate.toFixed(1)}%</div>
              <div className={`mt-0.5 text-[11px] font-semibold ${cashFlow.collectionRateDeltaPoints >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {pointsDeltaLabel(cashFlow.collectionRateDeltaPoints)}
              </div>
            </div>

            <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5 text-[11px] leading-5 text-[#6f655c]">
              Outstanding for revenue bookings: <span className="font-bold text-[#2d2a28]">{money(metrics.bookingOutstanding)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:gap-5 xl:grid-cols-3">
        <div className="min-w-0 rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">
            Revenue drivers
          </div>

          <h2 className="mt-1 text-lg font-bold text-[#28231f]">
            Products
          </h2>

          <p className="mt-1 text-xs leading-5 text-[#81766c]">
            Top current-period revenue contributors with previous-period deltas.
          </p>

          <div className="mt-4">
            <DriverRows rows={snapshot.drivers.productDrivers.slice(0, 6)} money={money} />
          </div>
        </div>

        <div className="min-w-0 rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">
            Revenue drivers
          </div>

          <h2 className="mt-1 text-lg font-bold text-[#28231f]">
            Geography (city)
          </h2>

          <p className="mt-1 text-xs leading-5 text-[#81766c]">
            City-level revenue concentration and movement vs previous period.
          </p>

          <div className="mt-4">
            <DriverRows rows={snapshot.drivers.geographyDrivers.slice(0, 6)} money={money} />
          </div>
        </div>

        <div className="min-w-0 rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">
            Revenue drivers
          </div>

          <h2 className="mt-1 text-lg font-bold text-[#28231f]">
            Booking creation channel
          </h2>

          <p className="mt-1 text-xs leading-5 text-[#81766c]">
            Operational channel only, not marketing attribution.
          </p>

          <div className="mt-4">
            <DriverRows rows={snapshot.drivers.sourceDrivers.slice(0, 6)} money={money} />
          </div>
        </div>
      </section>

      <section className="rounded-[22px] border border-dashed border-[#d9c9b7] bg-[#faf7f3] p-4 sm:rounded-[26px] sm:p-5">
        <div className="text-sm font-bold text-[#3c342e]">
          Phase 1 constraints
        </div>

        <p className="mt-1 text-xs leading-5 text-[#81766c]">
          Booked-sales analysis uses booking event dates and excludes archived/cancelled/refunded statuses. Cash-flow
          context uses payment date. Stored totals from bookings and payments are used as source of truth without
          recalculating pricing or tax logic.
        </p>

        <div className="mt-3 grid gap-2 text-[11px] font-medium text-[#5f554c] sm:grid-cols-3">
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-[#eee5db]">Discount change: <span className={deltaClass(comparison.delta.discountsPct)}>{deltaLabel(comparison.delta.discountsPct)}</span></div>
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-[#eee5db]">Delivery revenue change: <span className={deltaClass(comparison.delta.deliveryRevenuePct)}>{deltaLabel(comparison.delta.deliveryRevenuePct)}</span></div>
          <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-[#eee5db]">Successful payments: <span className="font-bold text-[#2d2a28]">{metrics.paymentCount.toLocaleString("en-US")}</span></div>
        </div>
      </section>
        </>
      ) : null}

      {activeTab === "marketing" && marketingSnapshot ? (
        <>
          <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Marketing Intelligence</div>
                <h2 className="mt-1 text-lg font-bold text-[#28231f]">Meta Ads performance + internal lead outcomes</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-[#81766c]">
                  Meta advertising metrics and CRM lead outcomes use the same selected calendar period, but revenue is not attributed to campaigns until a reliable campaign/ad identifier is captured with each lead or booking.
                </p>
              </div>
              <Link
                href="/admin/settings/integrations?provider=meta"
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-[#d8c9b8] bg-[#faf7f3] px-3 text-xs font-bold text-[#4b4037] transition hover:bg-white"
              >
                Meta integration
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-[#6f655c]">
              <span className="rounded-full bg-[#f7f2eb] px-3 py-1.5 ring-1 ring-[#eadfd1]">
                Meta source: {marketingSnapshot.metaAds.connection.source}
              </span>
              {marketingSnapshot.metaAds.connection.adAccountId ? (
                <span className="rounded-full bg-[#f7f2eb] px-3 py-1.5 ring-1 ring-[#eadfd1]">
                  {marketingSnapshot.metaAds.connection.adAccountId}
                </span>
              ) : null}
              <span className="rounded-full bg-[#f7f2eb] px-3 py-1.5 ring-1 ring-[#eadfd1]">
                {marketingSnapshot.metaAds.connection.graphVersion}
              </span>
            </div>

            {marketingSnapshot.metaAds.connection.error ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                <span className="font-bold">Meta Ads data unavailable:</span> {marketingSnapshot.metaAds.connection.error}
                <div className="mt-1 text-[11px]">Internal Lead Source reporting below remains available and is not blocked by Meta API status.</div>
              </div>
            ) : null}
          </section>

          {marketingSnapshot.metaAds.current && marketingSnapshot.comparisons ? (
            <>
              <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6 sm:gap-3">
                <Metric
                  label="Meta Spend"
                  value={money(marketingSnapshot.metaAds.current.spend)}
                  note={comparisonLabel({
                    currentValue: marketingSnapshot.comparisons.spend.current,
                    previousValue: marketingSnapshot.comparisons.spend.previous,
                    deltaPct: marketingSnapshot.comparisons.spend.deltaPct,
                  })}
                  noteClassName={comparisonClass({
                    currentValue: marketingSnapshot.comparisons.spend.current,
                    previousValue: marketingSnapshot.comparisons.spend.previous,
                    deltaPct: marketingSnapshot.comparisons.spend.deltaPct,
                  })}
                  tone="gold"
                />
                <Metric
                  label="Messages Started"
                  value={marketingSnapshot.metaAds.current.messagingConversations.toLocaleString("en-US")}
                  note={comparisonLabel({
                    currentValue: marketingSnapshot.comparisons.messagingConversations.current,
                    previousValue: marketingSnapshot.comparisons.messagingConversations.previous,
                    deltaPct: marketingSnapshot.comparisons.messagingConversations.deltaPct,
                  })}
                  noteClassName={comparisonClass({
                    currentValue: marketingSnapshot.comparisons.messagingConversations.current,
                    previousValue: marketingSnapshot.comparisons.messagingConversations.previous,
                    deltaPct: marketingSnapshot.comparisons.messagingConversations.deltaPct,
                  })}
                  tone="green"
                />
                <Metric
                  label="Cost / Message"
                  value={
                    marketingSnapshot.metaAds.current.costPerMessagingConversation === null
                      ? "—"
                      : money(marketingSnapshot.metaAds.current.costPerMessagingConversation)
                  }
                  note="Meta messaging conversations"
                  tone="blue"
                />
                <Metric
                  label="Clicks"
                  value={marketingSnapshot.metaAds.current.clicks.toLocaleString("en-US")}
                  note={`${percent(marketingSnapshot.metaAds.current.ctr, 2)} CTR`}
                />
                <Metric
                  label="CPC"
                  value={marketingSnapshot.metaAds.current.cpc === null ? "—" : money(marketingSnapshot.metaAds.current.cpc)}
                  note={`${marketingSnapshot.metaAds.current.impressions.toLocaleString("en-US")} impressions`}
                />
                <Metric
                  label="Meta Leads"
                  value={marketingSnapshot.metaAds.current.leads.toLocaleString("en-US")}
                  note={
                    marketingSnapshot.metaAds.current.cpl === null
                      ? "Lead Forms / website lead actions"
                      : `${money(marketingSnapshot.metaAds.current.cpl)} CPL`
                  }
                />
              </section>

              <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.25fr_.75fr]">
                <div className="min-w-0 rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Campaign performance</div>
                  <h2 className="mt-1 text-lg font-bold text-[#28231f]">Meta campaigns</h2>
                  <p className="mt-1 text-xs leading-5 text-[#81766c]">Spend and Meta-reported outcomes only. Internal booked revenue is intentionally not assigned to campaigns yet.</p>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-[0.1em] text-[#8b8177]">
                        <tr>
                          <th className="pb-2 pr-3">Campaign</th>
                          <th className="pb-2 pr-3 text-right">Spend</th>
                          <th className="pb-2 pr-3 text-right">Messages</th>
                          <th className="pb-2 pr-3 text-right">Cost / Msg</th>
                          <th className="pb-2 pr-3 text-right">Leads</th>
                          <th className="pb-2 pr-3 text-right">Clicks</th>
                          <th className="pb-2 text-right">CTR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marketingSnapshot.metaAds.campaigns.slice(0, 12).map((row: any) => (
                          <tr key={row.campaignId} className="border-t border-[#eee5dc]">
                            <td className="max-w-[300px] py-2.5 pr-3 font-semibold text-[#342e29]"><div className="truncate">{row.campaignName}</div></td>
                            <td className="py-2.5 pr-3 text-right font-semibold text-[#2d2a28]">{money(row.spend)}</td>
                            <td className="py-2.5 pr-3 text-right text-[#6f655c]">{row.messagingConversations.toLocaleString("en-US")}</td>
                            <td className="py-2.5 pr-3 text-right text-[#6f655c]">{row.costPerMessagingConversation === null ? "—" : money(row.costPerMessagingConversation)}</td>
                            <td className="py-2.5 pr-3 text-right text-[#6f655c]">{row.leads.toLocaleString("en-US")}</td>
                            <td className="py-2.5 pr-3 text-right text-[#6f655c]">{row.clicks.toLocaleString("en-US")}</td>
                            <td className="py-2.5 text-right text-[#6f655c]">{percent(row.ctr, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {marketingSnapshot.metaAds.campaigns.length === 0 ? (
                    <div className="mt-3 rounded-xl bg-[#faf7f3] px-4 py-5 text-center text-xs font-medium text-[#81766c]">No Meta campaign delivery in selected period.</div>
                  ) : null}
                </div>

                <div className="min-w-0 rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Daily efficiency</div>
                  <h2 className="mt-1 text-lg font-bold text-[#28231f]">Spend and messages</h2>
                  <div className="mt-4 space-y-2">
                    {marketingSnapshot.metaAds.daily.filter((row: any) => row.spend > 0 || row.messagingConversations > 0 || row.leads > 0).slice(-14).map((row: any) => (
                      <div key={row.date} className="flex items-center justify-between gap-3 rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2">
                        <div className="text-xs font-semibold text-[#4b4037]">{shortDate(row.date)}</div>
                        <div className="text-right text-[11px] text-[#6f655c]">
                          <span className="font-bold text-[#2d2a28]">{money(row.spend)}</span> · {row.messagingConversations.toLocaleString("en-US")} messages
                        </div>
                      </div>
                    ))}
                    {marketingSnapshot.metaAds.daily.filter((row: any) => row.spend > 0 || row.messagingConversations > 0 || row.leads > 0).length === 0 ? (
                      <div className="rounded-xl bg-[#faf7f3] px-4 py-5 text-center text-xs font-medium text-[#81766c]">No daily Meta delivery in selected period.</div>
                    ) : null}
                  </div>
                </div>
              </section>
            </>
          ) : null}

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.1fr_.9fr]">
            <div className="min-w-0 rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Internal source of truth</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Lead Source</h2>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">
                Leads created during the selected period, grouped by booking_leads.source. This is CRM Lead Source, not campaign attribution.
              </p>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#85796d]">Leads</div>
                  <div className="mt-1 text-xl font-bold text-[#2d2a28]">{marketingSnapshot.leadSummary.leads.toLocaleString("en-US")}</div>
                </div>
                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#85796d]">Linked to booking</div>
                  <div className="mt-1 text-xl font-bold text-[#2d2a28]">{marketingSnapshot.leadSummary.linkedLeads.toLocaleString("en-US")}</div>
                </div>
                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#85796d]">Linkage coverage</div>
                  <div className="mt-1 text-xl font-bold text-[#2d2a28]">{percent(marketingSnapshot.leadSummary.linkageCoveragePct)}</div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {marketingSnapshot.leadSources.map((row: any) => (
                  <div key={row.source} className="grid gap-2 rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                    <div className="font-semibold capitalize text-[#342e29]">{row.source.replaceAll("_", " ")}</div>
                    <div className="text-xs text-[#6f655c]">{row.leads.toLocaleString("en-US")} leads</div>
                    <div className="text-xs text-[#6f655c]">{row.linkedRevenueBookings.toLocaleString("en-US")} booked</div>
                    <div className="text-right text-xs font-bold text-[#2d2a28]">{money(row.linkedBookedRevenue)}</div>
                  </div>
                ))}
                {marketingSnapshot.leadSources.length === 0 ? (
                  <div className="rounded-xl bg-[#faf7f3] px-4 py-5 text-center text-xs font-medium text-[#81766c]">No CRM leads created in selected period.</div>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 sm:space-y-5">
              <div className="rounded-[22px] border border-amber-200 bg-amber-50 p-4 sm:rounded-[26px] sm:p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-700">Attribution readiness</div>
                <h2 className="mt-1 text-lg font-bold text-[#4b3a22]">
                  {marketingSnapshot.attribution.roasAvailable
                    ? "Attributed ROAS available"
                    : "ROAS not available yet"}
                </h2>

                <p className="mt-2 text-xs leading-5 text-amber-900/80">
                  {marketingSnapshot.attribution.reason}
                </p>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-amber-200">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
                      Ad attribution coverage
                    </div>
                    <div className="mt-1 text-base font-bold text-[#4b3a22]">
                      {percent(marketingSnapshot.attribution.attributionCoveragePct)}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-amber-200">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
                      Matched bookings
                    </div>
                    <div className="mt-1 text-base font-bold text-[#4b3a22]">
                      {marketingSnapshot.attribution.matchedLinkedRevenueBookings.toLocaleString("en-US")}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-amber-200">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
                      Attributed revenue
                    </div>
                    <div className="mt-1 text-base font-bold text-[#4b3a22]">
                      {money(marketingSnapshot.attribution.matchedBookedRevenue)}
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/70 px-3 py-2 ring-1 ring-amber-200">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
                      Matched ad spend
                    </div>
                    <div className="mt-1 text-base font-bold text-[#4b3a22]">
                      {money(marketingSnapshot.attribution.matchedAdSpend)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[11px] font-medium text-amber-900 ring-1 ring-amber-200">
                  {marketingSnapshot.attribution.roasAvailable &&
                  marketingSnapshot.attribution.roas !== null
                    ? `First-touch attributed ROAS: ${marketingSnapshot.attribution.roas.toFixed(2)}x.`
                    : "Revenue is joined to Meta spend only when the CRM lead has a captured Instagram ad ID, that ad exists in Meta Insights, and the lead is linked to a revenue booking."}
                </div>
              </div>

              <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Marketing signals</div>
                <h2 className="mt-1 text-lg font-bold text-[#28231f]">Deterministic diagnostics</h2>
                <div className="mt-4 space-y-2.5">
                  {marketingSnapshot.signals.map((signal: any) => {
                    const severityClass =
                      signal.severity === "positive"
                        ? "border-emerald-200 bg-emerald-50"
                        : signal.severity === "critical"
                          ? "border-red-200 bg-red-50"
                          : signal.severity === "warning"
                            ? "border-amber-200 bg-amber-50"
                            : "border-[#eee5dc] bg-[#fcfaf7]";

                    return (
                      <div key={signal.id} className={`rounded-xl border px-3 py-3 ${severityClass}`}>
                        <div className="text-xs font-bold text-[#2d2a28]">{signal.title}</div>
                        <div className="mt-1 text-[11px] leading-5 text-[#6f655c]">{signal.explanation}</div>
                      </div>
                    );
                  })}
                  {marketingSnapshot.signals.length === 0 ? (
                    <div className="rounded-xl bg-[#faf7f3] px-4 py-5 text-center text-xs font-medium text-[#81766c]">No material marketing signal crossed the current deterministic thresholds.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "sales" ? (
        <>
          <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6 sm:gap-3">
            <Metric
              label="Revenue"
              value={money(salesSnapshot.summary.revenue.current)}
              note={comparisonLabel({
                currentValue: salesSnapshot.summary.revenue.current,
                previousValue: salesSnapshot.summary.revenue.previous,
                deltaPct: salesSnapshot.summary.revenue.deltaPct,
              })}
              noteClassName={comparisonClass({
                currentValue: salesSnapshot.summary.revenue.current,
                previousValue: salesSnapshot.summary.revenue.previous,
                deltaPct: salesSnapshot.summary.revenue.deltaPct,
              })}
              tone="gold"
            />

            <Metric
              label="Bookings"
              value={salesSnapshot.summary.bookings.current.toLocaleString("en-US")}
              note={comparisonLabel({
                currentValue: salesSnapshot.summary.bookings.current,
                previousValue: salesSnapshot.summary.bookings.previous,
                deltaPct: salesSnapshot.summary.bookings.deltaPct,
              })}
              noteClassName={comparisonClass({
                currentValue: salesSnapshot.summary.bookings.current,
                previousValue: salesSnapshot.summary.bookings.previous,
                deltaPct: salesSnapshot.summary.bookings.deltaPct,
              })}
              tone="green"
            />

            <Metric
              label="Average Booking"
              value={money(salesSnapshot.summary.averageBooking.current)}
              note={comparisonLabel({
                currentValue: salesSnapshot.summary.averageBooking.current,
                previousValue: salesSnapshot.summary.averageBooking.previous,
                deltaPct: salesSnapshot.summary.averageBooking.deltaPct,
              })}
              noteClassName={comparisonClass({
                currentValue: salesSnapshot.summary.averageBooking.current,
                previousValue: salesSnapshot.summary.averageBooking.previous,
                deltaPct: salesSnapshot.summary.averageBooking.deltaPct,
              })}
              tone="blue"
            />

            <Metric
              label="Median Booking"
              value={money(salesSnapshot.summary.medianBookingValue.current)}
              note={comparisonLabel({
                currentValue: salesSnapshot.summary.medianBookingValue.current,
                previousValue: salesSnapshot.summary.medianBookingValue.previous,
                deltaPct: salesSnapshot.summary.medianBookingValue.deltaPct,
              })}
              noteClassName={comparisonClass({
                currentValue: salesSnapshot.summary.medianBookingValue.current,
                previousValue: salesSnapshot.summary.medianBookingValue.previous,
                deltaPct: salesSnapshot.summary.medianBookingValue.deltaPct,
              })}
              tone="plain"
            />

            <Metric
              label="Discount Rate"
              value={percent(salesSnapshot.summary.discountRate.current)}
              note={comparisonLabel({
                currentValue: salesSnapshot.summary.discountRate.current,
                previousValue: salesSnapshot.summary.discountRate.previous,
                deltaPct: salesSnapshot.summary.discountRate.deltaPct,
              })}
              noteClassName={comparisonClass({
                currentValue: salesSnapshot.summary.discountRate.current,
                previousValue: salesSnapshot.summary.discountRate.previous,
                deltaPct: salesSnapshot.summary.discountRate.deltaPct,
              })}
              tone="red"
            />

            <Metric
              label="Future Booked Revenue"
              value={money(future30.revenue)}
              note={`${future30.bookingCount.toLocaleString("en-US")} bookings in next 30 days`}
              tone="plain"
            />
          </section>

          <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Sales trend</div>
                <h2 className="mt-1 text-lg font-bold text-[#28231f]">Revenue and booking volume by event date bucket</h2>
                <p className="mt-1 text-xs leading-5 text-[#81766c]">Adaptive buckets: daily for short ranges, weekly for longer ranges, monthly for very long ranges. Zero buckets remain in calculations for continuity.</p>
              </div>
            </div>

            {salesTrend.length > 0 ? (
              <>
                <div className="mt-5 min-w-0">
                  <div
                    className="grid h-[180px] min-w-0 items-end gap-[2px] sm:gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${salesTrend.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {salesTrend.map((row: any, index: number) => {
                      const currentHeight = row.currentRevenue > 0
                        ? Math.max(8, (row.currentRevenue / maxSalesTrendRevenue) * 120)
                        : 3;

                      const previousHeight = row.previousRevenue > 0
                        ? Math.max(8, (row.previousRevenue / maxSalesTrendRevenue) * 120)
                        : 3;

                      const showLabel =
                        index === 0 ||
                        index === salesTrend.length - 1 ||
                        salesTrend.length <= 12 ||
                        index % Math.ceil(salesTrend.length / 6) === 0;

                      return (
                        <div
                          key={`${row.label}-${index}`}
                          className="flex min-w-0 flex-col items-center justify-end"
                          title={`${row.label} | Current: ${money(row.currentRevenue)} (${row.currentBookings.toLocaleString("en-US")} bookings) | Previous: ${money(row.previousRevenue)} (${row.previousBookings.toLocaleString("en-US")} bookings)`}
                        >
                          <div className="mb-1 h-4 w-full min-w-0 truncate text-center text-[8px] font-bold leading-4 text-[#6f655c]">
                            {salesTrend.length <= 14 ? money(row.currentRevenue) : ""}
                          </div>

                          <div className="flex w-full max-w-[26px] items-end gap-[2px]">
                            <div className="w-1/2 rounded-t-md bg-[#8aa2b8]" style={{ height: `${previousHeight}px` }} />
                            <div className="w-1/2 rounded-t-md bg-[#c9964f]" style={{ height: `${currentHeight}px` }} />
                          </div>

                          <div className="mt-2 h-4 w-full min-w-0 text-center text-[8px] font-semibold leading-4 text-[#81766c]">
                            {showLabel ? row.label : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-[10px] font-semibold text-[#7e7368]">
                    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-[#c9964f]" /> Current period</span>
                    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded bg-[#8aa2b8]" /> Previous period</span>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Active buckets only</div>
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                    <tr>
                      <th className="py-2 pr-3">Period bucket</th>
                      <th className="py-2 pr-3">Revenue</th>
                      <th className="py-2 pr-3">Bookings</th>
                      <th className="py-2 pr-3">Previous revenue</th>
                      <th className="py-2 pr-3">Previous bookings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1e8de]">
                    {activeSalesTrendRows.slice(0, 12).map((row: any, index: number) => (
                      <tr key={`${row.label}-${index}`}>
                        <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{row.label}</td>
                        <td className="py-2.5 pr-3">{money(row.currentRevenue)}</td>
                        <td className="py-2.5 pr-3">{row.currentBookings.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3 text-[#81766c]">{money(row.previousRevenue)}</td>
                        <td className="py-2.5 pr-3 text-[#81766c]">{row.previousBookings.toLocaleString("en-US")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                  {activeSalesTrendRows.length === 0 ? (
                    <div className="mt-2 rounded-lg bg-[#faf7f3] px-3 py-2 text-xs text-[#81766c]">
                      No active revenue buckets in this period.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-xl bg-[#faf7f3] px-4 py-3 text-xs text-[#81766c]">
                No sales trend data in this period.
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.2fr_1fr]">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Booking value</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Distribution by booking amount bands</h2>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                    <tr>
                      <th className="py-2 pr-3">Band</th>
                      <th className="py-2 pr-3">Bookings</th>
                      <th className="py-2 pr-3">Booked revenue</th>
                      <th className="py-2 pr-3">Revenue share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1e8de]">
                    {salesSnapshot.valueBands.map((row: any) => (
                      <tr key={row.key}>
                        <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{row.label}</td>
                        <td className="py-2.5 pr-3">{row.bookingCount.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{money(row.revenue)}</td>
                        <td className="py-2.5 pr-3">{percent(row.revenueSharePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-[11px] text-[#81766c]">
                High-value threshold: {money(salesSnapshot.thresholds.highValueBookingThreshold)}
              </div>
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Discount intelligence</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Discount behavior and pressure</h2>

              <div className="mt-4 space-y-2.5">
                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Discounted booking share</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(salesSnapshot.summary.discountedBookingShare.current)}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${comparisonClass({
                    currentValue: salesSnapshot.summary.discountedBookingShare.current,
                    previousValue: salesSnapshot.summary.discountedBookingShare.previous,
                    deltaPct: salesSnapshot.summary.discountedBookingShare.deltaPct,
                  })}`}>
                    {comparisonLabel({
                      currentValue: salesSnapshot.summary.discountedBookingShare.current,
                      previousValue: salesSnapshot.summary.discountedBookingShare.previous,
                      deltaPct: salesSnapshot.summary.discountedBookingShare.deltaPct,
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Average discount per discounted booking</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{money(salesSnapshot.summary.averageDiscountPerDiscountedBooking.current)}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${comparisonClass({
                    currentValue: salesSnapshot.summary.averageDiscountPerDiscountedBooking.current,
                    previousValue: salesSnapshot.summary.averageDiscountPerDiscountedBooking.previous,
                    deltaPct: salesSnapshot.summary.averageDiscountPerDiscountedBooking.deltaPct,
                  })}`}>
                    {comparisonLabel({
                      currentValue: salesSnapshot.summary.averageDiscountPerDiscountedBooking.current,
                      previousValue: salesSnapshot.summary.averageDiscountPerDiscountedBooking.previous,
                      deltaPct: salesSnapshot.summary.averageDiscountPerDiscountedBooking.deltaPct,
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5 text-[11px] leading-5 text-[#6f655c]">
                  Discount rate uses: total discount_amount / (total_amount + discount_amount).
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Weekday performance</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Revenue, bookings, and value by weekday</h2>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                    <tr>
                      <th className="py-2 pr-3">Weekday</th>
                      <th className="py-2 pr-3">Revenue</th>
                      <th className="py-2 pr-3">Bookings</th>
                      <th className="py-2 pr-3">Average booking</th>
                      <th className="py-2 pr-3">Revenue share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1e8de]">
                    {salesSnapshot.weekdays.map((row: any) => (
                      <tr key={row.dayName}>
                        <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{row.dayName}</td>
                        <td className="py-2.5 pr-3">{money(row.revenue)}</td>
                        <td className="py-2.5 pr-3">{row.bookings.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{money(row.averageBookingValue)}</td>
                        <td className="py-2.5 pr-3">{percent(row.revenueSharePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Concentration</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Revenue concentration snapshots</h2>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">Shares are percentages of selected-period booked revenue.</p>

              <div className="mt-4 space-y-2.5">
                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Top city share</div>
                  <div className="text-[10px] text-[#81766c]">Top city revenue / selected-period booked revenue</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(salesSnapshot.concentration.topCityShare.current)}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${deltaClass(salesSnapshot.concentration.topCityShare.deltaPct)}`}>
                    {deltaLabel(salesSnapshot.concentration.topCityShare.deltaPct)}
                  </div>
                </div>

                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Top 3 city share</div>
                  <div className="text-[10px] text-[#81766c]">Top 3 city revenue / selected-period booked revenue</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(salesSnapshot.concentration.top3CityShare.current)}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${deltaClass(salesSnapshot.concentration.top3CityShare.deltaPct)}`}>
                    {deltaLabel(salesSnapshot.concentration.top3CityShare.deltaPct)}
                  </div>
                </div>

                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Top 10 booking share</div>
                  <div className="text-[10px] text-[#81766c]">Top 10 booking revenue / selected-period booked revenue</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(salesSnapshot.concentration.top10BookingsShare.current)}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${deltaClass(salesSnapshot.concentration.top10BookingsShare.deltaPct)}`}>
                    {deltaLabel(salesSnapshot.concentration.top10BookingsShare.deltaPct)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Geography: city</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">City sales performance</h2>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">Growth/decline ranking uses a minimum of {salesSnapshot.thresholds.minGeographyBookingsForDelta} bookings in current or previous period.</p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                    <tr>
                      <th className="py-2 pr-3">City</th>
                      <th className="py-2 pr-3">Revenue</th>
                      <th className="py-2 pr-3">Bookings</th>
                      <th className="py-2 pr-3">Avg booking</th>
                      <th className="py-2 pr-3">Share</th>
                      <th className="py-2 pr-3">vs previous</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1e8de]">
                    {salesSnapshot.cities.slice(0, 10).map((row: any) => (
                      <tr key={row.key}>
                        <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{row.label}</td>
                        <td className="py-2.5 pr-3">{money(row.currentRevenue)}</td>
                        <td className="py-2.5 pr-3">{row.currentBookings.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{money(row.currentAverageBooking)}</td>
                        <td className="py-2.5 pr-3">{percent(row.currentRevenueSharePct)}</td>
                        <td className={`py-2.5 pr-3 font-semibold ${comparisonClass({
                          currentValue: row.currentRevenue,
                          previousValue: row.previousRevenue,
                          deltaPct: row.revenueDeltaPct,
                        })}`}>
                          {comparisonLabel({
                            currentValue: row.currentRevenue,
                            previousValue: row.previousRevenue,
                            deltaPct: row.revenueDeltaPct,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Geography: ZIP</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">ZIP sales performance</h2>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                    <tr>
                      <th className="py-2 pr-3">ZIP</th>
                      <th className="py-2 pr-3">Revenue</th>
                      <th className="py-2 pr-3">Bookings</th>
                      <th className="py-2 pr-3">Avg booking</th>
                      <th className="py-2 pr-3">Share</th>
                      <th className="py-2 pr-3">vs previous</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1e8de]">
                    {salesSnapshot.zips.slice(0, 10).map((row: any) => (
                      <tr key={row.key}>
                        <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{row.label}</td>
                        <td className="py-2.5 pr-3">{money(row.currentRevenue)}</td>
                        <td className="py-2.5 pr-3">{row.currentBookings.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{money(row.currentAverageBooking)}</td>
                        <td className="py-2.5 pr-3">{percent(row.currentRevenueSharePct)}</td>
                        <td className={`py-2.5 pr-3 font-semibold ${comparisonClass({
                          currentValue: row.currentRevenue,
                          previousValue: row.previousRevenue,
                          deltaPct: row.revenueDeltaPct,
                        })}`}>
                          {comparisonLabel({
                            currentValue: row.currentRevenue,
                            previousValue: row.previousRevenue,
                            deltaPct: row.revenueDeltaPct,
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">City movement</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Growing and declining cities</h2>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-xs font-bold text-emerald-800">Growing cities</div>
                  {salesSnapshot.growingCities.length === 0 ? (
                    <div className="rounded-lg bg-[#faf7f3] px-3 py-2 text-xs text-[#81766c]">No qualifying growth.</div>
                  ) : (
                    salesSnapshot.growingCities.map((row: any) => (
                      <div key={`g-${row.key}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <div className="text-xs font-semibold text-[#2d2a28]">{row.label}</div>
                        <div className="text-[11px] text-[#6f655c]">{comparisonLabel({ currentValue: row.currentRevenue, previousValue: row.previousRevenue, deltaPct: row.revenueDeltaPct })}</div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-red-800">Declining cities</div>
                  {salesSnapshot.decliningCities.length === 0 ? (
                    <div className="rounded-lg bg-[#faf7f3] px-3 py-2 text-xs text-[#81766c]">No qualifying decline.</div>
                  ) : (
                    salesSnapshot.decliningCities.map((row: any) => (
                      <div key={`d-${row.key}`} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                        <div className="text-xs font-semibold text-[#2d2a28]">{row.label}</div>
                        <div className="text-[11px] text-[#6f655c]">{comparisonLabel({ currentValue: row.currentRevenue, previousValue: row.previousRevenue, deltaPct: row.revenueDeltaPct })}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">On the books</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Future booked revenue and pipeline snapshot</h2>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">Already-booked revenue for events occurring within each upcoming horizon.</p>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                {[future30, future60, future90].map((row: any) => (
                  <div key={row.days} className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Next {row.days} days</div>
                    <div className="mt-1 text-sm font-bold text-[#2d2a28]">{money(row.revenue)}</div>
                    <div className="text-[11px] text-[#6f655c]">{row.bookingCount.toLocaleString("en-US")} bookings</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5 text-[11px] leading-5 text-[#6f655c]">
                Future bookings created during selected period: <span className="font-bold text-[#2d2a28]">{salesSnapshot.forwardBookingPace.futureBookingsCreatedCount.toLocaleString("en-US")}</span> ({money(salesSnapshot.forwardBookingPace.futureRevenueCreated)}). This is a current-window creation snapshot, not a historical as-of pace comparison.
              </div>

              <div className="mt-2 rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5 text-[11px] leading-5 text-[#6f655c]">
                Opportunity Pipeline ({salesSnapshot.opportunityPipeline.statuses.join(", ")}): <span className="font-bold text-[#2d2a28]">{salesSnapshot.opportunityPipeline.count.toLocaleString("en-US")}</span>
                {salesSnapshot.opportunityPipeline.potentialAmount !== null ? (
                  <> · Potential Value {money(salesSnapshot.opportunityPipeline.potentialAmount)}</>
                ) : null}
                <div className="mt-1 text-[10px] text-[#81766c]">Pipeline is excluded from Booked Revenue.</div>
              </div>

              {salesSnapshot.opportunityPipeline.count === 0 ? (
                <div className="mt-2 rounded-lg bg-[#faf7f3] px-3 py-2 text-xs text-[#81766c]">No quote/pending_deposit opportunities in selected period.</div>
              ) : null}

              <div className="mt-2 rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5 text-[11px] leading-5 text-[#6f655c]">
                Event-period status snapshot: cancelled {salesSnapshot.cancellationSnapshot.cancelledCount.toLocaleString("en-US")} ({percent(salesSnapshot.cancellationSnapshot.cancelledSharePct)}), refunded {salesSnapshot.cancellationSnapshot.refundedCount.toLocaleString("en-US")} ({percent(salesSnapshot.cancellationSnapshot.refundedSharePct)}).
              </div>
            </div>
          </section>

          <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Sales signals</div>
            <h2 className="mt-1 text-lg font-bold text-[#28231f]">Deterministic sales diagnostics</h2>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {salesSnapshot.signals.map((signal: any) => {
                const severityClass =
                  signal.severity === "positive"
                    ? "border-emerald-200 bg-emerald-50"
                    : signal.severity === "critical"
                      ? "border-red-200 bg-red-50"
                      : signal.severity === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-[#eee5dc] bg-[#fcfaf7]";

                return (
                  <div key={signal.id} className={`rounded-xl border px-3 py-3 ${severityClass}`}>
                    <div className="text-xs font-bold text-[#2d2a28]">{signal.title}</div>
                    <div className="mt-1 text-[11px] leading-5 text-[#6f655c]">{signal.explanation}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "customers" ? (
        <>
          <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-6 sm:gap-3">
            <Metric
              label="Identified Customers"
              value={customerSnapshot.identity.distinctCustomerIds.toLocaleString("en-US")}
              note="Distinct customer_id values on qualifying event-period bookings"
              tone="gold"
            />

            <Metric
              label="Unidentified Bookings"
              value={customerSnapshot.identity.unidentifiedBookings.toLocaleString("en-US")}
              note="Missing customer_id on qualifying event-period bookings"
              tone="red"
            />

            <Metric
              label="New Customers"
              value={customerSnapshot.acquisition.current.newCustomers.toLocaleString("en-US")}
              note="First qualifying booking created in period"
              tone="green"
            />

            <Metric
              label="Repeat Customers"
              value={customerSnapshot.acquisition.current.repeatCustomersBookingInPeriod.toLocaleString("en-US")}
              note="Had qualifying booking before period + another created during period"
              tone="blue"
            />

            <Metric
              label="First-Event Customers"
              value={customerSnapshot.eventMix.current.firstEventCustomers.toLocaleString("en-US")}
              note="First qualifying event date in selected event period"
              tone="plain"
            />

            <Metric
              label="Returning Event Customers"
              value={customerSnapshot.eventMix.current.returningCustomers.toLocaleString("en-US")}
              note="Had earlier qualifying event before selected event period"
              tone="plain"
            />
          </section>

          <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Data confidence</div>
            <h2 className="mt-1 text-lg font-bold text-[#28231f]">Identity and linkage coverage</h2>
            <p className="mt-1 text-xs leading-5 text-[#81766c]">
              Missing customer_id is treated as unidentified coverage, not as zero-value customers.
            </p>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Booking identity coverage</div>
                <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(customerSnapshot.confidence.bookingIdentityCoverage.coveragePct)}</div>
                <div className="text-[11px] text-[#6f655c]">{customerSnapshot.confidence.bookingIdentityCoverage.linked.toLocaleString("en-US")} / {customerSnapshot.confidence.bookingIdentityCoverage.total.toLocaleString("en-US")} bookings linked</div>
              </div>

              <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Revenue identity coverage</div>
                <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(customerSnapshot.confidence.revenueIdentityCoverage.coveragePct)}</div>
                <div className="text-[11px] text-[#6f655c]">{money(customerSnapshot.confidence.revenueIdentityCoverage.linked)} / {money(customerSnapshot.confidence.revenueIdentityCoverage.total)} linked revenue</div>
              </div>

              <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Lead linkage coverage</div>
                <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(customerSnapshot.confidence.leadLinkageCoverage.coveragePct)}</div>
                <div className="text-[11px] text-[#6f655c]">{customerSnapshot.confidence.leadLinkageCoverage.linked.toLocaleString("en-US")} / {customerSnapshot.confidence.leadLinkageCoverage.total.toLocaleString("en-US")} bookings linked to booking_leads</div>
              </div>

              <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Unidentified revenue</div>
                <div className="mt-1 text-base font-bold text-[#2d2a28]">{money(unidentifiedRevenue)}</div>
                <div className="text-[11px] text-[#6f655c]">Revenue without customer_id in selected event period</div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Customer mix</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Event-based mix (event_date definition)</h2>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">First-event and returning event customers are based on first qualifying event date, not booking created date.</p>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <Metric
                  label="First-Event Customers"
                  value={customerSnapshot.eventMix.current.firstEventCustomers.toLocaleString("en-US")}
                  note={comparisonLabel({
                    currentValue: customerSnapshot.eventMix.current.firstEventCustomers,
                    previousValue: customerSnapshot.eventMix.previous.firstEventCustomers,
                    deltaPct: eventFirstDeltaPct,
                  })}
                  noteClassName={comparisonClass({
                    currentValue: customerSnapshot.eventMix.current.firstEventCustomers,
                    previousValue: customerSnapshot.eventMix.previous.firstEventCustomers,
                    deltaPct: eventFirstDeltaPct,
                  })}
                />

                <Metric
                  label="Returning Event Customers"
                  value={customerSnapshot.eventMix.current.returningCustomers.toLocaleString("en-US")}
                  note={comparisonLabel({
                    currentValue: customerSnapshot.eventMix.current.returningCustomers,
                    previousValue: customerSnapshot.eventMix.previous.returningCustomers,
                    deltaPct: eventReturningDeltaPct,
                  })}
                  noteClassName={comparisonClass({
                    currentValue: customerSnapshot.eventMix.current.returningCustomers,
                    previousValue: customerSnapshot.eventMix.previous.returningCustomers,
                    deltaPct: eventReturningDeltaPct,
                  })}
                />
              </div>

              <div className="mt-3 rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5 text-[11px] leading-5 text-[#6f655c]">
                Returning revenue share (event-based): <span className="font-bold text-[#2d2a28]">{percent(customerSnapshot.eventMix.current.returningRevenueSharePct)}</span> ({money(customerSnapshot.eventMix.current.returningRevenue)} of identified revenue).
              </div>
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Acquisition</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Created-based acquisition (created_at definition)</h2>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">New and repeat acquisition uses first qualifying booking created_at. customers.created_at is not used.</p>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">New customers</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{customerSnapshot.acquisition.current.newCustomers.toLocaleString("en-US")}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${comparisonClass({
                    currentValue: customerSnapshot.acquisition.current.newCustomers,
                    previousValue: customerSnapshot.acquisition.previous.newCustomers,
                    deltaPct: acquisitionNewDeltaPct,
                  })}`}>
                    {comparisonLabel({
                      currentValue: customerSnapshot.acquisition.current.newCustomers,
                      previousValue: customerSnapshot.acquisition.previous.newCustomers,
                      deltaPct: acquisitionNewDeltaPct,
                    })}
                  </div>
                  <div className="text-[11px] text-[#6f655c]">Revenue from new: {money(customerSnapshot.acquisition.current.revenueFromNewCustomers)}</div>
                </div>

                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Repeat customers in period</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{customerSnapshot.acquisition.current.repeatCustomersBookingInPeriod.toLocaleString("en-US")}</div>
                  <div className="text-[11px] text-[#6f655c]">Revenue from repeat: {money(customerSnapshot.acquisition.current.revenueFromRepeatCustomers)}</div>
                  <div className="text-[11px] text-[#6f655c]">Repeat revenue share: {percent(customerSnapshot.acquisition.current.repeatRevenueSharePct)}</div>
                  <div className="text-[11px] text-[#6f655c]">Repeat booking share: {percent(customerSnapshot.acquisition.current.repeatBookingSharePct)}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.15fr_1fr]">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Repeat behavior</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Return timing diagnostics</h2>

              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <Metric
                  label="Median Time To 2nd Booking"
                  value={customerSnapshot.repeatBehavior.timeToSecondMedianDays === null ? "N/A" : `${customerSnapshot.repeatBehavior.timeToSecondMedianDays.toFixed(1)} days`}
                  note={`${customerSnapshot.repeatBehavior.observedCustomers.toLocaleString("en-US")} customers observed`}
                />

                <Metric
                  label="Median Booking-Created Interval"
                  value={customerSnapshot.repeatBehavior.createdIntervalMedianDays === null ? "N/A" : `${customerSnapshot.repeatBehavior.createdIntervalMedianDays.toFixed(1)} days`}
                  note="Across consecutive qualifying booking created dates"
                />

                <Metric
                  label="Average Booking"
                  value={customerAverageBookingValue === null ? "N/A" : money(customerAverageBookingValue)}
                  note="Identified event-period revenue divided by identified bookings"
                />
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                    <tr>
                      <th className="py-2 pr-3">Window</th>
                      <th className="py-2 pr-3">Eligible customers</th>
                      <th className="py-2 pr-3">Repeated within window</th>
                      <th className="py-2 pr-3">Repeat rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1e8de]">
                    {customerSnapshot.repeatBehavior.repeatWindows.map((row: any) => (
                      <tr key={row.days}>
                        <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{row.days} days</td>
                        <td className="py-2.5 pr-3">{row.eligibleCustomers.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{row.repeatedWithinWindow.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{row.repeatRatePct === null ? "N/A" : percent(row.repeatRatePct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Revenue concentration</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Top customer share of identified revenue</h2>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">Denominator is event-period identified booked revenue only.</p>

              <div className="mt-4 space-y-2.5">
                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Top 1 share</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(customerSnapshot.concentration.top1Share.current)}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${deltaClass(customerSnapshot.concentration.top1Share.deltaPct)}`}>{deltaLabel(customerSnapshot.concentration.top1Share.deltaPct)}</div>
                </div>

                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Top 5 share</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(customerSnapshot.concentration.top5Share.current)}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${deltaClass(customerSnapshot.concentration.top5Share.deltaPct)}`}>{deltaLabel(customerSnapshot.concentration.top5Share.deltaPct)}</div>
                </div>

                <div className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#85796d]">Top 10 share</div>
                  <div className="mt-1 text-base font-bold text-[#2d2a28]">{percent(customerSnapshot.concentration.top10Share.current)}</div>
                  <div className={`mt-0.5 text-[11px] font-semibold ${deltaClass(customerSnapshot.concentration.top10Share.deltaPct)}`}>{deltaLabel(customerSnapshot.concentration.top10Share.deltaPct)}</div>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Top customers</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Current event-period leaders with lifetime context</h2>

              {customerTopRows.length === 0 ? (
                <div className="mt-4 rounded-xl bg-[#faf7f3] px-4 py-7 text-center text-sm font-medium text-[#81766c]">
                  No identified customers with qualifying event-period revenue.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-xs sm:text-sm">
                    <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                      <tr>
                        <th className="py-2 pr-3">Customer</th>
                        <th className="py-2 pr-3">Lifetime booked revenue</th>
                        <th className="py-2 pr-3">Lifetime bookings</th>
                        <th className="py-2 pr-3">Average booking</th>
                        <th className="py-2 pr-3">First booking created</th>
                        <th className="py-2 pr-3">Most recent created</th>
                        <th className="py-2 pr-3">Repeat status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1e8de]">
                      {customerTopRows.map((row: any) => (
                        <tr key={row.customerId}>
                          <td className="py-2.5 pr-3 align-top">
                            <div className="font-semibold text-[#2d2a28]">{row.customerName}</div>
                            <div className="text-[11px] text-[#81766c]">{row.customerId}</div>
                          </td>
                          <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{money(row.lifetimeBookedRevenue)}</td>
                          <td className="py-2.5 pr-3">{row.lifetimeBookingCount.toLocaleString("en-US")}</td>
                          <td className="py-2.5 pr-3">{money(row.averageBookingValue)}</td>
                          <td className="py-2.5 pr-3">{row.firstBookingCreatedAt ? shortDate(row.firstBookingCreatedAt) : "N/A"}</td>
                          <td className="py-2.5 pr-3">{row.mostRecentBookingCreatedAt ? shortDate(row.mostRecentBookingCreatedAt) : "N/A"}</td>
                          <td className="py-2.5 pr-3">{row.repeatStatus === "repeat" ? "Repeat" : "Single"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Customer event geography</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Event-location mix for identified customers</h2>

              {customerGeographyRows.length === 0 ? (
                <div className="mt-4 rounded-xl bg-[#faf7f3] px-4 py-7 text-center text-sm font-medium text-[#81766c]">
                  No identified customer event geography in selected period.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-xs sm:text-sm">
                    <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                      <tr>
                        <th className="py-2 pr-3">City / State</th>
                        <th className="py-2 pr-3">Identified customers</th>
                        <th className="py-2 pr-3">Returning customers</th>
                        <th className="py-2 pr-3">Returning share</th>
                        <th className="py-2 pr-3">Revenue</th>
                        <th className="py-2 pr-3">Returning revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1e8de]">
                      {customerGeographyRows.map((row: any) => (
                        <tr key={row.key}>
                          <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{row.label}</td>
                          <td className="py-2.5 pr-3">{row.identifiedCustomers.toLocaleString("en-US")}</td>
                          <td className="py-2.5 pr-3">{row.returningCustomers.toLocaleString("en-US")}</td>
                          <td className="py-2.5 pr-3">{percent(row.repeatCustomerSharePct)}</td>
                          <td className="py-2.5 pr-3">{money(row.totalRevenue)}</td>
                          <td className="py-2.5 pr-3">{money(row.returningRevenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {showLeadSourceSection ? (
            <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Lead source</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Audited from booking_leads.source</h2>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">Shown only when booking linkage coverage is reliable in the selected event period.</p>

              <div className="mt-3 rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5 text-[11px] leading-5 text-[#6f655c]">
                Coverage: {customerSnapshot.leadSources.coverage.linkedBookings.toLocaleString("en-US")} / {customerSnapshot.leadSources.coverage.totalBookings.toLocaleString("en-US")} bookings ({percent(customerSnapshot.leadSources.coverage.coveragePct)}). Multi-source linked bookings: {customerSnapshot.leadSources.multiSourceBookingCount.toLocaleString("en-US")}.
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                    <tr>
                      <th className="py-2 pr-3">Source</th>
                      <th className="py-2 pr-3">Linked bookings</th>
                      <th className="py-2 pr-3">Linked revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1e8de]">
                    {customerLeadRows.map((row: any) => (
                      <tr key={row.source}>
                        <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{row.source}</td>
                        <td className="py-2.5 pr-3">{row.linkedBookings.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{money(row.linkedRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="rounded-[22px] border border-dashed border-[#d9c9b7] bg-[#faf7f3] p-4 sm:rounded-[26px] sm:p-5">
              <div className="text-sm font-bold text-[#3c342e]">Lead source withheld due to linkage confidence</div>
              <p className="mt-1 text-xs leading-5 text-[#81766c]">
                booking_leads linkage coverage is {percent(customerSnapshot.leadSources.coverage.coveragePct)}, below the reliability threshold.
              </p>
            </section>
          )}

          <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Customer signals</div>
            <h2 className="mt-1 text-lg font-bold text-[#28231f]">Deterministic management flags</h2>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {customerSnapshot.signals.map((signal: any) => {
                const severityClass =
                  signal.severity === "positive"
                    ? "border-emerald-200 bg-emerald-50"
                    : signal.severity === "critical"
                      ? "border-red-200 bg-red-50"
                      : signal.severity === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-[#eee5dc] bg-[#fcfaf7]";

                return (
                  <div key={signal.id} className={`rounded-xl border px-3 py-3 ${severityClass}`}>
                    <div className="text-xs font-bold text-[#2d2a28]">{signal.title}</div>
                    <div className="mt-1 text-[11px] leading-5 text-[#6f655c]">{signal.explanation}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "products" ? (
        <>
          <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <Metric
              label="Product Revenue"
              value={money(productSnapshot.totals.totalRevenue)}
              note={`${productSnapshot.totals.productCount.toLocaleString("en-US")} products with activity`}
              tone="gold"
            />

            <Metric
              label="Rental Quantity"
              value={Math.round(productSnapshot.totals.totalRentals).toLocaleString("en-US")}
              note="Sum of booking item quantities"
              tone="green"
            />

            <Metric
              label="Distinct Product Bookings"
              value={productSnapshot.totals.totalDistinctProductBookings.toLocaleString("en-US")}
              note="Unique bookings with product activity"
              tone="blue"
            />

            <Metric
              label="Utilization Coverage"
              value={`${productSnapshot.totals.measurableUtilizationCount.toLocaleString("en-US")}/${productSnapshot.totals.productCount.toLocaleString("en-US")}`}
              note="Products with measurable capacity"
              tone="plain"
            />
          </section>

          <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">
                  Product leaders
                </div>

                <h2 className="mt-1 text-lg font-bold text-[#28231f]">
                  Revenue, rentals, and period comparison
                </h2>

                <p className="mt-1 text-xs leading-5 text-[#81766c]">
                  Growth and decline ranking requires at least {productSnapshot.minRentalActivityForGrowth} rentals in current or previous period.
                </p>
              </div>
            </div>

            {productSnapshot.rows.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                    <tr>
                      <th className="py-2 pr-3">Product</th>
                      <th className="py-2 pr-3">Revenue</th>
                      <th className="py-2 pr-3">Rentals</th>
                      <th className="py-2 pr-3">Bookings</th>
                      <th className="py-2 pr-3">Revenue / Rental</th>
                      <th className="py-2 pr-3">Revenue Share</th>
                      <th className="py-2 pr-3">vs Previous</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#f1e8de]">
                    {productSnapshot.rows.slice(0, 15).map((row: any) => (
                      <tr key={row.productId}>
                        <td className="py-2.5 pr-3 align-top">
                          <div className="font-semibold text-[#2d2a28]">{row.productName}</div>
                          <div className="text-[11px] text-[#81766c]">{row.categoryName}</div>
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-[#2d2a28]">{money(row.currentRevenue)}</td>
                        <td className="py-2.5 pr-3">{Math.round(row.currentRentals).toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{row.currentBookingCount.toLocaleString("en-US")}</td>
                        <td className="py-2.5 pr-3">{money(row.revenuePerRental)}</td>
                        <td className="py-2.5 pr-3">{percent(row.revenueSharePct)}</td>
                        <td className={`py-2.5 pr-3 font-semibold ${comparisonClass({ currentValue: row.currentRevenue, previousValue: row.previousRevenue, deltaPct: row.revenueDeltaPct })}`}>
                          {comparisonLabel({ currentValue: row.currentRevenue, previousValue: row.previousRevenue, deltaPct: row.revenueDeltaPct })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-[#faf7f3] px-4 py-7 text-center text-sm font-medium text-[#81766c]">
                No product activity in selected period.
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Growth</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Growing products</h2>
              <div className="mt-4 space-y-2.5">
                {productSnapshot.leaders.fastestGrowing.length === 0 ? (
                  <div className="rounded-xl bg-[#faf7f3] px-4 py-5 text-sm text-[#81766c]">No qualifying growth in this period.</div>
                ) : (
                  productSnapshot.leaders.fastestGrowing.map((row: any) => (
                    <div key={row.productId} className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[#2d2a28]">{row.productName}</div>
                          <div className="text-[11px] text-[#81766c]">{Math.round(row.currentRentals)} rentals vs {Math.round(row.previousRentals)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-[#2d2a28]">{money(row.currentRevenue)}</div>
                          <div className={`text-[11px] font-semibold ${comparisonClass({ currentValue: row.currentRevenue, previousValue: row.previousRevenue, deltaPct: row.revenueDeltaPct })}`}>
                            {comparisonLabel({ currentValue: row.currentRevenue, previousValue: row.previousRevenue, deltaPct: row.revenueDeltaPct })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Decline</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Declining products</h2>
              <div className="mt-4 space-y-2.5">
                {productSnapshot.leaders.largestDecline.length === 0 ? (
                  <div className="rounded-xl bg-[#faf7f3] px-4 py-3 text-xs text-[#81766c]">No qualifying decline in this period.</div>
                ) : (
                  productSnapshot.leaders.largestDecline.map((row: any) => (
                    <div key={row.productId} className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[#2d2a28]">{row.productName}</div>
                          <div className="text-[11px] text-[#81766c]">{Math.round(row.currentRentals)} rentals vs {Math.round(row.previousRentals)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-[#2d2a28]">{money(row.currentRevenue)}</div>
                          <div className={`text-[11px] font-semibold ${comparisonClass({ currentValue: row.currentRevenue, previousValue: row.previousRevenue, deltaPct: row.revenueDeltaPct })}`}>
                            {comparisonLabel({ currentValue: row.currentRevenue, previousValue: row.previousRevenue, deltaPct: row.revenueDeltaPct })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Capacity & utilization</div>
            <h2 className="mt-1 text-lg font-bold text-[#28231f]">Measured by inventory model confidence</h2>
            <p className="mt-1 text-xs leading-5 text-[#81766c]">Unsupported means the current inventory mapping/model does not allow deterministic utilization for this product.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead className="text-[10px] uppercase tracking-[0.11em] text-[#81766c]">
                  <tr>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Inventory model</th>
                    <th className="py-2 pr-3">Capacity</th>
                    <th className="py-2 pr-3">Peak utilization</th>
                    <th className="py-2 pr-3">Period utilization</th>
                    <th className="py-2 pr-3">Capacity-hit days</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1e8de]">
                  {productSnapshot.utilizationRows.slice(0, 15).map((row: any) => (
                    <tr key={row.productId}>
                      <td className="py-2.5 pr-3 align-top">
                        <div className="font-semibold text-[#2d2a28]">{row.productName}</div>
                        {row.unsupportedReason ? (
                          <div className="text-[11px] text-[#81766c]">{row.unsupportedReason}</div>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 capitalize">{row.inventoryModel}</td>
                      <td className="py-2.5 pr-3">{row.availableCapacity === null ? "Not available" : Number(row.availableCapacity).toFixed(1)}</td>
                      <td className="py-2.5 pr-3">{row.peakUtilizationPct === null ? "Unsupported" : percent(row.peakUtilizationPct)}</td>
                      <td className="py-2.5 pr-3">{row.periodUtilizationPct === null ? "Unsupported" : percent(row.periodUtilizationPct)}</td>
                      <td className="py-2.5 pr-3">
                        {row.capacityHitDays === null
                          ? "Unsupported"
                          : `${row.capacityHitDays} day${row.capacityHitDays === 1 ? "" : "s"}`}
                        {row.highUtilizationDays !== null ? (
                          <div className="text-[10px] text-[#81766c]">{">="}80% on {row.highUtilizationDays} days</div>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${utilizationTone(row.statusKind)}`}>
                          {row.confidence === "unsupported" ? "Unsupported" : row.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Frequently booked together</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Top product combinations</h2>

              <div className="mt-4 space-y-2.5">
                {productSnapshot.combinations.length === 0 ? (
                  <div className="rounded-xl bg-[#faf7f3] px-4 py-5 text-sm text-[#81766c]">No product pair combinations in this period.</div>
                ) : (
                  productSnapshot.combinations.map((row: any, index: number) => (
                    <div key={`${row.productAId}-${row.productBId}`} className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[#2d2a28]">{index + 1}. {row.productAName}</div>
                          <div className="text-sm font-bold text-[#2d2a28]">+ {row.productBName}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs uppercase tracking-[0.12em] text-[#81766c]">Bookings together</div>
                          <div className="text-base font-bold text-[#2d2a28]">{row.bookingCount.toLocaleString("en-US")}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Category mix</div>
              <h2 className="mt-1 text-lg font-bold text-[#28231f]">Revenue by category</h2>

              {productSnapshot.totals.categoryCoverageLimited ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Category analysis is limited: {percent(productSnapshot.totals.uncategorizedRevenueSharePct)} of current product revenue is Uncategorized.
                </div>
              ) : null}

              <div className="mt-4 space-y-2.5">
                {productSnapshot.categories.length === 0 ? (
                  <div className="rounded-xl bg-[#faf7f3] px-4 py-5 text-sm text-[#81766c]">No category activity in this period.</div>
                ) : (
                  productSnapshot.categories.slice(0, 10).map((row: any) => (
                    <div key={row.categoryName} className="rounded-xl border border-[#eee5dc] bg-[#fcfaf7] px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[#2d2a28]">{row.categoryName}</div>
                          <div className="text-[11px] text-[#81766c]">{Math.round(row.rentals).toLocaleString("en-US")} rentals · {row.bookingCount.toLocaleString("en-US")} bookings</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-bold text-[#2d2a28]">{money(row.revenue)}</div>
                          <div className="text-[11px] text-[#81766c]">{percent(row.revenueSharePct)}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#a27742]">Product signals</div>
            <h2 className="mt-1 text-lg font-bold text-[#28231f]">Deterministic management flags</h2>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {productSnapshot.signals.map((signal: any) => {
                const severityClass =
                  signal.severity === "positive"
                    ? "border-emerald-200 bg-emerald-50"
                    : signal.severity === "critical"
                      ? "border-red-200 bg-red-50"
                      : signal.severity === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-[#eee5dc] bg-[#fcfaf7]";

                return (
                  <div key={signal.id} className={`rounded-xl border px-3 py-3 ${severityClass}`}>
                    <div className="text-xs font-bold text-[#2d2a28]">{signal.title}</div>
                    <div className="mt-1 text-[11px] leading-5 text-[#6f655c]">{signal.explanation}</div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
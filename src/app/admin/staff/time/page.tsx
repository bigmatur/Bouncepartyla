import Link from "next/link";

import {
  adminFinishWorkAction,
  adminResumeWorkAction,
  adminSetPayRateAction,
  adminStartBreakAction,
  adminStartWorkAction,
  adminUpdateShiftAction,
  adminAddMissedShiftAction,
  adminReviewBreakPremiumAction,
} from "@/app/admin/staff/time/actions";
import { requireAdminPermission } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

type SearchParams = {
  from?: string;
  to?: string;
  range?: string;
};

type ShiftRow = {
  id: string;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  source: string;
  status: string;
  break_minutes: number;
  paid_minutes: number;
  on_break: boolean;
};

type EmployeeRow = {
  profile_id: string;
  display_name: string;
  role: string;
  pay_type: string;
  hourly_rate: number | null;
  overtime_eligible: boolean;
  paid_minutes: number;
  break_minutes: number;
  regular_minutes: number;
  overtime_minutes: number;
  doubletime_minutes: number;
  estimated_pay: number;
  shift_count: number;
  working_now: boolean;
  on_break: boolean;
  current_clock_in: string | null;
  shifts: ShiftRow[];
};

type PayRateHistoryRow = {
  id: string;
  profile_id: string;
  pay_type: string;
  hourly_rate: number | null;
  overtime_eligible: boolean;
  effective_from: string;
  effective_until: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};


type BreakComplianceDay = {
  work_date: string;
  first_clock_in_at: string | null;
  last_clock_out_at: string | null;
  gross_minutes: number;
  paid_minutes: number;
  unpaid_break_minutes: number;
  paid_break_minutes: number;
  required_meal_periods: number;
  recorded_meal_periods: number;
  required_rest_periods: number;
  recorded_rest_periods: number;
  meal_status: "ok" | "review" | "not_required";
  rest_status: "ok" | "review" | "not_required";
};

type BreakComplianceEmployee = {
  profile_id: string;
  review_days: number;
  meal_review_days: number;
  rest_review_days: number;
  days: BreakComplianceDay[];
};

type BreakComplianceReport = {
  from: string;
  to: string;
  summary: {
    review_days?: number;
    meal_review_days?: number;
    rest_review_days?: number;
  };
  employees: BreakComplianceEmployee[];
};


type BreakPremiumDecision = {
  id: string;
  profile_id: string;
  work_date: string;
  premium_type: "meal" | "rest";
  decision: "no_premium" | "premium_owed";
  reason: string;
  regular_rate_snapshot: number | null;
  premium_amount_snapshot: number | null;
  decided_at: string;
  decided_by_email: string | null;
};

type BreakPremiumHistory = {
  id: string;
  decision_id: string | null;
  profile_id: string;
  work_date: string;
  premium_type: "meal" | "rest";
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  reason: string;
  created_at: string;
  changed_by_email: string | null;
};

type BreakPremiumReport = {
  from: string;
  to: string;
  summary: {
    confirmed_premiums?: number;
    meal_premiums?: number;
    rest_premiums?: number;
    estimated_premium_pay?: number;
    unknown_rate_premiums?: number;
  };
  decisions: BreakPremiumDecision[];
  history: BreakPremiumHistory[];
};

type AdjustmentRow = {
  id: string;
  time_entry_id: string;
  profile_id: string | null;
  employee_name: string;
  adjustment_type: string;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  reason: string;
  changed_by_email: string | null;
  created_at: string;
};

type Report = {
  from: string;
  to: string;
  summary: {
    working_now?: number;
    paid_minutes?: number;
    break_minutes?: number;
    overtime_minutes?: number;
    doubletime_minutes?: number;
    estimated_pay?: number;
    open_shifts?: number;
  };
  employees: EmployeeRow[];
};

function isMissingRpcFunctionError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const combined = `${message} ${details}`;

  return (
    code === "pgrst202" ||
    combined.includes("could not find the function") ||
    combined.includes("schema cache")
  );
}

function isoLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function resolveDates(searchParams?: SearchParams) {
  const today = new Date();
  const range = searchParams?.range || "this_week";

  if (searchParams?.from && searchParams?.to) {
    return {
      range: "custom",
      from: searchParams.from,
      to: searchParams.to,
    };
  }

  if (range === "today") {
    const value = isoLocal(today);
    return { range, from: value, to: value };
  }

  if (range === "last_week") {
    const thisMonday = startOfWeek(today);
    const lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    const lastSunday = new Date(thisMonday);
    lastSunday.setDate(lastSunday.getDate() - 1);
    return {
      range,
      from: isoLocal(lastMonday),
      to: isoLocal(lastSunday),
    };
  }

  if (range === "this_month") {
    return {
      range,
      from: isoLocal(new Date(today.getFullYear(), today.getMonth(), 1)),
      to: isoLocal(today),
    };
  }

  return {
    range: "this_week",
    from: isoLocal(startOfWeek(today)),
    to: isoLocal(today),
  };
}

function duration(minutes: number | null | undefined) {
  const safe = Math.max(0, Math.round(Number(minutes || 0)));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, "0")}m`;
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function timeLabel(value: string | null) {
  if (!value) return "Open";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function dateTimeLabel(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "—";

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function dateTimeLocalValue(value: string | null) {
  if (!value) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const map = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function rangeLink(range: string, label: string, active: string) {
  const selected = range === active;
  return (
    <Link
      href={`/admin/staff/time?range=${range}`}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${
        selected
          ? "bg-[#23313f] text-white"
          : "border border-[#ddd1c3] bg-white text-[#4d453e]"
      }`}
    >
      {label}
    </Link>
  );
}

function hiddenProfile(profileId: string) {
  return <input type="hidden" name="profile_id" value={profileId} />;
}

export default async function WorkingTimePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const { supabase } = await requireAdminPermission("staff.view");
  const dates = resolveDates(searchParams);

  const [result, adjustmentsResult, payRatesResult, complianceResult, premiumResult] = await Promise.all([
    supabase.rpc("get_working_time_admin_report", {
      p_from: dates.from,
      p_to: dates.to,
    }),
    supabase.rpc("get_working_time_adjustments_report", {
      p_from: dates.from,
      p_to: dates.to,
    }),
    supabase.rpc("get_staff_pay_rate_history", {
      p_profile_ids: null,
    }),
    supabase.rpc("get_working_time_break_compliance_report", {
      p_from: dates.from,
      p_to: dates.to,
    }),
    supabase.rpc("get_working_time_break_premium_report", {
      p_from: dates.from,
      p_to: dates.to,
    }),
  ]);

  if (result.error) throw new Error(result.error.message);
  if (adjustmentsResult.error) {
    throw new Error(adjustmentsResult.error.message);
  }
  if (payRatesResult.error) {
    throw new Error(payRatesResult.error.message);
  }
  if (complianceResult.error && !isMissingRpcFunctionError(complianceResult.error)) {
    throw new Error(complianceResult.error.message);
  }
  if (premiumResult.error && !isMissingRpcFunctionError(premiumResult.error)) {
    throw new Error(premiumResult.error.message);
  }

  const report = (result.data || {
    from: dates.from,
    to: dates.to,
    summary: {},
    employees: [],
  }) as Report;

  const summary = report.summary || {};
  const employees = Array.isArray(report.employees)
    ? report.employees
    : [];
  const adjustments = Array.isArray(adjustmentsResult.data)
    ? (adjustmentsResult.data as AdjustmentRow[])
    : [];
  const payRateHistory = Array.isArray(payRatesResult.data)
    ? (payRatesResult.data as PayRateHistoryRow[])
    : [];
  const complianceReport = ((complianceResult.error && isMissingRpcFunctionError(complianceResult.error))
    ? null
    : complianceResult.data) || {
    from: dates.from,
    to: dates.to,
    summary: {},
    employees: [],
  } as BreakComplianceReport;
  const premiumReport = ((premiumResult.error && isMissingRpcFunctionError(premiumResult.error))
    ? null
    : premiumResult.data) || {
    from: dates.from,
    to: dates.to,
    summary: {},
    decisions: [],
    history: [],
  } as BreakPremiumReport;

  const premiumDecisionByKey = new Map<string, BreakPremiumDecision>();
  for (const decision of premiumReport.decisions || []) {
    premiumDecisionByKey.set(
      `${decision.profile_id}:${decision.work_date}:${decision.premium_type}`,
      decision,
    );
  }

  const premiumHistoryByProfile = new Map<string, BreakPremiumHistory[]>();
  for (const item of premiumReport.history || []) {
    const existing = premiumHistoryByProfile.get(item.profile_id) || [];
    existing.push(item);
    premiumHistoryByProfile.set(item.profile_id, existing);
  }

  const complianceByProfile = new Map<string, BreakComplianceEmployee>();

  for (const item of complianceReport.employees || []) {
    complianceByProfile.set(item.profile_id, item);
  }

  const payRatesByProfile = new Map<string, PayRateHistoryRow[]>();

  for (const rate of payRateHistory) {
    const existing = payRatesByProfile.get(rate.profile_id) || [];
    existing.push(rate);
    payRatesByProfile.set(rate.profile_id, existing);
  }

  const adjustmentsByShift = new Map<string, AdjustmentRow[]>();

  for (const adjustment of adjustments) {
    const existing = adjustmentsByShift.get(adjustment.time_entry_id) || [];
    existing.push(adjustment);
    adjustmentsByShift.set(adjustment.time_entry_id, existing);
  }

  return (
    <div className="space-y-4 pb-36 sm:space-y-6 sm:pb-6">
      <section className="rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)] sm:rounded-[28px] sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Staff
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[#1f1e1b] sm:text-3xl">
              Working Time
            </h1>
            <p className="mt-2 hidden max-w-2xl text-sm text-[#70665d] sm:block">
              Employee shifts, breaks, administrator controls, and estimated
              hourly payroll for the selected dates.
            </p>
          </div>

          <form className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
              From
              <input
                className="h-11 rounded-full border border-[#d8ccbd] px-4"
                type="date"
                name="from"
                defaultValue={dates.from}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
              To
              <input
                className="h-11 rounded-full border border-[#d8ccbd] px-4"
                type="date"
                name="to"
                defaultValue={dates.to}
              />
            </label>
            <button className="h-11 rounded-full bg-[#23313f] px-5 text-sm font-semibold text-white">
              Apply
            </button>
          </form>
        </div>

        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mt-5 sm:flex-wrap sm:overflow-visible sm:px-0">
          {rangeLink("today", "Today", dates.range)}
          {rangeLink("this_week", "This week", dates.range)}
          {rangeLink("last_week", "Last week", dates.range)}
          {rangeLink("this_month", "This month", dates.range)}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-7">
        {[
          ["Working now", String(summary.working_now || 0), false],
          ["Needs review", String(Number((summary as any).stale_open_shifts || 0)), Number((summary as any).stale_open_shifts || 0) > 0],
          ["Paid time", duration(summary.paid_minutes), false],
          ["Breaks", duration(summary.break_minutes), false],
          ["Overtime", duration(summary.overtime_minutes), false],
          ["Double time", duration(summary.doubletime_minutes), false],
          ["Estimated payroll", money(summary.estimated_pay), false],
        ].map(([label, value, warning]) => (
          <div
            key={String(label)}
            className={[
              "rounded-[18px] p-3 sm:rounded-[24px] sm:p-5",
              warning ? "border border-amber-200 bg-amber-50" : "bg-white",
            ].join(" ")}
          >
            <div className={[
              "text-[9px] font-semibold uppercase tracking-[0.06em] sm:text-xs sm:tracking-[0.1em]",
              warning ? "text-amber-800" : "text-[#82766b]",
            ].join(" ")}>
              {label}
            </div>
            <div className={[
              "mt-1 text-lg font-semibold sm:mt-2 sm:text-2xl",
              warning ? "text-amber-950" : "",
            ].join(" ")}>
              {value}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-[26px] border border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-800">
              Break compliance review
            </div>
            <h2 className="mt-1 text-lg font-semibold text-[#332a20]">
              {Number(complianceReport.summary?.review_days || 0)} workday(s) may need review
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-amber-900/75">
              This is a recordkeeping check only. Missing break records do not automatically
              create premium pay or prove that a break was not provided.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-white px-3 py-2 font-semibold text-amber-900">
              Meal {Number(complianceReport.summary?.meal_review_days || 0)}
            </span>
            <span className="rounded-full bg-white px-3 py-2 font-semibold text-amber-900">
              Rest {Number(complianceReport.summary?.rest_review_days || 0)}
            </span>
            <span className="rounded-full bg-[#23313f] px-3 py-2 font-semibold text-white">
              Confirmed premium {money(premiumReport.summary?.estimated_premium_pay)}
            </span>
          </div>
        </div>
      </section>

      <details className="overflow-hidden rounded-[26px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.035)]">
        <summary className="cursor-pointer list-none px-3.5 py-3.5 sm:px-5 sm:py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                Audit
              </div>
              <h2 className="mt-1 text-lg font-semibold text-[#211f1c] sm:text-xl">
                Adjustment History
              </h2>
              <p className="mt-1 hidden text-sm text-[#786e65] sm:block">
                All manually added or corrected shifts for the selected dates.
              </p>
            </div>
            <div className="rounded-full bg-[#f5efe8] px-4 py-2 text-sm font-semibold">
              {adjustments.length}
            </div>
          </div>
        </summary>

        <div className="border-t border-[#eee5da]">
          {adjustments.map((adjustment) => (
            <div
              key={adjustment.id}
              className="grid gap-3 border-b border-[#eee5da] px-5 py-4 last:border-b-0 lg:grid-cols-[220px_1fr_240px]"
            >
              <div>
                <div className="font-semibold">{adjustment.employee_name}</div>
                <div className="mt-1 text-xs capitalize text-[#7b7168]">
                  {adjustment.adjustment_type.replace(/_/g, " ")}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-[#332e29]">
                  {adjustment.reason}
                </div>
                <div className="mt-2 text-xs leading-5 text-[#746a61]">
                  Start: {dateTimeLabel(adjustment.old_values?.clock_in_at)}
                  {" → "}
                  {dateTimeLabel(adjustment.new_values?.clock_in_at)}
                  <br />
                  Finish: {dateTimeLabel(adjustment.old_values?.clock_out_at)}
                  {" → "}
                  {dateTimeLabel(adjustment.new_values?.clock_out_at)}
                </div>
              </div>

              <div className="text-xs leading-5 text-[#746a61] lg:text-right">
                {dateTimeLabel(adjustment.created_at)}
                <br />
                Changed by {adjustment.changed_by_email || "Admin"}
              </div>
            </div>
          ))}

          {adjustments.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[#7b7168]">
              No adjustments in this period.
            </div>
          ) : null}
        </div>
      </details>

      <section className="space-y-3">
        {employees.map((employee) => {
          const compliance = complianceByProfile.get(employee.profile_id);
          const staleOpenShiftCount = Number((employee as any).stale_open_shift_count || 0);
          const hasStaleOpenShift = staleOpenShiftCount > 0;
          const status = employee.working_now
            ? employee.on_break
              ? "On break"
              : "Working"
            : hasStaleOpenShift
              ? "Needs review"
              : "Not working";

          return (
            <details
              key={employee.profile_id}
              className="group overflow-hidden rounded-[18px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.035)] sm:rounded-[26px]"
            >
              <summary className="cursor-pointer list-none px-4 py-3.5 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-3 w-3 rounded-full ${
                        employee.working_now
                            ? employee.on_break
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                            : hasStaleOpenShift
                              ? "bg-amber-500"
                              : "bg-[#b8afa5]"
                      }`}
                    />
                    <div>
                      <div className="text-lg font-semibold text-[#211f1c]">
                        {employee.display_name}
                      </div>
                      <div className="text-sm capitalize text-[#786e65]">
                        {String(employee.role || "staff").replace(/_/g, " ")}
                        {" · "}
                        {status}
                        {employee.current_clock_in
                          ? ` since ${timeLabel(employee.current_clock_in)}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4 sm:gap-x-6 sm:text-sm">
                    <div>
                      <div className="text-xs uppercase text-[#8b8075]">
                        Paid
                      </div>
                      <div className="font-semibold">
                        {duration(employee.paid_minutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-[#8b8075]">
                        Overtime
                      </div>
                      <div className="font-semibold">
                        {duration(employee.overtime_minutes)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-[#8b8075]">
                        Rate
                      </div>
                      <div className="font-semibold">
                        {employee.hourly_rate == null
                          ? "Not set"
                          : `${money(employee.hourly_rate)}/hr`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-[#8b8075]">
                        Estimated
                      </div>
                      <div className="font-semibold">
                        {money(employee.estimated_pay)}
                      </div>
                    </div>
                  </div>
                </div>
              </summary>

              <div className="border-t border-[#eee5da] bg-[#fcfaf7] p-2.5 sm:p-5">
                <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {!employee.working_now ? (
                        <form action={adminStartWorkAction}>
                          {hiddenProfile(employee.profile_id)}
                          <button className="rounded-full bg-[#23313f] px-4 py-2 text-sm font-semibold text-white">
                            Start work
                          </button>
                        </form>
                      ) : employee.on_break ? (
                        <form action={adminResumeWorkAction}>
                          {hiddenProfile(employee.profile_id)}
                          <button className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
                            Resume work
                          </button>
                        </form>
                      ) : (
                        <form action={adminStartBreakAction}>
                          {hiddenProfile(employee.profile_id)}
                          <button className="rounded-full border border-[#d8ccbd] bg-white px-4 py-2 text-sm font-semibold">
                            Start break
                          </button>
                        </form>
                      )}

                      {employee.working_now ? (
                        <form action={adminFinishWorkAction}>
                          {hiddenProfile(employee.profile_id)}
                          <button className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white">
                            Finish work
                          </button>
                        </form>
                      ) : null}
                    </div>

                    <details className="rounded-[20px] border border-[#e7ded3] bg-white">
                      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#23313f]">
                        + Add missed shift
                      </summary>
                      <form
                        action={adminAddMissedShiftAction}
                        className="grid gap-3 border-t border-[#eee5da] p-4 md:grid-cols-2"
                      >
                        {hiddenProfile(employee.profile_id)}
                        <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                          Start
                          <input
                            className="h-10 min-w-0 rounded-xl border border-[#d8ccbd] px-2.5 text-sm sm:h-11 sm:px-3"
                            type="datetime-local"
                            name="clock_in_local"
                            required
                          />
                        </label>
                        <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                          Finish
                          <input
                            className="h-10 min-w-0 rounded-xl border border-[#d8ccbd] px-2.5 text-sm sm:h-11 sm:px-3"
                            type="datetime-local"
                            name="clock_out_local"
                            required
                          />
                        </label>
                        <label className="grid gap-1 text-xs font-semibold text-[#6f6358] md:col-span-2">
                          Reason
                          <input
                            className="h-11 rounded-xl border border-[#d8ccbd] px-3"
                            type="text"
                            name="reason"
                            minLength={3}
                            required
                          />
                        </label>
                        <div className="md:col-span-2">
                          <button className="rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white">
                            Add shift
                          </button>
                        </div>
                      </form>
                    </details>

                    {compliance?.days?.length ? (
                      <details className="rounded-[20px] border border-amber-200 bg-amber-50">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-amber-900">
                          Break compliance · {compliance.review_days} day(s) to review
                        </summary>
                        <div className="space-y-2 border-t border-amber-200 p-4">
                          {compliance.days.map((day) => {
                            const needsReview =
                              day.meal_status === "review" || day.rest_status === "review";
                            return (
                              <div
                                key={day.work_date}
                                className={`rounded-2xl border p-3 text-sm ${
                                  needsReview
                                    ? "border-amber-200 bg-white"
                                    : "border-emerald-100 bg-emerald-50"
                                }`}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="font-semibold">{dateLabel(day.work_date)}</div>
                                  <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                    needsReview
                                      ? "bg-amber-100 text-amber-900"
                                      : "bg-emerald-100 text-emerald-800"
                                  }`}>
                                    {needsReview ? "Possible review" : "Recorded breaks look complete"}
                                  </div>
                                </div>
                                <div className="mt-2 grid gap-2 text-xs text-[#675e56] sm:grid-cols-2">
                                  <div>
                                    Meal: {day.recorded_meal_periods}/{day.required_meal_periods} recorded
                                    {day.meal_status === "review" ? " · review" : ""}
                                  </div>
                                  <div>
                                    Rest: {day.recorded_rest_periods}/{day.required_rest_periods} recorded
                                    {day.rest_status === "review" ? " · review" : ""}
                                  </div>
                                  <div>Paid time: {duration(day.paid_minutes)}</div>
                                  <div>Unpaid breaks: {duration(day.unpaid_break_minutes)}</div>
                                </div>

                                {(["meal", "rest"] as const).map((premiumType) => {
                                  const status = premiumType === "meal" ? day.meal_status : day.rest_status;
                                  if (status !== "review") return null;

                                  const decision = premiumDecisionByKey.get(
                                    `${employee.profile_id}:${day.work_date}:${premiumType}`,
                                  );

                                  return (
                                    <div
                                      key={premiumType}
                                      className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-900">
                                          {premiumType} premium review
                                        </div>
                                        {decision ? (
                                          <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                            decision.decision === "premium_owed"
                                              ? "bg-red-100 text-red-800"
                                              : "bg-emerald-100 text-emerald-800"
                                          }`}>
                                            {decision.decision === "premium_owed"
                                              ? `Premium owed · ${money(decision.premium_amount_snapshot)}`
                                              : "Reviewed · no premium"}
                                          </span>
                                        ) : (
                                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                                            Not reviewed
                                          </span>
                                        )}
                                      </div>

                                      {decision ? (
                                        <div className="mt-2 text-xs leading-5 text-[#675e56]">
                                          {decision.reason}
                                          <br />
                                          {dateTimeLabel(decision.decided_at)} · {decision.decided_by_email || "Admin"}
                                          {decision.decision === "premium_owed" && decision.regular_rate_snapshot == null
                                            ? " · hourly rate missing"
                                            : ""}
                                        </div>
                                      ) : null}

                                      <form
                                        action={adminReviewBreakPremiumAction}
                                        className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
                                      >
                                        {hiddenProfile(employee.profile_id)}
                                        <input type="hidden" name="work_date" value={day.work_date} />
                                        <input type="hidden" name="premium_type" value={premiumType} />
                                        <input
                                          className="h-10 rounded-xl border border-[#d8ccbd] bg-white px-3 text-xs"
                                          type="text"
                                          name="reason"
                                          minLength={3}
                                          placeholder="Reason / review note"
                                          required
                                        />
                                        <button
                                          name="decision"
                                          value="no_premium"
                                          className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800"
                                        >
                                          No premium
                                        </button>
                                        <button
                                          name="decision"
                                          value="premium_owed"
                                          className="rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold text-white"
                                        >
                                          Premium owed
                                        </button>
                                      </form>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}

                    {(premiumHistoryByProfile.get(employee.profile_id) || []).length ? (
                      <details className="rounded-[20px] border border-[#e7ded3] bg-white">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#23313f]">
                          Break premium history ({(premiumHistoryByProfile.get(employee.profile_id) || []).length})
                        </summary>
                        <div className="divide-y divide-[#eee5da] border-t border-[#eee5da]">
                          {(premiumHistoryByProfile.get(employee.profile_id) || []).map((item) => (
                            <div key={item.id} className="px-4 py-3 text-xs leading-5 text-[#675e56]">
                              <div className="font-semibold capitalize text-[#302b27]">
                                {dateLabel(item.work_date)} · {item.premium_type} · {String(item.new_values?.decision || "review").replace(/_/g, " ")}
                              </div>
                              <div>{item.reason}</div>
                              <div className="text-[#8b8075]">
                                {dateTimeLabel(item.created_at)} · {item.changed_by_email || "Admin"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}

                    <div className="space-y-2 md:hidden">
                      {(employee.shifts || []).map((shift) => {
                        const shiftNeedsReview = Boolean((shift as any).needs_review);
                        return (
                          <details
                            key={`mobile-${shift.id}`}
                            open={shiftNeedsReview}
                            className={[
                              "overflow-hidden rounded-2xl border",
                              shiftNeedsReview ? "border-amber-200 bg-amber-50/70" : "border-[#e7ded3] bg-white",
                            ].join(" ")}
                          >
                            <summary className="cursor-pointer list-none p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-[#211f1c]">{dateLabel(shift.work_date)}</div>
                                  <div className="mt-1 text-xs text-[#786e65]">
                                    {timeLabel(shift.clock_in_at)} {" → "} {timeLabel(shift.clock_out_at)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-semibold">{duration(shift.paid_minutes)}</div>
                                  <div className="mt-1 text-[9px] uppercase tracking-[0.06em] text-[#8b8075]">
                                    {String(shift.source || "manual").replace(/_/g, " ")}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#786e65]">
                                <span>Break {duration(shift.break_minutes)}</span>
                                {shiftNeedsReview ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold uppercase text-amber-900">
                                    Needs review
                                  </span>
                                ) : null}
                              </div>
                            </summary>
                            <div className="border-t border-[#eee5da] p-3">
                              {shiftNeedsReview ? (
                                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                                  Open more than 24 hours. Excluded from payroll until corrected.
                                </div>
                              ) : null}
                              <form action={adminUpdateShiftAction} className="grid gap-2">
                                <input type="hidden" name="time_entry_id" value={shift.id} />
                                <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                                  Start
                                  <input className="h-11 rounded-xl border border-[#d8ccbd] bg-white px-3" type="datetime-local" name="clock_in_local" defaultValue={dateTimeLocalValue(shift.clock_in_at)} required />
                                </label>
                                <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                                  Finish
                                  <input className="h-11 rounded-xl border border-[#d8ccbd] bg-white px-3" type="datetime-local" name="clock_out_local" defaultValue={dateTimeLocalValue(shift.clock_out_at)} />
                                </label>
                                <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                                  Reason
                                  <input className="h-11 rounded-xl border border-[#d8ccbd] bg-white px-3" type="text" name="reason" minLength={3} required />
                                </label>
                                <button className="mt-1 rounded-xl bg-[#23313f] px-4 py-3 text-sm font-semibold text-white">
                                  Save correction
                                </button>
                              </form>
                            </div>
                          </details>
                        );
                      })}
                      {(employee.shifts || []).length === 0 ? (
                        <div className="rounded-2xl border border-[#e7ded3] bg-white px-4 py-8 text-center text-sm text-[#7b7168]">
                          No shifts in this period.
                        </div>
                      ) : null}
                    </div>

                    <div className="hidden overflow-hidden rounded-[20px] border border-[#e7ded3] bg-white md:block">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-[#f5efe8] text-xs uppercase tracking-[0.08em] text-[#786e65]">
                            <tr>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Start</th>
                              <th className="px-4 py-3">Finish</th>
                              <th className="px-4 py-3">Break</th>
                              <th className="px-4 py-3">Paid</th>
                              <th className="px-4 py-3">Source</th>
                              <th className="px-4 py-3">Correction</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#eee5da]">
                            {(employee.shifts || []).map((shift) => (
                              <tr key={shift.id}>
                                <td className="px-4 py-3 font-semibold">
                                  {dateLabel(shift.work_date)}
                                </td>
                                <td className="px-4 py-3">
                                  {timeLabel(shift.clock_in_at)}
                                </td>
                                <td className="px-4 py-3">
                                  {timeLabel(shift.clock_out_at)}
                                </td>
                                <td className="px-4 py-3">
                                  {duration(shift.break_minutes)}
                                </td>
                                <td className="px-4 py-3 font-semibold">
                                  {duration(shift.paid_minutes)}
                                </td>
                                <td className="px-4 py-3 capitalize">
                                  {String(shift.source || "manual").replace(
                                    /_/g,
                                    " ",
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <details className="min-w-[290px]">
                                    <summary className="cursor-pointer text-sm font-semibold text-[#23313f]">
                                      Edit / history
                                      {adjustmentsByShift.get(shift.id)?.length
                                        ? ` (${adjustmentsByShift.get(shift.id)?.length})`
                                        : ""}
                                    </summary>

                                    <div className="mt-3 space-y-3">
                                      <form
                                        action={adminUpdateShiftAction}
                                        className="grid gap-2 rounded-2xl border border-[#e7ded3] bg-[#fcfaf7] p-3"
                                      >
                                        <input
                                          type="hidden"
                                          name="time_entry_id"
                                          value={shift.id}
                                        />
                                        <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                                          Start
                                          <input
                                            className="h-10 rounded-xl border border-[#d8ccbd] px-3"
                                            type="datetime-local"
                                            name="clock_in_local"
                                            defaultValue={dateTimeLocalValue(
                                              shift.clock_in_at,
                                            )}
                                            required
                                          />
                                        </label>
                                        <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                                          Finish
                                          <input
                                            className="h-10 rounded-xl border border-[#d8ccbd] px-3"
                                            type="datetime-local"
                                            name="clock_out_local"
                                            defaultValue={dateTimeLocalValue(
                                              shift.clock_out_at,
                                            )}
                                          />
                                        </label>
                                        <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                                          Reason for change
                                          <input
                                            className="h-10 rounded-xl border border-[#d8ccbd] px-3"
                                            type="text"
                                            name="reason"
                                            minLength={3}
                                            required
                                          />
                                        </label>
                                        <button className="rounded-xl bg-[#23313f] px-3 py-2 text-xs font-semibold text-white">
                                          Save correction
                                        </button>
                                      </form>

                                      {(adjustmentsByShift.get(shift.id) || []).map(
                                        (adjustment) => (
                                          <div
                                            key={adjustment.id}
                                            className="rounded-2xl bg-[#f7f2eb] p-3 text-xs leading-5 text-[#675e56]"
                                          >
                                            <div className="font-semibold text-[#302b27]">
                                              {adjustment.reason}
                                            </div>
                                            <div className="mt-1">
                                              {dateTimeLabel(adjustment.created_at)}
                                              {" · "}
                                              {adjustment.changed_by_email || "Admin"}
                                            </div>
                                            <div className="mt-1">
                                              Start:{" "}
                                              {dateTimeLabel(
                                                adjustment.old_values?.clock_in_at,
                                              )}
                                              {" → "}
                                              {dateTimeLabel(
                                                adjustment.new_values?.clock_in_at,
                                              )}
                                            </div>
                                            <div>
                                              Finish:{" "}
                                              {dateTimeLabel(
                                                adjustment.old_values?.clock_out_at,
                                              )}
                                              {" → "}
                                              {dateTimeLabel(
                                                adjustment.new_values?.clock_out_at,
                                              )}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  </details>
                                </td>
                              </tr>
                            ))}
                            {(employee.shifts || []).length === 0 ? (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-4 py-8 text-center text-[#7b7168]"
                                >
                                  No shifts in this period.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <details className="rounded-[18px] border border-[#e7ded3] bg-white xl:hidden">


                    <summary className="cursor-pointer list-none px-4 py-3.5">


                      <div className="flex items-center justify-between gap-3">


                        <div>


                          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a723e]">Compensation</div>


                          <div className="mt-1 text-base font-semibold text-[#211f1c]">


                            {employee.hourly_rate == null ? "Rate not set" : `${money(employee.hourly_rate)}/hr`}


                          </div>


                        </div>


                        <span className="text-xs font-semibold text-[#786e65]">Open</span>


                      </div>


                    </summary>


                    <div className="border-t border-[#eee5da] p-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                      Compensation
                    </div>
                    <h3 className="mt-1 text-lg font-semibold">
                      Hourly rate
                    </h3>

                    <form
                      action={adminSetPayRateAction}
                      className="mt-4 space-y-3"
                    >
                      {hiddenProfile(employee.profile_id)}
                      <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                        Rate per hour
                        <input
                          className="h-11 rounded-xl border border-[#d8ccbd] px-3"
                          type="number"
                          name="hourly_rate"
                          min="0"
                          step="0.01"
                          defaultValue={employee.hourly_rate ?? ""}
                          required
                        />
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                        Effective from
                        <input
                          className="h-11 rounded-xl border border-[#d8ccbd] px-3"
                          type="date"
                          name="effective_from"
                          defaultValue={dates.from}
                        />
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="overtime_eligible"
                          defaultChecked={employee.overtime_eligible}
                        />
                        Overtime eligible
                      </label>

                      <button className="w-full rounded-xl bg-[#23313f] px-4 py-3 text-sm font-semibold text-white">
                        Save rate
                      </button>
                    </form>

                    <details className="mt-4 overflow-hidden rounded-xl border border-[#e7ded3] bg-white">
                      <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-[#23313f]">
                        Rate history ({(payRatesByProfile.get(employee.profile_id) || []).length})
                      </summary>
                      <div className="border-t border-[#eee5da]">
                        {(payRatesByProfile.get(employee.profile_id) || []).map(
                          (rate) => (
                            <div
                              key={rate.id}
                              className="border-b border-[#eee5da] px-3 py-3 text-xs last:border-b-0"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-[#332e29]">
                                    {rate.hourly_rate == null
                                      ? rate.pay_type
                                      : `${money(rate.hourly_rate)}/hr`}
                                  </div>
                                  <div className="mt-1 text-[#746a61]">
                                    {dateLabel(rate.effective_from)}
                                    {rate.effective_until
                                      ? ` – ${dateLabel(rate.effective_until)}`
                                      : " – Current"}
                                  </div>
                                </div>
                                <div className="rounded-full bg-[#f7f2eb] px-2 py-1 text-[11px] font-semibold text-[#6f6358]">
                                  {rate.overtime_eligible ? "OT eligible" : "No OT"}
                                </div>
                              </div>
                              <div className="mt-2 text-[#8b8075]">
                                Saved {dateTimeLabel(rate.created_at)}
                                {rate.created_by_email
                                  ? ` by ${rate.created_by_email}`
                                  : ""}
                              </div>
                            </div>
                          ),
                        )}
                        {(payRatesByProfile.get(employee.profile_id) || [])
                          .length === 0 ? (
                          <div className="px-3 py-4 text-xs text-[#7b7168]">
                            No rate history yet.
                          </div>
                        ) : null}
                      </div>
                    </details>

                    <div className="mt-4 rounded-xl bg-[#f7f2eb] p-3 text-xs leading-5 text-[#6f6358]">
                      Estimated payroll uses daily regular, overtime, and
                      double-time buckets. It is an operational estimate, not
                      a finalized payroll statement.
                    </div>
                  


                    </div>


                  </details>


                  <aside className="hidden rounded-[20px] border border-[#e7ded3] bg-white p-4 xl:block">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                      Compensation
                    </div>
                    <h3 className="mt-1 text-lg font-semibold">
                      Hourly rate
                    </h3>

                    <form
                      action={adminSetPayRateAction}
                      className="mt-4 space-y-3"
                    >
                      {hiddenProfile(employee.profile_id)}
                      <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                        Rate per hour
                        <input
                          className="h-11 rounded-xl border border-[#d8ccbd] px-3"
                          type="number"
                          name="hourly_rate"
                          min="0"
                          step="0.01"
                          defaultValue={employee.hourly_rate ?? ""}
                          required
                        />
                      </label>

                      <label className="grid gap-1 text-xs font-semibold text-[#6f6358]">
                        Effective from
                        <input
                          className="h-11 rounded-xl border border-[#d8ccbd] px-3"
                          type="date"
                          name="effective_from"
                          defaultValue={dates.from}
                        />
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="overtime_eligible"
                          defaultChecked={employee.overtime_eligible}
                        />
                        Overtime eligible
                      </label>

                      <button className="w-full rounded-xl bg-[#23313f] px-4 py-3 text-sm font-semibold text-white">
                        Save rate
                      </button>
                    </form>

                    <details className="mt-4 overflow-hidden rounded-xl border border-[#e7ded3] bg-white">
                      <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-[#23313f]">
                        Rate history ({(payRatesByProfile.get(employee.profile_id) || []).length})
                      </summary>
                      <div className="border-t border-[#eee5da]">
                        {(payRatesByProfile.get(employee.profile_id) || []).map(
                          (rate) => (
                            <div
                              key={rate.id}
                              className="border-b border-[#eee5da] px-3 py-3 text-xs last:border-b-0"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-semibold text-[#332e29]">
                                    {rate.hourly_rate == null
                                      ? rate.pay_type
                                      : `${money(rate.hourly_rate)}/hr`}
                                  </div>
                                  <div className="mt-1 text-[#746a61]">
                                    {dateLabel(rate.effective_from)}
                                    {rate.effective_until
                                      ? ` – ${dateLabel(rate.effective_until)}`
                                      : " – Current"}
                                  </div>
                                </div>
                                <div className="rounded-full bg-[#f7f2eb] px-2 py-1 text-[11px] font-semibold text-[#6f6358]">
                                  {rate.overtime_eligible ? "OT eligible" : "No OT"}
                                </div>
                              </div>
                              <div className="mt-2 text-[#8b8075]">
                                Saved {dateTimeLabel(rate.created_at)}
                                {rate.created_by_email
                                  ? ` by ${rate.created_by_email}`
                                  : ""}
                              </div>
                            </div>
                          ),
                        )}
                        {(payRatesByProfile.get(employee.profile_id) || [])
                          .length === 0 ? (
                          <div className="px-3 py-4 text-xs text-[#7b7168]">
                            No rate history yet.
                          </div>
                        ) : null}
                      </div>
                    </details>

                    <div className="mt-4 rounded-xl bg-[#f7f2eb] p-3 text-xs leading-5 text-[#6f6358]">
                      Estimated payroll uses daily regular, overtime, and
                      double-time buckets. It is an operational estimate, not
                      a finalized payroll statement.
                    </div>
                  


                  </aside>
                </div>
              </div>
            </details>
          );
        })}

        {employees.length === 0 ? (
          <div className="rounded-[26px] bg-white px-6 py-12 text-center text-[#7b7168]">
            No active employees were found.
          </div>
        ) : null}
      </section>
    </div>
  );
}

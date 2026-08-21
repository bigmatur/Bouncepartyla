import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/auth/require-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmployeeRow = {
  profile_id: string;
  display_name: string;
  role: string;
  hourly_rate: number | null;
  paid_minutes: number;
  break_minutes: number;
  regular_minutes: number;
  overtime_minutes: number;
  doubletime_minutes: number;
  estimated_pay: number;
};

type AdminReport = {
  employees?: EmployeeRow[];
};

type PremiumDecision = {
  profile_id: string;
  decision: "no_premium" | "premium_owed";
  premium_amount_snapshot: number | null;
};

type PremiumReport = {
  decisions?: PremiumDecision[];
};

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function number(value: unknown) {
  const result = Number(value || 0);
  return Number.isFinite(result) ? result : 0;
}

function hours(minutes: unknown) {
  return (number(minutes) / 60).toFixed(2);
}

function money(value: unknown) {
  return number(value).toFixed(2);
}

export async function GET(request: Request) {
  const { supabase } = await requireAdminPermission("staff.view");
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!validDate(from) || !validDate(to)) {
    return NextResponse.json(
      { error: "Valid from/to dates are required." },
      { status: 400 },
    );
  }

  const [reportResult, premiumResult] = await Promise.all([
    supabase.rpc("get_working_time_admin_report", {
      p_from: from,
      p_to: to,
    }),
    supabase.rpc("get_working_time_break_premium_report", {
      p_from: from,
      p_to: to,
    }),
  ]);

  if (reportResult.error) {
    return NextResponse.json({ error: reportResult.error.message }, { status: 500 });
  }
  if (premiumResult.error) {
    return NextResponse.json({ error: premiumResult.error.message }, { status: 500 });
  }

  const report = (reportResult.data || {}) as AdminReport;
  const premiumReport = (premiumResult.data || {}) as PremiumReport;
  const premiumByProfile = new Map<string, number>();

  for (const decision of premiumReport.decisions || []) {
    if (decision.decision !== "premium_owed") continue;
    premiumByProfile.set(
      decision.profile_id,
      number(premiumByProfile.get(decision.profile_id)) + number(decision.premium_amount_snapshot),
    );
  }

  const header = [
    "Employee",
    "Role",
    "Hourly Rate",
    "Paid Hours",
    "Break Hours",
    "Regular Hours",
    "OT Hours",
    "Double Time Hours",
    "Base Estimated Pay",
    "Confirmed Meal/Rest Premiums",
    "Estimated Gross Pay",
    "Rate Missing",
  ];

  const rows = [header.map(csvCell).join(",")];

  for (const employee of report.employees || []) {
    const premiumPay = number(premiumByProfile.get(employee.profile_id));
    const basePay = number(employee.estimated_pay);
    const grossPay = basePay + premiumPay;
    const missingRate = employee.hourly_rate == null && number(employee.paid_minutes) > 0;

    rows.push(
      [
        employee.display_name,
        employee.role,
        employee.hourly_rate == null ? "" : money(employee.hourly_rate),
        hours(employee.paid_minutes),
        hours(employee.break_minutes),
        hours(employee.regular_minutes),
        hours(employee.overtime_minutes),
        hours(employee.doubletime_minutes),
        money(basePay),
        money(premiumPay),
        money(grossPay),
        missingRate ? "YES" : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  const csv = `\uFEFF${rows.join("\n")}`;
  const filename = `working-time-payroll-${from}_to_${to}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "no-store",
    },
  });
}

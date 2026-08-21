import { NextResponse } from "next/server";
import { getUnifiedAccess, isStaffRole } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import {
  formatSalesTaxDate,
  formatSalesTaxPercent,
  loadSalesTaxReportData,
  resolveSalesTaxRange,
} from "../sales-tax-report";

export const runtime = "nodejs";

function formatMoney(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function escapeCsvCell(value: string) {
  const input = String(value || "");
  return `"${input.replace(/"/g, '""')}"`;
}

function buildCsv(rows: any[]) {
  const header = [
    "Name customer",
    "date",
    "address",
    "city",
    "county",
    "Cashless payment",
    "cash",
    "%tax",
    "total tax",
  ];

  const lines = [header.map(escapeCsvCell).join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.customerName,
        formatSalesTaxDate(row.eventDate),
        row.address,
        row.city,
        row.county,
        formatMoney(row.cashlessPayment),
        formatMoney(row.cash),
        formatSalesTaxPercent(row.taxRatePercent),
        formatMoney(row.totalTax),
      ]
        .map((cell) => escapeCsvCell(String(cell || "")))
        .join(",")
    );
  }

  return `\uFEFF${lines.join("\n")}`;
}

function buildExcelTsv(rows: any[]) {
  const header = [
    "Name customer",
    "date",
    "address",
    "city",
    "county",
    "Cashless payment",
    "cash",
    "%tax",
    "total tax",
  ];

  const lines = [header.join("\t")];

  for (const row of rows) {
    lines.push(
      [
        row.customerName,
        formatSalesTaxDate(row.eventDate),
        row.address,
        row.city,
        row.county,
        formatMoney(row.cashlessPayment),
        formatMoney(row.cash),
        formatSalesTaxPercent(row.taxRatePercent),
        formatMoney(row.totalTax),
      ]
        .map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " "))
        .join("\t")
    );
  }

  return `\uFEFF${lines.join("\n")}`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user || !access.isActive || !isStaffRole(access.role) || !access.can("reports.view")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const range = resolveSalesTaxRange({
    from: searchParams.get("from") || undefined,
    to: searchParams.get("to") || undefined,
  });

  const format = String(searchParams.get("format") || "csv").toLowerCase();

  const report = await loadSalesTaxReportData({
    supabase,
    from: range.from,
    to: range.to,
  });

  const fileBase = `sales-tax-${range.from}_to_${range.to}`;

  if (format === "excel" || format === "xls") {
    const tsv = buildExcelTsv(report.rows);

    return new NextResponse(tsv, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"${fileBase}.xls\"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const csv = buildCsv(report.rows);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${fileBase}.csv\"`,
      "Cache-Control": "no-store",
    },
  });
}

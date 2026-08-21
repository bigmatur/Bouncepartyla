import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  formatSalesTaxDate,
  formatSalesTaxPercent,
  loadSalesTaxReportData,
  resolveSalesTaxRange,
} from "./sales-tax-report";

function formatMoney(value: number | string | null | undefined) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numberValue);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  if (!status) return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";

  if (["confirmed", "paid", "completed", "available", "returned"].includes(status)) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (["pending", "draft", "reserved", "picked", "loaded", "installed"].includes(status)) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (["cancelled", "canceled", "damaged", "lost", "retired"].includes(status)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
}

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "green" | "red" | "blue" | "gold";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "blue"
          ? "text-[#355879]"
          : tone === "gold"
            ? "text-[#9a723e]"
            : "text-[#1f1e1b]";

  return (
    <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
        {label}
      </div>

      <div className={`mt-1.5 break-words text-xl font-bold leading-tight sm:mt-2 sm:text-3xl sm:font-semibold ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

export default async function ReportsPage(props: {
  searchParams?: Promise<{
    from?: string;
    to?: string;
  }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const { supabase } = await requireAdminPermission("reports.view");
  const salesTaxRange = resolveSalesTaxRange(searchParams);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const next30 = new Date(today);
  next30.setDate(today.getDate() + 30);
  const next30Iso = next30.toISOString().slice(0, 10);

  const [
    salesTaxReport,
    bookingsResult,
    upcomingBookingsResult,
    customersResult,
    inventoryItemsResult,
    unitsResult,
    movementsResult,
    reservationsResult,
  ] = await Promise.all([
    loadSalesTaxReportData({
      supabase,
      from: salesTaxRange.from,
      to: salesTaxRange.to,
    }),

    supabase
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        status,
        event_date,
        subtotal,
        delivery_fee,
        tax_amount,
        total_amount,
        deposit_amount,
        balance_due,
        setup_city,
        setup_zip,
        customers (
          id,
          full_name
        )
      `
      )
      .gte("event_date", monthStart)
      .order("event_date", { ascending: false })
      .limit(250),

    supabase
      .from("bookings")
      .select(
        `
        id,
        booking_number,
        status,
        event_date,
        total_amount,
        balance_due,
        setup_city,
        setup_zip,
        customers (
          id,
          full_name
        )
      `
      )
      .gte("event_date", todayIso)
      .lte("event_date", next30Iso)
      .order("event_date", { ascending: true })
      .limit(12),

    supabase.from("customers").select("id"),

    supabase
      .from("inventory_items")
      .select(
        `
        id,
        name,
        sku,
        tracking_type,
        quantity_on_hand,
        quantity_available,
        reorder_point,
        active
      `
      )
      .eq("active", true)
      .order("name", { ascending: true }),

    supabase
      .from("inventory_units")
      .select("id, status, inventory_item_id"),

    supabase
      .from("inventory_movements")
      .select(
        `
        id,
        movement_type,
        quantity,
        created_at,
        inventory_items (
          id,
          name
        ),
        inventory_units (
          id,
          unit_code
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(12),

    supabase
      .from("inventory_reservations")
      .select("id, status, returned_at")
      .is("returned_at", null),
  ]);

  if (bookingsResult.error) throw new Error(bookingsResult.error.message);
  if (upcomingBookingsResult.error) throw new Error(upcomingBookingsResult.error.message);
  if (customersResult.error) throw new Error(customersResult.error.message);
  if (inventoryItemsResult.error) throw new Error(inventoryItemsResult.error.message);
  if (unitsResult.error) throw new Error(unitsResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);
  if (reservationsResult.error) throw new Error(reservationsResult.error.message);

  const bookings = bookingsResult.data || [];
  const upcomingBookings = upcomingBookingsResult.data || [];
  const customers = customersResult.data || [];
  const inventoryItems = inventoryItemsResult.data || [];
  const units = unitsResult.data || [];
  const movements = movementsResult.data || [];
  const reservations = reservationsResult.data || [];

  const revenue = bookings.reduce(
    (sum: number, booking: any) => sum + Number(booking.total_amount || 0),
    0
  );

  const balanceDue = bookings.reduce(
    (sum: number, booking: any) => sum + Number(booking.balance_due || 0),
    0
  );

  const deposits = bookings.reduce(
    (sum: number, booking: any) => sum + Number(booking.deposit_amount || 0),
    0
  );

  const confirmedBookings = bookings.filter((booking: any) =>
    ["confirmed", "paid", "completed"].includes(booking.status)
  );

  const pendingBookings = bookings.filter((booking: any) =>
    ["pending", "draft"].includes(booking.status)
  );

  const cancelledBookings = bookings.filter((booking: any) =>
    ["cancelled", "canceled"].includes(booking.status)
  );

  const availableUnits = units.filter((unit: any) =>
    ["available", "returned"].includes(unit.status)
  );

  const outUnits = units.filter((unit: any) =>
    ["reserved", "picked", "loaded", "installed"].includes(unit.status)
  );

  const problemUnits = units.filter((unit: any) =>
    ["cleaning", "maintenance", "damaged", "lost", "retired"].includes(unit.status)
  );

  const lowStockItems = inventoryItems.filter((item: any) => {
    if (!["quantity", "consumable"].includes(item.tracking_type)) return false;

    return Number(item.quantity_available || 0) <= Number(item.reorder_point || 0);
  });

  const reservationStatusCounts = {
    reserved: reservations.filter((row: any) => row.status === "reserved").length,
    picked: reservations.filter((row: any) => row.status === "picked").length,
    loaded: reservations.filter((row: any) => row.status === "loaded").length,
    installed: reservations.filter((row: any) => row.status === "installed").length,
  };

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white px-4 py-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:px-6 sm:py-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a723e] sm:text-xs sm:font-semibold">
              Business overview
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Reports
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Быстрый обзор бронирований, денег, склада, активных резервов и
              проблемных позиций.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/admin/bookings"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Bookings
            </a>

            <a
              href="/admin/inventory"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#23313f] px-3 text-center text-xs font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Inventory
            </a>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Month revenue" value={formatMoney(revenue)} tone="green" />
        <StatCard label="Balance due" value={formatMoney(balanceDue)} tone="red" />
        <StatCard label="Deposits" value={formatMoney(deposits)} tone="gold" />
        <StatCard label="Bookings this month" value={bookings.length} />
        <div className="col-span-2 md:col-span-1">
          <StatCard label="Customers" value={customers.length} tone="blue" />
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Sales Tax report
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
                Cashless payment includes all methods except cash.
              </p>
            </div>

            <form method="get" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  From
                </span>
                <input
                  type="date"
                  name="from"
                  defaultValue={salesTaxRange.from}
                  className="h-11 w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-2.5 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-3 sm:text-sm"
                />
              </label>

              <label className="block min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
                  To
                </span>
                <input
                  type="date"
                  name="to"
                  defaultValue={salesTaxRange.to}
                  className="h-11 w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-2.5 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-3 sm:text-sm"
                />
              </label>

              <div className="col-span-2 flex items-end sm:col-span-1">
                <button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-[#23313f] px-4 text-xs font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:text-sm sm:font-semibold"
                >
                  Apply dates
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0 rounded-xl bg-[#fcfaf7] px-2.5 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49] sm:text-xs sm:font-semibold sm:tracking-[0.12em]">
                Cashless
              </div>
              <div className="mt-1 break-words text-sm font-bold leading-tight text-[#1f1e1b] sm:text-lg sm:font-semibold">
                {formatMoney(salesTaxReport.totals.cashlessPayment)}
              </div>
            </div>

            <div className="min-w-0 rounded-xl bg-[#fcfaf7] px-2.5 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49] sm:text-xs sm:font-semibold sm:tracking-[0.12em]">
                Cash
              </div>
              <div className="mt-1 break-words text-sm font-bold leading-tight text-[#1f1e1b] sm:text-lg sm:font-semibold">
                {formatMoney(salesTaxReport.totals.cash)}
              </div>
            </div>

            <div className="min-w-0 rounded-xl bg-[#fcfaf7] px-2.5 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49] sm:text-xs sm:font-semibold sm:tracking-[0.12em]">
                Total tax
              </div>
              <div className="mt-1 break-words text-sm font-bold leading-tight text-[#1f1e1b] sm:text-lg sm:font-semibold">
                {formatMoney(salesTaxReport.totals.totalTax)}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
            <a
              href={`/admin/reports/sales-tax-export?from=${encodeURIComponent(
                salesTaxRange.from
              )}&to=${encodeURIComponent(salesTaxRange.to)}&format=csv`}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-2 sm:text-sm sm:font-semibold"
            >
              Download CSV
            </a>

            <a
              href={`/admin/reports/sales-tax-export?from=${encodeURIComponent(
                salesTaxRange.from
              )}&to=${encodeURIComponent(salesTaxRange.to)}&format=excel`}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#23313f] px-3 text-center text-xs font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-2 sm:text-sm sm:font-semibold"
            >
              Download Excel
            </a>
          </div>
        </div>

        <div className="grid gap-2.5 p-3.5 sm:hidden">
          {salesTaxReport.rows.map((row) => (
            <div
              key={row.bookingId}
              className="rounded-[16px] border border-[#eee5d9] bg-[#fcfaf7] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-[#1f1e1b]">
                    {row.customerName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#6c6258]">
                    {formatSalesTaxDate(row.eventDate)}
                  </div>
                </div>

                <div className="shrink-0 rounded-xl bg-white px-2.5 py-2 text-right ring-1 ring-[#eee5d9]">
                  <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                    Tax
                  </div>
                  <div className="mt-0.5 text-xs font-bold text-[#1f1e1b]">
                    {formatMoney(row.totalTax)}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 text-[11px] leading-4 text-[#6c6258]">
                <div className="truncate">{row.address}</div>
                <div>{row.city} · {row.county}</div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                  <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                    Cashless
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#1f1e1b]">
                    {formatMoney(row.cashlessPayment)}
                  </div>
                </div>

                <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                  <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                    Cash
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#1f1e1b]">
                    {formatMoney(row.cash)}
                  </div>
                </div>

                <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                  <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                    Rate
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-[#1f1e1b]">
                    {formatSalesTaxPercent(row.taxRatePercent)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {salesTaxReport.rows.length === 0 && (
            <div className="rounded-[16px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-4 py-10 text-center">
              <div className="text-base font-bold text-[#1f1e1b]">
                No sales tax rows
              </div>
              <p className="mt-1 text-xs leading-5 text-[#6c6258]">
                No taxable bookings were found for the selected date range.
              </p>
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#eee5d9] bg-[#fcfaf7] text-left text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                <th className="px-5 py-4">Name customer</th>
                <th className="px-5 py-4">date</th>
                <th className="px-5 py-4">address</th>
                <th className="px-5 py-4">city</th>
                <th className="px-5 py-4">county</th>
                <th className="px-5 py-4 text-right">Cashless payment</th>
                <th className="px-5 py-4 text-right">cash</th>
                <th className="px-5 py-4 text-right">%tax</th>
                <th className="px-5 py-4 text-right">total tax</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#f0e7dc]">
              {salesTaxReport.rows.map((row) => (
                <tr key={row.bookingId} className="hover:bg-[#fcfaf7]">
                  <td className="px-5 py-4 font-semibold text-[#1f1e1b]">{row.customerName}</td>
                  <td className="px-5 py-4 text-[#6c6258]">{formatSalesTaxDate(row.eventDate)}</td>
                  <td className="px-5 py-4 text-[#6c6258]">{row.address}</td>
                  <td className="px-5 py-4 text-[#6c6258]">{row.city}</td>
                  <td className="px-5 py-4 text-[#6c6258]">{row.county}</td>
                  <td className="px-5 py-4 text-right font-semibold text-[#1f1e1b]">
                    {formatMoney(row.cashlessPayment)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-[#1f1e1b]">
                    {formatMoney(row.cash)}
                  </td>
                  <td className="px-5 py-4 text-right text-[#6c6258]">
                    {formatSalesTaxPercent(row.taxRatePercent)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold text-[#1f1e1b]">
                    {formatMoney(row.totalTax)}
                  </td>
                </tr>
              ))}

              {salesTaxReport.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-14 text-center">
                    <div className="text-lg font-semibold text-[#1f1e1b]">No sales tax rows</div>
                    <p className="mt-2 text-sm text-[#6c6258]">
                      No taxable bookings were found for the selected date range.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        <StatCard label="Confirmed" value={confirmedBookings.length} tone="green" />
        <StatCard label="Pending / draft" value={pendingBookings.length} tone="gold" />
        <StatCard label="Cancelled" value={cancelledBookings.length} tone="red" />
        <StatCard label="Upcoming 30 days" value={upcomingBookings.length} tone="blue" />
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 space-y-4 sm:space-y-6">
          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Upcoming bookings
              </h3>

              <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
                Ближайшие заказы на следующие 30 дней.
              </p>
            </div>

            <div className="grid gap-2.5 p-3.5 sm:hidden">
              {upcomingBookings.map((booking: any) => {
                const customer = Array.isArray(booking.customers)
                  ? booking.customers[0]
                  : booking.customers;

                return (
                  <a
                    key={booking.id}
                    href={`/admin/bookings/${booking.id}`}
                    className="rounded-[16px] border border-[#eee5d9] bg-[#fcfaf7] p-3 transition hover:bg-[#f8f4ee]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#1f1e1b]">
                          #{booking.booking_number || booking.id.slice(0, 8)}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[#6c6258]">
                          {customer?.full_name || "—"}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClass(
                          booking.status
                        )}`}
                      >
                        {prettyStatus(booking.status)}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                        <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                          Date
                        </div>
                        <div className="mt-0.5 text-[11px] font-bold text-[#1f1e1b]">
                          {formatDate(booking.event_date)}
                        </div>
                      </div>

                      <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                        <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                          Location
                        </div>
                        <div className="mt-0.5 truncate text-[11px] font-bold text-[#1f1e1b]">
                          {booking.setup_city || "—"}
                        </div>
                      </div>

                      <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                        <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                          Total
                        </div>
                        <div className="mt-0.5 text-[11px] font-bold text-[#1f1e1b]">
                          {formatMoney(booking.total_amount)}
                        </div>
                      </div>
                    </div>
                  </a>
                );
              })}

              {upcomingBookings.length === 0 && (
                <div className="rounded-[16px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-4 py-10 text-center">
                  <div className="text-base font-bold text-[#1f1e1b]">
                    No upcoming bookings
                  </div>
                  <p className="mt-1 text-xs text-[#6c6258]">
                    Nothing scheduled in the next 30 days.
                  </p>
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#eee5d9] bg-[#fcfaf7] text-left text-xs uppercase tracking-[0.12em] text-[#9a7a49]">
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Booking</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Location</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Total</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#f0e7dc]">
                  {upcomingBookings.map((booking: any) => {
                    const customer = Array.isArray(booking.customers)
                      ? booking.customers[0]
                      : booking.customers;

                    return (
                      <tr key={booking.id} className="hover:bg-[#fcfaf7]">
                        <td className="px-5 py-4 text-[#6c6258]">
                          {formatDate(booking.event_date)}
                        </td>

                        <td className="px-5 py-4">
                          <a
                            href={`/admin/bookings/${booking.id}`}
                            className="font-semibold text-[#1f1e1b] hover:text-[#c9964f]"
                          >
                            #{booking.booking_number || booking.id.slice(0, 8)}
                          </a>
                        </td>

                        <td className="px-5 py-4 text-[#6c6258]">
                          {customer?.full_name || "—"}
                        </td>

                        <td className="px-5 py-4 text-[#6c6258]">
                          {booking.setup_city || "—"} {booking.setup_zip || ""}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                              booking.status
                            )}`}
                          >
                            {prettyStatus(booking.status)}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-right font-semibold text-[#1f1e1b]">
                          {formatMoney(booking.total_amount)}
                        </td>
                      </tr>
                    );
                  })}

                  {upcomingBookings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-14 text-center">
                        <div className="text-lg font-semibold text-[#1f1e1b]">
                          No upcoming bookings
                        </div>
                        <p className="mt-2 text-sm text-[#6c6258]">
                          Nothing scheduled in the next 30 days.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Recent inventory movements
              </h3>

              <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
                Последние движения склада.
              </p>
            </div>

            <div className="divide-y divide-[#f0e7dc]">
              {movements.map((movement: any) => (
                <div
                  key={movement.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 py-3 sm:gap-4 sm:px-6 sm:py-4 md:grid-cols-[minmax(0,1fr)_180px_120px]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[#1f1e1b] sm:font-semibold">
                      {movement.inventory_items?.name || "Inventory item"}
                    </div>

                    <div className="mt-0.5 truncate text-[11px] text-[#6c6258] sm:mt-1 sm:text-sm">
                      {movement.inventory_units?.unit_code
                        ? `Unit ${movement.inventory_units.unit_code}`
                        : `Qty ${movement.quantity || 1}`}
                    </div>
                  </div>

                  <div className="self-start">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                        movement.movement_type
                      )}`}
                    >
                      {prettyStatus(movement.movement_type)}
                    </span>
                  </div>

                  <div className="col-span-2 text-[10px] text-[#6c6258] sm:text-sm md:col-span-1">
                    {formatDate(movement.created_at)}
                  </div>
                </div>
              ))}

              {movements.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
                  No inventory movements yet.
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="min-w-0 space-y-4 sm:space-y-6">
          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Inventory status
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-1 sm:gap-4 sm:p-6">
              <StatCard label="Active items" value={inventoryItems.length} />
              <StatCard label="Available units" value={availableUnits.length} tone="green" />
              <StatCard label="Out units" value={outUnits.length} tone="gold" />
              <StatCard label="Problem units" value={problemUnits.length} tone="red" />
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Active reservation flow
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2.5 p-3.5 sm:grid-cols-1 sm:gap-4 sm:p-6">
              <StatCard label="Reserved" value={reservationStatusCounts.reserved} tone="gold" />
              <StatCard label="Picked" value={reservationStatusCounts.picked} />
              <StatCard label="Loaded" value={reservationStatusCounts.loaded} tone="blue" />
              <StatCard label="Installed" value={reservationStatusCounts.installed} tone="gold" />
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[20px] border border-red-100 bg-red-50 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-red-100 px-3.5 py-3 sm:px-6 sm:py-5">
              <h3 className="text-base font-bold text-red-800 sm:text-xl sm:font-semibold">
                Low stock
              </h3>

              <p className="mt-0.5 hidden text-sm text-red-700/75 sm:block">
                Quantity / consumable items at or below reorder point.
              </p>
            </div>

            <div className="divide-y divide-red-100">
              {lowStockItems.map((item: any) => (
                <div key={item.id} className="px-3.5 py-3 sm:px-6 sm:py-4">
                  <a
                    href={`/admin/inventory/items/${item.id}`}
                    className="block truncate text-sm font-bold text-red-800 hover:text-red-900 sm:font-semibold"
                  >
                    {item.name}
                  </a>

                  <div className="mt-0.5 text-xs text-red-700/75 sm:mt-1 sm:text-sm">
                    Available {item.quantity_available || 0} · reorder{" "}
                    {item.reorder_point || 0}
                  </div>
                </div>
              ))}

              {lowStockItems.length === 0 && (
                <div className="px-6 py-10 text-center text-xs text-red-700/75 sm:py-12 sm:text-sm">
                  No low stock items.
                </div>
              )}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

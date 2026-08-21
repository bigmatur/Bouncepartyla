import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import DashboardBookingMap from "@/components/admin/DashboardBookingMap";
import { loadGa4Analytics } from "@/lib/analytics/ga4";

type SearchParams = {
  range?: string;
  from?: string;
  to?: string;
  view?: "overview" | "products" | "components" | "payments" | "analytics";
};

type RankedRow = { name: string; quantity: number; revenue: number };
type LocationCityRow = { name: string; bookings: number; revenue: number };
type LocationCitySummary = {
  city: string;
  bookings: number;
  revenue: number;
  tax: number;
};

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfWeek(value: Date) {
  const result = new Date(value);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  result.setHours(0, 0, 0, 0);
  return result;
}

function resolveRange(params: SearchParams) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const range = params.range || "this_month";

  if (range === "today") return { range, from: isoDate(today), to: isoDate(today) };
  if (range === "yesterday") {
    const day = addDays(today, -1);
    return { range, from: isoDate(day), to: isoDate(day) };
  }
  if (range === "this_week") return { range, from: isoDate(startOfWeek(today)), to: isoDate(today) };
  if (range === "last_week") {
    const thisWeek = startOfWeek(today);
    return { range, from: isoDate(addDays(thisWeek, -7)), to: isoDate(addDays(thisWeek, -1)) };
  }
  if (range === "last_month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { range, from: isoDate(first), to: isoDate(last) };
  }
  if (range === "custom" && params.from && params.to) {
    return {
      range,
      from: params.from <= params.to ? params.from : params.to,
      to: params.from <= params.to ? params.to : params.from,
    };
  }
  return {
    range: "this_month",
    from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: isoDate(today),
  };
}

function money(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function longDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function percent(value: number) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function duration(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds || 0)));
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

function one<T = any>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function pretty(value: unknown) {
  return String(value || "Unknown").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Metric({ label, value, note, tone = "plain" }: { label: string; value: React.ReactNode; note?: string; tone?: "plain" | "gold" | "green" | "red" | "blue" }) {
  const toneClass = {
    plain: "bg-white border-[#eadfd1]",
    gold: "bg-[#fff5d9] border-[#efd18a]",
    green: "bg-[#e9fbf4] border-[#bfe9d5]",
    red: "bg-[#fff0ef] border-[#f1c6c2]",
    blue: "bg-[#edf5fc] border-[#cfdfed]",
  }[tone];
  return (
    <div className={`min-w-0 rounded-[18px] border p-3 sm:rounded-2xl sm:p-4 ${toneClass}`}>
      <div className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[#8a7b6c] sm:text-[10px] sm:tracking-[0.14em]">{label}</div>
      <div className="mt-1.5 truncate text-xl font-bold tracking-tight text-[#25211e] sm:mt-2 sm:text-2xl">{value}</div>
      {note ? <div className="mt-1 truncate text-[10px] text-[#81766c] sm:text-[11px]">{note}</div> : null}
    </div>
  );
}

function Card({ title, subtitle, children, className = "" }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-[20px] border border-[#eadfd1] bg-white shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] ${className}`}>
      <header className="border-b border-[#efe6dc] px-4 py-3.5 sm:px-5 sm:py-4">
        <h2 className="text-base font-bold tracking-tight text-[#28231f] sm:text-lg">{title}</h2>
        {subtitle ? <p className="mt-1 text-[11px] leading-4 text-[#81766c] sm:text-xs sm:leading-5">{subtitle}</p> : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function Ranking({ rows, emptyText, valueLabel = "revenue", quantityLabel = "used / rented" }: { rows: RankedRow[]; emptyText: string; valueLabel?: "revenue" | "quantity"; quantityLabel?: string }) {
  const max = Math.max(1, ...rows.map((row) => valueLabel === "revenue" ? row.revenue : row.quantity));
  return (
    <div className="space-y-3 sm:space-y-4">
      {rows.map((row, index) => {
        const value = valueLabel === "revenue" ? row.revenue : row.quantity;
        return (
          <div key={`${row.name}-${index}`} className="rounded-xl bg-[#fcfaf7] px-3 py-2.5 ring-1 ring-[#f0e8df] sm:bg-transparent sm:px-0 sm:py-0 sm:ring-0">
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-[#302a25] sm:text-sm">{index + 1}. {row.name}</div>
                <div className="mt-0.5 text-[10px] text-[#8c8177] sm:text-xs">{row.quantity.toLocaleString("en-US")} {quantityLabel}</div>
              </div>
              <div className="shrink-0 text-xs font-bold text-[#302a25] sm:text-sm">{valueLabel === "revenue" ? money(row.revenue) : row.quantity.toLocaleString("en-US")}</div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1ebe4] sm:h-2">
              <div className="h-full rounded-full bg-[#c9964f]" style={{ width: `${Math.max(3, value / max * 100)}%` }} />
            </div>
          </div>
        );
      })}
      {rows.length === 0 ? <p className="py-6 text-center text-sm text-[#81766c]">{emptyText}</p> : null}
    </div>
  );
}

function CompactList({
  rows,
  emptyText,
  keyName,
  maxValue,
  formatter,
  subtitleFormatter,
}: {
  rows: Array<{ name: string; value: number; subtitle?: string; accent?: string }>; 
  emptyText: string;
  keyName: string;
  maxValue: number;
  formatter: (value: number) => string;
  subtitleFormatter?: (row: { name: string; value: number; subtitle?: string }) => string;
}) {
  return (
    <div className="space-y-2.5 sm:space-y-3">
      {rows.map((row, index) => (
        <div key={`${keyName}-${row.name}-${index}`} className="rounded-xl bg-[#f9f4ef] px-3 py-2.5 ring-1 ring-[#f0e8df]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[11px] font-bold text-[#302a25] sm:text-xs">{index + 1}. {row.name}</div>
              {row.subtitle || subtitleFormatter?.(row) ? (
                <div className="mt-0.5 text-[10px] text-[#8c8177] sm:text-[11px]">
                  {row.subtitle || subtitleFormatter?.(row) || ""}
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right text-[11px] font-bold text-[#2d2a28] sm:text-xs">{formatter(row.value)}</div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efe6dc]">
            <div
              className={`h-full rounded-full ${row.accent || "bg-[#c9964f]"}`}
              style={{ width: `${Math.max(8, (row.value / Math.max(maxValue, 1)) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      {rows.length === 0 ? <p className="py-4 text-center text-sm text-[#81766c]">{emptyText}</p> : null}
    </div>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams?: SearchParams }) {
  const { supabase, access } = await requireAdminPermission("dashboard.view");

  if (access.role === "driver") {
    redirect("/driver");
  }

  const params = searchParams || {};
  const period = resolveRange(params);
  const view = params.view || "overview";
  const fromTs = `${period.from}T00:00:00`;
  const toTs = `${period.to}T23:59:59.999`;
  const ga4Analytics = view === "analytics"
    ? await loadGa4Analytics({ from: period.from, to: period.to })
    : null;

  const [bookingsResult, paymentsResult, itemsResult, reservationsResult, modifiersResult, inventoryResult, routesResult] = await Promise.all([
    supabase.from("bookings").select(`
      id, booking_number, status, event_date, total_amount, balance_due,
      deposit_amount, discount_amount, delivery_fee, tax_amount, created_at,
      setup_address, setup_city, setup_state, setup_zip,
      customers (full_name)
    `).gte("event_date", period.from).lte("event_date", period.to).order("event_date"),
    supabase.from("payments").select("id, booking_id, amount, method, status, tip_amount, external_reference, note, paid_at, created_at").gte("paid_at", fromTs).lte("paid_at", toTs).order("paid_at", { ascending: false }),
    supabase.from("booking_items").select(`
      id, booking_id, quantity, unit_price, subtotal,
      products (id, name), bookings!inner (event_date, status)
    `).gte("bookings.event_date", period.from).lte("bookings.event_date", period.to),
    supabase.from("inventory_reservations").select(`
      id, quantity, status,
      inventory_items (id, name, sku),
      bookings!inner (event_date, status)
    `).gte("bookings.event_date", period.from).lte("bookings.event_date", period.to),
    supabase.from("booking_modifiers").select(`
      id, quantity, unit_price, subtotal,
      modifiers (id, name),
      bookings!inner (event_date, status)
    `).gte("bookings.event_date", period.from).lte("bookings.event_date", period.to),
    supabase.from("inventory_units").select("id, status"),
    supabase.from("route_stops").select("id, stop_type, status, stop_date").gte("stop_date", period.from).lte("stop_date", period.to),
  ]);

  for (const result of [bookingsResult, paymentsResult, itemsResult, reservationsResult, modifiersResult, inventoryResult, routesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const bookings = (bookingsResult.data || []) as any[];
  const payments = (paymentsResult.data || []) as any[];
  const items = (itemsResult.data || []) as any[];
  const reservations = (reservationsResult.data || []) as any[];
  const modifiers = (modifiersResult.data || []) as any[];
  const inventory = (inventoryResult.data || []) as any[];
  const routes = (routesResult.data || []) as any[];
  const excluded = new Set(["cancelled", "archived"]);
  const activeBookings = bookings.filter((b) => !excluded.has(String(b.status || "").toLowerCase()));
  const bookingMapPoints = activeBookings
    .map((booking) => {
      const address = [booking.setup_address, booking.setup_city, booking.setup_state, booking.setup_zip]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(", ");
      const customer = one<any>(booking.customers);

      return {
        id: String(booking.id),
        bookingNumber: String(booking.booking_number || "Booking"),
        customerName: String(customer?.full_name || "Customer"),
        eventDate: String(booking.event_date || ""),
        address,
        city: String(booking.setup_city || "").trim() || "Unknown city",
        totalAmount: Number(booking.total_amount || 0),
      };
    })
    .filter((booking) => Boolean(booking.address));
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  
    const locationZipCodes = Array.from(
      new Set(
        activeBookings
          .map((booking) => String(booking?.setup_zip || "").trim())
          .filter(Boolean),
      ),
    );

    let locationTaxRows: any[] = [];

    if (locationZipCodes.length > 0) {
      const locationTaxResult = await supabase
        .from("tax_rates_cache")
        .select("zip, tax_area_code, created_at")
        .in("zip", locationZipCodes)
        .order("created_at", { ascending: false });

      if (locationTaxResult.error) {
        throw new Error(locationTaxResult.error.message);
      }

      locationTaxRows = locationTaxResult.data || [];
    }

    const locationCountyByZip = new Map<string, string>();

    for (const row of locationTaxRows) {
      const zip = String(row?.zip || "").trim();
      if (!zip || locationCountyByZip.has(zip)) continue;

      const rawCounty = String(row?.tax_area_code || "").trim();
      locationCountyByZip.set(zip, rawCounty || "Unknown county");
    }

    function countyDisplayName(value: unknown) {
      const raw = String(value || "").trim();

      if (!raw || raw === "—" || raw.toLowerCase() === "unknown county") {
        return "Unknown county";
      }

      const normalized = raw
        .toLowerCase()
        .replace(/\b\w/g, (character) => character.toUpperCase());

      return /\bcounty$/i.test(normalized)
        ? normalized
        : `${normalized} County`;
    }

    const cityMap = new Map<
      string,
      {
        city: string;
        bookings: number;
        revenue: number;
        tax: number;
      }
    >();

    for (const booking of activeBookings) {
      const zip = String(booking?.setup_zip || "").trim();
      const rawCounty = locationCountyByZip.get(zip) || "Unknown county";
      const county = countyDisplayName(rawCounty);
      const rawCity = String(booking?.setup_city || "").trim() || "Unknown city";
      const cityName = rawCity.replace(/\s+/g, " ");
      const cityKey = cityName.toLowerCase();
      const revenue = Number(booking?.total_amount || 0);
      const tax = Number(booking?.tax_amount || 0);

      const cityRow = cityMap.get(cityKey) || {
        city: cityName,
        bookings: 0,
        revenue: 0,
        tax: 0,
      };

      cityRow.bookings += 1;
      cityRow.revenue += revenue;
      cityRow.tax += tax;
      cityMap.set(cityKey, cityRow);
    }

    const locationGroups: LocationCitySummary[] = [...cityMap.values()]
      .map((city) => ({
        city: city.city,
        bookings: city.bookings,
        revenue: city.revenue,
        tax: city.tax,
      }))
      .sort(
        (a, b) =>
          b.bookings - a.bookings ||
          b.revenue - a.revenue ||
          a.city.localeCompare(b.city),
      );

    const salesTaxRows = [...locationGroups]
      .sort((a, b) => b.tax - a.tax || a.city.localeCompare(b.city))
      .slice(0, 8);

    const successful = payments.filter((p) => ["paid", "completed", "succeeded", "success"].includes(String(p.status || "paid").toLowerCase()));

  const gross = activeBookings.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const collected = successful.reduce((s, p) => s + Number(p.amount || 0), 0);
  const outstanding = activeBookings.reduce((s, b) => s + Math.max(0, Number(b.balance_due || 0)), 0);
  const discounts = activeBookings.reduce((s, b) => s + Number(b.discount_amount || 0), 0);
  const tax = activeBookings.reduce((s, b) => s + Number(b.tax_amount || 0), 0);
  const delivery = activeBookings.reduce((s, b) => s + Number(b.delivery_fee || 0), 0);
  const average = activeBookings.length ? gross / activeBookings.length : 0;

  const daily: Array<{ date: string; sales: number; payments: number; bookings: number }> = [];
  for (let cursor = new Date(`${period.from}T00:00:00`), end = new Date(`${period.to}T00:00:00`); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    daily.push({ date: isoDate(cursor), sales: 0, payments: 0, bookings: 0 });
  }
  const dailyMap = new Map(daily.map((row) => [row.date, row]));
  activeBookings.forEach((b) => {
    const row = dailyMap.get(String(b.event_date || ""));
    if (row) { row.sales += Number(b.total_amount || 0); row.bookings += 1; }
  });
  successful.forEach((p) => {
    const row = dailyMap.get(String(p.paid_at || p.created_at || "").slice(0, 10));
    if (row) row.payments += Number(p.amount || 0);
  });
  const maxDaily = Math.max(1, ...daily.map((r) => Math.max(r.sales, r.payments)));

  function aggregate(source: any[], nameGetter: (row: any) => string, quantityGetter: (row: any) => number, revenueGetter: (row: any) => number) {
    const map = new Map<string, RankedRow>();
    source.forEach((row) => {
      const booking = one(row.bookings);
      if (excluded.has(String(booking?.status || "").toLowerCase())) return;
      const name = nameGetter(row) || "Unknown";
      const current = map.get(name) || { name, quantity: 0, revenue: 0 };
      current.quantity += quantityGetter(row);
      current.revenue += revenueGetter(row);
      map.set(name, current);
    });
    return [...map.values()];
  }

  const products = aggregate(items, (r) => one(r.products)?.name, (r) => Math.max(1, Number(r.quantity || 1)), (r) => Number(r.subtotal ?? Number(r.unit_price || 0) * Number(r.quantity || 1))).sort((a, b) => b.revenue - a.revenue);
  const components = aggregate(reservations, (r) => one(r.inventory_items)?.name, (r) => Number(r.quantity || 0), () => 0).sort((a, b) => b.quantity - a.quantity);
  const addOns = aggregate(modifiers, (r) => one(r.modifiers)?.name, (r) => Math.max(1, Number(r.quantity || 1)), (r) => Number(r.subtotal ?? Number(r.unit_price || 0) * Number(r.quantity || 1))).sort((a, b) => b.revenue - a.revenue);

  const paymentMethods = aggregate(successful, (r) => pretty(r.method), () => 1, (r) => Number(r.amount || 0)).sort((a, b) => b.revenue - a.revenue);
  const statusMap = new Map<string, number>();
  bookings.forEach((b) => statusMap.set(pretty(b.status), (statusMap.get(pretty(b.status)) || 0) + 1));

  const inventoryCounts = {
    available: inventory.filter((i) => ["available", "returned"].includes(String(i.status || "").toLowerCase())).length,
    active: inventory.filter((i) => ["reserved", "picked", "loaded", "installed"].includes(String(i.status || "").toLowerCase())).length,
    problem: inventory.filter((i) => ["dirty", "cleaning", "damaged", "repair_needed", "in_repair", "lost"].includes(String(i.status || "").toLowerCase())).length,
  };
  const completedStops = routes.filter((r) => ["completed", "installed", "picked_up"].includes(String(r.status || "").toLowerCase())).length;
  const tips = successful.reduce((sum, payment) => sum + Number(payment.tip_amount || 0), 0);
  const productRentalCount = products.reduce((sum, row) => sum + row.quantity, 0);
  const componentUnitCount = components.reduce((sum, row) => sum + row.quantity, 0);
  const addOnRevenue = addOns.reduce((sum, row) => sum + row.revenue, 0);

  const query = `range=${encodeURIComponent(period.range)}&from=${period.from}&to=${period.to}`;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4 pb-24 sm:space-y-5 sm:pb-12">
      <section className="rounded-[22px] border border-[#eadfd1] bg-white p-4 shadow-[0_10px_34px_rgba(45,36,25,.04)] sm:rounded-[28px] sm:p-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a27742]">Operations overview</div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#28231f] sm:text-3xl">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#81766c] sm:text-sm">Sales, bookings, routes, inventory and payments in one place.</p>
          </div>
          <form method="get" className="min-w-0 w-full max-w-[740px] overflow-hidden rounded-[18px] border border-[#e2d6c8] bg-[#f7f1ea] p-2.5 shadow-[0_4px_12px_rgba(60,49,38,0.03)] sm:rounded-[20px] sm:p-3">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="range" value="custom" />
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end sm:gap-3">
              <div className="min-w-0">
                  <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#7c685d] sm:text-left sm:text-[11px] sm:tracking-[0.18em]">From</div>
                <input type="date" name="from" defaultValue={period.from} className="h-11 min-w-0 w-full max-w-full rounded-xl border border-[#d8c9b8] bg-white px-2 text-[12px] font-medium text-[#2d2a28] outline-none ring-0 transition focus:border-[#c9964f] sm:h-12 sm:rounded-[14px] sm:px-3 sm:text-sm" />
              </div>
              <div className="min-w-0">
                  <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#7c685d] sm:text-left sm:text-[11px] sm:tracking-[0.18em]">To</div>
                <input type="date" name="to" defaultValue={period.to} className="h-11 min-w-0 w-full max-w-full rounded-xl border border-[#d8c9b8] bg-white px-2 text-[12px] font-medium text-[#2d2a28] outline-none ring-0 transition focus:border-[#c9964f] sm:h-12 sm:rounded-[14px] sm:px-3 sm:text-sm" />
              </div>
              <button className="h-11 rounded-xl bg-[#243342] px-4 text-sm font-bold text-white shadow-[0_8px_18px_rgba(36,51,66,0.16)] transition hover:bg-[#1d2a36] sm:col-span-1 sm:h-12 sm:rounded-[14px] sm:px-6">Apply dates</button>
            </div>
          </form>
        </div>
        <div className="mt-4 flex min-w-0 items-center justify-between gap-3 border-t border-[#efe6dc] pt-3 sm:mt-5 sm:pt-4">
          <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible">
            {(["overview", "products", "components", "payments", "analytics"] as const).map((tab) => (
              <Link
                key={tab}
                href={`/admin?${query}&view=${tab}`}
                className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-bold sm:px-5 sm:text-sm ${view === tab ? "bg-[#c9964f] text-white" : "bg-[#f5f0e9] text-[#5f554c]"}`}
              >
                {pretty(tab)}
              </Link>
            ))}
          </nav>
          <div className="hidden shrink-0 text-xs font-semibold text-[#81766c] sm:block">{longDate(period.from)} — {longDate(period.to)}</div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {[
          { href: "/admin/bookings", label: "Bookings", active: false },
          { href: "/admin/calendar", label: "Calendar", active: true },
          { href: "/admin/routes", label: "Routes", active: false },
          { href: "/admin/inventory", label: "Inventory", active: false },
        ].map(({ href, label, active }) => (
          <Link
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-bold sm:rounded-full sm:px-5 sm:text-sm ${active ? "bg-[#243342] text-white" : "bg-white text-[#243342] ring-1 ring-[#ded2c5]"}`}
          >
            {label}
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-8">
        <Metric label="Gross sales" value={money(gross)} note="Event value" tone="gold" />
        <Metric label="Collected" value={money(collected)} note={`${successful.length} payments`} tone="green" />
        <Metric label="Balance due" value={money(outstanding)} note="Still to collect" tone={outstanding ? "red" : "green"} />
        <Metric label="Average booking" value={money(average)} note={`${activeBookings.length} bookings`} tone="blue" />
        <Metric label="Discounts" value={money(discounts)} />
        <Metric label="Tax" value={money(tax)} />
        <Metric label="Delivery" value={money(delivery)} />
        <Metric label="Route stops" value={`${completedStops}/${routes.length}`} note="Completed / total" />
      </section>

      {view === "overview" ? (
        <>
          <section className="grid gap-4 sm:gap-5 xl:grid-cols-[1.7fr_1fr]">
            <Card title="Revenue and cash collection" subtitle="Booked event revenue compared with payments actually received.">
              <div className="-mx-1 overflow-x-auto px-1 pb-2">
                <div className="flex min-w-[560px] items-end gap-1.5 sm:min-w-[720px] sm:gap-2">
                  {daily.map((row) => (
                    <div key={row.date} className="flex min-w-[32px] flex-1 flex-col items-center">
                      <div className="flex h-32 w-full items-end gap-1 rounded-lg bg-[#faf7f3] px-1 pt-2 sm:h-44 sm:px-1.5">
                        <div title={`Sales ${money(row.sales)}`} className="w-1/2 rounded-t bg-[#c9964f]" style={{ height: `${Math.max(row.sales ? 3 : 0, row.sales / maxDaily * 100)}%` }} />
                        <div title={`Payments ${money(row.payments)}`} className="w-1/2 rounded-t bg-[#243342]" style={{ height: `${Math.max(row.payments ? 3 : 0, row.payments / maxDaily * 100)}%` }} />
                      </div>
                      <div className="mt-1.5 text-[9px] font-bold text-[#7e7369] sm:mt-2 sm:text-[10px]">{shortDate(row.date)}</div>
                      <div className="text-[8px] text-[#a0958b] sm:text-[9px]">{row.bookings} bk</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-5 text-xs font-semibold text-[#73685e]">
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-[#c9964f]" /> Booked sales</span>
                <span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-[#243342]" /> Collected payments</span>
              </div>
            </Card>

            <Card title="Business snapshot" subtitle="Fast operational summary for the selected dates.">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <Metric label="Bookings" value={activeBookings.length} note="Active orders" tone="blue" />
                <Metric label="Product rentals" value={productRentalCount} note={`${products.length} products`} tone="gold" />
                <Metric label="Component units" value={componentUnitCount} note={`${components.length} component types`} />
                <Metric label="Tips" value={money(tips)} note="Recorded tips" tone="green" />
                <Metric label="Available inventory" value={inventoryCounts.available} note="Ready to rent" tone="green" />
                <Metric label="Needs attention" value={inventoryCounts.problem} note="Cleaning / repair / lost" tone={inventoryCounts.problem ? "red" : "plain"} />
              </div>
            </Card>
          </section>

          <Card title="Booking map" subtitle="Client locations for bookings in the selected date range.">
            <DashboardBookingMap apiKey={googleMapsApiKey} points={bookingMapPoints} />
          </Card>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-2">
            <Card title="Sales by location" subtitle="Bookings grouped by city for the selected period.">
              <CompactList
                rows={locationGroups.slice(0, 6).map((row) => ({
                  name: row.city,
                  value: row.revenue,
                  subtitle: `${row.bookings.toLocaleString("en-US")} bookings`,
                  accent: "bg-[#c9964f]",
                }))}
                keyName="location"
                maxValue={Math.max(1, ...locationGroups.map((row) => row.revenue))}
                formatter={(value) => money(value)}
                emptyText="No location sales in this period."
              />
            </Card>

            <Card title="Sales tax" subtitle="Tax collected by city for the selected period.">
              <div className="mb-3 flex items-end justify-between gap-3 border-b border-[#efe6dc] pb-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a7b6c] sm:text-[11px]">Total sales tax</div>
                <div className="text-xl font-bold tracking-tight text-[#28231f] sm:text-2xl">{money(tax)}</div>
              </div>
              <CompactList
                rows={salesTaxRows.map((row) => ({
                  name: row.city,
                  value: row.tax,
                  subtitle: `${row.bookings.toLocaleString("en-US")} bookings`,
                  accent: "bg-[#243342]",
                }))}
                keyName="sales-tax"
                maxValue={Math.max(1, ...salesTaxRows.map((row) => row.tax))}
                formatter={(value) => money(value)}
                emptyText="No sales tax recorded in this period."
              />
            </Card>
          </section>

          <section className="grid gap-4 sm:gap-5 xl:grid-cols-3">
            <Card title="Top products" subtitle="Best-performing rental products by revenue."><Ranking rows={products.slice(0, 6)} emptyText="No product sales." /></Card>
            <Card title="Most-used components" subtitle="Balls, blowers, cords, rugs, tarps and other reserved warehouse items."><Ranking rows={components.slice(0, 8)} emptyText="No component reservations." valueLabel="quantity" /></Card>
            <Card title="Payment methods" subtitle="Collected payments grouped by method."><Ranking rows={paymentMethods.slice(0, 8)} emptyText="No payments." /></Card>
          </section>
        </>
      ) : null}

      {view === "products" ? (
        <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
          <Card title="Products by revenue" subtitle="Rental quantity and booked product revenue for the selected period.">
            <Ranking rows={products.slice(0, 30)} emptyText="No products in this period." />
          </Card>
          <div className="space-y-5">
            <Card title="Product KPIs">
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Distinct products" value={products.length} tone="blue" />
                <Metric label="Units rented" value={productRentalCount} tone="gold" />
                <Metric label="Product revenue" value={money(products.reduce((sum, row) => sum + row.revenue, 0))} tone="green" />
                <Metric label="Avg per unit" value={money(productRentalCount ? products.reduce((sum, row) => sum + row.revenue, 0) / productRentalCount : 0)} />
              </div>
            </Card>
            <Card title="Add-ons and paid options" subtitle="Generators, ball-color packages and other modifiers.">
              <Ranking rows={addOns.slice(0, 15)} emptyText="No add-ons in this period." />
            </Card>
          </div>
        </section>
      ) : null}

      {view === "components" ? (
        <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card title="Components by usage" subtitle="Actual reserved quantities for balls, blowers, extension cords, mats, rugs, tarps, sandbags and other components.">
            <Ranking rows={components.slice(0, 40)} emptyText="No components reserved in this period." valueLabel="quantity" />
          </Card>
          <div className="space-y-5">
            <Card title="Component KPIs">
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Component types" value={components.length} tone="blue" />
                <Metric label="Units required" value={componentUnitCount} tone="gold" />
                <Metric label="Available units" value={inventoryCounts.available} tone="green" />
                <Metric label="Reserved / out" value={inventoryCounts.active} />
                <Metric label="Needs attention" value={inventoryCounts.problem} tone={inventoryCounts.problem ? "red" : "plain"} />
                <Metric label="Route stops" value={routes.length} note={`${completedStops} completed`} />
              </div>
            </Card>
            <Card title="Popular component selections" subtitle="Quick view of the most requested warehouse items.">
              <Ranking rows={components.slice(0, 10)} emptyText="No component data." valueLabel="quantity" />
            </Card>
          </div>
        </section>
      ) : null}

      {view === "payments" ? (
        <section className="grid gap-5 xl:grid-cols-[1fr_1.25fr]">
          <div className="space-y-5">
            <Card title="Payment summary">
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Collected" value={money(collected)} note={`${successful.length} transactions`} tone="green" />
                <Metric label="Outstanding" value={money(outstanding)} tone={outstanding ? "red" : "green"} />
                <Metric label="Tips" value={money(tips)} tone="gold" />
                <Metric label="Discounts" value={money(discounts)} />
                <Metric label="Taxes" value={money(tax)} />
                <Metric label="Delivery revenue" value={money(delivery)} />
              </div>
            </Card>
            <Card title="Payment methods" subtitle="Amounts and transaction counts grouped by payment method.">
              <Ranking rows={paymentMethods.slice(0, 20)} emptyText="No payments in this period." />
            </Card>
          </div>

          <Card title="Recent payments" subtitle="Latest successful payments received in the selected period.">
            <div className="divide-y divide-[#eee5d9]">
              {successful.slice(0, 30).map((payment) => (
                <Link key={payment.id} href={`/admin/bookings/${payment.booking_id}`} className="flex items-center justify-between gap-4 py-3 hover:opacity-70">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[#302a25]">{pretty(payment.method)}</div>
                    <div className="mt-1 truncate text-xs text-[#81766c]">
                      {payment.paid_at ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(payment.paid_at)) : "Payment recorded"}
                      {(payment.external_reference || payment.note) ? ` · ${payment.external_reference || payment.note}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold text-emerald-700">{money(payment.amount)}</div>
                    {Number(payment.tip_amount || 0) > 0 ? <div className="text-xs text-[#8a6a3b]">Tip {money(payment.tip_amount)}</div> : null}
                  </div>
                </Link>
              ))}
              {successful.length === 0 ? <p className="py-10 text-center text-sm text-[#81766c]">No payments found.</p> : null}
            </div>
          </Card>
        </section>
      ) : null}

      {view === "analytics" && ga4Analytics ? (
        <>
          <section className="rounded-[20px] border border-[#eadfd1] bg-white p-4 shadow-[0_8px_28px_rgba(45,36,25,.04)] sm:rounded-[26px] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#a27742]">Google Analytics 4</div>
                <h2 className="mt-1 text-lg font-bold text-[#28231f] sm:text-xl">Website activity</h2>
                <p className="mt-1 text-xs text-[#81766c]">Live GA4 data for {longDate(period.from)} to {longDate(period.to)}.</p>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${ga4Analytics.available ? "bg-[#e9fbf4] text-emerald-700 ring-1 ring-[#bfe9d5]" : "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]"}`}>
                {ga4Analytics.available ? "Connected" : "Unavailable"}
              </span>
            </div>
            {!ga4Analytics.available ? (
              <div className="mt-4 rounded-2xl bg-[#fff8e8] p-4 text-sm leading-6 text-[#8a6b20] ring-1 ring-[#ead6a8]">
                {ga4Analytics.error || "Google Analytics data is currently unavailable."}
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4 2xl:grid-cols-8">
            <Metric label="Active users" value={ga4Analytics.overview.activeUsers.toLocaleString("en-US")} tone="blue" />
            <Metric label="Total users" value={ga4Analytics.overview.totalUsers.toLocaleString("en-US")} />
            <Metric label="Sessions" value={ga4Analytics.overview.sessions.toLocaleString("en-US")} tone="gold" />
            <Metric label="Page views" value={ga4Analytics.overview.pageViews.toLocaleString("en-US")} />
            <Metric label="Engagement" value={percent(ga4Analytics.overview.engagementRate)} tone="green" />
            <Metric label="Avg. session" value={duration(ga4Analytics.overview.averageSessionDuration)} />
            <Metric label="New users" value={ga4Analytics.overview.newUsers.toLocaleString("en-US")} tone="blue" />
            <Metric label="Key events" value={ga4Analytics.overview.keyEvents.toLocaleString("en-US")} tone="green" />
          </section>

          {ga4Analytics.available ? (
            <>
              <Card title="Daily website activity" subtitle="Sessions and page views by day from Google Analytics 4.">
                <div className="-mx-1 overflow-x-auto px-1 pb-2">
                  <div className="flex min-w-[520px] items-end gap-1.5 sm:gap-2">
                    {ga4Analytics.trend.map((row) => {
                      const max = Math.max(1, ...ga4Analytics.trend.map((item) => Math.max(item.sessions, item.pageViews)));
                      return (
                        <div key={row.date} className="flex min-w-[32px] flex-1 flex-col items-center">
                          <div className="flex h-36 w-full items-end gap-1 rounded-lg bg-[#faf7f3] px-1 pt-2 sm:h-44">
                            <div title={`Sessions ${row.sessions}`} className="relative w-1/2 rounded-t bg-[#243342]" style={{ height: `${Math.max(row.sessions ? 3 : 0, (row.sessions / max) * 100)}%` }}>
                              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-white [writing-mode:vertical-rl] [transform:translateX(-50%)_rotate(180deg)]">{row.sessions}</span>
                            </div>
                            <div title={`Page views ${row.pageViews}`} className="relative w-1/2 rounded-t bg-[#c9964f]" style={{ height: `${Math.max(row.pageViews ? 3 : 0, (row.pageViews / max) * 100)}%` }}>
                              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-[#3c2a16] [writing-mode:vertical-rl] [transform:translateX(-50%)_rotate(180deg)]">{row.pageViews}</span>
                            </div>
                          </div>
                          <div className="mt-1.5 text-[9px] font-bold text-[#7e7369]">{shortDate(row.date)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-4 flex gap-5 text-xs font-semibold text-[#73685e]"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-[#243342]" /> Sessions</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-[#c9964f]" /> Page views</span></div>
              </Card>

              <section className="grid gap-4 sm:gap-5 xl:grid-cols-3">
                <Card title="Acquisition channels" subtitle="Sessions, users and key events by channel.">
                  <Ranking rows={ga4Analytics.acquisition.map((row) => ({ name: row.name, quantity: row.sessions, revenue: row.users }))} emptyText="No acquisition data." valueLabel="quantity" quantityLabel="sessions" />
                </Card>
                <Card title="Top pages" subtitle="Most viewed pages in the selected period.">
                  <Ranking rows={ga4Analytics.topPages.map((row) => ({ name: row.name, quantity: row.pageViews || 0, revenue: row.users }))} emptyText="No page data." valueLabel="quantity" quantityLabel="page views" />
                </Card>
                <Card title="Source / medium" subtitle="Traffic sources ranked by sessions.">
                  <Ranking rows={ga4Analytics.sources.map((row) => ({ name: row.name, quantity: row.sessions, revenue: row.users }))} emptyText="No source data." valueLabel="quantity" quantityLabel="sessions" />
                </Card>
              </section>

              <Card title="UTM link performance" subtitle="Campaign parameters captured for sessions in the selected period.">
                {ga4Analytics.utm.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left text-xs">
                      <thead className="border-b border-[#eadfd1] text-[10px] font-bold uppercase tracking-[0.12em] text-[#81766c]">
                        <tr>
                          <th className="px-2 py-3">Campaign</th>
                          <th className="px-2 py-3">Source</th>
                          <th className="px-2 py-3">Medium</th>
                          <th className="px-2 py-3">Content</th>
                          <th className="px-2 py-3">Term</th>
                          <th className="px-2 py-3 text-right">Sessions</th>
                          <th className="px-2 py-3 text-right">Users</th>
                          <th className="px-2 py-3 text-right">Events</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#eee5d9] text-[#3c342e]">
                        {ga4Analytics.utm.map((row, index) => (
                          <tr key={`${row.campaign}-${row.source}-${row.medium}-${row.content}-${row.term}-${index}`}>
                            {[row.campaign, row.source, row.medium, row.content, row.term].map((value, valueIndex) => (
                              <td key={valueIndex} className="max-w-[180px] truncate px-2 py-3 font-medium" title={value === "(not set)" ? "Not provided" : value}>
                                {value === "(not set)" ? "-" : value}
                              </td>
                            ))}
                            <td className="px-2 py-3 text-right font-bold">{row.sessions.toLocaleString("en-US")}</td>
                            <td className="px-2 py-3 text-right">{row.users.toLocaleString("en-US")}</td>
                            <td className="px-2 py-3 text-right">{row.keyEvents.toLocaleString("en-US")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="py-8 text-center text-sm text-[#81766c]">No UTM-tagged visits in this period.</p>}
              </Card>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

import "server-only";

const SUCCESS_PAYMENT_STATUSES = new Set(["paid", "completed", "succeeded", "success"]);

export type SalesTaxRow = {
  bookingId: string;
  customerName: string;
  eventDate: string;
  address: string;
  city: string;
  county: string;
  cashlessPayment: number;
  cash: number;
  taxRatePercent: number;
  totalTax: number;
};

export type SalesTaxReportData = {
  rows: SalesTaxRow[];
  totals: {
    cashlessPayment: number;
    cash: number;
    totalTax: number;
  };
};

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeIsoDate(value: string | null | undefined) {
  const raw = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function one<T = any>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation")
  );
}

export function resolveSalesTaxRange(params?: { from?: string; to?: string }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const fromInput = normalizeIsoDate(params?.from);
  const toInput = normalizeIsoDate(params?.to);

  if (fromInput && toInput) {
    return fromInput <= toInput
      ? { from: fromInput, to: toInput }
      : { from: toInput, to: fromInput };
  }

  return {
    from: isoDate(monthStart),
    to: isoDate(today),
  };
}

function splitPayments(payments: any[]) {
  let cash = 0;
  let cashless = 0;

  for (const payment of payments) {
    const paymentStatus = String(payment?.status || "paid").toLowerCase();

    if (!SUCCESS_PAYMENT_STATUSES.has(paymentStatus)) {
      continue;
    }

    const amount = Number(payment?.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    const method = String(payment?.method || "").toLowerCase();

    if (method === "cash") {
      cash += amount;
    } else {
      cashless += amount;
    }
  }

  return {
    cash,
    cashless,
  };
}

function buildAddress(booking: any) {
  const address = String(booking?.setup_address || "").trim();
  const city = String(booking?.setup_city || "").trim();
  const state = String(booking?.setup_state || "").trim();
  const zip = String(booking?.setup_zip || "").trim();

  const tail = [city, state, zip].filter(Boolean).join(",");

  if (address && tail) {
    return `${address}, ${tail}`;
  }

  if (address) {
    return address;
  }

  return tail || "—";
}

function normalizeTaxRateToPercent(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  // Some rows store tax_rate as decimal (0.0975), others as percent (9.75).
  return parsed <= 1 ? parsed * 100 : parsed;
}

export async function loadSalesTaxReportData(params: {
  supabase: any;
  from: string;
  to: string;
}) {
  const { supabase, from, to } = params;

  const bookingsResult = await supabase
    .from("bookings")
    .select(
      `
      id,
      booking_number,
      status,
      event_date,
      setup_address,
      setup_city,
      setup_state,
      setup_zip,
      tax_rate,
      tax_amount,
      customers (
        full_name
      ),
      payments (
        amount,
        method,
        status
      )
    `
    )
    .gte("event_date", from)
    .lte("event_date", to)
    .gt("tax_amount", 0)
    .order("event_date", { ascending: false })
    .limit(2000);

  if (bookingsResult.error) {
    throw new Error(bookingsResult.error.message);
  }

  const bookings = (bookingsResult.data || []) as any[];

  const zipCodes = Array.from(
    new Set(
      bookings
        .map((booking) => String(booking?.setup_zip || "").trim())
        .filter(Boolean)
    )
  );

  let taxRows: any[] = [];

  if (zipCodes.length > 0) {
    const taxResult = await supabase
      .from("tax_rates_cache")
      .select("zip, tax_area_code, tax_rate, created_at")
      .in("zip", zipCodes)
      .order("created_at", { ascending: false });

    if (taxResult.error && !isMissingTableError(taxResult.error)) {
      throw new Error(taxResult.error.message);
    }

    taxRows = taxResult.error ? [] : taxResult.data || [];
  }

  const taxMetaByZip = new Map<string, { county: string; taxRatePercent: number | null }>();

  for (const row of taxRows) {
    const zip = String((row as any)?.zip || "").trim();

    if (!zip || taxMetaByZip.has(zip)) {
      continue;
    }

    const rawCounty = String((row as any)?.tax_area_code || "").trim();
    const normalizedRate = normalizeTaxRateToPercent((row as any)?.tax_rate);

    taxMetaByZip.set(zip, {
      county: rawCounty ? rawCounty.toUpperCase() : "—",
      taxRatePercent: normalizedRate > 0 ? Number(normalizedRate.toFixed(2)) : null,
    });
  }

  const rows: SalesTaxRow[] = bookings
    .filter((booking) => {
      const status = String(booking?.status || "").toLowerCase();
      return !["cancelled", "canceled", "archived"].includes(status);
    })
    .map((booking) => {
      const customer = one(booking?.customers);
      const paymentRows = Array.isArray(booking?.payments)
        ? booking.payments
        : booking?.payments
          ? [booking.payments]
          : [];

      const split = splitPayments(paymentRows);
      const city = String(booking?.setup_city || "").trim();
      const zip = String(booking?.setup_zip || "").trim();
      const taxMeta = taxMetaByZip.get(zip) || null;
      const bookingTaxPercent = normalizeTaxRateToPercent(booking?.tax_rate);
      const taxRatePercent = Number((bookingTaxPercent || taxMeta?.taxRatePercent || 0).toFixed(2));
      const totalTax = Number(Number(booking?.tax_amount || 0).toFixed(2));

      return {
        bookingId: String(booking?.id || ""),
        customerName: String(customer?.full_name || "").trim() || "—",
        eventDate: String(booking?.event_date || ""),
        address: buildAddress(booking),
        city: city || "—",
        county: taxMeta?.county || "—",
        cashlessPayment: Number(split.cashless.toFixed(2)),
        cash: Number(split.cash.toFixed(2)),
        taxRatePercent,
        totalTax,
      };
    });

  const totals = rows.reduce(
    (acc, row) => {
      acc.cashlessPayment += row.cashlessPayment;
      acc.cash += row.cash;
      acc.totalTax += row.totalTax;
      return acc;
    },
    {
      cashlessPayment: 0,
      cash: 0,
      totalTax: 0,
    }
  );

  return {
    rows,
    totals: {
      cashlessPayment: Number(totals.cashlessPayment.toFixed(2)),
      cash: Number(totals.cash.toFixed(2)),
      totalTax: Number(totals.totalTax.toFixed(2)),
    },
  } satisfies SalesTaxReportData;
}

export function formatSalesTaxDate(value: string | null | undefined) {
  const input = String(value || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return "—";
  }

  const [year, month, day] = input.split("-");
  return `${day}.${month}.${year}`;
}

export function formatSalesTaxPercent(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) {
    return "0.00%";
  }

  return `${parsed.toFixed(2)}%`;
}

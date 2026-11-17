import "server-only";

type SupabaseClientLike = {
  from: (table: string) => any;
};

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function losAngelesDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function one<T = any>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

export type BookingInvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type BookingInvoiceData = {
  bookingId: string;
  bookingNumber: string;
  invoiceNumber: string;
  issueDate: string;
  dueLabel: string;
  status: "PAID" | "PARTIALLY PAID" | "DUE";
  customer: {
    name: string;
    company: string;
    email: string;
    phone: string;
    address: string;
    taxId: string;
  };
  event: {
    date: string;
    startTime: string;
    endTime: string;
    address: string;
  };
  business: {
    name: string;
    logoUrl: string;
    accentColor: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    footer: string;
  };
  lines: BookingInvoiceLine[];
  summary: {
    subtotal: number;
    discount: number;
    delivery: number;
    taxRate: number;
    tax: number;
    total: number;
    paid: number;
    balance: number;
  };
};

export async function loadBookingInvoiceData(
  supabase: SupabaseClientLike,
  bookingId: string,
): Promise<BookingInvoiceData | null> {
  const [bookingResult, modifiersResult, designResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(`
        id,
        booking_number,
        event_date,
        event_start_time,
        event_end_time,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        subtotal,
        delivery_fee,
        tax_rate,
        tax_amount,
        total_amount,
        amount_paid,
        balance_due,
        discount_amount,
        customers (id, full_name, email, phone),
        booking_items (
          id,
          quantity,
          unit_price,
          subtotal,
          products (id, name)
        )
      `)
      .eq("id", bookingId)
      .maybeSingle(),
    supabase.from("booking_modifiers").select("*").eq("booking_id", bookingId),
    supabase
      .from("booking_receipt_design_settings")
      .select(
        "logo_url, brand_name, accent_color, footer_text, business_address, business_phone, business_email, business_website",
      )
      .limit(1)
      .maybeSingle(),
  ]);

  if (bookingResult.error) throw new Error(bookingResult.error.message);
  if (modifiersResult.error) throw new Error(modifiersResult.error.message);

  const booking = bookingResult.data as any;
  if (!booking) return null;

  const bookingNumber = String(booking.booking_number || booking.id).trim();
  const customer = one<any>(booking.customers) || {};
  const design = designResult.error ? {} : (designResult.data as any) || {};
  const bookingItems = Array.isArray(booking.booking_items) ? booking.booking_items : [];
  const modifiers = Array.isArray(modifiersResult.data) ? modifiersResult.data : [];

  const lines: BookingInvoiceLine[] = bookingItems.map((item: any, index: number) => {
    const product = one<any>(item.products) || {};
    const quantity = Math.max(1, number(item.quantity));
    const total = number(item.subtotal) || number(item.unit_price) * quantity;
    const unitPrice = number(item.unit_price) || total / quantity;
    return {
      id: String(item.id || `item-${index}`),
      description: String(product.name || "Rental item"),
      quantity,
      unitPrice,
      total,
    };
  });

  const modifierTotal = modifiers.reduce((sum: number, row: any) => {
    const total = number(
      row.subtotal ?? row.line_total ?? number(row.unit_price) * Math.max(1, number(row.quantity)),
    );
    return sum + total;
  }, 0);

  if (modifierTotal > 0.004) {
    lines.push({
      id: "selected-options",
      description: "Selected options and add-ons",
      quantity: 1,
      unitPrice: modifierTotal,
      total: modifierTotal,
    });
  }

  const total = number(booking.total_amount);
  const balance = Math.max(0, number(booking.balance_due));
  const recordedPaid = Math.max(0, number(booking.amount_paid));
  const paid = Math.min(total, Math.max(recordedPaid, total - balance));
  const status = balance <= 0.004 ? "PAID" : paid > 0.004 ? "PARTIALLY PAID" : "DUE";
  const address = [booking.setup_address, booking.setup_city, booking.setup_state, booking.setup_zip]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

  return {
    bookingId: String(booking.id),
    bookingNumber,
    invoiceNumber: `INV-${bookingNumber}`,
    issueDate: losAngelesDate(),
    dueLabel: balance <= 0.004 ? "Paid" : "Due upon receipt",
    status,
    customer: {
      name: String(customer.full_name || "Customer"),
      company: "",
      email: String(customer.email || ""),
      phone: String(customer.phone || ""),
      address: "",
      taxId: "",
    },
    event: {
      date: String(booking.event_date || ""),
      startTime: String(booking.event_start_time || ""),
      endTime: String(booking.event_end_time || ""),
      address,
    },
    business: {
      name: String(design.brand_name || "Bounce Party LA"),
      logoUrl: String(design.logo_url || ""),
      accentColor: String(design.accent_color || "#23313f"),
      address: String(design.business_address || ""),
      phone: String(design.business_phone || ""),
      email: String(design.business_email || ""),
      website: String(design.business_website || ""),
      footer: String(design.footer_text || "Thank you for choosing Bounce Party LA."),
    },
    lines,
    summary: {
      subtotal: number(booking.subtotal),
      discount: Math.max(0, number(booking.discount_amount)),
      delivery: number(booking.delivery_fee),
      taxRate: number(booking.tax_rate),
      tax: number(booking.tax_amount),
      total,
      paid,
      balance,
    },
  };
}

export type BookingInvoiceRecipientOverrides = Partial<{
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  taxId: string;
}>;

function cleanOverride(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

export function applyBookingInvoiceRecipientOverrides(
  invoice: BookingInvoiceData,
  overrides: BookingInvoiceRecipientOverrides,
): BookingInvoiceData {
  return {
    ...invoice,
    customer: {
      ...invoice.customer,
      name: cleanOverride(overrides.name, 160) || invoice.customer.name,
      company: cleanOverride(overrides.company, 200),
      email: cleanOverride(overrides.email, 254) || invoice.customer.email,
      phone: cleanOverride(overrides.phone, 80) || invoice.customer.phone,
      address: cleanOverride(overrides.address, 300),
      taxId: cleanOverride(overrides.taxId, 100),
    },
  };
}

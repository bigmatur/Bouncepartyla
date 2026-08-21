import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateCustomerAction } from "./actions";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatMoney(value: number | string | null | undefined) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numberValue);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function prettyStatus(status: string | null | undefined) {
  if (!status) {
    return "Unknown";
  }

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string | null | undefined) {
  if (!status) {
    return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
  }

  if (
    [
      "booked",
      "inventory_reserved",
      "scheduled",
      "installed",
      "closed",
    ].includes(status)
  ) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (
    [
      "draft",
      "pending",
      "quote",
      "picking",
      "loaded",
      "out_for_delivery",
      "pickup_scheduled",
      "picked_up",
      "returned",
      "cleaning",
    ].includes(status)
  ) {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (["cancelled", "failed"].includes(status)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function paymentClass(status: string | null | undefined) {
  if (status === "paid") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (status === "partial" || status === "deposit_paid") {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (status === "refunded" || status === "failed") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function textDefault(value: string | null | undefined) {
  return value || "";
}

function getCustomerInitials(name: string | null | undefined) {
  if (!name) {
    return "BP";
  }

  const parts = name.trim().split(/\s+/);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function getBookingProduct(booking: any) {
  return booking.booking_items?.[0]?.products || null;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[#3a342d]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm text-[#1f1e1b] outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm text-[#1f1e1b] outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default async function CustomerDetailPage(props: PageProps) {
  const params = await props.params;
  const supabase = await createClient();

  const customerResult = await supabase
    .from("customers")
    .select(
      `
      id,
      full_name,
      phone,
      email,
      notes,
      created_at,
      bookings (
        id,
        booking_number,
        status,
        payment_status,
        event_date,
        event_start_time,
        event_end_time,
        total_amount,
        balance_due,
        deposit_amount,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        created_at,
        booking_items (
          id,
          quantity,
          subtotal,
          products (
            id,
            name,
            image_url,
            short_description
          )
        ),
        booking_modifiers (
          id,
          quantity,
          subtotal,
          modifiers (
            id,
            name
          )
        ),
        payments (
          id,
          amount,
          method,
          status,
          paid_at
        )
      )
    `
    )
    .eq("id", params.id)
    .single();

  if (customerResult.error || !customerResult.data) {
    notFound();
  }

  const customer = customerResult.data as any;
  const bookings = [...(customer.bookings || [])].sort((a: any, b: any) => {
    return String(b.event_date || "").localeCompare(String(a.event_date || ""));
  });

  const totalRevenue = bookings.reduce((sum: number, booking: any) => {
    return sum + Number(booking.total_amount || 0);
  }, 0);

  const totalBalanceDue = bookings.reduce((sum: number, booking: any) => {
    return sum + Number(booking.balance_due || 0);
  }, 0);

  const totalPaid = bookings.reduce((sum: number, booking: any) => {
    const payments = booking.payments || [];

    const paid = payments.reduce((paymentSum: number, payment: any) => {
      if (payment.status === "failed") {
        return paymentSum;
      }

      return paymentSum + Number(payment.amount || 0);
    }, 0);

    return sum + paid;
  }, 0);

  const upcomingBookings = bookings.filter((booking: any) => {
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    return (
      booking.event_date >= todayIso &&
      booking.status !== "cancelled" &&
      booking.status !== "closed" &&
      booking.status !== "failed"
    );
  });

  const lastBooking = bookings[0] || null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-black/5 bg-white shadow-[0_18px_70px_rgba(0,0,0,0.08)]">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-6 lg:p-8">
            <Link
              href="/admin/customers"
              className="text-sm font-semibold text-[#9a7a49] hover:text-[#7f633a]"
            >
              ← Back to customers
            </Link>

            <div className="mt-5 inline-flex rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Customer profile
            </div>

            <div className="mt-6 flex flex-col gap-5 md:flex-row md:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] bg-[#23313f] text-3xl font-semibold text-white">
                {getCustomerInitials(customer.full_name)}
              </div>

              <div>
                <h2 className="text-3xl font-semibold tracking-tight text-[#1f1e1b] lg:text-4xl">
                  {customer.full_name || "No name"}
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6c6258]">
                  {customer.phone || "No phone"} ·{" "}
                  {customer.email || "No email"}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#eaf2f9] px-3 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                    {bookings.length} bookings
                  </span>

                  <span
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                      totalBalanceDue > 0
                        ? "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]"
                        : "bg-emerald-50 text-emerald-700 ring-emerald-200",
                    ].join(" ")}
                  >
                    {totalBalanceDue > 0
                      ? `Due ${formatMoney(totalBalanceDue)}`
                      : "No balance due"}
                  </span>

                  {upcomingBookings.length > 0 && (
                    <span className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold text-[#9a723e] ring-1 ring-[#e3d3bb]">
                      {upcomingBookings.length} upcoming
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/admin/bookings/new"
                className="rounded-full bg-[#c9964f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                + New booking
              </Link>

              <Link
                href="/admin/bookings"
                className="rounded-full border border-[#d8cec0] bg-white px-6 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                All bookings
              </Link>

              <Link
                href="/admin/calendar"
                className="rounded-full border border-[#d8cec0] bg-white px-6 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Calendar
              </Link>
            </div>
          </div>

          <div className="bg-[#23313f] p-6 text-white lg:p-8">
            <div className="text-sm font-medium text-white/55">
              Customer value
            </div>

            <div className="mt-3 text-5xl font-semibold">
              {formatMoney(totalRevenue)}
            </div>

            <div className="mt-2 text-sm text-white/55">
              Paid {formatMoney(totalPaid)} · Due {formatMoney(totalBalanceDue)}
            </div>

            <div className="mt-8 grid gap-3">
              <div className="rounded-[24px] bg-white/10 p-5">
                <div className="text-sm text-white/55">Bookings</div>
                <div className="mt-2 text-3xl font-semibold">
                  {bookings.length}
                </div>
              </div>

              <div className="rounded-[24px] bg-white/10 p-5">
                <div className="text-sm text-white/55">Last booking</div>
                <div className="mt-2 text-2xl font-semibold">
                  {lastBooking ? formatDate(lastBooking.event_date) : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <form
            action={updateCustomerAction}
            className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]"
          >
            <input type="hidden" name="customerId" value={customer.id} />

            <div className="border-b border-[#eee5d9] px-5 py-5">
              <h3 className="text-lg font-semibold text-[#1f1e1b]">
                Customer details
              </h3>

              <p className="mt-1 text-sm text-[#6c6258]">
                Contact information and internal notes.
              </p>
            </div>

            <div className="space-y-4 p-5">
              <Field label="Full name">
                <Input
                  name="fullName"
                  required
                  defaultValue={textDefault(customer.full_name)}
                />
              </Field>

              <Field label="Phone">
                <Input name="phone" defaultValue={textDefault(customer.phone)} />
              </Field>

              <Field label="Email">
                <Input
                  name="email"
                  type="email"
                  defaultValue={textDefault(customer.email)}
                />
              </Field>

              <Field label="Notes">
                <Textarea
                  name="notes"
                  rows={5}
                  defaultValue={textDefault(customer.notes)}
                />
              </Field>
            </div>

            <div className="border-t border-[#eee5d9] px-5 py-5">
              <button
                type="submit"
                className="w-full rounded-full bg-[#c9964f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Save customer
              </button>
            </div>
          </form>

          <div className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-lg font-semibold text-[#1f1e1b]">
              Quick stats
            </h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Total bookings</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {bookings.length}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Upcoming</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {upcomingBookings.length}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Total revenue</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {formatMoney(totalRevenue)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Paid</span>
                <span className="font-semibold text-emerald-700">
                  {formatMoney(totalPaid)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Balance due</span>
                <span className="font-semibold text-[#c9964f]">
                  {formatMoney(totalBalanceDue)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Customer since</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {customer.created_at
                    ? new Date(customer.created_at).toLocaleDateString()
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eee5d9] px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-[#1f1e1b]">
                  Booking history
                </h3>

                <p className="mt-1 text-sm text-[#6c6258]">
                  All bookings connected to this customer.
                </p>
              </div>

              <Link
                href="/admin/bookings/new"
                className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                + New booking
              </Link>
            </div>

            <div className="divide-y divide-[#f0e7dc]">
              {bookings.map((booking: any) => {
                const product = getBookingProduct(booking);
                const modifiers = booking.booking_modifiers || [];
                const payments = booking.payments || [];

                const paidAmount = payments.reduce(
                  (sum: number, payment: any) => {
                    if (payment.status === "failed") {
                      return sum;
                    }

                    return sum + Number(payment.amount || 0);
                  },
                  0
                );

                return (
                  <Link
                    key={booking.id}
                    href={`/admin/bookings/${booking.id}`}
                    className="grid gap-5 px-6 py-5 transition hover:bg-[#fcfaf7] xl:grid-cols-[1fr_0.7fr_0.7fr_0.55fr]"
                  >
                    <div className="flex min-w-0 gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[22px] bg-[#f1ebe1]">
                        {product?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-[#9f9488]">
                            No photo
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-[#1f1e1b]">
                          {product?.name || "Booking"}
                        </div>

                        <div className="mt-1 text-sm text-[#6c6258]">
                          #{booking.booking_number || booking.id.slice(0, 8)}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                              booking.status
                            )}`}
                          >
                            {prettyStatus(booking.status)}
                          </span>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${paymentClass(
                              booking.payment_status
                            )}`}
                          >
                            {prettyStatus(booking.payment_status)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                        Event
                      </div>

                      <div className="mt-2 font-semibold text-[#1f1e1b]">
                        {formatDate(booking.event_date)}
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        {booking.event_start_time || "—"} –{" "}
                        {booking.event_end_time || "—"}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                        Location / options
                      </div>

                      <div className="mt-2 truncate font-semibold text-[#1f1e1b]">
                        {[booking.setup_city, booking.setup_state, booking.setup_zip]
                          .filter(Boolean)
                          .join(", ") || "No location"}
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        {modifiers.length} options selected
                      </div>
                    </div>

                    <div className="xl:text-right">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                        Amount
                      </div>

                      <div className="mt-2 text-xl font-semibold text-[#1f1e1b]">
                        {formatMoney(booking.total_amount)}
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        Paid {formatMoney(paidAmount)}
                      </div>

                      <div className="mt-1 text-sm text-[#c9964f]">
                        Due {formatMoney(booking.balance_due)}
                      </div>
                    </div>
                  </Link>
                );
              })}

              {bookings.length === 0 && (
                <div className="px-6 py-16 text-center">
                  <div className="text-lg font-semibold text-[#1f1e1b]">
                    No bookings yet
                  </div>

                  <p className="mt-2 text-sm text-[#6c6258]">
                    Create the first booking for this customer.
                  </p>

                  <Link
                    href="/admin/bookings/new"
                    className="mt-6 inline-flex rounded-full bg-[#c9964f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
                  >
                    + New booking
                  </Link>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[30px] border border-black/5 bg-[#23313f] p-6 text-white shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <h3 className="text-xl font-semibold">Next CRM features</h3>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
                  Later we can add message history, contract links, automatic
                  reminders, customer tags and repeat-customer discounts.
                </p>
              </div>

              <Link
                href="/admin/bookings/new"
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#23313f] transition hover:bg-[#f5efe6]"
              >
                Create new booking
              </Link>
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}
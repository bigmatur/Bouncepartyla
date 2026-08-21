import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";

type PageProps = {
  searchParams?: Promise<{
    q?: string;
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
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getCustomerBookings(customer: any) {
  return customer.bookings || [];
}

function getCustomerTotal(customer: any) {
  const bookings = getCustomerBookings(customer);

  return bookings.reduce((sum: number, booking: any) => {
    return sum + Number(booking.total_amount || 0);
  }, 0);
}

function getCustomerBalance(customer: any) {
  const bookings = getCustomerBookings(customer);

  return bookings.reduce((sum: number, booking: any) => {
    return sum + Number(booking.balance_due || 0);
  }, 0);
}

function getLastBooking(customer: any) {
  const bookings = getCustomerBookings(customer);

  if (bookings.length === 0) {
    return null;
  }

  return [...bookings].sort((a: any, b: any) =>
    String(b.event_date || "").localeCompare(String(a.event_date || ""))
  )[0];
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

function statusClass(balanceDue: number) {
  if (balanceDue > 0) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
}

export default async function CustomersPage(props: PageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const query = (searchParams.q || "").trim();

  const { supabase } = await requireAdminPermission("customers.view");

  let customersQuery = supabase
    .from("customers")
    .select(
      `
      id,
      full_name,
      phone,
      email,
      created_at,
      notes,
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
        setup_city,
        setup_zip,
        booking_items (
          id,
          products (
            id,
            name,
            image_url
          )
        )
      )
    `
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (query) {
    customersQuery = customersQuery.or(
      `full_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`
    );
  }

  const customersResult = await customersQuery;

  if (customersResult.error) {
    throw new Error(customersResult.error.message);
  }

  const customers = customersResult.data || [];

  const totalBookings = customers.reduce((sum: number, customer: any) => {
    return sum + getCustomerBookings(customer).length;
  }, 0);

  const totalRevenue = customers.reduce((sum: number, customer: any) => {
    return sum + getCustomerTotal(customer);
  }, 0);

  const totalBalanceDue = customers.reduce((sum: number, customer: any) => {
    return sum + getCustomerBalance(customer);
  }, 0);

  const repeatCustomers = customers.filter((customer: any) => {
    return getCustomerBookings(customer).length > 1;
  });

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.04)] sm:rounded-[32px] sm:shadow-[0_18px_70px_rgba(0,0,0,0.08)]">
        <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="inline-flex rounded-full bg-[#f4ede2] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#9a723e] sm:px-3 sm:text-xs sm:font-semibold sm:tracking-[0.18em]">
              Customer CRM
            </div>

            <h2 className="mt-2.5 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:mt-4 sm:text-3xl sm:font-semibold lg:text-4xl">
              Customers
            </h2>

            <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-[#6c6258] sm:block sm:mt-3">
              Manage customer records, contact details, booking history,
              balances and repeat clients from one clean CRM screen.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:mt-7 sm:flex sm:flex-wrap sm:gap-3">
              <Link
                href="/admin/bookings/new"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c9964f] px-2.5 text-center text-[11px] font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-6 sm:py-3 sm:text-sm sm:font-semibold"
              >
                + New booking
              </Link>

              <Link
                href="/admin/bookings"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2.5 text-center text-[11px] font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-6 sm:py-3 sm:text-sm sm:font-semibold"
              >
                Bookings
              </Link>

              <Link
                href="/admin/calendar"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2.5 text-center text-[11px] font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-6 sm:py-3 sm:text-sm sm:font-semibold"
              >
                Calendar
              </Link>
            </div>
          </div>

          <div className="border-t border-[#eee5d9] bg-[#23313f] p-4 text-white sm:p-6 lg:border-l lg:border-t-0 lg:p-8">
            <div className="text-sm font-medium text-white/55">
              CRM overview
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:mt-6 sm:grid-cols-1 sm:gap-4">
              <div className="rounded-[16px] bg-white/10 p-3 sm:rounded-[24px] sm:p-5">
                <div className="text-sm text-white/55">Customers</div>
                <div className="mt-2 text-4xl font-semibold">
                  {customers.length}
                </div>
              </div>

              <div className="rounded-[16px] bg-white/10 p-3 sm:rounded-[24px] sm:p-5">
                <div className="text-sm text-white/55">Total revenue</div>
                <div className="mt-1 break-words text-3xl font-bold leading-none tracking-tight tabular-nums sm:mt-2 sm:text-4xl sm:font-semibold">
                  {formatMoney(totalRevenue)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[26px] sm:p-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
          <div className="text-sm font-medium text-[#8f7f6b]">Bookings</div>
          <div className="mt-3 text-3xl font-semibold text-[#1f1e1b]">
            {totalBookings}
          </div>
          <div className="mt-1 text-sm text-[#6c6258]">
            Bookings from loaded customers
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[26px] sm:p-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
          <div className="text-sm font-medium text-[#8f7f6b]">
            Repeat customers
          </div>
          <div className="mt-3 text-3xl font-semibold text-[#1f1e1b]">
            {repeatCustomers.length}
          </div>
          <div className="mt-1 text-sm text-[#6c6258]">
            More than one booking
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[26px] sm:p-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
          <div className="text-sm font-medium text-[#8f7f6b]">Balance due</div>
          <div className="mt-3 text-3xl font-semibold text-[#1f1e1b]">
            {formatMoney(totalBalanceDue)}
          </div>
          <div className="mt-1 text-sm text-[#6c6258]">
            Remaining payments
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[26px] sm:p-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
          <div className="text-sm font-medium text-[#8f7f6b]">Search</div>
          <div className="mt-3 text-3xl font-semibold text-[#1f1e1b]">
            {query ? customers.length : "—"}
          </div>
          <div className="mt-1 text-sm text-[#6c6258]">
            {query ? `Results for "${query}"` : "Use search below"}
          </div>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div>
              <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
                Customer list
              </h3>

              <p className="mt-1 text-sm text-[#6c6258]">
                {customers.length} customers loaded.
              </p>
            </div>

            <form className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:w-full md:w-auto" action="/admin/customers">
              <input
                name="q"
                defaultValue={query}
                placeholder="Search name, phone, email..."
                className="min-w-0 flex-1 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-full sm:px-5 sm:py-3 md:w-[320px]"
              />

              <button
                type="submit"
                className="rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3"
              >
                Search
              </button>

              {query && (
                <Link
                  href="/admin/customers"
                  className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                >
                  Clear
                </Link>
              )}
            </form>
          </div>
        </div>

        <div className="divide-y divide-[#f0e7dc]">
          {customers.map((customer: any) => {
            const bookings = getCustomerBookings(customer);
            const lastBooking = getLastBooking(customer);
            const total = getCustomerTotal(customer);
            const balance = getCustomerBalance(customer);
            const lastProduct = lastBooking?.booking_items?.[0]?.products;

            return (
              <Link
                key={customer.id}
                href={`/admin/customers/${customer.id}`}
                className="grid min-w-0 gap-2 px-3.5 py-3 transition hover:bg-[#fcfaf7] sm:gap-5 sm:px-6 sm:py-5 xl:grid-cols-[1fr_0.8fr_0.8fr_0.6fr]"
              >
                <div className="flex min-w-0 gap-3 sm:gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#23313f] text-sm font-bold text-white sm:h-16 sm:w-16 sm:rounded-[22px] sm:text-lg sm:font-semibold">
                    {getCustomerInitials(customer.full_name)}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold leading-5 text-[#1f1e1b] sm:text-base sm:font-semibold">
                      {customer.full_name || "No name"}
                    </div>

                    <div className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm">
                      {customer.phone || "No phone"}
                    </div>

                    <div className="truncate text-xs leading-5 text-[#8f7f6b] sm:mt-1 sm:text-sm">
                      {customer.email || "No email"}
                    </div>
                  </div>
                </div>

                <div className="hidden sm:block">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Last booking
                  </div>

                  <div className="mt-2 font-semibold text-[#1f1e1b]">
                    {lastBooking ? formatDate(lastBooking.event_date) : "No bookings"}
                  </div>

                  <div className="mt-1 truncate text-sm text-[#6c6258]">
                    {lastProduct?.name || "—"}
                  </div>

                  <div className="mt-1 text-sm text-[#8f7f6b]">
                    {lastBooking
                      ? `${lastBooking.event_start_time || "—"} – ${
                          lastBooking.event_end_time || "—"
                        }`
                      : "—"}
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[#fcfaf7] px-2.5 py-2 ring-1 ring-[#eee5d9] sm:block sm:rounded-none sm:bg-transparent sm:p-0 sm:ring-0">
                  <div className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49] sm:block">
                    History
                  </div>

                  <div className="text-xs font-bold text-[#1f1e1b] sm:mt-2 sm:text-base sm:font-semibold">
                    {bookings.length} {bookings.length === 1 ? "booking" : "bookings"}
                  </div>

                  <div className="text-xs text-[#6c6258] sm:mt-1 sm:text-sm">
                    · {formatMoney(total)}
                  </div>

                  <div className="ml-auto sm:ml-0 sm:mt-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                        balance
                      )}`}
                    >
                      {balance > 0 ? `Due ${formatMoney(balance)}` : "Paid"}
                    </span>
                  </div>
                </div>

                <div className="hidden sm:block xl:text-right">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    CRM
                  </div>

                  <div className="mt-2 text-sm text-[#6c6258]">
                    Created{" "}
                    {customer.created_at
                      ? new Date(customer.created_at).toLocaleDateString()
                      : "—"}
                  </div>

                  <div className="mt-3 text-sm font-semibold text-[#c9964f]">
                    Open profile →
                  </div>
                </div>
              </Link>
            );
          })}

          {customers.length === 0 && (
            <div className="px-6 py-16 text-center">
              <div className="text-lg font-semibold text-[#1f1e1b]">
                No customers found
              </div>

              <p className="mt-2 text-sm text-[#6c6258]">
                Create a booking or change your search.
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
    </div>
  );
}
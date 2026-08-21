import Link from "next/link";
import { redirect } from "next/navigation";

import CustomerShell from "@/components/account/CustomerShell";
import { getUnifiedAccess } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  customerId?: string;
}>;

type CustomerProfile = {
  customer_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type CustomerBooking = {
  id: string;
  booking_number: string | null;
  status: string;
  booking_source?: string | null;

  event_date: string;
  event_start_time: string | null;
  event_end_time: string | null;

  setup_city: string | null;
  setup_state: string | null;
  setup_zip: string | null;

  total_amount: number | string;
  amount_paid: number | string;
  balance_due: number | string;

  payment_status: string;
  contract_status: string;

  delivery_status: string | null;
  pickup_status: string | null;

  created_at: string;
};

function formatMoney(
  value: number | string | null | undefined,
) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string | null) {
  if (!value) {
    return null;
  }

  const [hoursString, minutesString] =
    value.split(":");

  const date = new Date();

  date.setHours(
    Number(hoursString),
    Number(minutesString),
    0,
    0,
  );

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function bookingStatusLabel(value: string) {
  const labels: Record<string, string> = {
    draft: "Booking started",
    quote: "Quote prepared",
    pending_deposit: "Waiting for deposit",
    booked: "Booked",
    scheduled: "Scheduled",
    inventory_reserved: "Equipment reserved",
    picking: "Preparing equipment",
    loaded: "Equipment loaded",
    out_for_delivery: "Out for delivery",
    installed: "Installed",
    pickup_scheduled: "Pickup scheduled",
    picked_up: "Picked up",
    returned: "Returned",
    cleaning: "Equipment cleaning",
    closed: "Completed",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };

  return (
    labels[value] ||
    value
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) =>
        character.toUpperCase(),
      )
  );
}

function paymentStatusLabel(value: string) {
  const labels: Record<string, string> = {
    unpaid: "Payment due",
    partial: "Partially paid",
    paid: "Paid",
    refunded: "Refunded",
    failed: "Payment failed",
  };

  return labels[value] || value;
}

function contractStatusLabel(value: string) {
  const labels: Record<string, string> = {
    not_sent: "Contract not sent",
    sent: "Contract sent",
    viewed: "Contract viewed",
    signed: "Contract signed",
    expired: "Contract expired",
    cancelled: "Contract cancelled",
  };

  return labels[value] || value;
}

function getStatusClass(status: string) {
  switch (status) {
    case "cancelled":
    case "refunded":
      return "bg-red-50 text-red-700";

    case "closed":
    case "returned":
    case "picked_up":
      return "bg-emerald-50 text-emerald-700";

    case "installed":
    case "out_for_delivery":
    case "loaded":
      return "bg-blue-50 text-blue-700";

    case "pending_deposit":
    case "quote":
    case "draft":
      return "bg-amber-50 text-amber-700";

    default:
      return "bg-black/[0.05] text-black/70";
  }
}

function CustomerPreviewEmptyState({
  userEmail,
  reason,
}: {
  userEmail: string;
  reason: string;
}) {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <section className="rounded-[30px] border border-black/10 bg-white p-8 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">
          Customer interface
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          No customer profile linked
        </h1>

        <p className="mt-3 text-sm leading-6 text-black/60">
          This account can preview the customer interface, but it is not linked to a customer profile yet.
        </p>

        <p className="mt-2 text-xs text-black/45">
          Signed in as {userEmail}. {reason}
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/admin/customers"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white transition hover:bg-black"
          >
            Open customers
          </Link>

          <Link
            href="/admin"
            className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-black/10 bg-white px-5 text-sm font-semibold text-[#1d1d1b] transition hover:bg-black/[0.03]"
          >
            Back to admin
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedPreviewCustomerId = String(params.customerId || "").trim();
  const supabase = await createClient();

  const access = await getUnifiedAccess(supabase);
  const user = access.user || null;

  if (!user) {
    redirect("/account/login");
  }

  const canPreviewCustomer = access.role !== "customer" && access.can("preview.customer");
  const userEmail = String(user.email || user.id || "staff");

  if (canPreviewCustomer) {
    const previewCustomersResult = await supabase
      .from("customers")
      .select(
        `
        id,
        full_name,
        phone,
        email,
        bookings (
          id,
          booking_number,
          status,
          event_date,
          event_start_time,
          event_end_time,
          setup_city,
          setup_state,
          setup_zip,
          total_amount,
          amount_paid,
          balance_due,
          payment_status,
          contract_status,
          delivery_status,
          pickup_status,
          created_at
        )
      `
      )
      .order("full_name", { ascending: true })
      .limit(300);

    if (previewCustomersResult.error) {
      return (
        <CustomerPreviewEmptyState
          userEmail={userEmail}
          reason={`Could not load customers for preview: ${previewCustomersResult.error.message}`}
        />
      );
    }

    const previewCustomers = (previewCustomersResult.data || []) as Array<{
      id: string;
      full_name: string | null;
      phone: string | null;
      email: string | null;
      bookings?: CustomerBooking[] | null;
    }>;

    if (previewCustomers.length === 0) {
      return (
        <CustomerPreviewEmptyState
          userEmail={userEmail}
          reason="There are no customers in the database yet."
        />
      );
    }

    const selectedCustomer =
      previewCustomers.find((customer) => customer.id === requestedPreviewCustomerId) ||
      previewCustomers[0];

    const selectedCustomerName =
      selectedCustomer.full_name ||
      selectedCustomer.email ||
      "Customer";

    const selectedCustomerBookings = [
      ...((selectedCustomer.bookings || []) as CustomerBooking[]),
    ].sort((left, right) => {
      const leftDate = String(left.event_date || "");
      const rightDate = String(right.event_date || "");
      return rightDate.localeCompare(leftDate);
    });

    const upcomingBookings = selectedCustomerBookings.filter(
      (booking) =>
        booking.status !== "cancelled" &&
        booking.status !== "refunded" &&
        booking.status !== "closed" &&
        booking.status !== "returned",
    );

    const completedBookings = selectedCustomerBookings.filter(
      (booking) =>
        booking.status === "closed" ||
        booking.status === "returned" ||
        booking.status === "cancelled" ||
        booking.status === "refunded",
    );

    return (
      <CustomerShell
        displayName={access.displayName}
        userEmail={access.user?.email || null}
        role={access.role}
        defaultInterface={access.defaultInterface}
        availableInterfaces={access.availableInterfaces}
        grantedPermissions={access.grantedPermissions}
        previewMode
      >
      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-10">
        <section className="rounded-[30px] border border-black/10 bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:p-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">
                Customer interface preview
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                {selectedCustomerName}
              </h1>

              <div className="mt-3 flex flex-wrap gap-2 text-sm text-black/55">
                {selectedCustomer.email ? <span>{selectedCustomer.email}</span> : null}
                {selectedCustomer.phone ? <span>{selectedCustomer.phone}</span> : null}
              </div>
            </div>

            <form className="w-full max-w-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                  Preview customer
                </span>

                <select
                  name="customerId"
                  defaultValue={selectedCustomer.id}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm"
                >
                  {previewCustomers.map((customer) => {
                    const name = customer.full_name || customer.email || "Customer";

                    return (
                      <option key={customer.id} value={customer.id}>
                        {name}
                      </option>
                    );
                  })}
                </select>
              </label>

              <button
                type="submit"
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl border border-black/10 px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
              >
                Switch preview
              </button>
            </form>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">
                Reservations
              </p>

              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                Customer bookings
              </h2>
            </div>

            <div className="flex gap-3 text-sm text-black/45">
              <span>{upcomingBookings.length} active</span>
              <span aria-hidden="true">·</span>
              <span>{completedBookings.length} completed</span>
            </div>
          </div>

          {selectedCustomerBookings.length === 0 ? (
            <div className="mt-5 rounded-[26px] border border-dashed border-black/15 bg-white/60 px-6 py-12 text-center">
              <p className="font-semibold">No bookings found</p>

              <p className="mt-2 text-sm text-black/50">
                This customer has no bookings yet.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-4">
              {selectedCustomerBookings.map((booking) => {
                const startTime = formatTime(
                  booking.event_start_time,
                );

                const endTime = formatTime(
                  booking.event_end_time,
                );

                const eventTime =
                  startTime && endTime
                    ? `${startTime} – ${endTime}`
                    : startTime || endTime;

                const location = [
                  booking.setup_city,
                  booking.setup_state,
                  booking.setup_zip,
                ]
                  .filter(Boolean)
                  .join(", ");

                return (
                  <article
                    key={booking.id}
                    className="rounded-[26px] border border-black/10 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-semibold">
                            {booking.booking_number ||
                              "Booking"}
                          </h3>

                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                              booking.status,
                            )}`}
                          >
                            {bookingStatusLabel(
                              booking.status,
                            )}
                          </span>
                        </div>

                        <p className="mt-4 text-base font-semibold">
                          {formatDate(
                            booking.event_date,
                          )}
                        </p>

                        {eventTime ? (
                          <p className="mt-1 text-sm text-black/55">
                            {eventTime}
                          </p>
                        ) : null}

                        {location ? (
                          <p className="mt-1 text-sm capitalize text-black/55">
                            {location}
                          </p>
                        ) : null}

                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-medium text-black/55">
                            {paymentStatusLabel(
                              booking.payment_status,
                            )}
                          </span>

                          <span className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-medium text-black/55">
                            {contractStatusLabel(
                              booking.contract_status,
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="min-w-48 rounded-2xl bg-[#f7f4ef] px-4 py-3 sm:text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
                          Balance due
                        </p>

                        <p className="mt-1 text-xl font-semibold">
                          {formatMoney(
                            booking.balance_due,
                          )}
                        </p>

                        <p className="mt-1 text-xs text-black/45">
                          Paid{" "}
                          {formatMoney(
                            booking.amount_paid,
                          )}{" "}
                          of{" "}
                          {formatMoney(
                            booking.total_amount,
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-black/[0.07] pt-4">
                      <p className="text-xs text-black/40">
                        Admin preview mode for customer booking details.
                      </p>

                      <Link
                        href={`/account/bookings/${booking.id}?preview=admin`}
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-black/10 px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
                      >
                        View details
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      </CustomerShell>
    );
  }

  const { data: profileRows, error: profileError } = await supabase.rpc(
    "get_my_customer_profile"
  );

  if (profileError) {
    console.error(
      "Customer profile error:",
      profileError.message,
    );

    if (canPreviewCustomer) {
      return (
        <CustomerPreviewEmptyState
          userEmail={userEmail}
          reason="Customer profile RPC did not return data for this user."
        />
      );
    }

    redirect("/account/login");
  }

  const profile =
    (profileRows?.[0] as
      | CustomerProfile
      | undefined) || null;

  if (!profile) {
    if (canPreviewCustomer) {
      return (
        <CustomerPreviewEmptyState
          userEmail={userEmail}
          reason="No customer record is associated with the current account."
        />
      );
    }

    redirect("/account/login");
  }

  let bookings: CustomerBooking[] = [];

  const directBookingsResult = await supabase
    .from("bookings")
    .select(
      `
      id,
      booking_number,
      status,
      booking_source,
      event_date,
      event_start_time,
      event_end_time,
      setup_city,
      setup_state,
      setup_zip,
      total_amount,
      amount_paid,
      balance_due,
      payment_status,
      contract_status,
      delivery_status,
      pickup_status,
      created_at
      `
    )
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  if (!directBookingsResult.error) {
    bookings = (directBookingsResult.data || []) as CustomerBooking[];

    // In some RLS states direct table reads can silently return 0 rows.
    // RPC may still resolve the current customer's bookings correctly.
    if (bookings.length === 0) {
      const rpcBookingsResult = await supabase.rpc("get_my_bookings");

      if (!rpcBookingsResult.error) {
        bookings = (rpcBookingsResult.data as CustomerBooking[] | null) || [];
      } else {
        console.error(
          "Customer bookings RPC fallback error:",
          rpcBookingsResult.error.message,
        );
      }
    }
  } else {
    console.error(
      "Customer bookings direct query error:",
      directBookingsResult.error.message,
    );

    const rpcBookingsResult = await supabase.rpc("get_my_bookings");

    if (rpcBookingsResult.error) {
      console.error(
        "Customer bookings RPC error:",
        rpcBookingsResult.error.message,
      );
    } else {
      bookings = (rpcBookingsResult.data as CustomerBooking[] | null) || [];
    }
  }

  // A self-service Stripe row in pending_deposit is an inventory/payment
  // checkout hold, not a finalized customer booking. Keep it out of My Bookings
  // if the browser is closed before Stripe finishes. It is removed by the
  // cancel/expiry flow and becomes visible normally once finalized as booked.
  const pendingBookingIds = bookings
    .filter((booking) => String(booking.status || "").toLowerCase() === "pending_deposit")
    .map((booking) => booking.id);

  if (pendingBookingIds.length > 0) {
    const sourceRows = await supabase
      .from("bookings")
      .select("id, booking_source")
      .in("id", pendingBookingIds);

    if (!sourceRows.error) {
      const sourceById = new Map(
        (sourceRows.data || []).map((row: any) => [String(row.id), String(row.booking_source || "")]),
      );

      bookings = bookings.map((booking) => ({
        ...booking,
        booking_source: booking.booking_source || sourceById.get(booking.id) || null,
      }));
    }
  }

  bookings = bookings.filter(
    (booking) =>
      !(
        String(booking.status || "").toLowerCase() === "pending_deposit" &&
        String(booking.booking_source || "").toLowerCase() === "customer_self_service"
      ),
  );

  const customerName =
    profile.full_name ||
    [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ") ||
    "Customer";

  const upcomingBookings = bookings.filter(
    (booking) =>
      booking.status !== "cancelled" &&
      booking.status !== "refunded" &&
      booking.status !== "closed" &&
      booking.status !== "returned",
  );

  const completedBookings = bookings.filter(
    (booking) =>
      booking.status === "closed" ||
      booking.status === "returned" ||
      booking.status === "cancelled" ||
      booking.status === "refunded",
  );

  return (
    <CustomerShell
      displayName={access.displayName}
      userEmail={access.user?.email || null}
      role={access.role}
      defaultInterface={access.defaultInterface}
      availableInterfaces={access.availableInterfaces}
      grantedPermissions={access.grantedPermissions}
    >
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-10">
      <section className="rounded-[30px] border border-black/10 bg-white p-7 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">
          Customer account
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
          Welcome, {customerName}
        </h1>

        <div className="mt-5 flex flex-wrap gap-x-7 gap-y-2 text-sm text-black/55">
          {profile.email ? (
            <span>{profile.email}</span>
          ) : null}

          {profile.phone ? (
            <span>{profile.phone}</span>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">
              Reservations
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
              My bookings
            </h2>
          </div>

          <div className="flex gap-3 text-sm text-black/45">
            <span>
              {upcomingBookings.length} active
            </span>

            <span aria-hidden="true">·</span>

            <span>
              {completedBookings.length} completed
            </span>
          </div>
        </div>

        {bookings.length === 0 ? (
          <div className="mt-5 rounded-[26px] border border-dashed border-black/15 bg-white/60 px-6 py-12 text-center">
            <p className="font-semibold">
              No bookings found
            </p>

            <p className="mt-2 text-sm text-black/50">
              Your confirmed bookings will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4">
            {bookings.map((booking) => {
              const startTime = formatTime(
                booking.event_start_time,
              );

              const endTime = formatTime(
                booking.event_end_time,
              );

              const eventTime =
                startTime && endTime
                  ? `${startTime} – ${endTime}`
                  : startTime || endTime;

              const location = [
                booking.setup_city,
                booking.setup_state,
                booking.setup_zip,
              ]
                .filter(Boolean)
                .join(", ");

              return (
                <article
                  key={booking.id}
                  className="rounded-[26px] border border-black/10 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)]"
                >
                  <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold">
                          {booking.booking_number ||
                            "Booking"}
                        </h3>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClass(
                            booking.status,
                          )}`}
                        >
                          {bookingStatusLabel(
                            booking.status,
                          )}
                        </span>
                      </div>

                      <p className="mt-4 text-base font-semibold">
                        {formatDate(
                          booking.event_date,
                        )}
                      </p>

                      {eventTime ? (
                        <p className="mt-1 text-sm text-black/55">
                          {eventTime}
                        </p>
                      ) : null}

                      {location ? (
                        <p className="mt-1 text-sm capitalize text-black/55">
                          {location}
                        </p>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-medium text-black/55">
                          {paymentStatusLabel(
                            booking.payment_status,
                          )}
                        </span>

                        <span className="rounded-full bg-black/[0.04] px-3 py-1 text-xs font-medium text-black/55">
                          {contractStatusLabel(
                            booking.contract_status,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-48 rounded-2xl bg-[#f7f4ef] px-4 py-3 sm:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
                        Balance due
                      </p>

                      <p className="mt-1 text-xl font-semibold">
                        {formatMoney(
                          booking.balance_due,
                        )}
                      </p>

                      <p className="mt-1 text-xs text-black/45">
                        Paid{" "}
                        {formatMoney(
                          booking.amount_paid,
                        )}{" "}
                        of{" "}
                        {formatMoney(
                          booking.total_amount,
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-black/[0.07] pt-4">
                    <p className="text-xs text-black/40">
                      Booking details, equipment,
                      payments and contract
                    </p>

                    <Link
                      href={`/account/bookings/${booking.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-black/10 px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
                    >
                      View details
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
    </CustomerShell>
  );
}
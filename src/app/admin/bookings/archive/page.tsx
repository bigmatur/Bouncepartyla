import Link from "next/link";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import { restoreArchivedBookingAction } from "../[id]/booking-admin-actions";

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
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
  const value = String(status || "").toLowerCase();

  if (["booked", "scheduled", "installed", "closed", "completed"].includes(value)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (["cancelled", "canceled", "failed", "refunded"].includes(value)) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]";
}

function normalizeReason(value: string | null | undefined) {
  return String(value || "").trim();
}

function isMissingFunctionError(error: any, functionName: string) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (code === "42883") {
    return true;
  }

  return (
    message.includes("function") &&
    message.includes(functionName.toLowerCase()) &&
    message.includes("does not exist")
  );
}

function isMissingColumnError(error: any, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (code === "42703" || code === "pgrst204") {
    return true;
  }

  return message.includes("column") && message.includes(String(columnName || "").toLowerCase());
}

function isMissingArchiveColumnError(error: any) {
  return (
    isMissingColumnError(error, "archive_reason") ||
    isMissingColumnError(error, "archived_by")
  );
}

export default async function AdminBookingsArchivePage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    reason?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { supabase } = await requireAdminPermission("bookings.view");
  const params = searchParams ? await searchParams : {};

  const query = String(params.q || "").trim().toLowerCase();
  const selectedStatus = String(params.status || "all");
  const selectedReason = String(params.reason || "all");
  const selectedFrom = String(params.from || "").trim();
  const selectedTo = String(params.to || "").trim();

  const selectWithArchiveDetails = `
      id,
      booking_number,
      status,
      event_date,
      setup_city,
      setup_state,
      setup_zip,
      total_amount,
      balance_due,
      archive_reason,
      archived_by,
      archived_at,
      customers (
        id,
        full_name,
        phone,
        email
      )
    `;
  const selectWithoutArchiveReason = `
      id,
      booking_number,
      status,
      event_date,
      setup_city,
      setup_state,
      setup_zip,
      total_amount,
      balance_due,
      archived_by,
      archived_at,
      customers (
        id,
        full_name,
        phone,
        email
      )
    `;
  const selectWithoutArchiveReasonAndBy = `
      id,
      booking_number,
      status,
      event_date,
      setup_city,
      setup_state,
      setup_zip,
      total_amount,
      balance_due,
      archived_at,
      customers (
        id,
        full_name,
        phone,
        email
      )
    `;

  async function loadArchivedBookings(selectClause: string) {
    return await supabase
      .from("bookings")
      .select(selectClause)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(500);
  }

  const selectCandidates = [
    selectWithArchiveDetails,
    selectWithoutArchiveReason,
    selectWithoutArchiveReasonAndBy,
  ];

  let archivedResult = await loadArchivedBookings(selectCandidates[0]);

  for (let index = 1; index < selectCandidates.length; index += 1) {
    if (!archivedResult.error) {
      break;
    }

    if (!isMissingArchiveColumnError(archivedResult.error)) {
      break;
    }

    archivedResult = await loadArchivedBookings(selectCandidates[index]);
  }

  if (archivedResult.error) {
    throw new Error(archivedResult.error.message);
  }

  const rows = (archivedResult.data || []) as any[];

  const archivedByIds = Array.from(
    new Set(rows.map((row) => row.archived_by).filter(Boolean))
  );

  const archivedByLookup = new Map<string, { full_name: string | null; email: string | null }>();

  if (archivedByIds.length > 0) {
    const directoryResult = await supabase.rpc("admin_access_user_directory");

    if (directoryResult.error) {
      if (!isMissingFunctionError(directoryResult.error, "admin_access_user_directory")) {
        throw new Error(directoryResult.error.message);
      }
    } else {
      for (const row of directoryResult.data || []) {
        if (!row?.auth_user_id) continue;

        archivedByLookup.set(String(row.auth_user_id), {
          full_name: row.full_name || null,
          email: row.email || null,
        });
      }
    }
  }

  const statusFiltered = selectedStatus === "all"
    ? rows
    : rows.filter((row) => String(row.status || "") === selectedStatus);

  const reasonFiltered = selectedReason === "all"
    ? statusFiltered
    : statusFiltered.filter((row) => normalizeReason(row.archive_reason) === selectedReason);

  const dateFiltered = reasonFiltered.filter((row) => {
    const archivedAt = String(row.archived_at || "").slice(0, 10);

    if (selectedFrom && archivedAt < selectedFrom) {
      return false;
    }

    if (selectedTo && archivedAt > selectedTo) {
      return false;
    }

    return true;
  });

  const filtered = query
    ? dateFiltered.filter((row) => {
        const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;

        const haystack = [
          row.booking_number,
          row.status,
          row.archive_reason,
          row.setup_city,
          row.setup_state,
          row.setup_zip,
          customer?.full_name,
          customer?.phone,
          customer?.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
    : dateFiltered;

  const reasonOptions = Array.from(
    new Set(rows.map((row) => normalizeReason(row.archive_reason)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">Booking archive</div>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">Archived bookings</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Search and review archived bookings. Archived items are hidden from active planning and can be restored when needed.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/admin/bookings" className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]">
              Active bookings
            </Link>
            <Link href="/admin/bookings?view=all" className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]">
              All bookings
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-6 py-5">
          <form className="grid gap-3 xl:grid-cols-[220px_180px_180px_180px_1fr_120px]">
            <select
              name="reason"
              defaultValue={selectedReason}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            >
              <option value="all">All reasons</option>
              {reasonOptions.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>

            <select
              name="status"
              defaultValue={selectedStatus}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="quote">Quote</option>
              <option value="pending_deposit">Pending deposit</option>
              <option value="booked">Booked</option>
              <option value="scheduled">Scheduled</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>

            <input
              type="date"
              name="from"
              defaultValue={selectedFrom}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />

            <input
              type="date"
              name="to"
              defaultValue={selectedTo}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />

            <input
              name="q"
              defaultValue={query}
              placeholder="Search booking number, customer, phone, email..."
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />

            <button type="submit" className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]">
              Filter
            </button>
          </form>
        </div>

        <div className="divide-y divide-[#eee5d9]">
          {filtered.map((booking) => {
            const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers;
            const location = [booking.setup_city, booking.setup_state, booking.setup_zip].filter(Boolean).join(", ");
            const archivedBy = booking.archived_by
              ? archivedByLookup.get(String(booking.archived_by))
              : null;
            const archivedByLabel = archivedBy?.full_name || archivedBy?.email || null;

            return (
              <article key={booking.id} className="px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-[#1f1e1b]">#{booking.booking_number || String(booking.id).slice(0, 8)}</div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClass(booking.status)}`}>
                        {prettyStatus(booking.status)}
                      </span>
                      <span className="rounded-full bg-[#23313f] px-3 py-1 text-xs font-semibold text-white">Archived</span>
                      {normalizeReason(booking.archive_reason) ? (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#d8cec0]">
                          {normalizeReason(booking.archive_reason)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 text-sm text-[#6c6258]">
                      {customer?.full_name || "No customer"}
                      {customer?.phone ? ` · ${customer.phone}` : ""}
                      {customer?.email ? ` · ${customer.email}` : ""}
                    </div>

                    <div className="mt-1 text-sm text-[#8b8177]">
                      Event: {formatDate(booking.event_date)}
                      {location ? ` · ${location}` : ""}
                    </div>

                    <div className="mt-1 text-xs text-[#8b8177]">
                      Archived at {formatDateTime(booking.archived_at)}
                      {archivedByLabel
                        ? ` · by ${archivedByLabel}`
                        : booking.archived_by
                          ? ` · by ${String(booking.archived_by).slice(0, 8)}`
                          : ""}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/bookings/${booking.id}`}
                      className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                    >
                      Open booking
                    </Link>

                    <form action={restoreArchivedBookingAction}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Restore
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            );
          })}

          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#6c6258]">
              No archived bookings match your filters.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

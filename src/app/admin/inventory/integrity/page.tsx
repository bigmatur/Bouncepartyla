import Link from "next/link";

import { requireAdminPermission } from "@/lib/auth/require-admin";

function integer(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function metricCard({
  label,
  value,
  description,
  tone = "neutral",
}: {
  label: string;
  value: number;
  description: string;
  tone?: "neutral" | "good" | "warning" | "danger";
}) {
  const toneClass =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : tone === "danger"
          ? "bg-red-50 text-red-700 ring-red-200"
          : "bg-[#f7f3ed] text-[#5e564e] ring-[#e7ddd0]";

  return (
    <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 sm:rounded-[24px] sm:p-5">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a723e] sm:text-xs sm:font-semibold">
        {label}
      </div>

      <div className="mt-2 flex items-end justify-between gap-2 sm:mt-3 sm:gap-3">
        <div className="text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
          {value}
        </div>

        <span
          className={[
            "inline-flex shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ring-1 sm:px-2.5 sm:text-[11px] sm:font-semibold",
            toneClass,
          ].join(" ")}
        >
          {tone === "good"
            ? "Healthy"
            : tone === "danger"
              ? "Action"
              : tone === "warning"
                ? "Review"
                : "Info"}
        </span>
      </div>

      <p className="mt-2 hidden text-sm leading-6 text-[#6c6258] sm:block">
        {description}
      </p>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function InventoryIntegrityPage() {
  const { supabase } = await requireAdminPermission("inventory.view");

  const [
    expiredHoldsResult,
    orphanResult,
    cancelledResult,
    historicalResult,
    activeFutureResult,
  ] = await Promise.all([
    supabase.rpc("preview_expired_customer_checkout_holds"),

    supabase
      .from("inventory_reservations")
      .select("id, booking_id", { count: "exact", head: true })
      .is("booking_id", null),

    supabase
      .from("inventory_reservations")
      .select(
        `
          id,
          bookings!inner (
            id,
            status
          )
        `,
        { count: "exact", head: true },
      )
      .in("bookings.status", ["cancelled", "canceled"]),

    supabase
      .from("inventory_reservations")
      .select(
        `
          id,
          reserved_until,
          status,
          bookings!inner (
            id,
            event_date,
            status
          )
        `,
        { count: "exact", head: true },
      )
      .lt("reserved_until", new Date().toISOString())
      .eq("status", "reserved"),

    supabase
      .from("inventory_reservations")
      .select("id", { count: "exact", head: true })
      .gte("reserved_until", new Date().toISOString())
      .eq("status", "reserved"),
  ]);

  if (expiredHoldsResult.error) {
    throw new Error(expiredHoldsResult.error.message);
  }

  if (orphanResult.error) {
    throw new Error(orphanResult.error.message);
  }

  /*
   * Some schemas may not allow enum spelling "canceled".
   * If the relation query fails because of an enum value, keep the dashboard
   * available and show 0 rather than making Integrity itself unusable.
   */
  const cancelledCount = cancelledResult.error
    ? 0
    : integer(cancelledResult.count);

  if (historicalResult.error) {
    throw new Error(historicalResult.error.message);
  }

  if (activeFutureResult.error) {
    throw new Error(activeFutureResult.error.message);
  }

  const expiredHolds = Array.isArray(expiredHoldsResult.data)
    ? expiredHoldsResult.data
    : [];

  const expiredCount = expiredHolds.length;
  const orphanCount = integer(orphanResult.count);
  const historicalCount = integer(historicalResult.count);
  const futureCount = integer(activeFutureResult.count);

  const criticalCount = expiredCount + orphanCount + cancelledCount;
  const healthy = criticalCount === 0;

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Inventory
            </div>

            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Reservation Integrity
            </h1>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Read-only health view for inventory reservations and abandoned
              customer checkout holds.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Link
              href="/admin/inventory/integrity"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#243442] transition hover:bg-[#f8f4ee] sm:rounded-full sm:px-4 sm:text-sm sm:font-semibold"
            >
              Refresh
            </Link>

            <span
              className={[
                "inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-center text-[11px] font-bold ring-1 sm:rounded-full sm:px-4 sm:text-sm sm:font-semibold",
                healthy
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-red-50 text-red-700 ring-red-200",
              ].join(" ")}
            >
              {healthy
                ? "System healthy"
                : `${criticalCount} issue${criticalCount === 1 ? "" : "s"} need attention`}
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        {metricCard({
          label: "Expired checkout holds",
          value: expiredCount,
          description:
            "Abandoned customer_self_service bookings older than the Stripe hold window.",
          tone: expiredCount > 0 ? "danger" : "good",
        })}

        {metricCard({
          label: "Orphan reservations",
          value: orphanCount,
          description:
            "Reservations with no booking_id. These should normally never exist.",
          tone: orphanCount > 0 ? "danger" : "good",
        })}

        {metricCard({
          label: "Cancelled booking holds",
          value: cancelledCount,
          description:
            "Reservations still attached to cancelled bookings.",
          tone: cancelledCount > 0 ? "danger" : "good",
        })}

        {metricCard({
          label: "Historical reservations",
          value: historicalCount,
          description:
            "Past reserved rows kept as history. Informational only; not auto-deleted.",
          tone: "neutral",
        })}

        <div className="col-span-2 md:col-span-1">
          {metricCard({
            label: "Active / future holds",
            value: futureCount,
            description:
              "Current and future inventory reservations participating in availability.",
            tone: "neutral",
          })}
        </div>
      </section>

      <section className="min-w-0 rounded-[20px] border border-black/5 bg-white p-3.5 shadow-[0_8px_26px_rgba(0,0,0,0.03)] sm:rounded-[28px] sm:p-6 sm:shadow-[0_10px_30px_rgba(0,0,0,0.025)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a723e] sm:text-xs sm:font-semibold">
              Safe cleanup candidates
            </div>

            <h2 className="mt-1 text-lg font-bold tracking-tight text-[#1f1e1b] sm:text-2xl sm:font-semibold">
              Expired self-service checkout holds
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Only customer self-service, unpaid, pending-deposit bookings can
              appear here. Admin bookings are excluded by the database rule.
            </p>
          </div>

          <div className="self-start rounded-full bg-[#f7f3ed] px-3 py-1.5 text-[10px] font-bold text-[#6c6258] ring-1 ring-[#e7ddd0] sm:text-xs sm:font-semibold">
            Auto self-healing enabled
          </div>
        </div>

        {expiredHolds.length === 0 ? (
          <div className="mt-4 rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-xs font-medium leading-5 text-emerald-800 sm:mt-5 sm:rounded-[22px] sm:px-5 sm:py-6 sm:text-sm">
            ✓ No expired customer checkout holds are blocking inventory.
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-2.5 sm:hidden">
              {expiredHolds.map((row: any) => (
                <div
                  key={String(row.booking_id)}
                  className="rounded-[16px] border border-[#eee5d9] bg-[#fcfaf7] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#1f1e1b]">
                        {row.booking_number ||
                          String(row.booking_id).slice(0, 8)}
                      </div>

                      <div className="mt-0.5 truncate text-[11px] text-[#6c6258]">
                        {row.booking_source || "—"}
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                      {row.booking_status || "pending_deposit"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                        Payment
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold text-[#1f1e1b]">
                        {row.payment_status_text || "unpaid"}
                      </div>
                      <div className="text-[10px] text-[#6c6258]">
                        ${Number(row.amount_paid || 0).toFixed(2)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                        Age
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold text-[#1f1e1b]">
                        {Number(row.age_minutes || 0).toFixed(0)} min
                      </div>
                    </div>

                    <div className="rounded-xl bg-white p-2 ring-1 ring-[#eee5d9]">
                      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#9a7a49]">
                        Reservations
                      </div>
                      <div className="mt-0.5 text-[11px] font-bold text-[#1f1e1b]">
                        {integer(row.reservation_count)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-[#8b8177]">
                    Created {formatDateTime(row.created_at)}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 hidden overflow-x-auto sm:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e7dfd4] text-xs uppercase tracking-[0.12em] text-[#8b8177]">
                    <th className="px-3 py-3">Booking</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Payment</th>
                    <th className="px-3 py-3">Age</th>
                    <th className="px-3 py-3">Reservations</th>
                    <th className="px-3 py-3">Created</th>
                  </tr>
                </thead>

                <tbody>
                  {expiredHolds.map((row: any) => (
                    <tr
                      key={String(row.booking_id)}
                      className="border-b border-[#f0eae2] last:border-0"
                    >
                      <td className="px-3 py-4 font-semibold text-[#1f1e1b]">
                        {row.booking_number ||
                          String(row.booking_id).slice(0, 8)}
                      </td>

                      <td className="px-3 py-4 text-[#5d554d]">
                        {row.booking_source || "—"}
                      </td>

                      <td className="px-3 py-4">
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                          {row.booking_status || "pending_deposit"}
                        </span>
                      </td>

                      <td className="px-3 py-4 text-[#5d554d]">
                        {row.payment_status_text || "unpaid"} · $
                        {Number(row.amount_paid || 0).toFixed(2)}
                      </td>

                      <td className="px-3 py-4 font-semibold text-[#5d554d]">
                        {Number(row.age_minutes || 0).toFixed(0)} min
                      </td>

                      <td className="px-3 py-4 text-[#5d554d]">
                        {integer(row.reservation_count)}
                      </td>

                      <td className="px-3 py-4 text-[#8b8177]">
                        {formatDateTime(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="min-w-0 rounded-[20px] border border-[#d8cec0] bg-[#fffdf9] p-3.5 sm:rounded-[26px] sm:p-5">
        <div className="text-sm font-bold text-[#1f1e1b] sm:font-semibold">
          Safety rules
        </div>

        <div className="mt-3 grid gap-2.5 text-xs leading-5 text-[#5d554d] sm:gap-3 sm:text-sm sm:leading-6 md:grid-cols-2">
          <div className="rounded-xl bg-white p-3 ring-1 ring-[#e7ddd0] sm:rounded-2xl sm:p-4">
            <strong>Admin bookings:</strong> never automatically expired by
            Inventory Integrity.
          </div>

          <div className="rounded-xl bg-white p-3 ring-1 ring-[#e7ddd0] sm:rounded-2xl sm:p-4">
            <strong>Customer self-service:</strong> unpaid pending checkout
            holds become eligible only after the Stripe expiration + safety
            grace.
          </div>

          <div className="rounded-xl bg-white p-3 ring-1 ring-[#e7ddd0] sm:rounded-2xl sm:p-4">
            <strong>Actual removal:</strong> still goes through
            <code className="ml-1 break-all">
              expire_unpaid_customer_stripe_booking()
            </code>
            .
          </div>

          <div className="rounded-xl bg-white p-3 ring-1 ring-[#e7ddd0] sm:rounded-2xl sm:p-4">
            <strong>Historical reservations:</strong> shown for visibility, not
            automatically deleted.
          </div>
        </div>
      </section>
    </div>
  );
}

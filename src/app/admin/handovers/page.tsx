import Link from "next/link";

import { requireAdminPermission } from "@/lib/auth/require-admin";

type HandoverStatus =
  | "all"
  | "draft"
  | "ready"
  | "viewed"
  | "signed"
  | "void";

function getOne(value: any) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value || null;
}

function parseStatus(value?: string): HandoverStatus {
  if (
    value === "all" ||
    value === "draft" ||
    value === "ready" ||
    value === "viewed" ||
    value === "signed" ||
    value === "void"
  ) {
    return value;
  }

  return "all";
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const source = String(value).slice(0, 10);

  const date = new Date(`${source}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return source;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function statusLabel(value: string | null | undefined) {
  const normalized = String(value || "draft");

  if (normalized === "draft") return "Draft";
  if (normalized === "ready") return "Ready";
  if (normalized === "viewed") return "Viewed";
  if (normalized === "signed") return "Signed";
  if (normalized === "void") return "Void";

  return normalized.replaceAll("_", " ");
}

function statusClass(value: string | null | undefined) {
  const status = String(value || "draft");

  if (status === "signed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (status === "ready") {
    return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  }

  if (status === "viewed") {
    return "bg-[#eef4ff] text-[#315ea8] ring-1 ring-[#d7e5fb]";
  }

  if (status === "void") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
}

function addressText(booking: any, bookingSnapshot: any) {
  const snapshot = bookingSnapshot || {};

  const parts = [
    snapshot.setup_address || booking?.setup_address,
    snapshot.setup_city || booking?.setup_city,
    snapshot.setup_state || booking?.setup_state,
    snapshot.setup_zip || booking?.setup_zip,
  ].filter(Boolean);

  return parts.join(", ") || "—";
}

function customerName(row: any, booking: any) {
  const customer = getOne(booking?.customers);

  return (
    row?.booking_snapshot?.customer_name ||
    customer?.full_name ||
    row?.signer_name ||
    "Customer"
  );
}

function customerEmail(row: any, booking: any) {
  const customer = getOne(booking?.customers);

  return (
    row?.booking_snapshot?.customer_email ||
    customer?.email ||
    row?.signer_email ||
    ""
  );
}

function productCount(itemsSnapshot: any) {
  const products = Array.isArray(itemsSnapshot?.products)
    ? itemsSnapshot.products
    : [];

  return products.length;
}

function componentCount(itemsSnapshot: any) {
  const components = Array.isArray(itemsSnapshot?.components)
    ? itemsSnapshot.components
    : [];

  return components.length;
}

function optionCount(itemsSnapshot: any) {
  const options = Array.isArray(itemsSnapshot?.options)
    ? itemsSnapshot.options
    : [];

  return options.length;
}

export const dynamic = "force-dynamic";

export default async function AdminHandoversPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    query?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams
    ? await searchParams
    : {};

  const selectedStatus = parseStatus(
    String(resolvedSearchParams.status || "")
  );

  const query = String(
    resolvedSearchParams.query || ""
  )
    .trim()
    .toLowerCase();

  const { supabase } =
    await requireAdminPermission("routes.view");

  let request = supabase
    .from("handover_documents")
    .select(
      `
      id,
      booking_id,
      status,
      template_snapshot,
      acknowledgement_label_snapshot,
      signature_label_snapshot,
      rendered_html,
      items_snapshot,
      booking_snapshot,
      delivery_notes,
      acknowledged,
      signer_name,
      signer_email,
      signature_metadata,
      signature_storage_path,
      pdf_storage_path,
      viewed_at,
      signed_at,
      voided_at,
      created_by,
      signed_by_user_id,
      created_at,
      updated_at,
      bookings (
        id,
        booking_number,
        event_date,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        customers (
          id,
          full_name,
          email,
          phone
        )
      )
    `
    )
    .order("created_at", {
      ascending: false,
    });

  if (selectedStatus !== "all") {
    request = request.eq("status", selectedStatus);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as any[];

  const filteredRows = query
    ? rows.filter((row) => {
        const booking = getOne(row.bookings);
        const customer = getOne(booking?.customers);

        const searchable = [
          row.id,
          row.booking_id,
          row.status,
          row.signer_name,
          row.signer_email,
          booking?.booking_number,
          booking?.event_date,
          customer?.full_name,
          customer?.email,
          customer?.phone,
          row.booking_snapshot?.customer_name,
          row.booking_snapshot?.customer_email,
          row.booking_snapshot?.booking_number,
          row.booking_snapshot?.setup_address,
          row.booking_snapshot?.setup_city,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      })
    : rows;

  const signedCount = rows.filter(
    (row) => row.status === "signed"
  ).length;

  const readyCount = rows.filter(
    (row) => row.status === "ready"
  ).length;

  const unsignedCount = rows.filter(
    (row) =>
      row.status !== "signed" &&
      row.status !== "void"
  ).length;

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="rounded-[24px] border border-black/5 bg-white p-4 shadow-[0_10px_35px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9a723e] sm:text-xs">
          Operations
        </div>

        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#1f1e1b] sm:text-3xl">
          Equipment Handovers
        </h1>

        <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
          Delivery acceptance documents are separate from rental
          contracts. This page shows prepared, viewed and signed
          equipment handovers.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.035)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
            Documents
          </div>

          <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
            {rows.length}
          </div>
        </div>

        <div className="rounded-[22px] border border-emerald-100 bg-emerald-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            Signed
          </div>

          <div className="mt-2 text-2xl font-semibold text-emerald-800">
            {signedCount}
          </div>
        </div>

        <div className="rounded-[22px] border border-blue-100 bg-blue-50 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
            Ready
          </div>

          <div className="mt-2 text-2xl font-semibold text-blue-800">
            {readyCount}
          </div>
        </div>

        <div className="rounded-[22px] border border-[#ead6a8] bg-[#fff8e8] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a6b20]">
            Open
          </div>

          <div className="mt-2 text-2xl font-semibold text-[#8a6b20]">
            {unsignedCount}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-black/5 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.035)] sm:rounded-[30px]">
        <div className="border-b border-[#eee5d9] p-4 sm:p-6">
          <form
            method="get"
            className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
          >
            <input
              name="query"
              defaultValue={
                resolvedSearchParams.query || ""
              }
              placeholder="Booking #, customer, email..."
              className="min-h-[46px] min-w-0 rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />

            <select
              name="status"
              defaultValue={selectedStatus}
              className="min-h-[46px] rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm outline-none focus:border-[#23313f]"
            >
              <option value="all">
                All statuses
              </option>

              <option value="draft">
                Draft
              </option>

              <option value="ready">
                Ready
              </option>

              <option value="viewed">
                Viewed
              </option>

              <option value="signed">
                Signed
              </option>

              <option value="void">
                Void
              </option>
            </select>

            <div className="flex gap-2">
              <button
                type="submit"
                className="min-h-[46px] flex-1 rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
              >
                Apply
              </button>

              <Link
                href="/admin/handovers"
                className="flex min-h-[46px] items-center justify-center rounded-full border border-[#d8cec0] bg-white px-5 text-sm font-semibold text-[#23313f]"
              >
                Reset
              </Link>
            </div>
          </form>
        </div>

        <div className="space-y-3 p-3 sm:space-y-4 sm:p-6">
          {filteredRows.map((row) => {
            const booking =
              getOne(row.bookings);

            const bookingNumber =
              booking?.booking_number ||
              row.booking_snapshot?.booking_number ||
              String(row.booking_id || "").slice(
                0,
                8
              );

            const products =
              Array.isArray(
                row.items_snapshot?.products
              )
                ? row.items_snapshot.products
                : [];

            const components =
              Array.isArray(
                row.items_snapshot?.components
              )
                ? row.items_snapshot.components
                : [];

            const options =
              Array.isArray(
                row.items_snapshot?.options
              )
                ? row.items_snapshot.options
                : [];

            return (
              <article
                key={row.id}
                className="overflow-hidden rounded-[22px] border border-[#eee5d9] bg-[#fcfaf7] sm:rounded-[26px]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eee5d9] bg-white p-4 sm:p-5">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                      Booking #{bookingNumber}
                    </div>

                    <h2 className="mt-1 truncate text-lg font-semibold text-[#1f1e1b] sm:text-xl">
                      {customerName(
                        row,
                        booking
                      )}
                    </h2>

                    <div className="mt-1 text-xs text-[#6c6258]">
                      Event{" "}
                      {formatDate(
                        booking?.event_date ||
                          row.booking_snapshot
                            ?.event_date
                      )}
                    </div>
                  </div>

                  <span
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      statusClass(row.status),
                    ].join(" ")}
                  >
                    {statusLabel(row.status)}
                  </span>
                </div>

                <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a7a49]">
                          Products
                        </div>

                        <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                          {productCount(
                            row.items_snapshot
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a7a49]">
                          Components
                        </div>

                        <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                          {componentCount(
                            row.items_snapshot
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a7a49]">
                          Options
                        </div>

                        <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                          {optionCount(
                            row.items_snapshot
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1 text-sm leading-6 text-[#6c6258]">
                      <div>
                        <span className="font-semibold text-[#1f1e1b]">
                          Address:
                        </span>{" "}
                        {addressText(
                          booking,
                          row.booking_snapshot
                        )}
                      </div>

                      {customerEmail(
                        row,
                        booking
                      ) && (
                        <div>
                          <span className="font-semibold text-[#1f1e1b]">
                            Email:
                          </span>{" "}
                          {customerEmail(
                            row,
                            booking
                          )}
                        </div>
                      )}

                      <div>
                        <span className="font-semibold text-[#1f1e1b]">
                          Created:
                        </span>{" "}
                        {formatDateTime(
                          row.created_at
                        )}
                      </div>

                      {row.viewed_at && (
                        <div>
                          <span className="font-semibold text-[#1f1e1b]">
                            Viewed:
                          </span>{" "}
                          {formatDateTime(
                            row.viewed_at
                          )}
                        </div>
                      )}

                      {row.signed_at && (
                        <div>
                          <span className="font-semibold text-[#1f1e1b]">
                            Signed:
                          </span>{" "}
                          {formatDateTime(
                            row.signed_at
                          )}
                        </div>
                      )}

                      {row.signer_name && (
                        <div>
                          <span className="font-semibold text-[#1f1e1b]">
                            Signed by:
                          </span>{" "}
                          {row.signer_name}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap content-start gap-2 lg:w-[170px] lg:flex-col">
                    <Link
                      href={`/admin/bookings/${row.booking_id}`}
                      className="flex-1 rounded-full bg-[#23313f] px-4 py-2.5 text-center text-xs font-semibold text-white lg:flex-none"
                    >
                      Open booking
                    </Link>

                    {row.pdf_storage_path && (
                      <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-center text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                        PDF saved
                      </div>
                    )}

                    {row.signature_storage_path && (
                      <div className="rounded-2xl bg-blue-50 px-3 py-2 text-center text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">
                        Signature saved
                      </div>
                    )}
                  </div>
                </div>

                <details className="border-t border-[#eee5d9] bg-white">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#355879] sm:px-5">
                    View document details
                  </summary>

                  <div className="space-y-4 border-t border-[#eee5d9] p-4 sm:p-5">
                    {row.delivery_notes && (
                      <div className="rounded-2xl bg-[#fff8e8] p-4 ring-1 ring-[#ead6a8]">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a6b20]">
                          Delivery notes
                        </div>

                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">
                          {row.delivery_notes}
                        </div>
                      </div>
                    )}

                    {products.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-[#1f1e1b]">
                          Products
                        </div>

                        <div className="mt-2 space-y-2">
                          {products.map(
                            (
                              item: any,
                              index: number
                            ) => (
                              <div
                                key={
                                  item.booking_item_id ||
                                  `${row.id}-product-${index}`
                                }
                                className="rounded-xl bg-[#fcfaf7] px-3 py-2 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]"
                              >
                                <span className="font-semibold text-[#1f1e1b]">
                                  {item.name ||
                                    "Product"}
                                </span>

                                {item.variant_name
                                  ? ` · ${item.variant_name}`
                                  : ""}

                                {item.quantity
                                  ? ` · x ${item.quantity}`
                                  : ""}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {components.length >
                      0 && (
                      <div>
                        <div className="text-sm font-semibold text-[#1f1e1b]">
                          Components
                        </div>

                        <div className="mt-2 space-y-2">
                          {components.map(
                            (
                              item: any,
                              index: number
                            ) => (
                              <div
                                key={
                                  item.inventory_item_id ||
                                  `${row.id}-component-${index}`
                                }
                                className="rounded-xl bg-[#fcfaf7] px-3 py-2 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]"
                              >
                                <span className="font-semibold text-[#1f1e1b]">
                                  {item.name ||
                                    "Component"}
                                </span>

                                {item.quantity
                                  ? ` · x ${item.quantity}`
                                  : ""}

                                {item.unit_label
                                  ? ` ${item.unit_label}`
                                  : ""}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {options.length > 0 && (
                      <div>
                        <div className="text-sm font-semibold text-[#1f1e1b]">
                          Options
                        </div>

                        <div className="mt-2 space-y-2">
                          {options.map(
                            (
                              item: any,
                              index: number
                            ) => (
                              <div
                                key={
                                  item.booking_modifier_id ||
                                  `${row.id}-option-${index}`
                                }
                                className="rounded-xl bg-[#fcfaf7] px-3 py-2 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]"
                              >
                                <span className="font-semibold text-[#1f1e1b]">
                                  {item.name ||
                                    item.label ||
                                    "Option"}
                                </span>

                                {item.quantity
                                  ? ` · x ${item.quantity}`
                                  : ""}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {row.rendered_html ? (
                      <div>
                        <div className="mb-2 text-sm font-semibold text-[#1f1e1b]">
                          Rendered document
                        </div>

                        <div
                          className="max-h-[520px] overflow-y-auto rounded-2xl border border-[#eee5d9] bg-white p-4 text-sm leading-6 text-[#4b4339]"
                          dangerouslySetInnerHTML={{
                            __html:
                              row.rendered_html,
                          }}
                        />
                      </div>
                    ) : row.template_snapshot ? (
                      <div>
                        <div className="mb-2 text-sm font-semibold text-[#1f1e1b]">
                          Handover text
                        </div>

                        <div
                          className="max-h-[420px] overflow-y-auto rounded-2xl border border-[#eee5d9] bg-white p-4 text-sm leading-6 text-[#4b4339]"
                          dangerouslySetInnerHTML={{
                            __html:
                              row.template_snapshot,
                          }}
                        />
                      </div>
                    ) : null}

                    <div className="break-all rounded-xl bg-[#f7f3ed] px-3 py-2 text-[10px] text-[#8b8177]">
                      Document ID: {row.id}
                    </div>
                  </div>
                </details>
              </article>
            );
          })}

          {filteredRows.length === 0 && (
            <div className="rounded-[24px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-14 text-center">
              <div className="text-lg font-semibold text-[#1f1e1b]">
                No handover documents found
              </div>

              <p className="mt-2 text-sm leading-6 text-[#6c6258]">
                Documents will appear here after a handover
                is prepared for a booking.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
import { createClient } from "@/lib/supabase/server";
import HandoverSigner from "./HandoverSigner";

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function text(value: any, fallback = "") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function numberValue(value: any) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function prettyQuantity(value: any) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) return "0";

  if (Number.isInteger(parsed)) {
    return String(parsed);
  }

  return String(parsed);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const clean = String(value).slice(0, 10);
  const date = new Date(`${clean}T12:00:00`);

  if (Number.isNaN(date.getTime())) return clean;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function normalizeSnapshot(value: any) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value;
}

function statusClass(status: string) {
  if (status === "signed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (status === "void") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
}

export default async function DriverHandoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    document?: string;
  }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const stopId = resolvedParams.id;
  const documentId = text(resolvedSearchParams.document);

  const supabase = await createClient();

  const { data: stop, error: stopError } = await supabase
    .from("route_stops")
    .select(
      `
      id,
      booking_id,
      stop_date,
      stop_type,
      driver_name,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      bookings (
        id,
        booking_number,
        event_date,
        customers (
          id,
          full_name,
          phone,
          email
        )
      )
    `
    )
    .eq("id", stopId)
    .maybeSingle();

  if (stopError) {
    throw new Error(stopError.message);
  }

  if (!stop) {
    return (
      <div className="min-h-screen bg-[#f5efe6] px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-[28px] bg-white p-8 text-center shadow">
          <div className="text-lg font-semibold text-[#1f1e1b]">
            Route stop not found
          </div>
        </div>
      </div>
    );
  }

  if (String(stop.stop_type || "").toLowerCase() !== "delivery") {
    return (
      <div className="min-h-screen bg-[#f5efe6] px-4 py-10">
        <div className="mx-auto max-w-3xl rounded-[28px] bg-white p-8 text-center shadow">
          <div className="text-lg font-semibold text-[#1f1e1b]">
            Handover is available only for delivery stops
          </div>
        </div>
      </div>
    );
  }

  if (!stop.booking_id) {
    throw new Error("Booking is missing for this route stop.");
  }

  let handover: any = null;

  if (documentId) {
    const { data, error } = await supabase
      .from("handover_documents")
      .select("*")
      .eq("id", documentId)
      .eq("booking_id", stop.booking_id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    handover = data;
  }

  if (!handover) {
    const { data, error } = await supabase.rpc(
      "get_handover_document_for_staff",
      {
        p_booking_id: stop.booking_id,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    handover = data;
  }

  if (!handover) {
    const { error: prepareError } = await supabase.rpc(
      "prepare_handover_document",
      {
        p_booking_id: stop.booking_id,
      }
    );

    if (prepareError) {
      throw new Error(prepareError.message);
    }

    const { data, error } = await supabase.rpc(
      "get_handover_document_for_staff",
      {
        p_booking_id: stop.booking_id,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    handover = data;
  }

  if (!handover) {
    throw new Error("Handover document could not be prepared.");
  }

  const booking = getOne(stop.bookings);
  const customer = getOne(booking?.customers);

  const status = text(handover.status, "draft").toLowerCase();

  const bookingSnapshot = normalizeSnapshot(
    handover.booking_snapshot || handover.booking
  );

  const itemsSnapshot = normalizeSnapshot(
    handover.items_snapshot || handover.items
  );

  const products = Array.isArray(itemsSnapshot.products)
    ? itemsSnapshot.products
    : [];

  const components = Array.isArray(itemsSnapshot.components)
    ? itemsSnapshot.components
    : [];

  const options = Array.isArray(itemsSnapshot.options)
    ? itemsSnapshot.options
    : [];

  const templateHtml = text(
    handover.template_snapshot || handover.template_html,
    "<h2>Equipment Delivery & Acceptance</h2>"
  );

  const acknowledgementLabel = text(
    handover.acknowledgement_label_snapshot ||
      handover.acknowledgement_label,
    "I confirm that I reviewed and accept the equipment and quantities listed above."
  );

  const signatureLabel = text(
    handover.signature_label_snapshot || handover.signature_label,
    "Customer signature"
  );

  const signed = status === "signed";

  const customerName =
    text(bookingSnapshot.customer_name) ||
    text(customer?.full_name) ||
    text(stop.customer_name, "Customer");

  const customerEmail =
    text(bookingSnapshot.customer_email) || text(customer?.email, "—");

  const address =
    [
      text(bookingSnapshot.setup_address) || text(stop.address),
      text(bookingSnapshot.setup_city) || text(stop.city),
      text(bookingSnapshot.setup_state) || text(stop.state),
      text(bookingSnapshot.setup_zip) || text(stop.zip),
    ]
      .filter(Boolean)
      .join(", ") || "—";

  const bookingNumber =
    text(bookingSnapshot.booking_number) ||
    text(booking?.booking_number) ||
    String(stop.booking_id).slice(0, 8);

  const eventDate =
    text(bookingSnapshot.event_date) || text(booking?.event_date);

  return (
    <div className="min-h-screen bg-[#f5efe6]">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-[#23313f] px-4 py-4 text-white shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#c9964f]">
              Customer document
            </div>

            <h1 className="mt-1 text-xl font-semibold sm:text-2xl">
              Equipment Handover
            </h1>

            <p className="mt-1 text-xs text-white/65 sm:text-sm">
              Booking #{bookingNumber}
            </p>
          </div>

          <a
            href={`/admin/routes/driver/stops/${stop.id}`}
            className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white ring-1 ring-white/10"
          >
            Back
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-3 py-4 sm:px-4 sm:py-5">
        <section className="overflow-hidden rounded-[26px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.055)] sm:rounded-[30px]">
          <div className="border-b border-[#eee5d9] bg-[#fcfaf7] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                  Delivery acceptance
                </div>

                <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                  Booking #{bookingNumber}
                </div>
              </div>

              <span
                className={[
                  "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em]",
                  statusClass(status),
                ].join(" ")}
              >
                {status}
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                  Customer
                </div>
                <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                  {customerName}
                </div>
                <div className="mt-1 break-all text-xs text-[#6c6258]">
                  {customerEmail}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                  Event date
                </div>
                <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                  {formatDate(eventDate)}
                </div>
              </div>
            </div>

            <div className="mt-2 rounded-2xl bg-white p-3 ring-1 ring-[#eee5d9]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                Delivery address
              </div>
              <div className="mt-1 text-sm font-semibold leading-5 text-[#1f1e1b]">
                {address}
              </div>
            </div>
          </div>

          <div className="space-y-5 p-4 sm:p-5">
            <div
              className="prose prose-sm max-w-none text-[#4b4339] prose-headings:text-[#1f1e1b] prose-p:leading-6"
              dangerouslySetInnerHTML={{ __html: templateHtml }}
            />

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#1f1e1b]">
                  Products
                </h2>

                <span className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold text-[#6c6258]">
                  {products.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {products.map((item: any, index: number) => (
                  <div
                    key={text(item.booking_item_id) || `${index}`}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1f1e1b]">
                        {text(item.name, "Product")}
                      </div>

                      {item.variant_name && (
                        <div className="mt-0.5 text-xs text-[#6c6258]">
                          {item.variant_name}
                        </div>
                      )}

                      {item.notes && (
                        <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#8b8177]">
                          {item.notes}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#23313f] ring-1 ring-[#d8cec0]">
                      × {prettyQuantity(item.quantity)}
                    </div>
                  </div>
                ))}

                {products.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#d8cec0] p-4 text-sm text-[#6c6258]">
                    No products in snapshot.
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#1f1e1b]">
                  Components
                </h2>

                <span className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold text-[#6c6258]">
                  {components.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {components.map((item: any, index: number) => (
                  <div
                    key={text(item.inventory_item_id) || `${index}`}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1f1e1b]">
                        {text(item.name, "Component")}
                      </div>

                      {item.sku && (
                        <div className="mt-0.5 text-xs text-[#6c6258]">
                          SKU: {item.sku}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#23313f] ring-1 ring-[#d8cec0]">
                      × {prettyQuantity(item.quantity)}
                    </div>
                  </div>
                ))}

                {components.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#d8cec0] p-4 text-sm text-[#6c6258]">
                    No components in snapshot.
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[#1f1e1b]">
                  Options
                </h2>

                <span className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold text-[#6c6258]">
                  {options.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {options.map((item: any, index: number) => (
                  <div
                    key={text(item.booking_modifier_id) || `${index}`}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1f1e1b]">
                        {text(item.name, "Option")}
                      </div>

                      {item.notes && (
                        <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#8b8177]">
                          {item.notes}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#23313f] ring-1 ring-[#d8cec0]">
                      × {prettyQuantity(item.quantity)}
                    </div>
                  </div>
                ))}

                {options.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#d8cec0] p-4 text-sm text-[#6c6258]">
                    No options in snapshot.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>

        {signed ? (
          <section className="rounded-[26px] border border-emerald-200 bg-emerald-50 p-4 shadow-[0_10px_35px_rgba(0,0,0,0.03)] sm:rounded-[30px] sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              Signed document
            </div>

            <div className="mt-2 text-xl font-semibold text-emerald-900">
              Handover completed
            </div>

            <div className="mt-3 grid gap-2 text-sm text-emerald-900 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/70 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Signer
                </div>
                <div className="mt-1 font-semibold">
                  {text(handover.signer_name, customerName)}
                </div>
              </div>

              <div className="rounded-2xl bg-white/70 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  Signed
                </div>
                <div className="mt-1 font-semibold">
                  {formatDateTime(handover.signed_at)}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[26px] border border-[#e7d8bf] bg-[#fffaf2] p-4 shadow-[0_10px_35px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              Customer acceptance
            </div>
            <div className="mt-4">
              <HandoverSigner
                documentId={text(handover.id)}
                stopId={String(stop.id)}
                signerName={customerName}
                acknowledgementLabel={acknowledgementLabel}
                signatureLabel={signatureLabel}
              />
            </div>
          </section>
        )}

        <a
          href={`/admin/routes/driver/stops/${stop.id}`}
          className="block rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-center text-sm font-semibold text-[#23313f]"
        >
          Back to delivery stop
        </a>
      </main>
    </div>
  );
}
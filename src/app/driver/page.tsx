import { redirect } from "next/navigation";
import {
  requireDriverInterfaceAccess,
  resolveDriverRecordForView,
} from "@/lib/auth/require-driver";

function isMissingArchivedAtError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42703" ||
    (message.includes("archived_at") && message.includes("bookings"))
  );
}

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) return "Any time";

  const cleanValue = String(value).slice(0, 5);
  const date = new Date(`2000-01-01T${cleanValue}:00`);

  if (Number.isNaN(date.getTime())) return cleanValue;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function mapUrl(stop: any) {
  const address = [stop.address, stop.city, stop.state, stop.zip]
    .filter(Boolean)
    .join(", ");

  if (!address) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address
  )}`;
}

function isCancelledStatus(value: string | null | undefined) {
  const normalized = String(value || "").toLowerCase();
  return normalized === "cancelled" || normalized === "canceled";
}

export default async function DriverPortalPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string; driver?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedDate = String(resolvedSearchParams?.date || todayISO());
  const selectedDriver = String(resolvedSearchParams?.driver || "").trim();

  const { supabase, access, linkedDriverRecord } = await requireDriverInterfaceAccess();

  if (!access.can("routes.view") && !access.can("preview.driver")) {
    redirect("/unauthorized");
  }

  const { driverRecord, previewMode } = await resolveDriverRecordForView({
    supabase,
    access,
    linkedDriverRecord,
    requestedDriverName: selectedDriver,
  });

  const user = access.user;
  const driverName = driverRecord?.name || String(user?.email || "Driver");

  const stopsSelectWithArchive = `
      id,
      stop_date,
      stop_type,
      status,
      customer_name,
      customer_phone,
      address,
      city,
      state,
      zip,
      scheduled_start_time,
      scheduled_end_time,
      driver_name,
      truck_name,
      items_summary,
      balance_due,
      sort_order,
      bookings (
        id,
        status,
        archived_at
      )
    `;
  const stopsSelectWithoutArchive = stopsSelectWithArchive.replace(",\n        archived_at", ""
  );

  function buildStopsRequest(selectClause: string) {
    return supabase
      .from("route_stops")
      .select(selectClause)
      .eq("stop_date", selectedDate)
      .eq("driver_name", driverRecord?.name || "")
      .order("sort_order", { ascending: true })
      .order("scheduled_start_time", { ascending: true });
  }

  let { data: stops, error: stopsError } = await buildStopsRequest(
    stopsSelectWithArchive
  );

  if (stopsError && isMissingArchivedAtError(stopsError)) {
    const fallbackResult = await buildStopsRequest(stopsSelectWithoutArchive);
    stops = fallbackResult.data;
    stopsError = fallbackResult.error;
  }

  if (stopsError) {
    throw new Error(stopsError.message);
  }

  const routeStops = (stops || []).filter((stop: any) => {
    const booking = Array.isArray(stop.bookings)
      ? stop.bookings[0] || null
      : stop.bookings || null;
    const bookingStatus = String(booking?.status || "").toLowerCase();
    const stopStatus = String(stop.status || "").toLowerCase();

    return !booking?.archived_at && !isCancelledStatus(bookingStatus) && !isCancelledStatus(stopStatus);
  });

  let driverOptions: string[] = [];

  if (previewMode) {
    const driversResult = await supabase
      .from("route_drivers")
      .select("name")
      .eq("active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (driversResult.error) {
      throw new Error(driversResult.error.message);
    }

    driverOptions = Array.from(
      new Set(
        (driversResult.data || [])
          .map((row: any) => String(row?.name || "").trim())
          .filter(Boolean)
      )
    );
  }

  return (
    <div className="space-y-6">
        <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
            Bounce Party LA
          </div>
          <h1 className="mt-2 text-3xl font-semibold">Assigned route stops</h1>
          <p className="mt-2 text-sm leading-6 text-[#6c6258]">
            Signed in as {user.email || user.id}. Showing deliveries assigned to {driverName}.
          </p>
          {previewMode && (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              Preview mode
            </p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Driver</div>
            <div className="mt-2 text-2xl font-semibold">{driverName}</div>
          </div>
          <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Date</div>
            <div className="mt-2 text-2xl font-semibold">{selectedDate}</div>
          </div>
          <div className="rounded-[24px] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Stops</div>
            <div className="mt-2 text-2xl font-semibold">{routeStops.length}</div>
          </div>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <form className="flex flex-wrap items-center gap-3">
              {previewMode && (
                <select
                  name="driver"
                  defaultValue={driverName}
                  className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
                >
                  {driverOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}

              <input
                name="date"
                type="date"
                defaultValue={selectedDate}
                className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
              />
              <button
                type="submit"
                className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
              >
                Load deliveries
              </button>
            </form>
          </div>

          <div className="space-y-4 p-6">
            {routeStops.map((stop: any, index: number) => {
              const url = mapUrl(stop);

              return (
                <article key={stop.id} className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                        Stop #{index + 1}
                      </div>
                      <div className="mt-1 text-xl font-semibold">
                        {stop.customer_name || "Route stop"}
                      </div>
                    </div>
                    <div className="rounded-full bg-[#23313f] px-3 py-1 text-xs font-semibold text-white">
                      {stop.status || "scheduled"}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-[1.5fr_1fr]">
                    <div className="rounded-[20px] bg-white p-4 ring-1 ring-[#eee5d9]">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Address</div>
                      <div className="mt-1 text-sm font-semibold">{[stop.address, stop.city, stop.state, stop.zip].filter(Boolean).join(", ") || "No address"}</div>
                      <div className="mt-2 text-sm text-[#6c6258]">{formatTime(stop.scheduled_start_time)} to {formatTime(stop.scheduled_end_time)}</div>
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-full bg-[#c9964f] px-4 py-2 text-xs font-semibold text-white">
                          Open in Maps
                        </a>
                      )}
                    </div>

                    <div className="rounded-[20px] bg-white p-4 ring-1 ring-[#eee5d9]">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Notes</div>
                      <div className="mt-2 text-sm text-[#6c6258]">
                        {stop.items_summary || "No item summary"}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}

            {routeStops.length === 0 && (
              <div className="rounded-[24px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-12 text-center text-sm text-[#6c6258]">
                No deliveries assigned for this date.
              </div>
            )}
          </div>
        </section>
    </div>
  );
}
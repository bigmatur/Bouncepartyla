import { requireAdminPermission } from "@/lib/auth/require-admin";

type PageProps = {
  searchParams?: Promise<{
    type?: string;
    date?: string;
    q?: string;
  }>;
};

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function prettyStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function prettyPhotoType(value: string | null | undefined) {
  if (value === "delivery_setup") return "Delivery setup";
  if (value === "pickup") return "Pickup";
  if (value === "damage") return "Damage";
  if (value === "cleaning") return "Cleaning";
  if (value === "inventory") return "Inventory";
  if (value === "customer") return "Customer";
  return "General";
}

function photoTypeClass(value: string | null | undefined) {
  if (value === "damage") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (value === "cleaning") {
    return "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]";
  }

  if (value === "delivery_setup" || value === "pickup") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function safeBookingNumber(booking: any) {
  return (
    booking?.booking_number ||
    booking?.reference_number ||
    booking?.confirmation_number ||
    booking?.id?.slice(0, 8) ||
    "Booking"
  );
}

function todayISO() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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

function SummaryCard({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string | number;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
        {label}
      </div>

      <div
        className={[
          "mt-2 text-3xl font-semibold",
          danger ? "text-red-700" : "text-[#1f1e1b]",
        ].join(" ")}
      >
        {value}
      </div>

      {hint && <div className="mt-1 text-xs text-[#6c6258]">{hint}</div>}
    </div>
  );
}

export default async function AdminPhotosPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const selectedType = String(resolvedSearchParams?.type || "all");
  const selectedDate = String(resolvedSearchParams?.date || dateDaysAgo(14));
  const searchQuery = String(resolvedSearchParams?.q || "").trim();

  const { supabase } = await requireAdminPermission("bookings.view");

  let photosRequest = supabase
    .from("booking_photos")
    .select(
      `
      id,
      booking_id,
      route_stop_id,
      checklist_item_id,
      inventory_item_id,
      inventory_unit_id,
      photo_type,
      photo_url,
      storage_path,
      caption,
      taken_by,
      created_at,
      bookings (
        id,
        booking_number,
        status,
        event_date,
        setup_address,
        setup_city,
        setup_state,
        setup_zip,
        customers (
          id,
          full_name,
          phone,
          email
        )
      ),
      route_stops (
        id,
        stop_type,
        stop_date,
        status,
        driver_name,
        truck_name
      ),
      booking_checklist_items (
        id,
        title,
        source
      ),
      inventory_items (
        id,
        name,
        sku
      ),
      inventory_units (
        id,
        unit_code,
        serial_number,
        status
      )
    `
    )
    .gte("created_at", `${selectedDate}T00:00:00`)
    .order("created_at", { ascending: false })
    .limit(300);

  if (selectedType !== "all") {
    photosRequest = photosRequest.eq("photo_type", selectedType);
  }

  const photosResult = await photosRequest;

  if (photosResult.error && isMissingTableError(photosResult.error)) {
    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-red-200 bg-red-50 p-6 text-red-800">
          <h2 className="text-2xl font-semibold">booking_photos table is missing</h2>

          <p className="mt-2 text-sm leading-6">
            Нужно сначала выполнить SQL для Photos / Proof of setup.
          </p>

          <a
            href="/admin/bookings"
            className="mt-5 inline-flex rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white"
          >
            Back to bookings
          </a>
        </section>
      </div>
    );
  }

  if (photosResult.error) {
    throw new Error(photosResult.error.message);
  }

  const allPhotos = photosResult.data || [];

  const photos = searchQuery
    ? allPhotos.filter((photo: any) => {
        const booking = getOne(photo.bookings);
        const customer = getOne(booking?.customers);
        const routeStop = getOne(photo.route_stops);
        const checklistItem = getOne(photo.booking_checklist_items);
        const inventoryItem = getOne(photo.inventory_items);
        const inventoryUnit = getOne(photo.inventory_units);

        const haystack = [
          photo.caption,
          photo.taken_by,
          photo.photo_type,
          booking?.booking_number,
          booking?.setup_address,
          booking?.setup_city,
          booking?.setup_zip,
          customer?.full_name,
          customer?.phone,
          customer?.email,
          routeStop?.driver_name,
          routeStop?.truck_name,
          checklistItem?.title,
          inventoryItem?.name,
          inventoryItem?.sku,
          inventoryUnit?.unit_code,
          inventoryUnit?.serial_number,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchQuery.toLowerCase());
      })
    : allPhotos;

  const totalPhotos = photos.length;
  const setupPhotos = photos.filter(
    (photo: any) => photo.photo_type === "delivery_setup"
  ).length;
  const pickupPhotos = photos.filter((photo: any) => photo.photo_type === "pickup").length;
  const damagePhotos = photos.filter((photo: any) => photo.photo_type === "damage").length;
  const cleaningPhotos = photos.filter((photo: any) => photo.photo_type === "cleaning").length;

  const photoTypes = [
    { value: "all", label: "All photos" },
    { value: "delivery_setup", label: "Delivery setup" },
    { value: "pickup", label: "Pickup" },
    { value: "damage", label: "Damage" },
    { value: "cleaning", label: "Cleaning" },
    { value: "inventory", label: "Inventory" },
    { value: "customer", label: "Customer" },
    { value: "general", label: "General" },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Photo proof center
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Booking Photos Review
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Review delivery setup, pickup, cleaning and damage photos from all bookings.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/bookings"
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Bookings
            </a>

            <a
              href="/admin/routes/driver/checklists"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Driver checklist
            </a>
          </div>
        </div>

        <form className="mt-5 grid gap-3 lg:grid-cols-[180px_220px_1fr_120px]">
          <input
            type="date"
            name="date"
            defaultValue={selectedDate || todayISO()}
            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
          />

          <select
            name="type"
            defaultValue={selectedType}
            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
          >
            {photoTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>

          <input
            name="q"
            defaultValue={searchQuery}
            placeholder="Search customer, booking, unit, driver, caption..."
            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
          />

          <button
            type="submit"
            className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
          >
            Filter
          </button>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total photos" value={totalPhotos} hint="Filtered results" />
        <SummaryCard label="Setup" value={setupPhotos} hint="Delivery setup proof" />
        <SummaryCard label="Pickup" value={pickupPhotos} hint="Pickup proof" />
        <SummaryCard
          label="Damage"
          value={damagePhotos}
          hint="Damage evidence"
          danger={damagePhotos > 0}
        />
        <SummaryCard label="Cleaning" value={cleaningPhotos} hint="Cleaning proof" />
      </section>

      <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {photos.map((photo: any) => {
          const booking = getOne(photo.bookings);
          const customer = getOne(booking?.customers);
          const routeStop = getOne(photo.route_stops);
          const checklistItem = getOne(photo.booking_checklist_items);
          const inventoryItem = getOne(photo.inventory_items);
          const inventoryUnit = getOne(photo.inventory_units);

          const bookingNumber = safeBookingNumber(booking);
          const bookingAddress = [
            booking?.setup_address,
            booking?.setup_city,
            booking?.setup_state,
            booking?.setup_zip,
          ]
            .filter(Boolean)
            .join(", ");

          return (
            <article
              key={photo.id}
              className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]"
            >
              <a
                href={photo.photo_url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-[4/3] bg-[#e7e0d7]"
              >
                <img
                  src={photo.photo_url}
                  alt={photo.caption || "Booking photo"}
                  className="h-full w-full object-cover"
                />
              </a>

              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                      photoTypeClass(photo.photo_type),
                    ].join(" ")}
                  >
                    {prettyPhotoType(photo.photo_type)}
                  </span>

                  <span className="text-xs text-[#8b8177]">
                    {formatDateTime(photo.created_at)}
                  </span>
                </div>

                <div>
                  <a
                    href={`/admin/bookings/${photo.booking_id}`}
                    className="text-lg font-semibold text-[#1f1e1b] hover:text-[#9a723e]"
                  >
                    Booking #{bookingNumber}
                  </a>

                  <div className="mt-1 text-sm leading-6 text-[#6c6258]">
                    {customer?.full_name || "No customer"} ·{" "}
                    {formatDate(booking?.event_date)}
                  </div>

                  {bookingAddress && (
                    <div className="mt-1 text-xs leading-5 text-[#8b8177]">
                      {bookingAddress}
                    </div>
                  )}
                </div>

                {photo.caption && (
                  <p className="whitespace-pre-wrap rounded-2xl bg-[#fcfaf7] p-4 text-sm leading-6 text-[#1f1e1b] ring-1 ring-[#eee5d9]">
                    {photo.caption}
                  </p>
                )}

                <div className="space-y-1 text-xs leading-5 text-[#6c6258]">
                  {photo.taken_by && <div>Taken by: {photo.taken_by}</div>}

                  {routeStop && (
                    <div>
                      Route: {prettyStatus(routeStop.stop_type)} ·{" "}
                      {formatDate(routeStop.stop_date)} · {prettyStatus(routeStop.status)}
                    </div>
                  )}

                  {checklistItem && (
                    <div>Checklist: {checklistItem.title || "Checklist item"}</div>
                  )}

                  {inventoryItem && (
                    <div>
                      Inventory: {inventoryItem.name}
                      {inventoryUnit?.unit_code ? ` · ${inventoryUnit.unit_code}` : ""}
                      {inventoryUnit?.serial_number
                        ? ` · ${inventoryUnit.serial_number}`
                        : ""}
                    </div>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <a
                    href={`/admin/bookings/${photo.booking_id}/photos`}
                    className="rounded-full bg-[#23313f] px-4 py-2 text-center text-xs font-semibold text-white hover:bg-[#18222d]"
                  >
                    Booking photos
                  </a>

                  <a
                    href={`/admin/bookings/${photo.booking_id}/workflow`}
                    className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-xs font-semibold text-[#2b2a28] hover:bg-[#faf8f5]"
                  >
                    Workflow
                  </a>
                </div>
              </div>
            </article>
          );
        })}

        {photos.length === 0 && (
          <div className="col-span-full rounded-[30px] border border-dashed border-[#d8cec0] bg-white px-6 py-16 text-center shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="text-lg font-semibold text-[#1f1e1b]">
              No photos found
            </div>

            <p className="mt-2 text-sm text-[#6c6258]">
              Try another date, type, or search query.
            </p>

            <a
              href="/admin/routes/driver/checklists"
              className="mt-5 inline-flex rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white"
            >
              Open driver checklist
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
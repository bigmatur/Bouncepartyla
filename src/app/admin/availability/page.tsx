import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getAvailabilityForDate } from "@/lib/booking/getAvailabilityForDate";

function getDefaultReservedFrom(date: string) {
  return `${date}T07:00:00-07:00`;
}

function getDefaultReservedUntil(date: string) {
  const d = new Date(`${date}T07:00:00-07:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

type PageProps = {
  searchParams?: Promise<{
    date?: string;
  }>;
};

export default async function AdminAvailabilityPage(props: PageProps) {
  const searchParams = await props.searchParams;

  const selectedDate =
    searchParams?.date || new Date().toISOString().slice(0, 10);

  const reservedFrom = getDefaultReservedFrom(selectedDate);
  const reservedUntil = getDefaultReservedUntil(selectedDate);

  const { supabase } = await requireAdminPermission("bookings.view");

  const availability = await getAvailabilityForDate({
    supabase,
    reservedFrom,
    reservedUntil,
    quantity: 1,
  });

  const available = availability.filter((item) => item.status === "available");
  const limited = availability.filter((item) => item.status === "limited");
  const unavailable = availability.filter(
    (item) => item.status === "unavailable"
  );

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-neutral-900">
            Bounce Party LA Availability
          </h1>

          <p className="mt-2 text-sm text-neutral-500">
            Check available products by date based on real inventory,
            components, and reservations.
          </p>

          <form className="mt-6 flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Event date
              </label>
              <input
                type="date"
                name="date"
                defaultValue={selectedDate}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900"
              />
            </div>

            <button
              type="submit"
              className="rounded-xl bg-neutral-900 px-5 py-2 text-sm font-medium text-white"
            >
              Check availability
            </button>
          </form>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-sm text-neutral-500">Available</div>
            <div className="mt-2 text-3xl font-semibold text-green-700">
              {available.length}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-sm text-neutral-500">Limited</div>
            <div className="mt-2 text-3xl font-semibold text-amber-600">
              {limited.length}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="text-sm text-neutral-500">Unavailable</div>
            <div className="mt-2 text-3xl font-semibold text-red-600">
              {unavailable.length}
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">
            Available items
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {available.map((item) => (
              <div
                key={item.productId}
                className="rounded-2xl border border-green-200 bg-green-50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-neutral-900">
                      {item.productName}
                    </h3>
                    <p className="mt-1 text-sm text-green-700">
                      Available qty: {item.availableQuantity}
                    </p>
                  </div>

                  <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white">
                    Available
                  </span>
                </div>

                <div className="mt-4 space-y-1 text-xs text-neutral-600">
                  {item.components.map((component) => (
                    <div key={component.inventoryItemId}>
                      {component.inventoryItemName}:{" "}
                      {component.availableQuantity} available /{" "}
                      {component.requiredQuantity} required
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {available.length === 0 && (
            <p className="mt-4 text-sm text-neutral-500">
              No available products for this date.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">
            Limited items
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {limited.map((item) => (
              <div
                key={item.productId}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-neutral-900">
                      {item.productName}
                    </h3>
                    <p className="mt-1 text-sm text-amber-700">
                      Available qty: {item.availableQuantity}
                    </p>
                  </div>

                  <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white">
                    Limited
                  </span>
                </div>

                <div className="mt-4 space-y-1 text-xs text-neutral-600">
                  {item.warnings.map((warning) => (
                    <div key={warning}>{warning}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {limited.length === 0 && (
            <p className="mt-4 text-sm text-neutral-500">
              No limited products for this date.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">
            Unavailable items
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {unavailable.map((item) => (
              <div
                key={item.productId}
                className="rounded-2xl border border-red-200 bg-red-50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-neutral-900">
                      {item.productName}
                    </h3>
                    <p className="mt-1 text-sm text-red-700">
                      Reason: {item.reason}
                    </p>
                  </div>

                  <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white">
                    Unavailable
                  </span>
                </div>

                <div className="mt-4 space-y-1 text-xs text-neutral-700">
                  {item.missingComponents.map((component) => (
                    <div key={component.inventoryItemId}>
                      Missing {component.inventoryItemName}: need{" "}
                      {component.requiredQuantity}, available{" "}
                      {component.availableQuantity}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {unavailable.length === 0 && (
            <p className="mt-4 text-sm text-neutral-500">
              No unavailable products for this date.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
import { createClient } from "@/lib/supabase/server";
import {
  createWarehouseLocationAction,
  deleteWarehouseLocationAction,
  toggleWarehouseLocationAction,
  updateWarehouseLocationAction,
} from "./actions";

function getParentName(locations: any[], parentId: string | null) {
  if (!parentId) return "Root location";

  const parent = locations.find((location) => location.id === parentId);
  return parent?.name || "Root location";
}

function getChildrenCount(locations: any[], locationId: string) {
  return locations.filter((location) => location.parent_id === locationId)
    .length;
}

function getUnitsForLocation(units: any[], locationId: string) {
  return units.filter((unit) => unit.warehouse_location_id === locationId);
}

function getUnitsCount(units: any[], locationId: string) {
  return getUnitsForLocation(units, locationId).length;
}

function getAvailableUnitsCount(units: any[], locationId: string) {
  return getUnitsForLocation(units, locationId).filter((unit) =>
    ["available", "returned"].includes(String(unit.status || ""))
  ).length;
}

function getOutUnitsCount(units: any[], locationId: string) {
  return getUnitsForLocation(units, locationId).filter((unit) =>
    ["reserved", "picked", "loaded", "installed"].includes(
      String(unit.status || "")
    )
  ).length;
}

function statusClass(active: boolean) {
  if (active) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function locationTypeLabel(type: string | null | undefined) {
  const value = String(type || "zone");

  const labels: Record<string, string> = {
    warehouse: "Warehouse",
    vehicle: "Vehicle",
    service_area: "Service area",
    cleaning_area: "Cleaning area",
    repair_area: "Repair area",
    customer_site: "Customer site",
    shelf: "Shelf",
    zone: "Zone",
  };

  return labels[value] || value;
}

function locationTypeClass(type: string | null | undefined) {
  const value = String(type || "zone");

  if (value === "warehouse") {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (value === "vehicle") {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (value === "service_area" || value === "cleaning_area") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (value === "repair_area") {
    return "bg-red-50 text-red-700 ring-1 ring-red-100";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
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
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default async function WarehouseLocationsPage() {
  const supabase = await createClient();

  const [locationsResult, unitsResult] = await Promise.all([
    supabase
      .from("warehouse_locations")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("inventory_units")
      .select("id, warehouse_location_id, status"),
  ]);

  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  if (unitsResult.error) {
    throw new Error(unitsResult.error.message);
  }

  const locations = locationsResult.data || [];
  const units = unitsResult.data || [];

  const activeCount = locations.filter(
    (location: any) => location.active !== false
  ).length;

  const inactiveCount = locations.filter(
    (location: any) => location.active === false
  ).length;

  const vehiclesCount = locations.filter(
    (location: any) => location.location_type === "vehicle"
  ).length;

  const serviceAreasCount = locations.filter((location: any) =>
    ["service_area", "cleaning_area", "repair_area"].includes(
      String(location.location_type || "")
    )
  ).length;

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse map
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Warehouse Locations
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Складские зоны, машины, зона чистки, зона ремонта, временная
              локация у клиента и места хранения.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/admin/inventory"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Inventory list
            </a>

            <a
              href="/admin/inventory/movements"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#23313f] px-3 text-center text-xs font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Movements
            </a>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Locations
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {locations.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Active
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {activeCount}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Vehicles
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#8a6b20] sm:mt-2 sm:text-3xl sm:font-semibold">
            {vehiclesCount}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Service areas
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#355879] sm:mt-2 sm:text-3xl sm:font-semibold">
            {serviceAreasCount}
          </div>
        </div>

        <div className="col-span-2 min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:col-span-1 sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Inactive
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#6c6258] sm:mt-2 sm:text-3xl sm:font-semibold">
            {inactiveCount}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Add location
            </h3>

            <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
              Создай складскую зону, полку, машину или зону чистки.
            </p>
          </div>

          <form
            action={createWarehouseLocationAction}
            className="space-y-3 p-3.5 sm:space-y-5 sm:p-6"
          >
            <Field label="Name">
              <Input
                name="name"
                placeholder="Main Warehouse, Van 1, Cleaning Area..."
                required
              />
            </Field>

            <Field label="Parent location">
              <Select name="parentId" defaultValue="">
                <option value="">Root location</option>
                {locations.map((location: any) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-1 sm:gap-4">
              <Field label="Location type">
                <Select name="locationType" defaultValue="zone">
                  <option value="warehouse">Warehouse</option>
                  <option value="zone">Zone</option>
                  <option value="shelf">Shelf</option>
                  <option value="vehicle">Vehicle</option>
                  <option value="service_area">Service area</option>
                  <option value="cleaning_area">Cleaning area</option>
                  <option value="repair_area">Repair area</option>
                  <option value="customer_site">Customer site</option>
                </Select>
              </Field>

              <Field label="Sort order">
                <Input name="sortOrder" type="number" defaultValue="100" />
              </Field>
            </div>

            <Field label="Short description">
              <Input
                name="description"
                placeholder="Short description for this location..."
              />
            </Field>

            <button
              type="submit"
              className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_22px_rgba(201,150,79,0.20)] transition hover:bg-[#b78744] sm:rounded-full sm:px-6 sm:py-4 sm:font-semibold"
            >
              Create location
            </button>
          </form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Location list
            </h3>

            <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
              Редактирование локаций, типа зоны, активности и удаление пустых
              локаций.
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {locations.map((location: any) => {
              const unitsCount = getUnitsCount(units, location.id);
              const availableUnitsCount = getAvailableUnitsCount(
                units,
                location.id
              );
              const outUnitsCount = getOutUnitsCount(units, location.id);
              const childrenCount = getChildrenCount(locations, location.id);
              const canDelete = unitsCount === 0 && childrenCount === 0;

              return (
                <div key={location.id} className="p-3.5 sm:p-6">
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 sm:mb-4 sm:gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                        location.active !== false
                      )}`}
                    >
                      {location.active !== false ? "Active" : "Inactive"}
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${locationTypeClass(
                        location.location_type
                      )}`}
                    >
                      {locationTypeLabel(location.location_type)}
                    </span>

                    <span className="rounded-full bg-[#eaf2f9] px-2.5 py-1 text-[10px] font-bold text-[#355879] ring-1 ring-[#cfe0ef] sm:px-3 sm:text-xs sm:font-semibold">
                      {unitsCount} units
                    </span>

                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 sm:px-3 sm:text-xs sm:font-semibold">
                      {availableUnitsCount} available
                    </span>

                    <span className="rounded-full bg-[#fff4d8] px-2.5 py-1 text-[10px] font-bold text-[#8a6b20] ring-1 ring-[#efd582] sm:px-3 sm:text-xs sm:font-semibold">
                      {outUnitsCount} out
                    </span>

                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold text-neutral-600 ring-1 ring-neutral-200 sm:px-3 sm:text-xs sm:font-semibold">
                      {childrenCount} children
                    </span>
                  </div>

                  <div className="grid min-w-0 gap-3 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
                    <form
                      action={updateWarehouseLocationAction}
                      className="min-w-0 space-y-3 sm:space-y-4"
                    >
                      <input
                        type="hidden"
                        name="locationId"
                        value={location.id}
                      />

                      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-[1fr_220px] 2xl:grid-cols-[1fr_220px_170px_120px]">
                        <Field label="Name">
                          <Input
                            name="name"
                            defaultValue={location.name || ""}
                            required
                          />
                        </Field>

                        <Field label="Parent">
                          <Select
                            name="parentId"
                            defaultValue={location.parent_id || ""}
                          >
                            <option value="">Root location</option>
                            {locations
                              .filter((item: any) => item.id !== location.id)
                              .map((item: any) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </Select>
                        </Field>

                        <Field label="Type">
                          <Select
                            name="locationType"
                            defaultValue={location.location_type || "zone"}
                          >
                            <option value="warehouse">Warehouse</option>
                            <option value="zone">Zone</option>
                            <option value="shelf">Shelf</option>
                            <option value="vehicle">Vehicle</option>
                            <option value="service_area">Service area</option>
                            <option value="cleaning_area">Cleaning area</option>
                            <option value="repair_area">Repair area</option>
                            <option value="customer_site">Customer site</option>
                          </Select>
                        </Field>

                        <Field label="Sort">
                          <Input
                            name="sortOrder"
                            type="number"
                            defaultValue={location.sort_order || 100}
                          />
                        </Field>
                      </div>

                      <Field label="Short description">
                        <Input
                          name="description"
                          defaultValue={location.description || ""}
                          placeholder="Short description for this location..."
                        />
                      </Field>

                      <label className="flex items-center justify-between gap-4 rounded-xl border border-[#eee5d9] bg-[#fcfaf7] px-3 py-2.5 text-sm font-bold text-[#1f1e1b] sm:rounded-2xl sm:px-4 sm:py-3 sm:font-semibold">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={location.active !== false}
                          className="h-5 w-5"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2 text-[11px] leading-4 text-[#6c6258] sm:text-xs">
                        <div className="truncate">
                          Slug: {location.slug || "—"}
                        </div>
                        <div className="truncate">
                          Parent: {getParentName(locations, location.parent_id)}
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold"
                      >
                        Save
                      </button>
                    </form>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-1">
                      <form action={toggleWarehouseLocationAction}>
                        <input
                          type="hidden"
                          name="locationId"
                          value={location.id}
                        />

                        <input
                          type="hidden"
                          name="active"
                          value={location.active === false ? "true" : "false"}
                        />

                        <button
                          type="submit"
                          className={[
                            "w-full rounded-xl px-3 py-2.5 text-xs font-bold transition sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold",
                            location.active === false
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                              : "bg-red-50 text-red-700 ring-1 ring-red-100 hover:bg-red-100",
                          ].join(" ")}
                        >
                          {location.active === false ? "Activate" : "Deactivate"}
                        </button>
                      </form>

                      <form action={deleteWarehouseLocationAction}>
                        <input
                          type="hidden"
                          name="locationId"
                          value={location.id}
                        />

                        <button
                          type="submit"
                          disabled={!canDelete}
                          title={
                            canDelete
                              ? "Delete empty location"
                              : "Move units and child locations before deleting"
                          }
                          className={[
                            "w-full rounded-xl px-3 py-2.5 text-xs font-bold transition sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold",
                            canDelete
                              ? "bg-red-700 text-white hover:bg-red-800"
                              : "cursor-not-allowed bg-neutral-100 text-neutral-400 ring-1 ring-neutral-200",
                          ].join(" ")}
                        >
                          Delete
                        </button>
                      </form>

                      {!canDelete && (
                        <div className="col-span-2 rounded-xl bg-[#fff8eb] p-3 text-[11px] leading-4 text-[#8a6b20] ring-1 ring-[#efd582] sm:rounded-2xl sm:p-4 sm:text-xs sm:leading-5 xl:col-span-1">
                          Cannot delete: location has {unitsCount} unit(s) and{" "}
                          {childrenCount} child location(s). Move them first.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {locations.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No locations yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Create your first warehouse location.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

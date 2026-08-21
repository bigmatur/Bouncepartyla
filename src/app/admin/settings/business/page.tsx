import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  createDeliveryZoneAction,
  lookupTaxRateAction,
  toggleDeliveryZoneAction,
  updateBusinessSettingsAction,
  updateDeliveryZoneAction,
} from "./actions";

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatArray(value: any) {
  if (!Array.isArray(value) || value.length === 0) return "";

  return value.join(", ");
}

function formatGeojson(value: any) {
  if (!value) return "";

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function statusClass(active: boolean) {
  if (active) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
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
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
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
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
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
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <div className="border-b border-[#eee5d9] px-6 py-5">
        <h3 className="text-xl font-semibold text-[#1f1e1b]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[#6c6258]">{description}</p>
      </div>

      <div className="p-6">{children}</div>
    </section>
  );
}

export default async function BusinessSettingsPage() {
  const { supabase } = await requireAdminPermission("settings.view");

  const [settingsResult, zonesResult, taxCacheResult] = await Promise.all([
    supabase
      .from("business_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("delivery_zones")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

    supabase
      .from("tax_rate_cache")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  if (zonesResult.error) {
    throw new Error(zonesResult.error.message);
  }

  if (taxCacheResult.error) {
    throw new Error(taxCacheResult.error.message);
  }

  const settings = settingsResult.data;
  const zones = zonesResult.data || [];
  const taxCache = taxCacheResult.data || [];

  const deliveryMode = settings?.delivery_pricing_mode || "per_mile";

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white px-6 py-5 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <a
              href="/admin/settings"
              className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
            >
              ← Back to settings
            </a>

            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Business setup
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Warehouse, Delivery & Tax
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Настройки точки выезда склада, способов расчета доставки и tax
              lookup через CDTFA.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/bookings/new"
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              New Booking
            </a>

            <a
              href="/admin/settings"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Settings
            </a>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Delivery mode
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
            {deliveryMode === "zones" ? "Zones" : "Per mile"}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Zones
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
            {zones.length}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_8px_28px_rgba(0,0,0,0.03)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Tax provider
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
            CDTFA
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <main className="space-y-6">
          <SettingCard
            title="Business / Warehouse Origin"
            description="От этой точки будет считаться доставка по милям. Для точного расчета нужны координаты склада."
          >
            <form action={updateBusinessSettingsAction} className="space-y-5">
              <input type="hidden" name="settingsId" value={settings?.id || ""} />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Business name">
                  <Input
                    name="businessName"
                    defaultValue={settings?.business_name || "Bounce Party LA"}
                  />
                </Field>

                <Field label="Warehouse name">
                  <Input
                    name="warehouseName"
                    defaultValue={settings?.warehouse_name || "Main Warehouse"}
                  />
                </Field>

                <Field label="Origin address">
                  <Input
                    name="originAddress"
                    defaultValue={settings?.origin_address || ""}
                    placeholder="Warehouse street address"
                  />
                </Field>

                <Field label="Origin city">
                  <Input
                    name="originCity"
                    defaultValue={settings?.origin_city || ""}
                    placeholder="La Cañada Flintridge"
                  />
                </Field>

                <Field label="Origin state">
                  <Input
                    name="originState"
                    defaultValue={settings?.origin_state || "CA"}
                  />
                </Field>

                <Field label="Origin ZIP">
                  <Input
                    name="originZip"
                    defaultValue={settings?.origin_zip || ""}
                    placeholder="91011"
                  />
                </Field>

                <Field label="Origin latitude">
                  <Input
                    name="originLat"
                    type="number"
                    step="0.000001"
                    defaultValue={settings?.origin_lat || ""}
                    placeholder="34.2068"
                  />
                </Field>

                <Field label="Origin longitude">
                  <Input
                    name="originLng"
                    type="number"
                    step="0.000001"
                    defaultValue={settings?.origin_lng || ""}
                    placeholder="-118.2000"
                  />
                </Field>
              </div>

              <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                <h4 className="text-lg font-semibold text-[#1f1e1b]">
                  Delivery pricing
                </h4>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Pricing mode">
                    <Select
                      name="deliveryPricingMode"
                      defaultValue={settings?.delivery_pricing_mode || "per_mile"}
                    >
                      <option value="per_mile">By miles</option>
                      <option value="zones">Delivery zones</option>
                    </Select>
                  </Field>

                  <Field label="Base fee">
                    <Input
                      name="deliveryBaseFee"
                      type="number"
                      step="0.01"
                      defaultValue={settings?.delivery_base_fee || 0}
                    />
                  </Field>

                  <Field label="Per mile rate">
                    <Input
                      name="deliveryPerMileRate"
                      type="number"
                      step="0.01"
                      defaultValue={settings?.delivery_per_mile_rate || 0}
                    />
                  </Field>

                  <Field label="Minimum fee">
                    <Input
                      name="deliveryMinimumFee"
                      type="number"
                      step="0.01"
                      defaultValue={settings?.delivery_minimum_fee || 0}
                    />
                  </Field>

                  <Field label="Free radius miles">
                    <Input
                      name="deliveryFreeRadiusMiles"
                      type="number"
                      step="0.01"
                      defaultValue={settings?.delivery_free_radius_miles || 0}
                    />
                  </Field>

                  <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                    <input
                      type="checkbox"
                      name="taxEnabled"
                      defaultChecked={settings?.tax_enabled !== false}
                      className="h-4 w-4"
                    />
                    Enable CDTFA tax lookup
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="rounded-full bg-[#23313f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Save business settings
              </button>
            </form>
          </SettingCard>

          <SettingCard
            title="Delivery Zones"
            description="Зоны можно задавать через ZIP/city сейчас, а polygon_geojson пригодится для карты позже."
          >
            <div className="space-y-5">
              {zones.map((zone: any) => (
                <div
                  key={zone.id}
                  className="rounded-[26px] border border-[#eee5d9] bg-[#fcfaf7] p-5"
                >
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-semibold text-[#1f1e1b]">
                          {zone.name}
                        </h4>

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                            zone.active
                          )}`}
                        >
                          {zone.active ? "Active" : "Inactive"}
                        </span>

                        <span className="rounded-full bg-[#fff4d8] px-3 py-1 text-xs font-semibold text-[#8a6b20] ring-1 ring-[#efd582]">
                          {money(zone.delivery_fee)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-[#6c6258]">
                        {zone.description || "No description"}
                      </p>
                    </div>

                    <form action={toggleDeliveryZoneAction}>
                      <input type="hidden" name="zoneId" value={zone.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={zone.active ? "false" : "true"}
                      />

                      <button
                        type="submit"
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                      >
                        {zone.active ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>

                  <form action={updateDeliveryZoneAction} className="space-y-4">
                    <input type="hidden" name="zoneId" value={zone.id} />

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Zone name">
                        <Input name="name" defaultValue={zone.name || ""} />
                      </Field>

                      <Field label="Delivery fee">
                        <Input
                          name="deliveryFee"
                          type="number"
                          step="0.01"
                          defaultValue={zone.delivery_fee || 0}
                        />
                      </Field>

                      <Field label="Cities">
                        <Input
                          name="cityNames"
                          defaultValue={formatArray(zone.city_names)}
                          placeholder="Glendale, Pasadena, Burbank"
                        />
                      </Field>

                      <Field label="ZIP codes">
                        <Input
                          name="zipCodes"
                          defaultValue={formatArray(zone.zip_codes)}
                          placeholder="91204, 91107, 91501"
                        />
                      </Field>

                      <Field label="Sort order">
                        <Input
                          name="sortOrder"
                          type="number"
                          defaultValue={zone.sort_order || 100}
                        />
                      </Field>

                      <Field label="Description">
                        <Input
                          name="description"
                          defaultValue={zone.description || ""}
                        />
                      </Field>
                    </div>

                    <Field label="Polygon GeoJSON">
                      <Textarea
                        name="polygonGeojson"
                        rows={5}
                        defaultValue={formatGeojson(zone.polygon_geojson)}
                        placeholder='{"type":"Polygon","coordinates":[...]}'
                      />
                    </Field>

                    <button
                      type="submit"
                      className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                    >
                      Save zone
                    </button>
                  </form>
                </div>
              ))}

              {zones.length === 0 && (
                <div className="rounded-[26px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-14 text-center">
                  <div className="text-lg font-semibold text-[#1f1e1b]">
                    No delivery zones yet
                  </div>
                  <p className="mt-2 text-sm text-[#6c6258]">
                    Add your first delivery zone below.
                  </p>
                </div>
              )}
            </div>
          </SettingCard>
        </main>

        <aside className="space-y-6">
          <SettingCard
            title="Add Delivery Zone"
            description="Создай зону по городам, ZIP-кодам или GeoJSON."
          >
            <form action={createDeliveryZoneAction} className="space-y-4">
              <Field label="Zone name">
                <Input name="name" placeholder="Local zone" required />
              </Field>

              <Field label="Description">
                <Input name="description" placeholder="Within local service area" />
              </Field>

              <Field label="Delivery fee">
                <Input
                  name="deliveryFee"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
              </Field>

              <Field label="Cities">
                <Input
                  name="cityNames"
                  placeholder="Glendale, Pasadena, Burbank"
                />
              </Field>

              <Field label="ZIP codes">
                <Input name="zipCodes" placeholder="91204, 91107, 91501" />
              </Field>

              <Field label="Sort order">
                <Input name="sortOrder" type="number" defaultValue="100" />
              </Field>

              <Field label="Polygon GeoJSON">
                <Textarea
                  name="polygonGeojson"
                  rows={5}
                  placeholder='{"type":"Polygon","coordinates":[...]}'
                />
              </Field>

              <button
                type="submit"
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Add delivery zone
              </button>
            </form>
          </SettingCard>

          <SettingCard
            title="CDTFA Tax Lookup"
            description="Проверка tax rate по адресу клиента через CDTFA."
          >
            <form action={lookupTaxRateAction} className="space-y-4">
              <Field label="Address">
                <Input
                  name="taxAddress"
                  placeholder="331 El Bonito Ave"
                  required
                />
              </Field>

              <Field label="City">
                <Input name="taxCity" placeholder="Glendale" required />
              </Field>

              <Field label="ZIP">
                <Input name="taxZip" placeholder="91204" required />
              </Field>

              <button
                type="submit"
                className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Lookup tax rate
              </button>
            </form>

            <div className="mt-6 space-y-3">
              {taxCache.map((row: any) => (
                <div
                  key={row.id}
                  className="rounded-[20px] border border-[#eee5d9] bg-[#fcfaf7] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-[#1f1e1b]">
                      {Number(row.tax_rate || 0).toFixed(3)}%
                    </div>

                    <div className="text-xs text-[#6c6258]">
                      {formatDate(row.created_at)}
                    </div>
                  </div>

                  <div className="mt-2 text-sm leading-6 text-[#6c6258]">
                    {row.address}, {row.city} {row.zip}
                  </div>
                </div>
              ))}

              {taxCache.length === 0 && (
                <div className="rounded-[20px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-4 py-8 text-center text-sm text-[#6c6258]">
                  No tax lookups yet.
                </div>
              )}
            </div>
          </SettingCard>

          <section className="rounded-[30px] border border-black/5 bg-[#23313f] p-6 text-white shadow-[0_12px_40px_rgba(0,0,0,0.06)]">
            <h3 className="text-lg font-semibold">Next connection</h3>

            <div className="mt-4 space-y-3 text-sm leading-6 text-white/65">
              <p>
                1. New Booking будет брать адрес клиента.
              </p>
              <p>
                2. Delivery fee будет считаться по выбранному mode.
              </p>
              <p>
                3. Tax rate будет подтягиваться через CDTFA.
              </p>
              <p>
                4. Total будет считаться автоматически.
              </p>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
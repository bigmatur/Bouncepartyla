"use client";

import { useState } from "react";
import { updateSystemSettingsAction } from "../actions";

type TimeFormat = "12h" | "24h";
type DateFormat = "us" | "eu";
type DeliveryPricingMode = "miles" | "radius_zones" | "zip_zones";

function cardClass(isActive: boolean) {
  if (isActive) {
    return "border-[#23313f] bg-[#eaf2f9] ring-2 ring-[#cfe0ef]";
  }

  return "border-[#eee5d9] bg-white hover:bg-[#fcfaf7]";
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
        {label}
      </span>

      {children}

      {hint && <span className="mt-1 block text-xs text-[#8b8177]">{hint}</span>}
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

export default function RegionalSettingsForm({
  settings,
}: {
  settings: {
    business_name?: string | null;
    timezone?: string | null;
    time_format?: string | null;
    date_format?: string | null;
    warehouse_address?: string | null;
    warehouse_city?: string | null;
    warehouse_state?: string | null;
    warehouse_zip?: string | null;
    warehouse_lat?: number | string | null;
    warehouse_lng?: number | string | null;
    delivery_pricing_mode?: string | null;
    free_delivery_miles?: number | string | null;
    price_per_mile?: number | string | null;
    minimum_delivery_fee?: number | string | null;
  };
}) {
  const [timeFormat, setTimeFormat] = useState<TimeFormat>(
    settings.time_format === "24h" ? "24h" : "12h"
  );

  const [dateFormat, setDateFormat] = useState<DateFormat>(
    settings.date_format === "eu" ? "eu" : "us"
  );

  const [deliveryMode, setDeliveryMode] = useState<DeliveryPricingMode>(() => {
    if (settings.delivery_pricing_mode === "radius_zones") return "radius_zones";
    if (settings.delivery_pricing_mode === "zip_zones") return "zip_zones";
    return "miles";
  });

  return (
    <form action={updateSystemSettingsAction} className="space-y-6">
      <div className="grid gap-6 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Business name">
            <Input
              name="businessName"
              defaultValue={settings.business_name || ""}
              placeholder="Bounce Party LA"
            />
          </Field>

          <Field label="Timezone">
            <Select
              name="timezone"
              defaultValue={settings.timezone || "America/Los_Angeles"}
            >
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Chicago">America/Chicago</option>
              <option value="America/Denver">America/Denver</option>
              <option value="UTC">UTC</option>
            </Select>
          </Field>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Time format
          </div>

          <input type="hidden" name="timeFormat" value={timeFormat} />

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setTimeFormat("12h")}
              className={`rounded-[24px] border p-5 text-left transition ${cardClass(
                timeFormat === "12h"
              )}`}
            >
              <div className="text-base font-semibold text-[#1f1e1b]">
                American — 12-hour
              </div>

              <div className="mt-1 text-sm text-[#6c6258]">
                9:00 AM / 6:30 PM
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTimeFormat("24h")}
              className={`rounded-[24px] border p-5 text-left transition ${cardClass(
                timeFormat === "24h"
              )}`}
            >
              <div className="text-base font-semibold text-[#1f1e1b]">
                European — 24-hour
              </div>

              <div className="mt-1 text-sm text-[#6c6258]">
                09:00 / 18:30
              </div>
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Date format
          </div>

          <input type="hidden" name="dateFormat" value={dateFormat} />

          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setDateFormat("us")}
              className={`rounded-[24px] border p-5 text-left transition ${cardClass(
                dateFormat === "us"
              )}`}
            >
              <div className="text-base font-semibold text-[#1f1e1b]">
                American date
              </div>

              <div className="mt-1 text-sm text-[#6c6258]">
                MM/DD/YYYY — 06/27/2026
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDateFormat("eu")}
              className={`rounded-[24px] border p-5 text-left transition ${cardClass(
                dateFormat === "eu"
              )}`}
            >
              <div className="text-base font-semibold text-[#1f1e1b]">
                European date
              </div>

              <div className="mt-1 text-sm text-[#6c6258]">
                DD/MM/YYYY — 27/06/2026
              </div>
            </button>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
          <h4 className="text-lg font-semibold text-[#1f1e1b]">
            Warehouse address
          </h4>

          <p className="mt-1 text-sm text-[#6c6258]">
            От этого адреса будет считаться доставка.
          </p>

          <div className="mt-5 grid gap-4">
            <Field label="Warehouse address">
              <Input
                name="warehouseAddress"
                defaultValue={settings.warehouse_address || ""}
                placeholder="Street address"
              />
            </Field>

            <div className="grid gap-4 md:grid-cols-[1fr_120px_120px]">
              <Field label="City">
                <Input
                  name="warehouseCity"
                  defaultValue={settings.warehouse_city || ""}
                  placeholder="La Cañada Flintridge"
                />
              </Field>

              <Field label="State">
                <Input
                  name="warehouseState"
                  defaultValue={settings.warehouse_state || "CA"}
                  placeholder="CA"
                />
              </Field>

              <Field label="ZIP">
                <Input
                  name="warehouseZip"
                  defaultValue={settings.warehouse_zip || ""}
                  placeholder="91011"
                />
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Latitude" hint="Можно оставить пустым пока.">
                <Input
                  name="warehouseLat"
                  type="number"
                  step="0.000001"
                  defaultValue={settings.warehouse_lat || ""}
                  placeholder="34.2068"
                />
              </Field>

              <Field label="Longitude" hint="Можно оставить пустым пока.">
                <Input
                  name="warehouseLng"
                  type="number"
                  step="0.000001"
                  defaultValue={settings.warehouse_lng || ""}
                  placeholder="-118.2000"
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
          <h4 className="text-lg font-semibold text-[#1f1e1b]">
            Delivery pricing
          </h4>

          <p className="mt-1 text-sm text-[#6c6258]">
            Можно считать доставку по милям, по радиусным зонам или по ZIP.
          </p>

          <input type="hidden" name="deliveryPricingMode" value={deliveryMode} />

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <button
              type="button"
              onClick={() => setDeliveryMode("miles")}
              className={`rounded-[24px] border p-5 text-left transition ${cardClass(
                deliveryMode === "miles"
              )}`}
            >
              <div className="text-base font-semibold text-[#1f1e1b]">
                By miles
              </div>

              <div className="mt-1 text-sm text-[#6c6258]">
                Free miles + price per mile.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDeliveryMode("radius_zones")}
              className={`rounded-[24px] border p-5 text-left transition ${cardClass(
                deliveryMode === "radius_zones"
              )}`}
            >
              <div className="text-base font-semibold text-[#1f1e1b]">
                By radius zones
              </div>

              <div className="mt-1 text-sm text-[#6c6258]">
                0–10 mi, 10–20 mi, 20–30 mi.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setDeliveryMode("zip_zones")}
              className={`rounded-[24px] border p-5 text-left transition ${cardClass(
                deliveryMode === "zip_zones"
              )}`}
            >
              <div className="text-base font-semibold text-[#1f1e1b]">
                By ZIP zones
              </div>

              <div className="mt-1 text-sm text-[#6c6258]">
                91011, 91214, 91101 etc.
              </div>
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Field label="Free delivery miles">
              <Input
                name="freeDeliveryMiles"
                type="number"
                step="0.01"
                defaultValue={settings.free_delivery_miles || "10"}
              />
            </Field>

            <Field label="Price per mile">
              <Input
                name="pricePerMile"
                type="number"
                step="0.01"
                defaultValue={settings.price_per_mile || "1"}
              />
            </Field>

            <Field label="Minimum delivery fee">
              <Input
                name="minimumDeliveryFee"
                type="number"
                step="0.01"
                defaultValue={settings.minimum_delivery_fee || "0"}
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t border-[#eee5d9] px-6 py-5">
        <button
          type="submit"
          className="rounded-full bg-[#c9964f] px-8 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.28)] transition hover:bg-[#b78744]"
        >
          Save settings
        </button>
      </div>
    </form>
  );
}
"use client";

import { useState } from "react";
import GoogleAddressInput from "@/components/admin/GoogleAddressInput";

type WarehouseAddressFieldsProps = {
  googleMapsApiKey: string;
  defaultAddress: string;
  defaultCity: string;
  defaultState: string;
  defaultZip: string;
  defaultLat: string;
  defaultLng: string;
};

export default function WarehouseAddressFields({
  googleMapsApiKey,
  defaultAddress,
  defaultCity,
  defaultState,
  defaultZip,
  defaultLat,
  defaultLng,
}: WarehouseAddressFieldsProps) {
  const [address, setAddress] = useState(defaultAddress);
  const [city, setCity] = useState(defaultCity);
  const [stateValue, setStateValue] = useState(defaultState || "CA");
  const [zip, setZip] = useState(defaultZip);
  const [lat, setLat] = useState(defaultLat);
  const [lng, setLng] = useState(defaultLng);

  return (
    <>
      <div className="md:col-span-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Warehouse address
          </span>

          <GoogleAddressInput
            apiKey={googleMapsApiKey}
            name="warehouseAddress"
            value={address}
            onChange={setAddress}
            onResolved={(parts) => {
              if (parts.addressLine) {
                setAddress(parts.addressLine);
              }

              if (parts.city) {
                setCity(parts.city);
              }

              if (parts.state) {
                setStateValue(parts.state);
              }

              if (parts.zip) {
                setZip(parts.zip);
              }

              if (parts.lat !== null) {
                setLat(String(parts.lat));
              }

              if (parts.lng !== null) {
                setLng(String(parts.lng));
              }
            }}
            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          City
        </span>

        <input
          name="warehouseCity"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          State
        </span>

        <input
          name="warehouseState"
          value={stateValue}
          onChange={(event) => setStateValue(event.target.value)}
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          ZIP
        </span>

        <input
          name="warehouseZip"
          value={zip}
          onChange={(event) => setZip(event.target.value)}
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          Latitude
        </span>

        <input
          name="warehouseLat"
          type="number"
          step="0.000001"
          value={lat}
          onChange={(event) => setLat(event.target.value)}
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          Longitude
        </span>

        <input
          name="warehouseLng"
          type="number"
          step="0.000001"
          value={lng}
          onChange={(event) => setLng(event.target.value)}
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />
      </label>
    </>
  );
}

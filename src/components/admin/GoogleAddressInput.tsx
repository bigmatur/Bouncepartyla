"use client";

import { useEffect, useId, useMemo, useRef } from "react";

type GoogleAddressParts = {
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  formattedAddress: string;
};

type GoogleAddressInputProps = {
  apiKey: string;
  value: string;
  onChange: (value: string) => void;
  onResolved?: (parts: GoogleAddressParts) => void;
  placeholder?: string;
  className?: string;
  name?: string;
  required?: boolean;
};

declare global {
  interface Window {
    __googleMapsPlacesLoaderPromise?: Promise<void>;
    __googleMapsRouteLoaderPromise?: Promise<void>;
    google?: any;
  }
}

function loadGooglePlaces(apiKey: string) {
  if (!apiKey) {
    return Promise.resolve();
  }

  if (window.google?.maps?.places) {
    return Promise.resolve();
  }

  if (window.google?.maps?.importLibrary) {
    return window.google.maps.importLibrary("places").then(() => undefined);
  }

  if (window.__googleMapsPlacesLoaderPromise) {
    return window.__googleMapsPlacesLoaderPromise;
  }

  if (window.__googleMapsRouteLoaderPromise) {
    window.__googleMapsPlacesLoaderPromise = window.__googleMapsRouteLoaderPromise;
    return window.__googleMapsPlacesLoaderPromise;
  }

  window.__googleMapsPlacesLoaderPromise = new Promise<void>((resolve, reject) => {
    const anyGoogleMapsScript = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    ) as HTMLScriptElement | null;

    if (anyGoogleMapsScript) {
      if (window.google?.maps) {
        resolve();
        return;
      }

      anyGoogleMapsScript.addEventListener("load", () => resolve(), {
        once: true,
      });
      anyGoogleMapsScript.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps Places script.")),
        { once: true }
      );
      return;
    }

    const existing = document.querySelector(
      'script[data-google-maps-places="true"]'
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Google Maps Places script.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMapsPlaces = "true";

    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load Google Maps Places script."));

    document.head.appendChild(script);
  });

  window.__googleMapsRouteLoaderPromise = window.__googleMapsPlacesLoaderPromise;

  return window.__googleMapsPlacesLoaderPromise;
}

function getAddressComponent(place: any, type: string) {
  const components = Array.isArray(place?.address_components)
    ? place.address_components
    : [];

  const component = components.find((item: any) =>
    Array.isArray(item?.types) ? item.types.includes(type) : false
  );

  return String(component?.long_name || "").trim();
}

function getAddressComponentShort(place: any, type: string) {
  const components = Array.isArray(place?.address_components)
    ? place.address_components
    : [];

  const component = components.find((item: any) =>
    Array.isArray(item?.types) ? item.types.includes(type) : false
  );

  return String(component?.short_name || component?.long_name || "").trim();
}

function toAddressParts(place: any): GoogleAddressParts {
  const streetNumber = getAddressComponent(place, "street_number");
  const route = getAddressComponent(place, "route");
  const city =
    getAddressComponent(place, "locality") ||
    getAddressComponent(place, "postal_town") ||
    getAddressComponent(place, "administrative_area_level_2");
  const state = getAddressComponentShort(place, "administrative_area_level_1");
  const zip = getAddressComponent(place, "postal_code");

  const addressLine = [streetNumber, route].filter(Boolean).join(" ").trim();

  const geometry = place?.geometry?.location;
  const lat = typeof geometry?.lat === "function" ? Number(geometry.lat()) : null;
  const lng = typeof geometry?.lng === "function" ? Number(geometry.lng()) : null;

  return {
    addressLine,
    city,
    state,
    zip,
    placeId: place?.place_id || null,
    lat: Number.isFinite(lat as number) ? (lat as number) : null,
    lng: Number.isFinite(lng as number) ? (lng as number) : null,
    formattedAddress: String(place?.formatted_address || "").trim(),
  };
}

export default function GoogleAddressInput({
  apiKey,
  value,
  onChange,
  onResolved,
  placeholder,
  className,
  name,
  required,
}: GoogleAddressInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const fallbackId = useId();
  const inputName = useMemo(() => name || `address-${fallbackId}`, [name, fallbackId]);

  useEffect(() => {
    let mounted = true;
    let listener: any = null;
    let autocomplete: any = null;

    async function init() {
      if (!apiKey || !inputRef.current) {
        return;
      }

      try {
        await loadGooglePlaces(apiKey);
      } catch {
        return;
      }

      if (!mounted || !inputRef.current || !window.google?.maps?.places) {
        return;
      }

      autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: [
          "address_components",
          "formatted_address",
          "geometry",
          "place_id",
          "name",
        ],
        componentRestrictions: { country: "us" },
      });

      listener = autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const parts = toAddressParts(place);

        const nextAddress =
          parts.addressLine || parts.formattedAddress || String(place?.name || "").trim();

        if (nextAddress) {
          onChange(nextAddress);
        }

        onResolved?.(parts);
      });
    }

    init();

    return () => {
      mounted = false;
      if (listener && window.google?.maps?.event?.removeListener) {
        window.google.maps.event.removeListener(listener);
      }
    };
  }, [apiKey, onChange, onResolved]);

  return (
    <input
      ref={inputRef}
      name={inputName}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      autoComplete="off"
      className={className}
    />
  );
}

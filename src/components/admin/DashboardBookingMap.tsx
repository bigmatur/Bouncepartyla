"use client";

import { useEffect, useRef, useState } from "react";

type BookingMapPoint = {
  id: string;
  bookingNumber: string;
  customerName: string;
  eventDate: string;
  address: string;
  city: string;
  totalAmount: number;
};

declare global {
  interface Window {
    google?: any;
    __googleMapsDashboardLoaderPromise?: Promise<void>;
  }
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();

  if (window.__googleMapsDashboardLoaderPromise) {
    return window.__googleMapsDashboardLoaderPromise;
  }

  window.__googleMapsDashboardLoaderPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });

  return window.__googleMapsDashboardLoaderPromise;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}

export default function DashboardBookingMap({
  apiKey,
  points,
}: {
  apiKey: string;
  points: BookingMapPoint[];
}) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const markers: any[] = [];

    async function renderMap() {
      if (!mapRef.current || !apiKey || points.length === 0) return;

      try {
        await loadGoogleMaps(apiKey);
      } catch {
        if (!cancelled) setError("Google Maps could not be loaded.");
        return;
      }

      if (cancelled || !mapRef.current || !window.google?.maps) return;

      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 34.1478, lng: -118.1445 },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        clickableIcons: false,
      });
      const bounds = new window.google.maps.LatLngBounds();
      const geocoder = new window.google.maps.Geocoder();
      const infoWindow = new window.google.maps.InfoWindow();

      await Promise.all(points.map(async (point) => {
        const location = await new Promise<any | null>((resolve) => {
          geocoder.geocode({ address: point.address }, (results: any, status: string) => {
            resolve(status === "OK" && results?.length ? results[0].geometry?.location || null : null);
          });
        });

        if (cancelled || !location) return;

        const marker = new window.google.maps.Marker({
          map,
          position: location,
          title: `${point.bookingNumber} · ${point.customerName}`,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: "#f87171",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: 6,
          },
        });
        marker.addListener("click", () => {
          infoWindow.setContent(`
            <div style="min-width:180px;padding:2px 1px;font-family:Arial,sans-serif">
              <strong>${point.bookingNumber}</strong><br/>
              <span>${point.customerName}</span><br/>
              <span>${point.eventDate} · ${formatMoney(point.totalAmount)}</span><br/>
              <a href="/admin/bookings/${point.id}" style="display:inline-block;margin-top:7px;color:#243342;font-weight:600">Open booking</a>
            </div>
          `);
          infoWindow.open({ map, anchor: marker });
        });
        markers.push(marker);
        bounds.extend(location);
      }));

      if (cancelled || markers.length === 0) return;
      if (markers.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(13);
      } else {
        map.fitBounds(bounds, 48);
      }
    }

    void renderMap();
    return () => {
      cancelled = true;
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [apiKey, points]);

  if (!apiKey) {
    return <p className="py-12 text-center text-sm text-[#81766c]">Google Maps API key is not configured.</p>;
  }

  if (points.length === 0) {
    return <p className="py-12 text-center text-sm text-[#81766c]">No booking addresses for the selected dates.</p>;
  }

  return (
    <div className="relative h-[320px] overflow-hidden rounded-2xl bg-[#eee7de] sm:h-[390px]">
      <div ref={mapRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#243342] shadow-sm">
        {points.length} booking{points.length === 1 ? "" : "s"}
      </div>
      {error ? <p className="absolute inset-x-4 bottom-4 rounded-xl bg-red-600 px-4 py-3 text-center text-xs font-semibold text-white">{error}</p> : null}
    </div>
  );
}
"use client";

import { useEffect, useRef, useState } from "react";

type DriverLocation = {
  latitude: number;
  longitude: number;
};

type Props = {
  apiKey: string;
  driverLocation: DriverLocation;
  destination: string;
};

declare global {
  interface Window {
    google?: any;
    __driverNavigatorGoogleMapsPromise?: Promise<void>;
  }
}

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();

  if (window.__driverNavigatorGoogleMapsPromise) {
    return window.__driverNavigatorGoogleMapsPromise;
  }

  window.__driverNavigatorGoogleMapsPromise = new Promise<void>(
    (resolve, reject) => {
      const existing = document.querySelector(
        'script[src*="maps.googleapis.com/maps/api/js"]',
      ) as HTMLScriptElement | null;

      if (existing) {
        if (window.google?.maps) {
          resolve();
          return;
        }

        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Google Maps failed to load.")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey,
      )}&v=weekly`;
      script.async = true;
      script.defer = true;
      script.dataset.driverNavigator = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google Maps failed to load."));
      document.head.appendChild(script);
    },
  );

  return window.__driverNavigatorGoogleMapsPromise;
}

export default function DriverNavigatorMap({
  apiKey,
  driverLocation,
  destination,
}: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const directionsServiceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function ensureMap() {
      if (!mapRef.current || !apiKey) return;

      try {
        await loadGoogleMaps(apiKey);
      } catch (mapError) {
        if (!cancelled) {
          setError(
            mapError instanceof Error
              ? mapError.message
              : "Google Maps failed to load.",
          );
        }
        return;
      }

      if (cancelled || !mapRef.current || !window.google?.maps) return;

      const origin = {
        lat: driverLocation.latitude,
        lng: driverLocation.longitude,
      };

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
          center: origin,
          zoom: 16,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: "greedy",
          disableDefaultUI: true,
          zoomControl: true,
        });

        directionsServiceRef.current =
          new window.google.maps.DirectionsService();

        directionsRendererRef.current =
          new window.google.maps.DirectionsRenderer({
            map: mapInstanceRef.current,
            suppressMarkers: true,
            preserveViewport: true,
          });

        driverMarkerRef.current = new window.google.maps.Marker({
          map: mapInstanceRef.current,
          position: origin,
          title: "Driver location",
          zIndex: 1000,
        });
      } else {
        driverMarkerRef.current?.setPosition(origin);
      }

      const map = mapInstanceRef.current;
      map.panTo(origin);

      if (!destination || !directionsServiceRef.current) {
        map.setZoom(16);
        return;
      }

      directionsServiceRef.current.route(
        {
          origin,
          destination,
          travelMode: window.google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: false,
        },
        (result: any, status: string) => {
          if (cancelled) return;

          if (status !== "OK" || !result?.routes?.length) {
            setError("Could not build live route from driver GPS.");
            map.panTo(origin);
            map.setZoom(16);
            return;
          }

          setError("");
          directionsRendererRef.current?.setDirections(result);

          const leg = result.routes[0]?.legs?.[0];
          const destinationLocation = leg?.end_location;

          if (destinationLocation) {
            if (!destinationMarkerRef.current) {
              destinationMarkerRef.current = new window.google.maps.Marker({
                map,
                position: destinationLocation,
                title: "Current stop",
                zIndex: 900,
              });
            } else {
              destinationMarkerRef.current.setPosition(destinationLocation);
            }
          }

          map.panTo(origin);
          map.setZoom(16);
        },
      );
    }

    void ensureMap();

    return () => {
      cancelled = true;
    };
  }, [
    apiKey,
    destination,
    driverLocation.latitude,
    driverLocation.longitude,
  ]);

  return (
    <div className="relative h-full w-full bg-[#d9d4ca]">
      <div ref={mapRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full bg-[#23313f]/90 px-4 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur">
        Live GPS navigation
      </div>

      {error ? (
        <div className="absolute inset-x-4 bottom-28 z-10 rounded-2xl bg-red-600 px-4 py-3 text-center text-xs font-semibold text-white shadow-lg">
          {error}
        </div>
      ) : null}
    </div>
  );
}

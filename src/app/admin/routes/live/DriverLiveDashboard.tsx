"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    google?: any;
    __googleMapsPromise?: Promise<void>;
    __driverLiveDirectionsCache?: Map<
      string,
      {
        createdAt: number;
        result: any;
      }
    >;
  }
}

type DriverDashboardItem = {
  id: string;
  name: string;
  color: string;
  phone: string | null;
  account_email: string | null;
  latestPing: {
    id: string;
    driver_name: string;
    route_date: string | null;
    latitude: number | string;
    longitude: number | string;
    accuracy: number | string | null;
    heading: number | string | null;
    speed: number | string | null;
    created_at: string;
  } | null;
  eta: {
    distance_text: string | null;
    duration_text: string | null;
    duration_seconds: number | null;
    arrival_at: string | null;
    fetched_at?: string | null;
    source?: string;
    status: {
      state: "ok" | "risk" | "late" | "unknown";
      label: string;
      minutesLate: number;
    };
  } | null;
  stats: {
    totalStops: number;
    completedStops: number;
    openStops: number;
    collectTotal: number;
  };
  stops: Array<{
    id: string;
    sequence_number: number;
    title: string;
    stop_type: string | null;
    status: string | null;
    address: string;
    scheduled_start_time: string | null;
    scheduled_end_time: string | null;
    balance_due: number | string | null;
    payment_collected: boolean | null;
  }>;
  currentStop: {
    id: string;
    sequence_number: number | null;
    title: string;
    stop_type: string | null;
    status: string | null;
    address: string;
    scheduled_start_time: string | null;
    scheduled_end_time: string | null;
    balance_due: number | string | null;
  } | null;
};

type Props = {
  selectedDate: string;
  googleMapsApiKey: string;
  drivers: DriverDashboardItem[];
};

function loadGoogleMaps(apiKey: string) {
  if (!apiKey) {
    return Promise.reject(new Error("Missing Google Maps API key."));
  }

  if (typeof window === "undefined") {
    return Promise.reject(new Error("Window unavailable."));
  }

  if (window.google?.maps) {
    return Promise.resolve();
  }

  if (window.__googleMapsPromise) {
    return window.__googleMapsPromise;
  }

  window.__googleMapsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("google-maps-live-dashboard");

    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Google Maps script failed."))
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "google-maps-live-dashboard";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places`;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps script failed."));

    document.head.appendChild(script);
  });

  return window.__googleMapsPromise;
}

function formatMoney(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function timeValue(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function formatTime(value: string | null | undefined) {
  const cleanValue = timeValue(value);

  if (!cleanValue) return "Any time";

  const date = new Date(`2000-01-01T${cleanValue}:00`);

  if (Number.isNaN(date.getTime())) return cleanValue;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatClock(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function prettyStatus(value: string | null | undefined) {
  if (!value) return "Scheduled";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function secondsAgo(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  const diffSeconds = Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / 1000)
  );

  if (!Number.isFinite(diffSeconds)) return null;

  return diffSeconds;
}

function onlineTone(seconds: number | null) {
  if (seconds == null) {
    return {
      label: "No GPS",
      className: "bg-[#f4ede2] text-[#6c6258] ring-[#d8cec0]",
      dot: "bg-[#8b8177]",
    };
  }

  if (seconds <= 90) {
    return {
      label: "Online",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      dot: "bg-emerald-500",
    };
  }

  if (seconds <= 300) {
    return {
      label: "Delayed",
      className: "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]",
      dot: "bg-[#c9964f]",
    };
  }

  return {
    label: "Offline",
    className: "bg-red-50 text-red-700 ring-red-200",
    dot: "bg-red-500",
  };
}

function etaTone(state: string | undefined) {
  if (state === "late") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (state === "risk") {
    return "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]";
  }

  if (state === "ok") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-[#f4ede2] text-[#6c6258] ring-[#d8cec0]";
}

function lastSeenLabel(seconds: number | null) {
  if (seconds == null) return "No location yet";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);

  return `${hours}h ago`;
}

function mapsLocationUrl(driver: DriverDashboardItem) {
  if (!driver.latestPing) return "";

  const lat = driver.latestPing.latitude;
  const lng = driver.latestPing.longitude;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${lat},${lng}`
  )}`;
}

function mapsDirectionUrl(driver: DriverDashboardItem) {
  if (!driver.latestPing || !driver.currentStop?.address) return "";

  const lat = driver.latestPing.latitude;
  const lng = driver.latestPing.longitude;

  const params = new URLSearchParams({
    api: "1",
    origin: `${lat},${lng}`,
    destination: driver.currentStop.address,
    travelmode: "driving",
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function makeDriverIcon(color: string) {
  const safeColor = encodeURIComponent(color || "#23313f");

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="52" height="52" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
        <circle cx="26" cy="26" r="22" fill="${decodeURIComponent(safeColor)}" stroke="white" stroke-width="4"/>
        <path d="M15 28h22l-3-8H18l-3 8z" fill="white"/>
        <circle cx="20" cy="32" r="3" fill="white"/>
        <circle cx="32" cy="32" r="3" fill="white"/>
      </svg>
    `)}`,
    scaledSize: new window.google.maps.Size(42, 42),
    anchor: new window.google.maps.Point(21, 21),
  };
}

function stopMarkerColor(stopType: string | null) {
  if (stopType === "pickup") return "#dc2626";
  return "#059669";
}

function makeStopIcon({
  number,
  color,
  current,
}: {
  number: number;
  color: string;
  current: boolean;
}) {
  const size = current ? 46 : 38;
  const fontSize = current ? 16 : 14;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="${color}" stroke="white" stroke-width="4"/>
        <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-weight="700" font-size="${fontSize}" fill="white">${number}</text>
      </svg>
    `)}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(size / 2, size / 2),
  };
}

function geocodeCacheKey(address: string) {
  return `bpla_live_geo_${address.toLowerCase().trim()}`;
}

function readGeocodeCache(address: string) {
  try {
    const raw = window.localStorage.getItem(geocodeCacheKey(address));

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const createdAt = Number(parsed?.createdAt || 0);
    const ageDays = (Date.now() - createdAt) / 1000 / 60 / 60 / 24;

    if (ageDays > 30) return null;

    const lat = Number(parsed?.lat);
    const lng = Number(parsed?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}

function writeGeocodeCache(address: string, position: { lat: number; lng: number }) {
  try {
    window.localStorage.setItem(
      geocodeCacheKey(address),
      JSON.stringify({
        ...position,
        createdAt: Date.now(),
      })
    );
  } catch {
    // ignore
  }
}

async function geocodeAddress(address: string) {
  const cached = readGeocodeCache(address);

  if (cached) return cached;

  const geocoder = new window.google.maps.Geocoder();

  const result = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
    geocoder.geocode({ address }, (results: any, status: string) => {
      if (status !== "OK" || !results?.[0]?.geometry?.location) {
        resolve(null);
        return;
      }

      const location = results[0].geometry.location;
      resolve({
        lat: location.lat(),
        lng: location.lng(),
      });
    });
  });

  if (result) {
    writeGeocodeCache(address, result);
  }

  return result;
}

function directionsCacheKey(driver: DriverDashboardItem) {
  const lat = Number(driver.latestPing?.latitude || 0).toFixed(4);
  const lng = Number(driver.latestPing?.longitude || 0).toFixed(4);
  const stopId = driver.currentStop?.id || "none";

  return `${driver.id}_${stopId}_${lat}_${lng}`;
}

async function getDirectionsForSelectedDriver(driver: DriverDashboardItem) {
  if (!driver.latestPing || !driver.currentStop?.address) return null;

  if (!window.__driverLiveDirectionsCache) {
    window.__driverLiveDirectionsCache = new Map();
  }

  const key = directionsCacheKey(driver);
  const cached = window.__driverLiveDirectionsCache.get(key);

  if (cached && Date.now() - cached.createdAt < 1000 * 60 * 2) {
    return cached.result;
  }

  const directionsService = new window.google.maps.DirectionsService();

  const origin = {
    lat: Number(driver.latestPing.latitude),
    lng: Number(driver.latestPing.longitude),
  };

  const result = await new Promise<any | null>((resolve) => {
    directionsService.route(
      {
        origin,
        destination: driver.currentStop?.address || "",
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (response: any, status: string) => {
        if (status === "OK") {
          resolve(response);
          return;
        }

        resolve(null);
      }
    );
  });

  if (result) {
    window.__driverLiveDirectionsCache.set(key, {
      createdAt: Date.now(),
      result,
    });
  }

  return result;
}

export default function DriverLiveDashboard({
  selectedDate,
  googleMapsApiKey,
  drivers,
}: Props) {
  const router = useRouter();

  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);

  const [selectedDriverId, setSelectedDriverId] = useState(() => {
    const active =
      drivers.find((driver) =>
        ["on_the_way", "arrived"].includes(
          String(driver.currentStop?.status || "")
        )
      ) || drivers.find((driver) => driver.latestPing);

    return active?.id || drivers[0]?.id || "";
  });

  const selectedDriver =
    drivers.find((driver) => driver.id === selectedDriverId) ||
    drivers[0] ||
    null;

  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [router]);

  useEffect(() => {
    if (!selectedDriverId && drivers[0]) {
      setSelectedDriverId(drivers[0].id);
    }
  }, [drivers, selectedDriverId]);

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      if (!mapElementRef.current || !googleMapsApiKey) return;

      await loadGoogleMaps(googleMapsApiKey);

      if (cancelled || !mapElementRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new window.google.maps.Map(mapElementRef.current, {
          center: { lat: 34.0522, lng: -118.2437 },
          zoom: 10,
          mapTypeControl: false,
          fullscreenControl: true,
          streetViewControl: false,
        });
      }

      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = [];

      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
        directionsRendererRef.current = null;
      }

      const bounds = new window.google.maps.LatLngBounds();
      let hasBounds = false;

      for (const driver of drivers) {
        if (driver.latestPing) {
          const position = {
            lat: Number(driver.latestPing.latitude),
            lng: Number(driver.latestPing.longitude),
          };

          if (Number.isFinite(position.lat) && Number.isFinite(position.lng)) {
            const marker = new window.google.maps.Marker({
              position,
              map: mapRef.current,
              title: `${driver.name} current location`,
              icon: makeDriverIcon(driver.color),
              zIndex: driver.id === selectedDriver?.id ? 1000 : 500,
            });

            marker.addListener("click", () => setSelectedDriverId(driver.id));
            markersRef.current.push(marker);
            bounds.extend(position);
            hasBounds = true;
          }
        }
      }

      const stopGeocodeTasks: Array<Promise<void>> = [];

      drivers.forEach((driver) => {
        driver.stops.forEach((stop) => {
          if (!stop.address) return;

          stopGeocodeTasks.push(
            (async () => {
              const position = await geocodeAddress(stop.address);

              if (!position || cancelled) return;

              const current = stop.id === driver.currentStop?.id;
              const marker = new window.google.maps.Marker({
                position,
                map: mapRef.current,
                title: `${driver.name} #${stop.sequence_number} ${stop.title}`,
                icon: makeStopIcon({
                  number: stop.sequence_number,
                  color: stopMarkerColor(stop.stop_type),
                  current,
                }),
                zIndex: current ? 900 : 300,
              });

              marker.addListener("click", () => setSelectedDriverId(driver.id));
              markersRef.current.push(marker);
              bounds.extend(position);
              hasBounds = true;
            })()
          );
        });
      });

      await Promise.all(stopGeocodeTasks.slice(0, 25));

      if (selectedDriver) {
        const directions = await getDirectionsForSelectedDriver(selectedDriver);

        if (directions && !cancelled) {
          directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: {
              strokeColor: selectedDriver.color || "#23313f",
              strokeWeight: 6,
              strokeOpacity: 0.9,
            },
          });

          directionsRendererRef.current.setMap(mapRef.current);
          directionsRendererRef.current.setDirections(directions);

          const routeBounds = directions.routes?.[0]?.bounds;

          if (routeBounds) {
            bounds.union(routeBounds);
            hasBounds = true;
          }
        }
      }

      if (hasBounds) {
        mapRef.current.fitBounds(bounds, 80);
      }
    }

    void renderMap();

    return () => {
      cancelled = true;
    };
  }, [drivers, googleMapsApiKey, selectedDriver?.id]);

  const summary = useMemo(() => {
    const online = drivers.filter((driver) => {
      const seconds = secondsAgo(driver.latestPing?.created_at);
      return seconds != null && seconds <= 90;
    }).length;

    const delayed = drivers.filter((driver) => {
      const seconds = secondsAgo(driver.latestPing?.created_at);
      return seconds != null && seconds > 90 && seconds <= 300;
    }).length;

    const offline = drivers.length - online - delayed;

    const openStops = drivers.reduce(
      (sum, driver) => sum + driver.stats.openStops,
      0
    );

    const collectTotal = drivers.reduce(
      (sum, driver) => sum + Number(driver.stats.collectTotal || 0),
      0
    );

    const lateDrivers = drivers.filter(
      (driver) => driver.eta?.status?.state === "late"
    ).length;

    const riskDrivers = drivers.filter(
      (driver) => driver.eta?.status?.state === "risk"
    ).length;

    return {
      online,
      delayed,
      offline,
      openStops,
      collectTotal,
      lateDrivers,
      riskDrivers,
    };
  }, [drivers]);

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Live operations
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Driver monitoring center
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Live GPS, route movement, current destination, ETA and delay
              warnings. ETA is cached for 3 minutes to reduce Google API usage.
            </p>
          </div>

          <form className="flex flex-wrap gap-2">
            <input
              name="date"
              type="date"
              defaultValue={selectedDate}
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />

            <button
              type="submit"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
            >
              Open date
            </button>

            <button
              type="button"
              onClick={() => router.refresh()}
              className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white"
            >
              Refresh
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-6">
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Online
          </div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">
            {summary.online}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Delayed GPS
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#8a6b20]">
            {summary.delayed}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Offline
          </div>
          <div className="mt-2 text-3xl font-semibold text-red-700">
            {summary.offline}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            At risk
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#8a6b20]">
            {summary.riskDrivers}
          </div>
        </div>

        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Late
          </div>
          <div className="mt-2 text-3xl font-semibold text-red-700">
            {summary.lateDrivers}
          </div>
        </div>

        <div className="rounded-[24px] border border-[#ead6a8] bg-[#fff8e8] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Collect
          </div>
          <div className="mt-2 text-3xl font-semibold text-[#8a6b20]">
            {formatMoney(summary.collectTotal)}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_430px]">
        <div className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eee5d9] px-5 py-4">
            <div>
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Live route map
              </h3>
              <p className="mt-1 text-sm text-[#6c6258]">
                Driver icons, numbered stops, and selected driver route to
                current destination.
              </p>
            </div>

            {selectedDriver && (
              <div className="rounded-full bg-[#f4ede2] px-4 py-2 text-sm font-semibold text-[#23313f] ring-1 ring-[#d8cec0]">
                Selected: {selectedDriver.name}
              </div>
            )}
          </div>

          <div className="relative h-[620px] bg-[#d9d4ca]">
            {googleMapsApiKey ? (
              <div ref={mapElementRef} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-center text-sm font-semibold text-[#23313f]">
                Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show live map.
              </div>
            )}

            <div className="absolute left-4 top-4 max-w-[280px] rounded-2xl bg-white/95 p-3 text-xs leading-5 text-[#6c6258] shadow-[0_10px_30px_rgba(0,0,0,0.16)] backdrop-blur">
              Route polyline is loaded only for the selected driver to reduce
              Google Directions API usage.
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          {drivers.map((driver) => {
            const seconds = secondsAgo(driver.latestPing?.created_at);
            const tone = onlineTone(seconds);
            const locationUrl = mapsLocationUrl(driver);
            const directionUrl = mapsDirectionUrl(driver);
            const selected = selectedDriver?.id === driver.id;

            return (
              <button
                key={driver.id}
                type="button"
                onClick={() => setSelectedDriverId(driver.id)}
                className={[
                  "block w-full rounded-[26px] border bg-white p-4 text-left shadow-[0_10px_28px_rgba(0,0,0,0.035)] transition",
                  selected
                    ? "border-[#c9964f] ring-2 ring-[#c9964f]/30"
                    : "border-black/5 hover:border-[#d8cec0]",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3.5 w-3.5 rounded-full"
                        style={{ backgroundColor: driver.color }}
                      />
                      <div className="truncate text-base font-semibold text-[#1f1e1b]">
                        {driver.name}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <span
                        className={[
                          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                          tone.className,
                        ].join(" ")}
                      >
                        <span
                          className={["h-2 w-2 rounded-full", tone.dot].join(" ")}
                        />
                        {tone.label}
                      </span>

                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                          etaTone(driver.eta?.status?.state),
                        ].join(" ")}
                      >
                        {driver.eta?.status?.label || "No ETA"}
                      </span>
                    </div>
                  </div>

                  <div className="text-right text-xs font-semibold text-[#6c6258]">
                    {driver.stats.completedStops}/{driver.stats.totalStops}
                    <br />
                    done
                  </div>
                </div>

                <div className="mt-3 rounded-2xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                    Current destination
                  </div>

                  {driver.currentStop ? (
                    <>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                            driver.currentStop.stop_type === "pickup"
                              ? "bg-red-50 text-red-700 ring-red-200"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-200",
                          ].join(" ")}
                        >
                          #{driver.currentStop.sequence_number || "?"}{" "}
                          {driver.currentStop.stop_type === "pickup"
                            ? "Pickup"
                            : "Delivery"}
                        </span>

                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                          {prettyStatus(driver.currentStop.status)}
                        </span>
                      </div>

                      <div className="mt-2 text-sm font-semibold leading-5 text-[#1f1e1b]">
                        {driver.currentStop.title}
                      </div>

                      <div className="mt-1 text-xs font-semibold text-[#9a723e]">
                        Board: {formatTime(driver.currentStop.scheduled_start_time)} —{" "}
                        {formatTime(driver.currentStop.scheduled_end_time)}
                      </div>

                      <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#6c6258]">
                        {driver.currentStop.address || "No address"}
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-sm text-[#6c6258]">
                      No active or open stop.
                    </div>
                  )}
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-2xl bg-[#f7fbff] p-3 ring-1 ring-[#d8e8f7]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#355879]">
                      ETA
                    </div>

                    <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                      {driver.eta?.duration_text || "—"}
                    </div>

                    <div className="mt-1 text-xs text-[#6c6258]">
                      Arrival: {formatClock(driver.eta?.arrival_at || null)}
                    </div>

                    <div className="mt-1 text-xs text-[#6c6258]">
                      Distance: {driver.eta?.distance_text || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-[#fff8e8] p-3 ring-1 ring-[#ead6a8]">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                      Collect
                    </div>

                    <div className="mt-1 text-sm font-semibold text-[#8a6b20]">
                      {formatMoney(driver.stats.collectTotal)}
                    </div>

                    <div className="mt-1 text-xs text-[#6c6258]">
                      Last GPS: {lastSeenLabel(seconds)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {locationUrl && (
                    <a
                      href={locationUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Open location
                    </a>
                  )}

                  {directionUrl && (
                    <a
                      href={directionUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-full bg-[#c9964f] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Google route
                    </a>
                  )}

                  {driver.phone && (
                    <a
                      href={`tel:${driver.phone}`}
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white"
                    >
                      Call
                    </a>
                  )}
                </div>
              </button>
            );
          })}

          {drivers.length === 0 && (
            <div className="rounded-[30px] border border-dashed border-[#d8cec0] bg-white p-10 text-center text-sm text-[#6c6258]">
              No active drivers found.
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
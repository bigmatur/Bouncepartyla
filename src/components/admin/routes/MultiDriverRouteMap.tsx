"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RouteStopLite = {
  id: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  title?: string;
  stopType?: string | null;
  sequenceNumber?: number;
  stopDate?: string | null;
  scheduledStartTime?: string | null;
};

type DriverRouteGroup = {
  driverId: string;
  driverName: string;
  color: string;
  originStop?: RouteStopLite | null;
  stops: RouteStopLite[];
};

type RouteSegmentSummary = {
  from: string;
  to: string;
  distanceText: string | null;
  durationText: string | null;
  fromSequence: number;
  toSequence: number;
  fromStopType: string | null;
  toStopType: string | null;
  fromStopId: string | null;
  toStopId: string | null;
};

type MultiDriverRouteMapProps = {
  apiKey: string;
  warehouseOriginAddress?: string | null;
  groups: DriverRouteGroup[];
  className?: string;
  onRouteSegmentsChange?: (
    segmentsByDriverId: Record<string, RouteSegmentSummary[]>,
  ) => void;
};

declare global {
  interface Window {
    __googleMapsRouteLoaderPromise?: Promise<void>;
    __googleMapsPlacesLoaderPromise?: Promise<void>;
    google?: any;
  }
}

function loadGoogleMaps(apiKey: string) {
  if (!apiKey) {
    return Promise.resolve();
  }

  if (window.google?.maps) {
    return Promise.resolve();
  }

  if (window.__googleMapsRouteLoaderPromise) {
    return window.__googleMapsRouteLoaderPromise;
  }

  if (window.__googleMapsPlacesLoaderPromise) {
    window.__googleMapsRouteLoaderPromise =
      window.__googleMapsPlacesLoaderPromise;
    return window.__googleMapsRouteLoaderPromise;
  }

  window.__googleMapsRouteLoaderPromise = new Promise<void>(
    (resolve, reject) => {
      const anyGoogleMapsScript = document.querySelector(
        'script[src*="maps.googleapis.com/maps/api/js"]',
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
          () => reject(new Error("Failed to load Google Maps script.")),
          { once: true },
        );
        return;
      }

      const existing = document.querySelector(
        'script[data-google-maps-route="true"]',
      ) as HTMLScriptElement | null;

      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Failed to load Google Maps script.")),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        apiKey,
      )}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsRoute = "true";

      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Google Maps script."));

      document.head.appendChild(script);
    },
  );

  window.__googleMapsPlacesLoaderPromise =
    window.__googleMapsRouteLoaderPromise;

  return window.__googleMapsRouteLoaderPromise;
}

function stopAddress(stop: RouteStopLite | undefined | null) {
  if (!stop) {
    return "";
  }

  return [stop.address, stop.city, stop.state, stop.zip]
    .filter(Boolean)
    .join(", ");
}

function routeDepartureTime(stop: RouteStopLite | undefined | null) {
  const date = String(stop?.stopDate || "").trim();
  const time = String(stop?.scheduledStartTime || "").trim();

  if (!date || !time) {
    return null;
  }

  const result = new Date(`${date}T${time.slice(0, 5)}:00`);

  if (Number.isNaN(result.getTime())) return null;

  // Google Directions rejects traffic-aware departure times in the past.
  // The route itself should still render for completed/earlier delivery dates,
  // so omit drivingOptions when the planned departure is not in the future.
  return result.getTime() > Date.now() + 60_000 ? result : null;
}

function markerFillColor(stopType: string | null | undefined) {
  if (stopType === "delivery") return "#1f9d55";
  if (stopType === "pickup") return "#dc2626";
  return "#b47316";
}

function markerIcon(
  fillColor: string,
  strokeColor: string,
  numberText: string,
) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="20" fill="#ffffff" opacity="0.95" />
      <circle cx="24" cy="24" r="17" fill="${fillColor}" stroke="${strokeColor}" stroke-width="3.5" />
      <text x="24" y="29" text-anchor="middle" font-size="16" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">${numberText}</text>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(48, 48),
    anchor: new window.google.maps.Point(24, 24),
  };
}

function lightenHexColor(hexColor: string, amount: number) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(
    hexColor || "",
  );

  if (!match) return hexColor;

  const clamp = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value)));

  const [r, g, b] = [
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16),
  ];

  const nextR = clamp(r + (255 - r) * amount);
  const nextG = clamp(g + (255 - g) * amount);
  const nextB = clamp(b + (255 - b) * amount);

  return `#${nextR.toString(16).padStart(2, "0")}${nextG
    .toString(16)
    .padStart(2, "0")}${nextB.toString(16).padStart(2, "0")}`;
}

export default function MultiDriverRouteMap({
  apiKey,
  warehouseOriginAddress,
  groups,
  className,
  onRouteSegmentsChange,
}: MultiDriverRouteMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeGroups = useMemo(
    () => groups.filter((group) => group.stops.length > 0),
    [groups],
  );

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const segmentsByDriverId: Record<string, RouteSegmentSummary[]> = {};
    let hoveredSegmentInfoWindow: any = null;

    async function renderMap() {
      if (!mapRef.current || !apiKey || activeGroups.length === 0) {
        return;
      }

      setLoadError(null);

      try {
        await loadGoogleMaps(apiKey);
      } catch {
        if (!cancelled) {
          setLoadError("Google Maps failed to load.");
        }

        return;
      }

      if (cancelled || !mapRef.current || !window.google?.maps) {
        return;
      }

      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 34.1478, lng: -118.1445 },
        zoom: 10,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });

      const bounds = new window.google.maps.LatLngBounds();
      const directionsService = new window.google.maps.DirectionsService();
      const geocoder = new window.google.maps.Geocoder();

      hoveredSegmentInfoWindow = new window.google.maps.InfoWindow({
        disableAutoPan: true,
      });

      cleanups.push(() => hoveredSegmentInfoWindow?.close());

      async function geocodeAddress(address: string) {
        return await new Promise<any | null>((resolve) => {
          geocoder.geocode({ address }, (results: any, status: string) => {
            if (status !== "OK" || !results?.length) {
              resolve(null);
              return;
            }

            resolve(results[0].geometry?.location || null);
          });
        });
      }

      async function renderGroup(group: DriverRouteGroup) {
        const addresses = group.stops
          .map((stop) => stopAddress(stop))
          .filter(Boolean);
        const customOriginAddress = stopAddress(group.originStop);
        const hasStops = group.stops.length > 0;
        const isPickupOnly =
          hasStops && group.stops.every((stop) => stop.stopType === "pickup");
        const routeStrokeColor = isPickupOnly
          ? lightenHexColor(group.color, 0.22)
          : group.color;

        if (addresses.length === 0) {
          segmentsByDriverId[group.driverId] = [];
          return;
        }

        const createNumberMarker = (position: any, stop: RouteStopLite) => {
          if (!position || !stop) return;

          const sequence = Number(stop.sequenceNumber || 0) || 1;
          const stopTypeLabel =
            stop.stopType === "delivery"
              ? "Delivery"
              : stop.stopType === "pickup"
                ? "Pickup"
                : "Stop";

          const marker = new window.google.maps.Marker({
            map,
            position,
            title: `${group.driverName} · ${stopTypeLabel} #${sequence}${
              stop.title ? ` · ${stop.title}` : ""
            }`,
            icon: markerIcon(
              markerFillColor(stop.stopType),
              group.color,
              String(sequence),
            ),
          });

          bounds.extend(position);
          cleanups.push(() => marker.setMap(null));
        };

        if (addresses.length === 1 && !warehouseOriginAddress && !customOriginAddress) {
          const location = await geocodeAddress(addresses[0]);

          createNumberMarker(location, group.stops[0]);

          segmentsByDriverId[group.driverId] = [];
          return;
        }

        const hasCustomOrigin = Boolean(customOriginAddress);
        const hasWarehouseOrigin = !hasCustomOrigin && Boolean(warehouseOriginAddress);
        const origin = customOriginAddress || warehouseOriginAddress || addresses[0];
        const destination = addresses[addresses.length - 1];
        const waypointAddresses = hasCustomOrigin
          ? addresses.slice(0, -1)
          : hasWarehouseOrigin
            ? addresses.slice(0, -1)
            : addresses.slice(1, -1);

        const directions = await new Promise<any | null>((resolve) => {
          const departureTime = routeDepartureTime(group.stops[0]);

          directionsService.route(
            {
              origin,
              destination,
              travelMode: window.google.maps.TravelMode.DRIVING,
              drivingOptions: departureTime
                ? {
                    departureTime,
                    trafficModel: window.google.maps.TrafficModel.BEST_GUESS,
                  }
                : undefined,
              waypoints: waypointAddresses.map((address) => ({
                location: address,
                stopover: true,
              })),
              optimizeWaypoints: false,
            },
            (result: any, status: string) => {
              if (status !== "OK") {
                resolve(null);
                return;
              }

              resolve(result);
            },
          );
        });

        if (!directions) {
          for (let index = 0; index < addresses.length; index += 1) {
            const location = await geocodeAddress(addresses[index]);
            createNumberMarker(location, group.stops[index]);
          }

          segmentsByDriverId[group.driverId] = [];
          return;
        }

        const renderer = new window.google.maps.DirectionsRenderer({
          map,
          directions,
          suppressMarkers: true,
          preserveViewport: true,
          polylineOptions: {
            strokeColor: routeStrokeColor,
            strokeOpacity: 0.92,
            strokeWeight: 6,
          },
        });

        cleanups.push(() => renderer.setMap(null));

        const legs = directions.routes?.[0]?.legs || [];

        segmentsByDriverId[group.driverId] = legs.map(
          (leg: any, index: number) => {
            const isExternalOriginLeg = Boolean(
              (hasCustomOrigin || hasWarehouseOrigin) && index === 0,
            );

            const fromStop = isExternalOriginLeg
              ? group.originStop || null
              : hasCustomOrigin || hasWarehouseOrigin
                ? group.stops[index - 1] || null
                : group.stops[index] || null;

            const toStop = hasCustomOrigin || hasWarehouseOrigin
              ? group.stops[index] || null
              : group.stops[index + 1] || null;

            return {
              from: isExternalOriginLeg
                ? group.originStop?.title ||
                  stopAddress(group.originStop) ||
                  (hasWarehouseOrigin ? "Warehouse" : "Origin")
                : fromStop?.title ||
                  stopAddress(fromStop) ||
                  `Stop ${index + 1}`,
              to: toStop?.title || stopAddress(toStop) || `Stop ${index + 2}`,
              distanceText: leg.distance?.text || null,
              durationText:
                leg.duration_in_traffic?.text || leg.duration?.text || null,

              fromSequence: isExternalOriginLeg
                ? Number(group.originStop?.sequenceNumber || 0)
                : Number(fromStop?.sequenceNumber || index + 1) || index + 1,
              toSequence:
                Number(toStop?.sequenceNumber || index + 1) || index + 1,

              fromStopType: isExternalOriginLeg
                ? group.originStop?.stopType ||
                  (hasWarehouseOrigin ? "warehouse" : "other")
                : fromStop?.stopType || null,
              toStopType: toStop?.stopType || null,

              fromStopId: isExternalOriginLeg
                ? group.originStop?.id ||
                  (hasWarehouseOrigin ? "warehouse" : "origin")
                : fromStop?.id || null,
              toStopId: toStop?.id || null,
            };
          },
        );

        const showSegmentHover = (leg: any, title: string, position: any) => {
          if (!hoveredSegmentInfoWindow || !position) return;

          const content = `
            <div style="font-family: Arial, sans-serif; min-width: 180px; padding: 2px 0;">
              <div style="font-size: 12px; font-weight: 700; color: #1f1e1b; margin-bottom: 4px;">${title}</div>
              <div style="font-size: 11px; color: #6c6258;">${leg.distance?.text || "—"} · ${
                leg.duration_in_traffic?.text || leg.duration?.text || "—"
              }</div>
            </div>
          `;

          hoveredSegmentInfoWindow.setContent(content);
          hoveredSegmentInfoWindow.setPosition(position);
          hoveredSegmentInfoWindow.open({ map });
        };

        const hideSegmentHover = () => {
          hoveredSegmentInfoWindow?.close();
        };

        const hoverPolylines: any[] = [];

        legs.forEach((leg: any, index: number) => {
          const path = (leg.steps || [])
            .flatMap((step: any) => step.path || [])
            .filter(Boolean);

          if (!path.length) {
            return;
          }

          const segmentPolyline = new window.google.maps.Polyline({
            map,
            path,
            strokeColor: routeStrokeColor,
            strokeOpacity: 0,
            strokeWeight: 16,
            clickable: true,
            zIndex: 99,
          });

          const fromStop = warehouseOriginAddress
            ? group.stops[index - 1] || null
            : group.stops[index] || null;

          const toStop = warehouseOriginAddress
            ? group.stops[index] || null
            : group.stops[index + 1] || null;

          const usesExternalOrigin = hasCustomOrigin || hasWarehouseOrigin;
          const externalFromStop = usesExternalOrigin
            ? index === 0
              ? group.originStop || null
              : group.stops[index - 1] || null
            : fromStop;
          const externalToStop = usesExternalOrigin
            ? group.stops[index] || null
            : toStop;

          const title = `${group.driverName} · ${
            usesExternalOrigin && index === 0
              ? group.originStop?.title ||
                stopAddress(group.originStop) ||
                (hasWarehouseOrigin ? "Warehouse" : "Origin")
              : externalFromStop?.title ||
                stopAddress(externalFromStop) ||
                `Stop ${index + 1}`
          } → ${
            externalToStop?.title ||
            stopAddress(externalToStop) ||
            `Stop ${index + 2}`
          }`;

          const midpointIndex = Math.max(0, Math.floor(path.length / 2));
          const hoverPosition =
            path[midpointIndex] ||
            leg.end_location ||
            leg.start_location ||
            null;

          const overListener = segmentPolyline.addListener("mouseover", () => {
            segmentPolyline.setOptions({
              strokeOpacity: 0.75,
              strokeWeight: 8,
            });
            showSegmentHover(leg, title, hoverPosition);
          });

          const outListener = segmentPolyline.addListener("mouseout", () => {
            segmentPolyline.setOptions({ strokeOpacity: 0, strokeWeight: 16 });
            hideSegmentHover();
          });

          hoverPolylines.push(segmentPolyline);

          cleanups.push(() => {
            overListener.remove();
            outListener.remove();
            segmentPolyline.setMap(null);
          });
        });

        for (
          let stopIndex = 0;
          stopIndex < group.stops.length;
          stopIndex += 1
        ) {
          let location: any = null;

          if (hasCustomOrigin || hasWarehouseOrigin) {
            location = legs[stopIndex]?.end_location || null;
          } else if (group.stops.length === 1) {
            location = await geocodeAddress(addresses[0]);
          } else if (stopIndex === 0) {
            location = legs[0]?.start_location || null;
          } else {
            location = legs[stopIndex - 1]?.end_location || null;
          }

          if (!location) {
            location = await geocodeAddress(addresses[stopIndex]);
          }

          createNumberMarker(location, group.stops[stopIndex]);
        }

        cleanups.push(() => {
          hoverPolylines.forEach((polyline) => polyline.setMap(null));
        });
      }

      for (const group of activeGroups) {
        await renderGroup(group);
      }

      if (onRouteSegmentsChange && !cancelled) {
        onRouteSegmentsChange(segmentsByDriverId);
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, 48);
      }
    }

    void renderMap();

    return () => {
      cancelled = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [apiKey, activeGroups, warehouseOriginAddress, onRouteSegmentsChange]);

  if (!apiKey) {
    return (
      <div
        className={
          className ||
          "flex min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] text-sm font-semibold text-[#6c6258]"
        }
      >
        Google Maps API key is missing.
      </div>
    );
  }

  if (activeGroups.length === 0) {
    return (
      <div
        className={
          className ||
          "flex min-h-[420px] items-center justify-center rounded-[28px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] text-sm font-semibold text-[#6c6258]"
        }
      >
        No stops for this filter.
      </div>
    );
  }

  return (
    <div
      className={
        className ||
        "relative min-h-[420px] overflow-hidden rounded-[28px] border border-[#eee5d9]"
      }
    >
      <div ref={mapRef} className="absolute inset-0 h-full w-full" />
      {loadError && (
        <div className="absolute inset-x-3 top-3 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          {loadError}
        </div>
      )}
    </div>
  );
}

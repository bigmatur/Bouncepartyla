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

type LiveDriverLocation = {
  id: string;
  driver_name: string;
  route_date: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  created_at: string;
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
  liveDriverLocations?: LiveDriverLocation[];
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
  typeBadge?: string | null,
  typeBadgeColor?: string,
) {
  const badge = String(typeBadge || "").trim();
  const badgeColor = String(typeBadgeColor || "#1f2937").trim() || "#1f2937";
  const badgeMarkup = badge
    ? `
      <circle cx="37" cy="12" r="8" fill="#ffffff" opacity="0.98" />
      <circle cx="37" cy="12" r="6.6" fill="${badgeColor}" />
      <text x="37" y="14.5" text-anchor="middle" font-size="8" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">${badge.slice(0, 2)}</text>
    `
    : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r="20" fill="#ffffff" opacity="0.95" />
      <circle cx="24" cy="24" r="17" fill="${fillColor}" stroke="${strokeColor}" stroke-width="3.5" />
      <text x="24" y="29" text-anchor="middle" font-size="16" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff">${numberText}</text>
      ${badgeMarkup}
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(48, 48),
    anchor: new window.google.maps.Point(24, 24),
  };
}

function driverLocationIcon(
  color: string,
  heading: number | null | undefined,
  stale: boolean,
) {
  const validHeading =
    typeof heading === "number" &&
    Number.isFinite(heading) &&
    heading >= 0
      ? heading
      : 0;

  const opacity = stale ? 0.58 : 1;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="54" height="54" viewBox="0 0 54 54">
      <circle cx="27" cy="27" r="23" fill="#ffffff" opacity="0.96" />
      <circle
        cx="27"
        cy="27"
        r="19"
        fill="${color}"
        opacity="${opacity}"
        stroke="#ffffff"
        stroke-width="3"
      />
      <g transform="rotate(${validHeading} 27 27)">
        <path d="M27 14 L35 34 L27 30 L19 34 Z" fill="#ffffff" />
      </g>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(54, 54),
    anchor: new window.google.maps.Point(27, 27),
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

function latLngParts(position: any): { lat: number; lng: number } | null {
  if (!position) return null;

  const latRaw =
    typeof position.lat === "function" ? position.lat() : position.lat;
  const lngRaw =
    typeof position.lng === "function" ? position.lng() : position.lng;

  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function normalizedAddressKey(stop: RouteStopLite | null | undefined) {
  const address = stopAddress(stop)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return address;
}

function overlapKey(position: any, stop: RouteStopLite | null | undefined) {
  const addressKey = normalizedAddressKey(stop);
  if (addressKey) {
    return `a:${addressKey}`;
  }

  const point = latLngParts(position);
  if (!point) return "";
  return `c:${point.lat.toFixed(4)}|${point.lng.toFixed(4)}`;
}

function stopTypeOffsetAngle(stopType: string | null | undefined) {
  if (stopType === "delivery") {
    return (Math.PI * 3) / 4;
  }

  if (stopType === "pickup") {
    return Math.PI / 4;
  }

  return 0;
}

function offsetOverlappedPosition(
  position: any,
  overlapIndex: number,
  options?: {
    preferredAngle?: number;
    forceDirectional?: boolean;
  },
) {
  const point = latLngParts(position);
  if (!point || overlapIndex <= 0) {
    return position;
  }

  const ring = Math.floor((overlapIndex - 1) / 8) + 1;
  const spoke = (overlapIndex - 1) % 8;
  const baseAngle = (Math.PI * 2 * spoke) / 8;

  // Force a visible delivery/pickup split at same location.
  const angle = options?.forceDirectional && options?.preferredAngle != null
    ? options.preferredAngle + (spoke >= 2 ? (spoke - 1) * (Math.PI / 12) : 0)
    : options?.preferredAngle != null
      ? options.preferredAngle + baseAngle
      : baseAngle;

  // ~14-30m radial offset depending on stack density.
  const radius = 0.00014 * ring;

  return {
    lat: point.lat + Math.sin(angle) * radius,
    lng: point.lng + Math.cos(angle) * radius,
  };
}

export default function MultiDriverRouteMap({
  apiKey,
  warehouseOriginAddress,
  groups,
  liveDriverLocations = [],
  className,
  onRouteSegmentsChange,
}: MultiDriverRouteMapProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const liveMarkerCleanupsRef = useRef<Array<() => void>>([]);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
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

      mapInstanceRef.current = map;
      setMapReadyVersion((version) => version + 1);

      const bounds = new window.google.maps.LatLngBounds();
      const overlapCountsByCoord = new Map<string, number>();
      const addressTypeStats = new Map<
        string,
        { delivery: number; pickup: number; other: number }
      >();
      const addressStops = new Map<
        string,
        Array<{ id: string; sequence: number; stopType: string | null | undefined }>
      >();

      for (const group of activeGroups) {
        for (const stop of group.stops) {
          const key = normalizedAddressKey(stop);
          if (!key) {
            continue;
          }

          const entry = addressTypeStats.get(key) || {
            delivery: 0,
            pickup: 0,
            other: 0,
          };

          if (stop.stopType === "delivery") {
            entry.delivery += 1;
          } else if (stop.stopType === "pickup") {
            entry.pickup += 1;
          } else {
            entry.other += 1;
          }

          addressTypeStats.set(key, entry);

          const stopList = addressStops.get(key) || [];
          stopList.push({
            id: String(stop.id || ""),
            sequence: Number(stop.sequenceNumber || 0) || 1,
            stopType: stop.stopType,
          });
          addressStops.set(key, stopList);
        }
      }

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

          const key = overlapKey(position, stop);
          const overlapIndex = key
            ? overlapCountsByCoord.get(key) || 0
            : 0;

          if (key) {
            overlapCountsByCoord.set(key, overlapIndex + 1);
          }

          const addressKey = normalizedAddressKey(stop);
          const typeStats = addressKey ? addressTypeStats.get(addressKey) : null;
          const hasMixedDeliveryPickup =
            Boolean(typeStats) &&
            (typeStats?.delivery || 0) > 0 &&
            (typeStats?.pickup || 0) > 0;

          const peers = addressKey
            ? (addressStops.get(addressKey) || [])
            : [];
          const hiddenPeer = peers
            .filter((peer) => peer.id !== String(stop.id || ""))
            .sort((a, b) => {
              if (a.stopType === stop.stopType && b.stopType !== stop.stopType) return 1;
              if (a.stopType !== stop.stopType && b.stopType === stop.stopType) return -1;
              if (a.sequence !== b.sequence) return a.sequence - b.sequence;
              return a.id.localeCompare(b.id);
            })[0] || null;

          const hiddenPeerBadge = hiddenPeer ? String(hiddenPeer.sequence) : null;
          const hiddenPeerBadgeColor = hiddenPeer
            ? markerFillColor(hiddenPeer.stopType)
            : undefined;

          const markerPosition = offsetOverlappedPosition(
            position,
            overlapIndex,
            {
              preferredAngle: stopTypeOffsetAngle(stop.stopType),
              forceDirectional: hasMixedDeliveryPickup,
            },
          );

          const marker = new window.google.maps.Marker({
            map,
            position: markerPosition,
            title: `${group.driverName} · ${stopTypeLabel} #${sequence}${
              stop.title ? ` · ${stop.title}` : ""
            }`,
            icon: markerIcon(
              markerFillColor(stop.stopType),
              group.color,
              String(sequence),
              hasMixedDeliveryPickup ? hiddenPeerBadge : null,
              hasMixedDeliveryPickup ? hiddenPeerBadgeColor : undefined,
            ),
          });

          bounds.extend(markerPosition);
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
      liveMarkerCleanupsRef.current.forEach((cleanup) => cleanup());
      liveMarkerCleanupsRef.current = [];
      mapInstanceRef.current = null;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [
    apiKey,
    activeGroups,
    warehouseOriginAddress,
    onRouteSegmentsChange,
  ]);


  useEffect(() => {
    let cancelled = false;

    async function renderLiveDriverMarkers() {
      if (!apiKey || !mapInstanceRef.current) return;

      try {
        await loadGoogleMaps(apiKey);
      } catch {
        return;
      }

      if (
        cancelled ||
        !mapInstanceRef.current ||
        !window.google?.maps
      ) {
        return;
      }

      liveMarkerCleanupsRef.current.forEach((cleanup) => cleanup());
      liveMarkerCleanupsRef.current = [];

      const map = mapInstanceRef.current;
      const driverColorByName = new Map<string, string>();

      for (const group of groups) {
        const key = String(group.driverName || "")
          .trim()
          .toLowerCase();

        if (key && !driverColorByName.has(key)) {
          driverColorByName.set(key, group.color || "#23313f");
        }
      }

      for (const location of liveDriverLocations) {
        const driverName = String(location.driver_name || "").trim();
        const driverKey = driverName.toLowerCase();

        if (!driverName || !driverColorByName.has(driverKey)) continue;

        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

        const createdAt = new Date(location.created_at).getTime();
        if (!Number.isFinite(createdAt)) continue;

        const ageMs = Date.now() - createdAt;
        const ageMinutes = ageMs / 60_000;
        if (ageMinutes > 5) continue;

        const stale = ageMinutes > 2;
        const position = { lat: latitude, lng: longitude };
        const color = driverColorByName.get(driverKey) || "#23313f";

        const marker = new window.google.maps.Marker({
          map,
          position,
          zIndex: 500,
          title: `${driverName} · ${stale ? "Last known location" : "Live location"}`,
          icon: driverLocationIcon(color, location.heading, stale),
        });

        const ageText =
          ageMs < 60_000
            ? `${Math.max(1, Math.round(ageMs / 1000))} sec ago`
            : `${Math.max(1, Math.round(ageMinutes))} min ago`;

        const accuracy = Number(location.accuracy);
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="font-family: Arial, sans-serif; min-width: 180px; padding: 3px 1px;">
              <div style="font-size: 13px; font-weight: 700; color: #1f1e1b;">${driverName}</div>
              <div style="margin-top: 4px; font-size: 11px; font-weight: 700; color: ${stale ? "#b47316" : "#1f9d55"};">
                ${stale ? "LAST KNOWN LOCATION" : "LIVE LOCATION"}
              </div>
              <div style="margin-top: 4px; font-size: 11px; color: #6c6258;">Updated ${ageText}</div>
              ${
                Number.isFinite(accuracy)
                  ? `<div style="margin-top: 2px; font-size: 10px; color: #8b8177;">Accuracy ${Math.round(accuracy)} m</div>`
                  : ""
              }
            </div>
          `,
        });

        const listener = marker.addListener("click", () => {
          infoWindow.open({ map, anchor: marker });
        });

        liveMarkerCleanupsRef.current.push(() => {
          listener?.remove?.();
          infoWindow.close();
          marker.setMap(null);
        });
      }
    }

    void renderLiveDriverMarkers();

    return () => {
      cancelled = true;
      liveMarkerCleanupsRef.current.forEach((cleanup) => cleanup());
      liveMarkerCleanupsRef.current = [];
    };
  }, [apiKey, groups, liveDriverLocations, mapReadyVersion]);

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

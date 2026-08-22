"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { bookingItemsProductSummary } from "@/lib/booking/booking-items-summary";
import DriverNavigatorMap from "@/components/admin/routes/DriverNavigatorMap";
import {
  updateDriverAppProfileAction,
  updateDriverAppStopStatusAction,
} from "../actions";
import {
  finishWorkAction,
  resumeWorkAction,
  startBreakAction,
} from "@/app/time-clock/actions";

type DriverStop = {
  id: string;
  booking_id: string | null;
  stop_date: string | null;
  stop_type: string | null;
  status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  driver_name: string | null;
  truck_name: string | null;
  items_summary: string | null;
  setup_notes?: string | null;
  balance_due: number | string | null;
  payment_collected?: boolean | null;
  sort_order: number | null;
  markerColor?: string | null;
  bookings?: any;
};

type DriverProfile = {
  id: string;
  name: string;
  color: string | null;
  phone: string | null;
  account_email: string | null;
  auth_user_id: string | null;
  notes: string | null;
  active: boolean;
  sort_order: number | null;
  profile?: {
    role: string;
    permissions: string[];
    plainNotes: string;
  };
};

type WorkTimeBreak = {
  id: string;
  started_at: string;
  ended_at: string | null;
  break_type: string;
};

type WorkTimeEntry = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  source: string;
  staff_time_breaks?: WorkTimeBreak[] | null;
};

type Props = {
  stops: DriverStop[];
  selectedDate: string;
  selectedDriver: string;
  driverNames: string[];
  driverProfiles: DriverProfile[];
  selectedDriverProfile: DriverProfile | null;
  googleMapsApiKey: string;
  warehouseOriginAddress: string;
  lockDriverSelection?: boolean;
  workTimeEntry?: WorkTimeEntry | null;
  showOwnWorkingTime?: boolean;
};

type DriverLocation = {
  latitude: number;
  longitude: number;
};

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
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

function formatShortDate(value: string | null | undefined) {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "No date";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function safeMarkerColor(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : "#23313f";
}

function prettyStatus(value: string | null | undefined) {
  if (!value) return "Scheduled";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isCompleted(stop: DriverStop) {
  return ["installed", "picked_up", "completed"].includes(
    String(stop.status || "")
  );
}

function isStarted(stop: DriverStop) {
  return ["on_the_way", "arrived"].includes(String(stop.status || ""));
}

function breakMinutesFromStop(stop: DriverStop | null | undefined) {
  if (!stop) return null;

  const setupNotes = String(stop.setup_notes || "");
  const notesMatch = setupNotes.match(
    /break[_\s-]*minutes\s*[:=]\s*(\d{1,3})/i
  );

  if (notesMatch) {
    const parsed = Number(notesMatch[1]);

    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const summary = String(stop.items_summary || "");
  const summaryMatch = summary.match(/(\d{1,3})\s*(?:min|mins|minutes)\b/i);

  if (summaryMatch) {
    const parsed = Number(summaryMatch[1]);

    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function isBreakStop(stop: DriverStop | null | undefined) {
  if (!stop) return false;

  return Boolean(
    breakMinutesFromStop(stop) ||
      /\bbreak\b/i.test(String(stop.customer_name || "")) ||
      /\bbreak\b/i.test(String(stop.items_summary || "")) ||
      /\bbreak\b/i.test(String(stop.setup_notes || ""))
  );
}

function isNavigableStop(stop: DriverStop | null | undefined) {
  if (!stop) return false;
  if (isBreakStop(stop)) return false;

  return stop.stop_type === "delivery" || stop.stop_type === "pickup";
}

function stopTypeLabel(value: string | null | undefined) {
  if (value === "pickup") return "Pickup";
  if (value === "delivery") return "Delivery";
  return "Stop";
}

function stopTypeTone(value: string | null | undefined) {
  if (value === "pickup") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (value === "delivery") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-[#f4ede2] text-[#6c6258] ring-[#d8cec0]";
}

function breakTone() {
  return "bg-[#fff8e8] text-[#9a723e] ring-[#ead6a8]";
}

function statusTone(value: string | null | undefined) {
  if (["installed", "picked_up", "completed"].includes(String(value || ""))) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (["on_the_way", "arrived"].includes(String(value || ""))) {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  if (["failed", "cancelled"].includes(String(value || ""))) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]";
}

function mainProductName(stop: DriverStop) {
  if (isBreakStop(stop)) {
    const minutes = breakMinutesFromStop(stop);

    return minutes ? `Break (${minutes} min)` : "Break";
  }

  const booking = getOne(stop.bookings);
  const bookingItems = booking?.booking_items || [];

  return bookingItemsProductSummary(
    bookingItems,
    stop.items_summary?.split("\n")[0] || "Route stop",
  );
}

function customerName(stop: DriverStop) {
  const booking = getOne(stop.bookings);
  const customer = getOne(booking?.customers);

  return customer?.full_name || stop.customer_name || "Customer";
}

function customerPhone(stop: DriverStop) {
  const booking = getOne(stop.bookings);
  const customer = getOne(booking?.customers);

  return customer?.phone || stop.customer_phone || "";
}

function phoneUrl(phone: string | null | undefined) {
  const cleanPhone = String(phone || "").replace(/[^\d+]/g, "");
  return cleanPhone ? `tel:${cleanPhone}` : "";
}

function addressText(stop: DriverStop) {
  return (
    [stop.address, stop.city, stop.state, stop.zip].filter(Boolean).join(", ") ||
    "No address"
  );
}

function partyTime(stop: DriverStop) {
  if (isBreakStop(stop)) {
    return "Break time";
  }

  const booking = getOne(stop.bookings);
  const partyDate = booking?.event_date
    ? formatShortDate(booking.event_date)
    : "No date";

  if (!booking?.event_start_time && !booking?.event_end_time) {
    return `${partyDate} · No party time`;
  }

  return `${partyDate} · ${formatTime(booking?.event_start_time)} — ${formatTime(
    booking?.event_end_time
  )}`;
}

function routeTimeLabel(stop: DriverStop) {
  const label = isBreakStop(stop)
    ? "Break saved"
    : stop.stop_type === "pickup"
      ? "Pickup saved"
      : "Delivery saved";

  const routeDate = stop.stop_date ? formatShortDate(stop.stop_date) : "No date";
  const start = formatTime(stop.scheduled_start_time);
  const end = stop.scheduled_end_time ? formatTime(stop.scheduled_end_time) : "";

  return `${label}: ${routeDate} · ${start}${end ? ` — ${end}` : ""}`;
}

function mapAddress(stop: DriverStop | null) {
  if (!stop || isBreakStop(stop)) return "";

  const address = addressText(stop);

  return address === "No address" ? "" : address;
}

function driverLocationAddress(location: DriverLocation | null) {
  if (!location) return "";
  return `${location.latitude},${location.longitude}`;
}

function googleDirectionsEmbedUrl({
  apiKey,
  origin,
  destination,
}: {
  apiKey: string;
  origin: string;
  destination: string;
}) {
  if (!apiKey || !destination) return "";

  const url = new URL("https://www.google.com/maps/embed/v1/directions");

  url.searchParams.set("key", apiKey);
  url.searchParams.set("origin", origin || destination);
  url.searchParams.set("destination", destination);
  url.searchParams.set("mode", "driving");

  return url.toString();
}

function googleMapsExternalUrl({
  origin,
  destination,
}: {
  origin: string;
  destination: string;
}) {
  if (!destination) return "";

  const params = new URLSearchParams({
    api: "1",
    destination,
    travelmode: "driving",
  });

  if (origin) {
    params.set("origin", origin);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function googlePlaceEmbedUrl({
  apiKey,
  destination,
}: {
  apiKey: string;
  destination: string;
}) {
  if (!apiKey || !destination) return "";

  const url = new URL("https://www.google.com/maps/embed/v1/place");

  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", destination);

  return url.toString();
}

function nextCompletionStatus(stop: DriverStop) {
  if (stop.stop_type === "pickup") return "picked_up";
  if (stop.stop_type === "delivery") return "installed";
  return "completed";
}

function effectiveBalanceDue(stop: DriverStop) {
  const stopBalance = Number(stop.balance_due || 0);

  if (String(stop.stop_type || "").toLowerCase() !== "delivery") {
    return Number.isFinite(stopBalance) ? Math.max(stopBalance, 0) : 0;
  }

  const booking = getOne(stop.bookings);
  const bookingBalance = Number(booking?.balance_due || 0);

  if (!Number.isFinite(bookingBalance)) {
    return Number.isFinite(stopBalance) ? Math.max(stopBalance, 0) : 0;
  }

  return Math.max(bookingBalance, 0);
}

export default function DriverRouteApp({
  stops,
  selectedDate,
  selectedDriver,
  driverNames,
  selectedDriverProfile,
  googleMapsApiKey,
  warehouseOriginAddress,
  lockDriverSelection = false,
  workTimeEntry = null,
  showOwnWorkingTime = false,
}: Props) {
  const routeStops = useMemo(() => {
    const sortValue = (stop: DriverStop) => {
      const date = String(stop.stop_date || selectedDate || "").trim();
      const startTime = timeValue(stop.scheduled_start_time);

      if (!date || !startTime) {
        return Number.POSITIVE_INFINITY;
      }

      const stamp = Date.parse(`${date}T${startTime}:00`);
      return Number.isNaN(stamp) ? Number.POSITIVE_INFINITY : stamp;
    };

    return [...stops].sort((leftStop, rightStop) => {
      const leftValue = sortValue(leftStop);
      const rightValue = sortValue(rightStop);

      if (leftValue !== rightValue) {
        return leftValue - rightValue;
      }

      const leftOrder = Number(leftStop.sort_order ?? Number.MAX_SAFE_INTEGER);
      const rightOrder = Number(
        rightStop.sort_order ?? Number.MAX_SAFE_INTEGER,
      );

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return String(leftStop.id).localeCompare(String(rightStop.id));
    });
  }, [stops, selectedDate]);

  const navigableStops = useMemo(
    () => routeStops.filter((stop) => isNavigableStop(stop)),
    [routeStops]
  );

  const stopSequenceById = useMemo(() => {
    const sequence = new Map<string, number>();
    let counter = 0;

    routeStops.forEach((stop) => {
      if (!isNavigableStop(stop)) return;

      counter += 1;
      sequence.set(stop.id, counter);
    });

    return sequence;
  }, [routeStops]);

  const firstOpenIndex = routeStops.findIndex(
    (stop) => isNavigableStop(stop) && !isCompleted(stop)
  );
  const firstNavigableIndex = routeStops.findIndex((stop) => isNavigableStop(stop));
  const initialIndex =
    firstOpenIndex >= 0 ? firstOpenIndex : firstNavigableIndex >= 0 ? firstNavigableIndex : 0;

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [manualActiveStopId, setManualActiveStopId] = useState<string | null>(
    null
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeMenuTab, setActiveMenuTab] = useState<"account" | "inbox">(
    "account"
  );
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(
    null
  );
  const [locationStatus, setLocationStatus] = useState<
    "idle" | "loading" | "ready" | "denied" | "error"
  >("idle");
  const [isPending, startTransition] = useTransition();

  const activeStop = routeStops[activeIndex] || null;
  const nextUncompletedIndex = routeStops.findIndex(
    (stop) => isNavigableStop(stop) && !isCompleted(stop)
  );

  const previousNavigableStop = useMemo(() => {
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      const stop = routeStops[index];

      if (isNavigableStop(stop)) {
        return stop;
      }
    }

    return null;
  }, [activeIndex, routeStops]);

  const nextNavigableIndex = useMemo(() => {
    for (let index = activeIndex + 1; index < routeStops.length; index += 1) {
      const stop = routeStops[index];

      if (isNavigableStop(stop)) {
        return index;
      }
    }

    return -1;
  }, [activeIndex, routeStops]);

  const nextStop = nextNavigableIndex >= 0 ? routeStops[nextNavigableIndex] : null;

  const isActiveBreak = Boolean(activeStop && isBreakStop(activeStop));
  const isActiveNavigable = Boolean(activeStop && isNavigableStop(activeStop));
  const isNavigatorMode = activeStop?.status === "on_the_way" && isActiveNavigable;

  useEffect(() => {
    if (routeStops.length === 0) return;

    const currentStop = routeStops[activeIndex];

    if (!currentStop) {
      setActiveIndex(initialIndex);
      return;
    }

    if (isBreakStop(currentStop) && !manualActiveStopId && firstNavigableIndex >= 0) {
      setActiveIndex(firstNavigableIndex);
      return;
    }

    if (
      !manualActiveStopId &&
      isNavigableStop(currentStop) &&
      isCompleted(currentStop) &&
      nextUncompletedIndex >= 0
    ) {
      setActiveIndex(nextUncompletedIndex);
    }
  }, [
    routeStops,
    activeIndex,
    initialIndex,
    firstNavigableIndex,
    nextUncompletedIndex,
    manualActiveStopId,
  ]);

  useEffect(() => {
    requestDriverLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestDriverLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("error");
      return;
    }

    setLocationStatus("loading");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDriverLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("ready");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("denied");
        } else {
          setLocationStatus("error");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  }

  // LIVE DRIVER GPS WATCH
  // getCurrentPosition is only a snapshot. While navigation is active we keep
  // listening to the real driver location and rebuild the route from there.
  useEffect(() => {
    if (!isNavigatorMode || typeof navigator === "undefined") return;
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }

    setLocationStatus("loading");

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setDriverLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("ready");
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus("denied");
        } else {
          setLocationStatus("error");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isNavigatorMode]);

  const driverOrigin = driverLocationAddress(driverLocation);

  const fallbackOrigin = previousNavigableStop
    ? mapAddress(previousNavigableStop)
    : warehouseOriginAddress || mapAddress(activeStop);

  const previewMapOrigin = driverOrigin || fallbackOrigin;
  const navigatorMapOrigin = driverOrigin;
  const mapOrigin = isNavigatorMode ? navigatorMapOrigin : previewMapOrigin;
  const mapDestination = activeStop ? mapAddress(activeStop) : "";
  const mapUrl =
    activeStop && googleMapsApiKey && mapDestination
      ? googleDirectionsEmbedUrl({
          apiKey: googleMapsApiKey,
          origin: mapOrigin,
          destination: mapDestination,
        }) ||
        googlePlaceEmbedUrl({
          apiKey: googleMapsApiKey,
          destination: mapDestination,
        })
      : "";

  const externalMapUrl = googleMapsExternalUrl({
    origin: mapOrigin,
    destination: mapDestination,
  });

  const completedCount = navigableStops.filter(isCompleted).length;
  const openCount = navigableStops.length - completedCount;
  const collectTotal = navigableStops.reduce((sum, stop) => {
    if (Boolean(stop.payment_collected)) return sum;
    return sum + effectiveBalanceDue(stop);
  }, 0);

  function updateStopStatus(stop: DriverStop, status: string, nextIndex?: number) {
    const formData = new FormData();

    formData.set("stopId", stop.id);
    formData.set("status", status);
    formData.set("date", selectedDate);
    formData.set("driver", selectedDriver);

    startTransition(() => {
      void updateDriverAppStopStatusAction(formData);
    });

    if (typeof nextIndex === "number") {
      setActiveIndex(nextIndex);
      setManualActiveStopId(routeStops[nextIndex]?.id || null);
    }
  }

  function chooseStop(index: number) {
    const stop = routeStops[index];

    if (!stop) return;

    if (isBreakStop(stop)) {
      setExpandedStopId(expandedStopId === stop.id ? null : stop.id);
      return;
    }

    setActiveIndex(index);
    setManualActiveStopId(stop.id);
    setExpandedStopId(stop.id);
  }

  function makeActiveStop(index: number) {
    const stop = routeStops[index];

    if (!stop || !isNavigableStop(stop)) return;

    setActiveIndex(index);
    setManualActiveStopId(stop.id);
    setExpandedStopId(null);
    setSheetOpen(false);
  }

  function clearManualSelection() {
    setManualActiveStopId(null);

    if (nextUncompletedIndex >= 0) {
      setActiveIndex(nextUncompletedIndex);
    }
  }

  function startNavigation() {
    if (!activeStop || !isActiveNavigable) return;

    if (!driverLocation) {
      requestDriverLocation();
    }

    updateStopStatus(activeStop, "on_the_way");
    setManualActiveStopId(activeStop.id);
    setSheetOpen(false);
  }

  function handleMainAction() {
    if (!activeStop || !isActiveNavigable) return;

    if (!isStarted(activeStop) && !isCompleted(activeStop)) {
      startNavigation();
      return;
    }

    if (activeStop.status === "on_the_way") {
      updateStopStatus(activeStop, "arrived");
      setSheetOpen(false);
      return;
    }

    if (activeStop.status === "arrived") {
      updateStopStatus(activeStop, nextCompletionStatus(activeStop));
      setSheetOpen(false);
      return;
    }

    if (isCompleted(activeStop) && nextStop && nextNavigableIndex >= 0) {
      updateStopStatus(nextStop, "on_the_way", nextNavigableIndex);
      setSheetOpen(false);
      return;
    }

    if (isCompleted(activeStop) && !nextStop) {
      // Route completion and the end of paid work are intentionally separate.
      // The driver may still need to return to the warehouse, unload, refuel,
      // or complete other assigned duties.
      setSheetOpen(false);
    }
  }

  function mainButtonLabel() {
    if (!activeStop) return "No route";

    if (isActiveBreak) return "Break time";
    if (!isActiveNavigable) return "No navigation";

    if (!isStarted(activeStop) && !isCompleted(activeStop)) {
      return "Start navigation";
    }

    if (activeStop.status === "on_the_way") {
      return "Arrived";
    }

    if (activeStop.status === "arrived") {
      return activeStop.stop_type === "pickup"
        ? "Complete pickup"
        : "Complete delivery";
    }

    if (isCompleted(activeStop) && nextStop) {
      return "Start next stop";
    }

    if (isCompleted(activeStop) && !nextStop) {
      return "Route completed";
    }

    return "Continue";
  }

  const activeSequence = activeStop ? stopSequenceById.get(activeStop.id) : null;
  const openWorkBreak =
    workTimeEntry?.staff_time_breaks?.find((item) => !item.ended_at) || null;
  const routeIsCompleted =
    navigableStops.length > 0 &&
    navigableStops.every((stop) => isCompleted(stop));

  return (
    <div className="relative h-[100dvh] min-h-screen overflow-hidden bg-[#111827]">
      <div className="absolute inset-0">
        {isNavigatorMode ? (
          driverLocation && mapDestination ? (
            <DriverNavigatorMap
              apiKey={googleMapsApiKey}
              driverLocation={driverLocation}
              destination={mapDestination}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-[#d9d4ca] px-8 text-center text-[#23313f]">
              <div className="text-base font-semibold">Waiting for driver GPS…</div>
              <div className="mt-2 max-w-sm text-xs leading-5 text-[#6c6258]">
                Navigation starts from the current driver location. It will not
                use the warehouse or previous stop as a fake origin.
              </div>
            </div>
          )
        ) : mapUrl ? (
          <iframe
            title="Driver route map"
            src={mapUrl}
            className="h-full w-full border-0"
            loading="lazy"
            allowFullScreen
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#d9d4ca] px-6 text-center text-sm font-semibold text-[#23313f]">
            Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show integrated map here.
          </div>
        )}
      </div>

      <div
        className={[
          "pointer-events-none absolute inset-x-0 top-0 z-10 px-4 pt-3 text-white transition-all duration-300",
          isNavigatorMode
            ? "bg-transparent pb-0"
            : "bg-gradient-to-b from-black/70 to-transparent pb-16",
        ].join(" ")}
      >
        <div className="mx-auto max-w-3xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className={[
                  "pointer-events-auto mt-1 flex h-11 w-11 items-center justify-center rounded-full text-xl font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.25)] ring-1 ring-white/15 backdrop-blur transition",
                  isNavigatorMode ? "bg-[#23313f]/85" : "bg-white/15",
                ].join(" ")}
                aria-label="Open menu"
              >
                ☰
              </button>

              {!isNavigatorMode && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f0c987]">
                    Bounce Party LA
                  </div>
                  <h1 className="mt-1 text-xl font-semibold leading-6">
                    Routes
                  </h1>
                  <div className="mt-0.5 text-xs text-white/75">
                    {completedCount}/{navigableStops.length} completed
                    {selectedDriver ? ` · ${selectedDriver}` : ""}
                  </div>
                </div>
              )}
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={requestDriverLocation}
                className={[
                  "rounded-full px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.22)] ring-1 ring-white/15 backdrop-blur transition",
                  isNavigatorMode ? "bg-[#23313f]/85" : "bg-white/15",
                ].join(" ")}
              >
                {locationStatus === "ready"
                  ? "GPS"
                  : locationStatus === "loading"
                    ? "GPS..."
                    : "GPS"}
              </button>

              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className={[
                  "rounded-full px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_25px_rgba(0,0,0,0.22)] ring-1 ring-white/15 backdrop-blur transition",
                  isNavigatorMode ? "bg-[#23313f]/85" : "bg-white/15",
                ].join(" ")}
              >
                Date
              </button>
            </div>
          </div>

          {!isNavigatorMode && locationStatus === "denied" && (
            <div className="pointer-events-auto mt-2 rounded-2xl bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-100">
              Location permission denied. Browser is using warehouse/previous
              stop as origin.
            </div>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="absolute inset-0 z-40">
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="absolute inset-0 bg-black/45"
            aria-label="Close filters overlay"
          />

          <aside className="absolute right-0 top-0 h-full w-[82vw] max-w-[360px] bg-[#f5efe6] shadow-[-18px_0_45px_rgba(0,0,0,0.28)]">
            <div className="flex h-full flex-col">
              <div className="bg-[#23313f] px-5 pb-5 pt-6 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9964f]">
                      Route date
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      Date & Driver
                    </div>
                    <div className="mt-1 text-sm text-white/65">
                      {selectedDate}
                      {selectedDriver
                        ? ` · ${selectedDriver}`
                        : " · All drivers"}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <form className="flex-1 space-y-5 overflow-y-auto p-5">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                    Route date
                  </span>
                  <input
                    type="date"
                    name="date"
                    defaultValue={selectedDate}
                    className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-4 text-base text-[#1f1e1b] outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                    Driver
                  </span>
                  {lockDriverSelection ? (
                    <input
                      type="text"
                      value={selectedDriver || "Assigned driver"}
                      readOnly
                      className="w-full rounded-2xl border border-[#d8cec0] bg-[#f5efe6] px-4 py-4 text-base text-[#1f1e1b] outline-none"
                    />
                  ) : (
                    <select
                      name="driver"
                      defaultValue={selectedDriver}
                      className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-4 text-base text-[#1f1e1b] outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                    >
                      <option value="">All drivers</option>
                      {driverNames.map((driverName) => (
                        <option key={driverName} value={driverName}>
                          {driverName}
                        </option>
                      ))}
                    </select>
                  )}
                </label>

                <button
                  type="submit"
                  className="w-full rounded-full bg-[#c9964f] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.28)]"
                >
                  Apply
                </button>

                <a
                  href="/admin/routes/driver"
                  className="block w-full rounded-full border border-[#d8cec0] bg-white px-5 py-4 text-center text-base font-semibold text-[#23313f]"
                >
                  Reset date
                </a>
              </form>
            </div>
          </aside>
        </div>
      )}

      {menuOpen && (
        <div className="absolute inset-0 z-40">
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/45"
            aria-label="Close menu overlay"
          />

          <aside className="absolute left-0 top-0 h-full w-[82vw] max-w-[360px] bg-[#f5efe6] shadow-[18px_0_45px_rgba(0,0,0,0.28)]">
            <div className="flex h-full flex-col">
              <div className="bg-[#23313f] px-5 pb-5 pt-6 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9964f]">
                      Driver app
                    </div>
                    <div className="mt-2 text-2xl font-semibold">
                      {selectedDriver || "Driver"}
                    </div>
                    <div className="mt-1 text-sm text-white/65">
                      {selectedDate} · {navigableStops.length} stops
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMenuOpen(false)}
                    className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-b border-[#e5d9ca] bg-white px-4 py-3">
                <button
                  type="button"
                  onClick={() => setActiveMenuTab("account")}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold",
                    activeMenuTab === "account"
                      ? "bg-[#23313f] text-white"
                      : "bg-[#f4ede2] text-[#6c6258]",
                  ].join(" ")}
                >
                  Account
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMenuTab("inbox")}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold",
                    activeMenuTab === "inbox"
                      ? "bg-[#23313f] text-white"
                      : "bg-[#f4ede2] text-[#6c6258]",
                  ].join(" ")}
                >
                  Inbox
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {activeMenuTab === "account" && (
                  <div className="space-y-4">
                    {showOwnWorkingTime ? (
                      <div className="rounded-[24px] bg-white p-5 ring-1 ring-[#eee5d9]">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                          Working time
                        </div>

                        <div className="mt-2 text-xl font-semibold text-[#1f1e1b]">
                          {!workTimeEntry
                            ? "Starts with your first route action"
                            : openWorkBreak
                              ? "On break"
                              : routeIsCompleted
                                ? "Route completed"
                                : "Working"}
                        </div>

                        <div className="mt-1 text-sm leading-5 text-[#6c6258]">
                          {!workTimeEntry
                            ? "Start navigation or update the first stop. Your shift will start automatically."
                            : openWorkBreak
                              ? `Break started ${formatTime(openWorkBreak.started_at)}.`
                              : `Work started ${formatTime(workTimeEntry.clock_in_at)}.`}
                        </div>

                        {workTimeEntry ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {openWorkBreak ? (
                              <form action={resumeWorkAction}>
                                <button className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">
                                  Resume work
                                </button>
                              </form>
                            ) : (
                              <form action={startBreakAction}>
                                <button className="rounded-full border border-[#d8cec0] bg-white px-4 py-2.5 text-sm font-semibold text-[#23313f]">
                                  Start break
                                </button>
                              </form>
                            )}

                            {routeIsCompleted ? (
                              <form action={finishWorkAction}>
                                <button className="rounded-full bg-red-700 px-4 py-2.5 text-sm font-semibold text-white">
                                  Finish work
                                </button>
                              </form>
                            ) : null}
                          </div>
                        ) : null}

                        {routeIsCompleted && workTimeEntry ? (
                          <div className="mt-3 rounded-2xl bg-[#fff7e8] px-3 py-3 text-xs leading-5 text-[#765522] ring-1 ring-[#efd9ad]">
                            Finish work only after returning, unloading, refueling,
                            and completing all remaining duties.
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="rounded-[24px] bg-white p-5 ring-1 ring-[#eee5d9]">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                        Current order
                      </div>

                      {activeStop ? (
                        <div className="mt-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {isBreakStop(activeStop) ? (
                              <span className="rounded-full bg-[#9a723e] px-3 py-1 text-xs font-semibold text-white">
                                Break
                              </span>
                            ) : (
                              <span className="rounded-full bg-[#23313f] px-3 py-1 text-xs font-semibold text-white">
                                #{activeSequence || 1}
                              </span>
                            )}

                            <span
                              className={[
                                "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                                isBreakStop(activeStop)
                                  ? breakTone()
                                  : stopTypeTone(activeStop.stop_type),
                              ].join(" ")}
                            >
                              {isBreakStop(activeStop)
                                ? "Break"
                                : stopTypeLabel(activeStop.stop_type)}
                            </span>

                            {!isBreakStop(activeStop) && (
                              <span
                                className={[
                                  "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                                  statusTone(activeStop.status),
                                ].join(" ")}
                              >
                                {prettyStatus(activeStop.status)}
                              </span>
                            )}
                          </div>

                          <div>
                            <div className="text-xl font-semibold leading-6 text-[#1f1e1b]">
                              {mainProductName(activeStop)}
                            </div>

                            <div className="mt-1 text-sm font-semibold leading-5 text-[#9a723e]">
                              {routeTimeLabel(activeStop)}
                            </div>
                          </div>

                          <div className="rounded-2xl bg-[#fcfaf7] p-4 text-sm leading-6 text-[#6c6258] ring-1 ring-[#eee5d9]">
                            {isBreakStop(activeStop) ? (
                              <>
                                <div>
                                  <span className="font-semibold text-[#1f1e1b]">
                                    Break:
                                  </span>{" "}
                                  {routeTimeLabel(activeStop)}
                                </div>
                                <div className="mt-1">
                                  <span className="font-semibold text-[#1f1e1b]">
                                    Duration:
                                  </span>{" "}
                                  {breakMinutesFromStop(activeStop) || "—"} min
                                </div>
                              </>
                            ) : (
                              <>
                                <div>
                                  <span className="font-semibold text-[#1f1e1b]">
                                    Address:
                                  </span>{" "}
                                  {addressText(activeStop)}
                                </div>

                                <div className="mt-1">
                                  <span className="font-semibold text-[#1f1e1b]">
                                    Party:
                                  </span>{" "}
                                  {partyTime(activeStop)}
                                </div>

                                <div className="mt-1">
                                  <span className="font-semibold text-[#1f1e1b]">
                                    Customer:
                                  </span>{" "}
                                  {customerName(activeStop)}
                                </div>

                                {customerPhone(activeStop) && (
                                  <a
                                    href={phoneUrl(customerPhone(activeStop))}
                                    className="mt-3 block rounded-full bg-emerald-600 px-4 py-2 text-center text-xs font-semibold text-white"
                                  >
                                    Call {customerPhone(activeStop)}
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                          No active order selected.
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                          Completed
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
                          {completedCount}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                          Open
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">
                          {openCount}
                        </div>
                      </div>

                      <div className="col-span-2 rounded-2xl bg-[#fff8e8] p-4 ring-1 ring-[#ead6a8]">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                          Collect today
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-[#8a6b20]">
                          {money(collectTotal)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] bg-white p-5 ring-1 ring-[#eee5d9]">
                      <div className="text-sm font-semibold text-[#1f1e1b]">
                        GPS
                      </div>

                      <div className="mt-3 rounded-2xl bg-[#fcfaf7] px-4 py-3 text-sm text-[#6c6258]">
                        Status: {locationStatus}
                      </div>

                      <button
                        type="button"
                        onClick={requestDriverLocation}
                        className="mt-3 w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
                      >
                        Update my location
                      </button>
                    </div>

                    <div className="rounded-[24px] bg-white p-5 ring-1 ring-[#eee5d9]">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                        Driver profile
                      </div>

                      <div className="mt-3 text-xl font-semibold text-[#1f1e1b]">
                        {selectedDriver || "No driver selected"}
                      </div>

                      <div className="mt-1 text-sm leading-6 text-[#6c6258]">
                        This profile is the same Staff profile from Admin Staff.
                      </div>
                    </div>

                    {!selectedDriverProfile && (
                      <div className="rounded-[24px] bg-[#fff8e8] p-5 text-sm leading-6 text-[#8a6b20] ring-1 ring-[#ead6a8]">
                        Select a specific driver in the Date menu to edit profile
                        data.
                      </div>
                    )}

                    {selectedDriverProfile && (
                      <form
                        action={updateDriverAppProfileAction}
                        className="space-y-4 rounded-[24px] bg-white p-5 ring-1 ring-[#eee5d9]"
                      >
                        <input
                          type="hidden"
                          name="driverId"
                          value={selectedDriverProfile.id}
                        />
                        <input
                          type="hidden"
                          name="selectedDate"
                          value={selectedDate}
                        />
                        <input
                          type="hidden"
                          name="selectedDriver"
                          value={selectedDriver}
                        />

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                            Driver name
                          </span>
                          <input
                            name="name"
                            defaultValue={selectedDriverProfile.name || ""}
                            required
                            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-4 text-base text-[#1f1e1b] outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                            Phone
                          </span>
                          <input
                            name="phone"
                            defaultValue={selectedDriverProfile.phone || ""}
                            placeholder="Driver phone"
                            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-4 text-base text-[#1f1e1b] outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                            Login email
                          </span>
                          <input
                            name="accountEmail"
                            type="email"
                            defaultValue={
                              selectedDriverProfile.account_email || ""
                            }
                            placeholder="driver@email.com"
                            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-4 text-base text-[#1f1e1b] outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                            Auth user id
                          </span>
                          <input
                            name="authUserId"
                            defaultValue={
                              selectedDriverProfile.auth_user_id || ""
                            }
                            placeholder="Supabase auth user id"
                            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-4 text-base text-[#1f1e1b] outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                          <span className="mt-2 block text-xs leading-5 text-[#8b8177]">
                            This connects the Staff profile with the Supabase
                            login account. Password is not visible here for
                            security.
                          </span>
                        </label>

                        <div className="rounded-2xl bg-[#fcfaf7] p-4 text-sm leading-6 text-[#6c6258] ring-1 ring-[#eee5d9]">
                          <div>
                            <span className="font-semibold text-[#1f1e1b]">
                              Role:
                            </span>{" "}
                            {selectedDriverProfile.profile?.role || "driver"}
                          </div>
                          <div className="mt-1">
                            <span className="font-semibold text-[#1f1e1b]">
                              Permissions:
                            </span>{" "}
                            {(selectedDriverProfile.profile?.permissions || [])
                              .join(", ") || "No permissions"}
                          </div>
                        </div>

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                            Personal notes
                          </span>
                          <textarea
                            name="plainNotes"
                            rows={4}
                            defaultValue={
                              selectedDriverProfile.profile?.plainNotes || ""
                            }
                            placeholder="Driver notes, emergency info, preferences..."
                            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-4 text-base text-[#1f1e1b] outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </label>

                        <button
                          type="submit"
                          className="w-full rounded-full bg-[#23313f] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(35,49,63,0.18)]"
                        >
                          Save staff profile
                        </button>

                        <a
                          href="/admin/staff"
                          className="block w-full rounded-full border border-[#d8cec0] bg-white px-5 py-4 text-center text-base font-semibold text-[#23313f]"
                        >
                          Open Staff settings
                        </a>
                      </form>
                    )}
                  </div>
                )}

                {activeMenuTab === "inbox" && (
                  <div className="space-y-4">
                    <div className="rounded-[24px] bg-white p-5 ring-1 ring-[#eee5d9]">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                        Inbox
                      </div>

                      <div className="mt-3 text-xl font-semibold text-[#1f1e1b]">
                        Support chat
                      </div>

                      <div className="mt-2 text-sm leading-6 text-[#6c6258]">
                        Здесь будет переписка водителя со службой поддержки.
                        Telegram-группу можно подключить через Telegram Bot API.
                      </div>
                    </div>

                    <div className="rounded-[24px] bg-[#eaf2f9] p-5 text-sm leading-6 text-[#355879] ring-1 ring-[#cfe0ef]">
                      <div className="font-semibold">Telegram sync plan</div>
                      <div className="mt-2">
                        1. Создать Telegram bot.
                        <br />
                        2. Добавить bot в support group.
                        <br />
                        3. Создать таблицу driver_inbox_messages.
                        <br />
                        4. Webhook будет сохранять сообщения в Supabase.
                        <br />
                        5. Driver app будет читать inbox по driver_name или
                        staff account.
                      </div>
                    </div>

                    <button
                      type="button"
                      className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white opacity-60"
                      disabled
                    >
                      Telegram connection coming soon
                    </button>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {activeStop && !isNavigatorMode && isActiveNavigable && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 px-4 lg:absolute lg:bottom-[92px] lg:z-10">
          <div className="mx-auto max-w-3xl">
            <div className="pointer-events-auto rounded-[28px] bg-white/96 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.22)] backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#23313f] px-3 py-1 text-xs font-semibold text-white">
                      #{activeSequence || 1}
                    </span>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                        stopTypeTone(activeStop.stop_type),
                      ].join(" ")}
                    >
                      {stopTypeLabel(activeStop.stop_type)}
                    </span>
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                        statusTone(activeStop.status),
                      ].join(" ")}
                    >
                      {prettyStatus(activeStop.status)}
                    </span>
                  </div>

                  <div className="mt-2 truncate text-lg font-semibold leading-6 text-[#1f1e1b]">
                    {mainProductName(activeStop)}
                  </div>

                  <div className="mt-1 text-sm font-semibold leading-5 text-[#9a723e]">
                    {routeTimeLabel(activeStop)}
                  </div>

                  <div className="mt-1 text-xs font-semibold text-[#6c6258]">
                    Origin:{" "}
                    {driverLocation ? "Driver GPS" : "Warehouse / previous stop"}
                    {manualActiveStopId ? " · Manual stop selected" : ""}
                  </div>
                </div>

                {effectiveBalanceDue(activeStop) > 0 &&
                  !Boolean(activeStop.payment_collected) && (
                    <div className="shrink-0 rounded-2xl bg-[#fff8e8] px-3 py-2 text-right text-xs font-semibold text-[#8a6b20] ring-1 ring-[#ead6a8]">
                      Collect
                      <br />
                      {money(effectiveBalanceDue(activeStop))}
                    </div>
                  )}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <button
                  type="button"
                  onClick={handleMainAction}
                  disabled={
                    isPending ||
                    !activeStop ||
                    !isActiveNavigable ||
                    (isCompleted(activeStop) && !nextStop)
                  }
                  className="w-full rounded-full bg-[#c9964f] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Updating..." : mainButtonLabel()}
                </button>

                {externalMapUrl && (
                  <a
                    href={externalMapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[#d8cec0] bg-white px-5 py-4 text-center text-sm font-semibold text-[#23313f]"
                  >
                    Maps
                  </a>
                )}
              </div>

              {manualActiveStopId && nextUncompletedIndex >= 0 && (
                <button
                  type="button"
                  onClick={clearManualSelection}
                  className="mt-2 w-full rounded-full bg-[#f4ede2] px-5 py-3 text-sm font-semibold text-[#6c6258]"
                >
                  Back to planned next stop
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeStop && isNavigatorMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 px-4 lg:absolute lg:z-10">
          <div className="mx-auto max-w-3xl">
            <div className="pointer-events-auto rounded-[24px] bg-[#23313f]/95 p-3 shadow-[0_18px_45px_rgba(0,0,0,0.26)] backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#23313f]">
                  #{activeSequence || 1}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">
                    {mainProductName(activeStop)}
                  </div>
                  <div className="truncate text-xs text-white/70">
                    Navigation mode · Origin:{" "}
                    {driverLocation ? "Driver GPS" : "Warehouse / previous stop"}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleMainAction}
                  disabled={isPending}
                  className="shrink-0 rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isPending ? "..." : "Arrived"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={[
          "fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 lg:absolute lg:z-20",
          sheetOpen ? "translate-y-0" : "translate-y-[calc(100%-72px)]",
        ].join(" ")}
      >
        <div className="mx-auto flex max-h-[calc(100dvh-4.5rem)] max-w-3xl flex-col overflow-hidden rounded-t-[34px] bg-[#f5efe6] shadow-[0_-14px_45px_rgba(0,0,0,0.24)]">
          <button
            type="button"
            onClick={() => setSheetOpen((value) => !value)}
            className="block w-full px-5 pt-3"
          >
            <span className="mx-auto block h-1.5 w-14 rounded-full bg-[#b8aa98]" />
            <span className="mt-3 flex items-center justify-between text-left">
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                  Route stops
                </span>
                <span className="block text-sm text-[#6c6258]">
                  Swipe/tap to {sheetOpen ? "hide" : "open"} list
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#23313f] ring-1 ring-[#d8cec0]">
                {routeStops.length} stops
              </span>
            </span>
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
            <div className="space-y-2">
              {routeStops.map((stop, index) => {
                const expanded = expandedStopId === stop.id;
                const active = activeStop?.id === stop.id;
                const phone = customerPhone(stop);
                const phoneHref = phoneUrl(phone);
                const hasCollect =
                  effectiveBalanceDue(stop) > 0 &&
                  !Boolean(stop.payment_collected) &&
                  isNavigableStop(stop);
                const breakStop = isBreakStop(stop);
                const sequence = stopSequenceById.get(stop.id);

                return (
                  <article
                    key={stop.id}
                    className={[
                      "relative overflow-hidden rounded-[22px] border bg-white shadow-[0_8px_22px_rgba(0,0,0,0.045)]",
                      active && !breakStop
                        ? "border-[#c9964f] ring-2 ring-[#c9964f]/30"
                        : breakStop
                          ? "border-[#ead6a8] bg-[#fffaf0]"
                          : "border-black/5",
                    ].join(" ")}
                  >
                    {!breakStop && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-1.5"
                        style={{ backgroundColor: safeMarkerColor(stop.markerColor) }}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => chooseStop(index)}
                      className="flex w-full items-start gap-2.5 py-3 pl-5 pr-3 text-left sm:gap-3 sm:pl-6 sm:pr-4"
                    >
                      {breakStop ? (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#9a723e] text-[10px] font-semibold uppercase tracking-[0.08em] text-white sm:h-11 sm:w-11">
                          Break
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#23313f] text-sm font-semibold text-white sm:h-11 sm:w-11 sm:text-base">
                          #{sequence || index + 1}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span
                            className={[
                              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 sm:text-[11px]",
                              breakStop ? breakTone() : stopTypeTone(stop.stop_type),
                            ].join(" ")}
                          >
                            {breakStop ? "Break" : stopTypeLabel(stop.stop_type)}
                          </span>

                          {!breakStop && (
                            <span
                              className={[
                                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 sm:text-[11px]",
                                statusTone(stop.status),
                              ].join(" ")}
                            >
                              {prettyStatus(stop.status)}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 max-w-full truncate text-[15px] font-semibold leading-5 text-[#1f1e1b] sm:text-base">
                          {mainProductName(stop)}
                        </div>

                        <div
                          className={[
                            "mt-0.5 line-clamp-2 text-[12px] font-semibold leading-4 sm:text-sm sm:leading-5",
                            breakStop ? "text-[#9a723e]" : "text-[#9a723e]",
                          ].join(" ")}
                        >
                          {routeTimeLabel(stop)}
                        </div>

                        {breakStop && (
                          <div className="mt-1 inline-flex rounded-full bg-[#fff8e8] px-2.5 py-1 text-[11px] font-semibold text-[#8a6b20] ring-1 ring-[#ead6a8]">
                            Rest time · {breakMinutesFromStop(stop) || "—"} min
                          </div>
                        )}

                        {active && manualActiveStopId === stop.id && !breakStop && (
                          <div className="mt-1 inline-flex rounded-full bg-[#eaf2f9] px-2.5 py-1 text-[11px] font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                            Active selected stop
                          </div>
                        )}

                        {hasCollect && (
                          <div className="mt-1 inline-flex rounded-full bg-[#fff8e8] px-2.5 py-1 text-[11px] font-semibold text-[#8a6b20] ring-1 ring-[#ead6a8] sm:hidden">
                            Collect {money(effectiveBalanceDue(stop))}
                          </div>
                        )}
                      </div>

                      {hasCollect && (
                        <div className="hidden shrink-0 pt-1 text-right text-xs font-semibold text-[#8a6b20] sm:block">
                          {money(effectiveBalanceDue(stop))}
                        </div>
                      )}
                    </button>

                    {expanded && (
                      <div className="border-t border-[#eee5d9] bg-[#fcfaf7] px-4 py-3">
                        <div className="grid gap-2 text-sm">
                          {breakStop ? (
                            <>
                              <div>
                                <span className="font-semibold text-[#1f1e1b]">
                                  Break:
                                </span>{" "}
                                <span className="text-[#6c6258]">
                                  {routeTimeLabel(stop)}
                                </span>
                              </div>

                              <div>
                                <span className="font-semibold text-[#1f1e1b]">
                                  Duration:
                                </span>{" "}
                                <span className="text-[#6c6258]">
                                  {breakMinutesFromStop(stop) || "—"} min
                                </span>
                              </div>

                              <div className="rounded-2xl bg-[#fff8e8] p-3 text-sm leading-5 text-[#8a6b20] ring-1 ring-[#ead6a8]">
                                This is a scheduled non-navigation stop. Start the
                                break here when it actually begins and resume work
                                when it ends. The actual unpaid duration is deducted
                                from working time; a break of 30+ minutes is also
                                counted as a recorded meal period.
                              </div>

                              {showOwnWorkingTime && workTimeEntry ? (
                                <div className="flex flex-wrap gap-2">
                                  {openWorkBreak ? (
                                    <form action={resumeWorkAction}>
                                      <button className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">
                                        Resume work
                                      </button>
                                    </form>
                                  ) : (
                                    <form action={startBreakAction}>
                                      <button className="rounded-full bg-[#9a723e] px-4 py-2.5 text-sm font-semibold text-white">
                                        Start scheduled break
                                      </button>
                                    </form>
                                  )}
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div>
                                <span className="font-semibold text-[#1f1e1b]">
                                  Address:
                                </span>{" "}
                                <span className="text-[#6c6258]">
                                  {addressText(stop)}
                                </span>
                              </div>

                              <div>
                                <span className="font-semibold text-[#1f1e1b]">
                                  Party:
                                </span>{" "}
                                <span className="text-[#6c6258]">
                                  {partyTime(stop)}
                                </span>
                              </div>

                              <div>
                                <span className="font-semibold text-[#1f1e1b]">
                                  Customer:
                                </span>{" "}
                                <span className="text-[#6c6258]">
                                  {customerName(stop)}
                                </span>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-2">
                                <button
                                  type="button"
                                  onClick={() => makeActiveStop(index)}
                                  className="rounded-full bg-[#23313f] px-4 py-2 text-center text-xs font-semibold text-white"
                                >
                                  Make active stop
                                </button>

                                {!isCompleted(stop) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      makeActiveStop(index);
                                      setTimeout(() => {
                                        if (routeStops[index]) {
                                          updateStopStatus(
                                            routeStops[index],
                                            "on_the_way"
                                          );
                                        }
                                      }, 0);
                                    }}
                                    className="rounded-full bg-[#c9964f] px-4 py-2 text-center text-xs font-semibold text-white"
                                  >
                                    Start this stop
                                  </button>
                                )}
                              </div>
                              {stop.stop_type === "delivery" && stop.booking_id && (
                                <a
                                  href={`/admin/routes/driver/stops/${stop.id}`}
                                  className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-center text-xs font-semibold text-[#23313f]"
                                >
                                  Open stop details
                                </a>
                              )}
                              {phone && (
                                <a
                                  href={phoneHref}
                                  className="rounded-full bg-emerald-600 px-4 py-2 text-center text-xs font-semibold text-white"
                                >
                                  Call {phone}
                                </a>
                              )}

                              {hasCollect && (
                                <div className="rounded-2xl bg-[#fff8e8] p-3 text-sm font-semibold text-[#8a6b20] ring-1 ring-[#ead6a8]">
                                  Collect payment: {money(effectiveBalanceDue(stop))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}

              {routeStops.length === 0 && (
                <div className="rounded-[24px] border border-dashed border-[#d8cec0] bg-white p-8 text-center text-sm text-[#6c6258]">
                  No delivery or pickup stops for this date.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
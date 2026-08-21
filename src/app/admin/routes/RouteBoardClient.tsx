"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "next/navigation";
import {
  createOrUpdateRouteDriverAction,
  createRouteStopAction,
  deleteRouteStopAction,
  deleteRouteDriverAction,
  quickUpdateRouteStopStatusAction,
  saveRouteOrderAction,
  updateRouteStopCompactAction,
  updateRouteStopDriverAction,
} from "./actions";
import GoogleAddressInput from "@/components/admin/GoogleAddressInput";
import MultiDriverRouteMap from "@/components/admin/routes/MultiDriverRouteMap";
import { getBookingMarkerColor } from "@/lib/booking/marker-color";
import {
  bookingItemsProductSummary,
  resolveBookingRouteDurations,
  totalBookingSetupMinutes,
  totalBookingTeardownMinutes,
} from "@/lib/booking/booking-items-summary";

type RouteStop = {
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
  time_locked?: boolean | null;
  driver_name: string | null;
  truck_name: string | null;
  items_summary: string | null;
  surface: string | null;
  gate_code: string | null;
  parking_notes: string | null;
  setup_notes: string | null;
  pickup_notes: string | null;
  client_delivery_windows?: any;
  client_pickup_windows?: any;
  balance_due: number | string | null;
  sort_order: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  bookings?: any;
  route_setup_duration_min?: number | null;
  route_teardown_duration_min?: number | null;
  route_duration_breakdown?: Array<{
    name: string;
    quantity: number;
    setupMinutes: number;
    teardownMinutes: number;
  }>;
};

function bookingRouteDurations(stop: RouteStop, bookingItems: any[]) {
  return resolveBookingRouteDurations(bookingItems, {
    setupMinutes: stop.route_setup_duration_min,
    teardownMinutes: stop.route_teardown_duration_min,
  });
}

type RouteWindow = {
  date: string;
  start_time: string;
  end_time: string;
};

type Driver = {
  id: string;
  name: string;
  color: string;
  phone: string | null;
  account_email: string | null;
  auth_user_id: string | null;
  notes: string | null;
  active: boolean;
  deleted_at?: string | null;
  sort_order: number;
};

type ChecklistItem = {
  id: string;
  booking_id: string;
  title: string;
  quantity: number | string | null;
  item_type: string | null;
  inventory_items?: any;
  inventory_units?: any;
};

type BookingModifier = {
  id: string;
  booking_id: string;
  booking_item_id?: string | null;
  label?: string | null;
  notes?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
};

type LiveTiming = {
  date: string;
  startTime: string;
  endTime: string;
};

type TimingDraft = Partial<LiveTiming> & { locked?: boolean };

type RouteTimingHealth = {
  tone: "ok" | "warning" | "conflict" | "neutral";
  label: string;
  details: string[];
};

type RouteSegment = {
  from: string;
  to: string;
  distanceText: string | null;
  durationText: string | null;
  fromSequence: number;
  toSequence: number;
  fromStopType: string | null;
  toStopType: string | null;
  fromStopId?: string | null;
  toStopId?: string | null;
};

const statuses = [
  { value: "scheduled", label: "Scheduled" },
  { value: "on_the_way", label: "On the way" },
  { value: "arrived", label: "Arrived" },
  { value: "installed", label: "Installed" },
  { value: "picked_up", label: "Picked up" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const stopTypes = [
  { value: "delivery", label: "Delivery" },
  { value: "pickup", label: "Pickup" },
  { value: "service", label: "Service" },
  { value: "warehouse", label: "Warehouse" },
  { value: "other", label: "Other" },
];

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function timeValue(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function timeFromAny(value: any) {
  if (!value) return "";

  const raw = String(value);

  if (/^\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 5);
  }

  const match = raw.match(/(\d{2}):(\d{2})/);
  if (!match) return "";

  return `${match[1]}:${match[2]}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Any date";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(date);
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

function compactSegmentMetric(
  value: string | null | undefined,
  kind: "time" | "distance",
) {
  const raw = String(value || "").trim();

  if (!raw) return "—";

  if (kind === "time") {
    const match = raw.match(
      /(\d+(?:[\.,]\d+)?)\s*(?:h|hr|hrs|hour|hours|min|mins|minute|minutes|m|ч|час|часа|часов|мин|минута|минуты|минут)\b/i,
    );

    if (match) {
      const normalized = match[1].replace(",", ".");
      const unit = /h|hr|hrs|hour|hours|ч|час/i.test(raw) ? "h" : "min";
      return `${normalized}${unit}`;
    }

    return raw
      .replace(/мин\.?/gi, "min")
      .replace(/minutes?/gi, "min")
      .replace(/mins?/gi, "min")
      .replace(/\s+/g, "");
  }

  const milesMatch = raw.match(
    /(\d+(?:[\.,]\d+)?)\s*(?:mi|mile|miles|мил|миля|мили|миль)\b/i,
  );

  if (milesMatch) {
    return `${milesMatch[1].replace(",", ".")}mi`;
  }

  const kmMatch = raw.match(
    /(\d+(?:[\.,]\d+)?)\s*(?:km|kilometer|kilometers)\b/i,
  );

  if (kmMatch) {
    return `${kmMatch[1].replace(",", ".")}km`;
  }

  return raw
    .replace(/мил\.?/gi, "mi")
    .replace(/мили?/gi, "mi")
    .replace(/миль/gi, "mi")
    .replace(/\s+/g, "");
}

function compactSegmentLabel(segment: {
  durationText: string | null;
  distanceText: string | null;
}) {
  const duration = compactSegmentMetric(segment.durationText, "time");
  const distance = compactSegmentMetric(segment.distanceText, "distance");

  if (duration === "—" && distance === "—") return "—";

  return `${duration}/${distance}`;
}

function parseSegmentDurationMinutes(value: string | null | undefined) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  if (!raw) return null;

  let totalMinutes = 0;

  const hourPattern =
    /(\d+(?:[.,]\d+)?)\s*(?:hours?|hrs?|hr|h|часов|часа|час|ч)(?=\s|[.,;:]|$)/gi;

  const minutePattern =
    /(\d+(?:[.,]\d+)?)\s*(?:minutes?|mins?|min|m|минуты|минута|минут|мин)(?=\s|[.,;:]|$)/gi;

  for (const match of raw.matchAll(hourPattern)) {
    const parsed = Number(String(match[1] || "").replace(",", "."));

    if (Number.isFinite(parsed) && parsed > 0) {
      totalMinutes += parsed * 60;
    }
  }

  for (const match of raw.matchAll(minutePattern)) {
    const parsed = Number(String(match[1] || "").replace(",", "."));

    if (Number.isFinite(parsed) && parsed > 0) {
      totalMinutes += parsed;
    }
  }

  if (totalMinutes > 0) {
    return Math.max(1, Math.round(totalMinutes));
  }

  const compactMatch = raw.match(
    /^(\d+(?:[.,]\d+)?)\s*(?:minutes?|mins?|min|m|минуты|минута|минут|мин)?[.]?$/i,
  );

  if (compactMatch) {
    const parsed = Number(String(compactMatch[1] || "").replace(",", "."));

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.round(parsed));
    }
  }

  return null;
}

function parseWindows(value: any): RouteWindow[] {
  if (!value) return [];

  const raw = Array.isArray(value)
    ? value
    : (() => {
        try {
          return JSON.parse(String(value));
        } catch {
          return [];
        }
      })();

  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => ({
      date: String(item?.date || "").slice(0, 10),
      start_time: String(item?.start_time || "").slice(0, 5),
      end_time: String(item?.end_time || "").slice(0, 5),
    }))
    .filter((item) => item.date && item.start_time && item.end_time);
}

function formatWindow(window: RouteWindow) {
  return `${formatDate(window.date)} · ${formatTime(
    window.start_time,
  )} — ${formatTime(window.end_time)}`;
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function stopTypeLabel(value: string | null | undefined) {
  return stopTypes.find((type) => type.value === value)?.label || "Other";
}

function breakMinutesFromRouteStop(stop: RouteStop) {
  const setupNotes = String(stop.setup_notes || "");
  const notesMatch = setupNotes.match(
    /break[_\s-]*minutes\s*[:=]\s*(\d{1,3})/i,
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

function isBreakRouteStop(stop: RouteStop) {
  return Boolean(
    breakMinutesFromRouteStop(stop) ||
    /\bbreak\b/i.test(String(stop.customer_name || "")) ||
    /\bbreak\b/i.test(String(stop.items_summary || "")) ||
    /\bbreak\b/i.test(String(stop.setup_notes || "")),
  );
}

function parseMinutes(value: any) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  return Math.round(parsed);
}

function addMinutesToTime(
  value: string | null | undefined,
  minutesToAdd: number,
) {
  const cleanValue = timeValue(value);

  if (!cleanValue) return "";

  const [hoursRaw, minutesRaw] = cleanValue.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return cleanValue;
  }

  const total = (hours * 60 + minutes + minutesToAdd) % (24 * 60);
  const normalizedTotal = total < 0 ? total + 24 * 60 : total;
  const nextHours = String(Math.floor(normalizedTotal / 60)).padStart(2, "0");
  const nextMinutes = String(normalizedTotal % 60).padStart(2, "0");

  return `${nextHours}:${nextMinutes}`;
}

function minutesFromTime(value: string | null | undefined) {
  const clean = timeValue(value);

  if (!clean) return null;

  const [hoursRaw, minutesRaw] = clean.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
}

function durationBetweenTimes(
  start: string | null | undefined,
  end: string | null | undefined,
) {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);

  if (startMinutes == null || endMinutes == null) return null;
  if (endMinutes >= startMinutes) return endMinutes - startMinutes;

  return endMinutes + 24 * 60 - startMinutes;
}

function estimateTravelMinutes(
  previousStop: RouteStop,
  currentStop: RouteStop,
) {
  if (isBreakRouteStop(previousStop) || isBreakRouteStop(currentStop)) {
    return 0;
  }

  const previousAddress = resolvedStopAddress(previousStop).toLowerCase();
  const currentAddress = resolvedStopAddress(currentStop).toLowerCase();

  if (!previousAddress || !currentAddress) return 0;
  if (previousAddress === currentAddress) return 0;

  const prevZip = String(previousStop.zip || "").trim();
  const curZip = String(currentStop.zip || "").trim();

  if (prevZip && curZip && prevZip === curZip) return 10;

  const prevCity = String(previousStop.city || "")
    .trim()
    .toLowerCase();
  const curCity = String(currentStop.city || "")
    .trim()
    .toLowerCase();

  if (prevCity && curCity && prevCity === curCity) return 18;

  return 45;
}

function routeTimingSummary(
  date: string | null | undefined,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
) {
  return `${formatDate(date)} · ${formatTime(startTime)} — ${formatTime(endTime)}`;
}

function routeDateTimeValue(
  date: string | null | undefined,
  time: string | null | undefined,
) {
  const cleanDate = String(date || "").slice(0, 10);
  const cleanTime = timeValue(time);

  if (!cleanDate || !cleanTime) return null;

  const value = new Date(`${cleanDate}T${cleanTime}:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

function evaluateRouteTimingHealth({
  stopType,
  routeDate,
  routeStartTime,
  routeEndTime,
  eventDate,
  eventStartTime,
  eventEndTime,
  clientWindows,
  bookingWindowStart,
  bookingWindowEnd,
}: {
  stopType: string | null | undefined;
  routeDate: string | null | undefined;
  routeStartTime: string | null | undefined;
  routeEndTime: string | null | undefined;
  eventDate: string | null | undefined;
  eventStartTime: string | null | undefined;
  eventEndTime: string | null | undefined;
  clientWindows: RouteWindow[];
  bookingWindowStart: string;
  bookingWindowEnd: string;
}): RouteTimingHealth {
  const routeStart = minutesFromTime(routeStartTime);
  const routeEnd = minutesFromTime(routeEndTime);

  if (!routeDate || routeStart == null || routeEnd == null) {
    return {
      tone: "neutral",
      label: "Timing not complete",
      details: ["Route date or time is missing."],
    };
  }

  const details: string[] = [];
  let tone: RouteTimingHealth["tone"] = "ok";

  function raise(nextTone: RouteTimingHealth["tone"], detail: string) {
    const rank = {
      neutral: 0,
      ok: 1,
      warning: 2,
      conflict: 3,
    };

    if (rank[nextTone] > rank[tone]) {
      tone = nextTone;
    }

    details.push(detail);
  }

  const routeStartDateTime = routeDateTimeValue(routeDate, routeStartTime);
  const routeEndDateTime = routeDateTimeValue(routeDate, routeEndTime);
  const eventStartDateTime = routeDateTimeValue(eventDate, eventStartTime);
  const eventEndDateTime = routeDateTimeValue(eventDate, eventEndTime);

  if (
    stopType === "delivery" &&
    routeEndDateTime != null &&
    eventStartDateTime != null
  ) {
    const bufferMinutes = Math.round(
      (eventStartDateTime - routeEndDateTime) / 60_000,
    );

    if (bufferMinutes < 0) {
      raise(
        "conflict",
        `Setup ends ${Math.abs(bufferMinutes)} min after event start.`,
      );
    } else if (bufferMinutes < 30) {
      raise(
        "warning",
        `Only ${bufferMinutes} min remain before the event starts.`,
      );
    }
  }

  if (
    stopType === "pickup" &&
    routeStartDateTime != null &&
    eventEndDateTime != null &&
    routeStartDateTime < eventEndDateTime
  ) {
    const earlyMinutes = Math.round(
      (eventEndDateTime - routeStartDateTime) / 60_000,
    );
    raise(
      "conflict",
      `Pickup starts ${earlyMinutes} min before the event ends.`,
    );
  }

  const sameDateClientWindows = clientWindows.filter(
    (window) =>
      String(window.date).slice(0, 10) === String(routeDate).slice(0, 10),
  );

  const effectiveWindows =
    sameDateClientWindows.length > 0
      ? sameDateClientWindows
      : bookingWindowStart && bookingWindowEnd
        ? [
            {
              date: String(routeDate).slice(0, 10),
              start_time: bookingWindowStart,
              end_time: bookingWindowEnd,
            },
          ]
        : [];

  if (effectiveWindows.length > 0) {
    const windowRanges = effectiveWindows
      .map((window) => ({
        start: minutesFromTime(window.start_time),
        end: minutesFromTime(window.end_time),
      }))
      .filter(
        (
          range,
        ): range is {
          start: number;
          end: number;
        } => range.start != null && range.end != null,
      );

    const matchingWindow = windowRanges.find(
      (window) => routeStart >= window.start && routeStart <= window.end,
    );

    if (!matchingWindow && windowRanges.length > 0) {
      const earliestStart = Math.min(
        ...windowRanges.map((window) => window.start),
      );
      const latestEnd = Math.max(...windowRanges.map((window) => window.end));

      if (routeStart < earliestStart) {
        raise(
          "warning",
          `Arrival is ${earliestStart - routeStart} min before the client window.`,
        );
      } else if (routeStart > latestEnd) {
        raise(
          "conflict",
          `Arrival is ${routeStart - latestEnd} min after the client window.`,
        );
      }
    } else if (matchingWindow) {
      const remaining = matchingWindow.end - routeStart;

      if (remaining < 15) {
        raise(
          "warning",
          `Arrival is only ${remaining} min before the client window closes.`,
        );
      }
    }
  }

  if (details.length === 0) {
    details.push("Route timing fits the available constraints.");
  }

  const labelByTone: Record<RouteTimingHealth["tone"], string> = {
    conflict: "Timing conflict",
    warning: "Check timing",
    ok: "Timing OK",
    neutral: "Timing not complete",
  };

  return {
    tone,
    label: labelByTone[tone],
    details,
  };
}

function routeTimingHealthClasses(tone: RouteTimingHealth["tone"]) {
  if (tone === "conflict") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (tone === "warning") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (tone === "ok") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  return "bg-slate-50 text-slate-600 ring-slate-200";
}

function statusTone(value: string | null | undefined) {
  if (["installed", "picked_up", "completed"].includes(String(value || ""))) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (["failed", "cancelled"].includes(String(value || ""))) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  if (["on_the_way", "arrived"].includes(String(value || ""))) {
    return "bg-blue-50 text-blue-700 ring-blue-200";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-[#efd582]";
}

function phoneUrl(phone: string | null | undefined) {
  const cleanPhone = String(phone || "").replace(/[^\d+]/g, "");
  return cleanPhone ? `tel:${cleanPhone}` : "";
}

function resolvedStopAddressParts(stop: RouteStop) {
  const booking = getOne(stop.bookings);

  return {
    address: stop.address || booking?.setup_address || null,
    city: stop.city || booking?.setup_city || null,
    state: stop.state || booking?.setup_state || null,
    zip: stop.zip || booking?.setup_zip || null,
  };
}

function resolvedStopAddress(stop: RouteStop) {
  const parts = resolvedStopAddressParts(stop);

  return [parts.address, parts.city, parts.state, parts.zip]
    .filter(Boolean)
    .join(", ");
}

function mapUrl(stop: RouteStop) {
  const address = resolvedStopAddress(stop);

  if (!address) return "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;
}

function googleRouteUrl(
  stops: RouteStop[],
  warehouseOriginAddress?: string | null,
) {
  const addresses = stops
    .map((stop) => resolvedStopAddress(stop))
    .filter(Boolean);
  const normalizedWarehouseOrigin = String(warehouseOriginAddress || "").trim();

  if (addresses.length === 0) return "";

  if (addresses.length === 1) {
    if (normalizedWarehouseOrigin) {
      const params = new URLSearchParams({
        api: "1",
        origin: normalizedWarehouseOrigin,
        destination: addresses[0],
        travelmode: "driving",
      });

      return `https://www.google.com/maps/dir/?${params.toString()}`;
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      addresses[0],
    )}`;
  }

  const origin = normalizedWarehouseOrigin || addresses[0];
  const destination = addresses[addresses.length - 1];
  const waypoints = (
    normalizedWarehouseOrigin ? addresses.slice(0, -1) : addresses.slice(1, -1)
  ).join("|");

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });

  if (waypoints) {
    params.set("waypoints", waypoints);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function driverColor(stop: RouteStop, drivers: Driver[]) {
  const name = String(stop.driver_name || "Unassigned");
  const driver = drivers.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );

  return driver?.color || "#8b8177";
}

function mainProductName(stop: RouteStop) {
  if (isBreakRouteStop(stop)) {
    const minutes = breakMinutesFromRouteStop(stop);
    return minutes ? `Break (${minutes} min)` : "Break";
  }

  const booking = getOne(stop.bookings);
  const bookingItems = booking?.booking_items || [];

  return bookingItemsProductSummary(
    bookingItems,
    stop.items_summary?.split("\n")[0] || "Route stop",
  );
}

function bookingEventTime(stop: RouteStop) {
  const booking = getOne(stop.bookings);

  if (!booking) return "No booking event time";

  return `${formatDate(booking.event_date)} · ${formatTime(
    booking.event_start_time,
  )} — ${formatTime(booking.event_end_time)}`;
}

function bookingStopByType(
  bookingId: string | null,
  stopType: string,
  bookingRouteStops: RouteStop[],
) {
  if (!bookingId) return null;

  const candidates = bookingRouteStops.filter(
    (item) => item.booking_id === bookingId && item.stop_type === stopType,
  );

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const updatedA = new Date(
      String(a.updated_at || a.created_at || 0),
    ).getTime();
    const updatedB = new Date(
      String(b.updated_at || b.created_at || 0),
    ).getTime();

    if (Number.isFinite(updatedA) && Number.isFinite(updatedB)) {
      if (updatedA !== updatedB) return updatedB - updatedA;
    }

    const sortA = Number(a.sort_order || 999999);
    const sortB = Number(b.sort_order || 999999);

    if (sortA !== sortB) return sortA - sortB;

    return String(a.id).localeCompare(String(b.id));
  })[0];
}

function bookingCustomer(stop: RouteStop) {
  const booking = getOne(stop.bookings);
  const customer = getOne(booking?.customers);

  return {
    name: customer?.full_name || stop.customer_name || "Customer",
    phone: customer?.phone || stop.customer_phone || "",
  };
}

function bookingAddress(stop: RouteStop) {
  const address = resolvedStopAddress(stop);
  return address || "No address";
}

function componentsForBooking(
  bookingId: string | null,
  checklistItems: ChecklistItem[],
) {
  if (!bookingId) return [];

  const items = checklistItems.filter(
    (item) => item.booking_id === bookingId && item.item_type !== "addon",
  );
  const grouped = new Map<string, ChecklistItem>();

  for (const item of items) {
    const normalizedTitle = cleanDetailText(item.title).toLowerCase();
    const key = normalizedTitle || String(item.id);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, { ...item });
      continue;
    }

    const existingQty = Number(existing.quantity || 0);
    const currentQty = Number(item.quantity || 0);

    if (Number.isFinite(existingQty) && Number.isFinite(currentQty)) {
      grouped.set(key, {
        ...existing,
        quantity: existingQty + currentQty,
      });
    }
  }

  return Array.from(grouped.values());
}

function optionsForBooking(
  bookingId: string | null,
  modifiers: BookingModifier[],
) {
  if (!bookingId) return [];
  return modifiers.filter((item) => item.booking_id === bookingId);
}

function cleanDetailText(value: string | null | undefined) {
  return String(value || "")
    .replace(/^(?:\[[^\]]+\])+\s*/g, "")
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\s+·\s+.*$/, "")
    .trim();
}

function formatChecklistItem(item: ChecklistItem) {
  const title = cleanDetailText(item.title) || "Component";
  const pieces = [title];

  if (item.quantity) {
    pieces.push(`x ${item.quantity}`);
  }

  return pieces.join(" ");
}

function formatModifierItem(item: BookingModifier) {
  const label =
    cleanDetailText(item.label) || cleanDetailText(item.notes) || "Option";
  const pieces = [label];

  if (item.quantity) {
    pieces.push(`x ${item.quantity}`);
  }

  return pieces.join(" ");
}

function normalizedOptionKey(value: string | null | undefined) {
  const strippedQty = cleanDetailText(value).replace(/\bx\s*\d+\b/gi, " ");

  return strippedQty
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionVariants(value: string | null | undefined) {
  const clean = cleanDetailText(value);

  if (!clean) return [];

  const parts = clean
    .split(":")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) return [clean];

  return [clean, ...parts];
}

function componentIsCoveredByOption(
  item: ChecklistItem,
  options: BookingModifier[],
) {
  const componentKeys = [
    normalizedOptionKey(item.title),
    normalizedOptionKey(
      cleanDetailText(item.title).replace(/\bballs?\b/gi, ""),
    ),
  ].filter(Boolean);

  if (componentKeys.length === 0) return false;

  const optionKeys = options
    .flatMap((option) => optionVariants(option.label || option.notes))
    .map((variant) => normalizedOptionKey(variant))
    .filter(Boolean);

  if (optionKeys.length === 0) return false;

  return componentKeys.some((componentKey) =>
    optionKeys.some(
      (optionKey) =>
        optionKey.includes(componentKey) || componentKey.includes(optionKey),
    ),
  );
}

function normalizedTitleKey(value: string | null | undefined) {
  return cleanDetailText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function WindowEditor({
  name,
  label,
  initialValue,
}: {
  name: string;
  label: string;
  initialValue: RouteWindow[];
}) {
  const [windows, setWindows] = useState<RouteWindow[]>(
    initialValue.length > 0
      ? initialValue
      : [{ date: "", start_time: "", end_time: "" }],
  );

  function updateWindow(index: number, key: keyof RouteWindow, value: string) {
    setWindows((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  function addWindow() {
    setWindows((current) => [
      ...current,
      { date: "", start_time: "", end_time: "" },
    ]);
  }

  function removeWindow(index: number) {
    setWindows((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  return (
    <div className="rounded-[24px] bg-white p-5 ring-1 ring-[#eee5d9]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[#1f1e1b]">{label}</div>
        <button
          type="button"
          onClick={addWindow}
          className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold text-[#6c6258] hover:bg-[#eadfce]"
        >
          + Add period
        </button>
      </div>

      <input type="hidden" name={name} value={JSON.stringify(windows)} />

      <div className="mt-4 space-y-3">
        {windows.map((window, index) => (
          <div
            key={`${name}-${index}`}
            className="rounded-2xl bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9]"
          >
            <div className="grid gap-2 md:grid-cols-[1fr_120px_120px_auto]">
              <input
                type="date"
                value={window.date}
                onChange={(event) =>
                  updateWindow(index, "date", event.target.value)
                }
                className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
              />
              <input
                type="time"
                value={window.start_time}
                onChange={(event) =>
                  updateWindow(index, "start_time", event.target.value)
                }
                className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
              />
              <input
                type="time"
                value={window.end_time}
                onChange={(event) =>
                  updateWindow(index, "end_time", event.target.value)
                }
                className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
              />
              <button
                type="button"
                onClick={() => removeWindow(index)}
                className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Remove
              </button>
            </div>

            <div className="mt-2 text-xs text-[#8b8177]">
              {window.date && window.start_time && window.end_time
                ? formatWindow(window)
                : "Fill date and time for this period."}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortableStopCard({
  stop,
  sequenceNumber,
  numberTone,
  liveTimingByStopId,
  onTimingDraftChange,
  driverDraftByStopId,
  onDriverDraftChange,
  drivers,
  checklistItems,
  modifiers,
  selectedDate,
  bookingRouteStops,
  supportsRouteStopWindows,
}: {
  stop: RouteStop;
  sequenceNumber: number | null;
  numberTone: "delivery" | "pickup" | "other";
  liveTimingByStopId: Map<string, LiveTiming>;
  onTimingDraftChange: (stopId: string, draft: TimingDraft) => void;
  driverDraftByStopId: Record<string, string>;
  onDriverDraftChange: (stopId: string, driverName: string) => void;
  drivers: Driver[];
  checklistItems: ChecklistItem[];
  modifiers: BookingModifier[];
  selectedDate: string;
  bookingRouteStops: RouteStop[];
  supportsRouteStopWindows: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: stop.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: "relative" as const,
    zIndex: isDragging ? 50 : "auto",
  };

  const color = driverColor(stop, drivers);
  const customer = bookingCustomer(stop);
  const phone = phoneUrl(customer.phone);
  const url = mapUrl(stop);
  const components = componentsForBooking(stop.booking_id, checklistItems);
  const options = optionsForBooking(stop.booking_id, modifiers);
  const currentRouteStop =
    bookingStopByType(
      stop.booking_id,
      String(stop.stop_type || ""),
      bookingRouteStops,
    ) || stop;

  const deliveryStop =
    bookingStopByType(stop.booking_id, "delivery", bookingRouteStops) ||
    currentRouteStop;

  const pickupStop =
    bookingStopByType(stop.booking_id, "pickup", bookingRouteStops) ||
    (currentRouteStop.stop_type === "pickup" ? currentRouteStop : null);

  const deliveryWindows = parseWindows(
    (deliveryStop as any).client_delivery_windows,
  );
  const pickupWindows = parseWindows(
    (pickupStop as any)?.client_pickup_windows,
  );
  const booking = getOne(stop.bookings);
  const bookingItems = Array.isArray(booking?.booking_items)
    ? booking.booking_items
    : [];
  const routeDurations = bookingRouteDurations(stop, bookingItems);
  const setupDurationMin = routeDurations.setupMinutes;
  const teardownDurationMin = routeDurations.teardownMinutes;
  const liveCurrentTiming =
    liveTimingByStopId.get(stop.id) ||
    liveTimingByStopId.get(currentRouteStop.id);
  const liveTimingForBookingStopType = (
    stopType: "delivery" | "pickup",
    preferredStop: RouteStop | null | undefined,
  ) => {
    const candidates = [
      preferredStop,
      currentRouteStop,
      ...bookingRouteStops,
    ].filter(
      (candidate): candidate is RouteStop =>
        Boolean(candidate) &&
        candidate.booking_id === stop.booking_id &&
        candidate.stop_type === stopType,
    );

    for (const candidate of candidates) {
      const liveTiming = liveTimingByStopId.get(candidate.id);
      if (liveTiming) return liveTiming;
    }

    return undefined;
  };

  // A booking can have its delivery and pickup rendered on different date boards.
  // Read the live draft by booking + stop type, not only by one selected row id.
  // This also keeps older duplicate route_stop rows visually synchronized.
  const liveDeliveryTiming = liveTimingForBookingStopType(
    "delivery",
    deliveryStop,
  );
  const livePickupTiming = liveTimingForBookingStopType("pickup", pickupStop);

  const bookingDeliveryStart = timeFromAny(
    (booking as any)?.delivery_window_start,
  );
  const bookingDeliveryEnd = timeFromAny((booking as any)?.delivery_window_end);
  const bookingPickupStart = timeFromAny((booking as any)?.pickup_window_start);
  const bookingPickupEnd = timeFromAny((booking as any)?.pickup_window_end);

  const initialDeliveryDate =
    liveDeliveryTiming?.date ||
    deliveryStop.stop_date ||
    (booking as any)?.delivery_date ||
    selectedDate;
  const initialDeliveryStart =
    liveDeliveryTiming?.startTime ||
    timeValue(deliveryStop.scheduled_start_time) ||
    bookingDeliveryStart;
  const deliveryStopLocked = Boolean(deliveryStop.time_locked);
  const initialDeliveryEnd =
    liveDeliveryTiming?.endTime ||
    (deliveryStopLocked
      ? timeValue(deliveryStop.scheduled_end_time) || bookingDeliveryEnd
      : addMinutesToTime(
          initialDeliveryStart,
          breakMinutesFromRouteStop(stop) || setupDurationMin,
        ) ||
        timeValue(deliveryStop.scheduled_end_time) ||
        bookingDeliveryEnd) ||
    addMinutesToTime(
      initialDeliveryStart,
      breakMinutesFromRouteStop(stop) || setupDurationMin,
    );

  const initialPickupDate =
    livePickupTiming?.date ||
    pickupStop?.stop_date ||
    (booking as any)?.pickup_date ||
    selectedDate;
  const initialPickupStart =
    livePickupTiming?.startTime ||
    timeValue(pickupStop?.scheduled_start_time) ||
    bookingPickupStart;
  const pickupStopLocked = Boolean(pickupStop?.time_locked);
  const initialPickupEnd =
    livePickupTiming?.endTime ||
    (pickupStopLocked
      ? timeValue(pickupStop?.scheduled_end_time) || bookingPickupEnd
      : addMinutesToTime(initialPickupStart, teardownDurationMin) ||
        timeValue(pickupStop?.scheduled_end_time) ||
        bookingPickupEnd) ||
    addMinutesToTime(initialPickupStart, teardownDurationMin);

  const [deliveryDate, setDeliveryDate] = useState(initialDeliveryDate);
  const [deliveryStartTime, setDeliveryStartTime] =
    useState(initialDeliveryStart);
  const [deliveryEndTime, setDeliveryEndTime] = useState(initialDeliveryEnd);
  const [pickupDate, setPickupDate] = useState(initialPickupDate);
  const [pickupStartTime, setPickupStartTime] = useState(initialPickupStart);
  const [pickupEndTime, setPickupEndTime] = useState(initialPickupEnd);
  const initialDeliveryDriver =
    deliveryStop.driver_name || stop.driver_name || "";
  const initialPickupDriver =
    pickupStop?.driver_name || initialDeliveryDriver;
  const router = useRouter();
  const [deliveryDriverName, setDeliveryDriverName] = useState(
    initialDeliveryDriver,
  );
  const [pickupDriverName, setPickupDriverName] = useState(initialPickupDriver);
  const [isDriverSaving, startDriverSaveTransition] = useTransition();
  const [driverSaveMessage, setDriverSaveMessage] = useState("");

  const saveDriverImmediately = useCallback(
  (
    stopId: string | null | undefined,
    driverName: string,
    rollback?: () => void,
  ) => {
    if (!stopId) return;

    setDriverSaveMessage("");

    startDriverSaveTransition(async () => {
      try {
        const data = new FormData();

        data.set("stopId", stopId);
        data.set("driverName", driverName);

        await updateRouteStopDriverAction(data);

        router.refresh();
        setDriverSaveMessage("Saved");
      } catch (error) {
        rollback?.();
        router.refresh();

        setDriverSaveMessage(
          error instanceof Error
            ? error.message
            : "Driver was not saved.",
        );
      }
    });
  },
  [router],
);

  useEffect(() => {
    setDeliveryDriverName(deliveryStop.driver_name || "");
  }, [deliveryStop.id, deliveryStop.driver_name]);

  useEffect(() => {
    setPickupDriverName(
      pickupStop?.driver_name || deliveryStop.driver_name || "",
    );
  }, [pickupStop?.id, pickupStop?.driver_name, deliveryStop.driver_name]);

  useEffect(() => {
    const sharedDeliveryDriver = driverDraftByStopId[deliveryStop.id];

    if (sharedDeliveryDriver !== undefined) {
      setDeliveryDriverName(sharedDeliveryDriver);
    }
  }, [deliveryStop.id, driverDraftByStopId]);

  useEffect(() => {
    if (!pickupStop) return;

    const sharedPickupDriver = driverDraftByStopId[pickupStop.id];

    if (sharedPickupDriver !== undefined) {
      setPickupDriverName(sharedPickupDriver);
    }
  }, [pickupStop?.id, driverDraftByStopId]);

  useEffect(() => {
    if (liveDeliveryTiming) return;
    const nextDeliveryStart =
      timeValue(deliveryStop.scheduled_start_time) || bookingDeliveryStart;
    setDeliveryDate(
      deliveryStop.stop_date || (booking as any)?.delivery_date || selectedDate,
    );
    setDeliveryStartTime(nextDeliveryStart);
    setDeliveryEndTime(
      deliveryStop.time_locked
        ? timeValue(deliveryStop.scheduled_end_time) ||
            bookingDeliveryEnd ||
            addMinutesToTime(
              nextDeliveryStart,
              breakMinutesFromRouteStop(stop) || setupDurationMin,
            )
        : addMinutesToTime(
            nextDeliveryStart,
            breakMinutesFromRouteStop(stop) || setupDurationMin,
          ) ||
            timeValue(deliveryStop.scheduled_end_time) ||
            bookingDeliveryEnd,
    );
  }, [
    deliveryStop.id,
    deliveryStop.stop_date,
    deliveryStop.scheduled_start_time,
    deliveryStop.scheduled_end_time,
    liveDeliveryTiming,
  ]);

  useEffect(() => {
    if (livePickupTiming || !pickupStop) return;
    const nextPickupStart =
      timeValue(pickupStop.scheduled_start_time) || bookingPickupStart;
    setPickupDate(
      pickupStop.stop_date || (booking as any)?.pickup_date || selectedDate,
    );
    setPickupStartTime(nextPickupStart);
    setPickupEndTime(
      pickupStop.time_locked
        ? timeValue(pickupStop.scheduled_end_time) ||
            bookingPickupEnd ||
            addMinutesToTime(nextPickupStart, teardownDurationMin)
        : addMinutesToTime(nextPickupStart, teardownDurationMin) ||
            timeValue(pickupStop.scheduled_end_time) ||
            bookingPickupEnd,
    );
  }, [
    pickupStop?.id,
    pickupStop?.stop_date,
    pickupStop?.scheduled_start_time,
    pickupStop?.scheduled_end_time,
    livePickupTiming,
  ]);

  const [deliveryTimeLocked, setDeliveryTimeLocked] = useState(
    Boolean(deliveryStop.time_locked),
  );
  const [pickupTimeLocked, setPickupTimeLocked] = useState(
    Boolean(pickupStop?.time_locked),
  );

  useEffect(() => {
    if (!liveDeliveryTiming) return;

    setDeliveryDate(liveDeliveryTiming.date || deliveryDate);
    setDeliveryStartTime(liveDeliveryTiming.startTime || deliveryStartTime);
    setDeliveryEndTime(liveDeliveryTiming.endTime || deliveryEndTime);
  }, [
    liveDeliveryTiming?.date,
    liveDeliveryTiming?.startTime,
    liveDeliveryTiming?.endTime,
  ]);

  useEffect(() => {
    if (!livePickupTiming) return;

    setPickupDate(livePickupTiming.date || pickupDate);
    setPickupStartTime(livePickupTiming.startTime || pickupStartTime);
    setPickupEndTime(livePickupTiming.endTime || pickupEndTime);
  }, [
    livePickupTiming?.date,
    livePickupTiming?.startTime,
    livePickupTiming?.endTime,
  ]);

  const isBreakCard = isBreakRouteStop(stop);
  const breakMinutes = breakMinutesFromRouteStop(stop);
  const [breakEditStopType, setBreakEditStopType] = useState<
    "delivery" | "pickup"
  >(stop.stop_type === "pickup" ? "pickup" : "delivery");
  const [breakEditMinutes, setBreakEditMinutes] = useState(
    String(breakMinutes || setupDurationMin || 30),
  );

  useEffect(() => {
    setBreakEditStopType(stop.stop_type === "pickup" ? "pickup" : "delivery");
    setBreakEditMinutes(String(breakMinutes || setupDurationMin || 30));
  }, [stop.id, stop.stop_type, breakMinutes, setupDurationMin]);

  const parsedBreakEditMinutes = Number(breakEditMinutes || 0);

const effectiveDeliveryDurationMin =
  isBreakCard &&
  Number.isFinite(parsedBreakEditMinutes) &&
  parsedBreakEditMinutes > 0
    ? parsedBreakEditMinutes
    : setupDurationMin;
  const isDeliveryCard = stop.stop_type === "delivery";
  const isPickupCard = stop.stop_type === "pickup";
  const showDeliverySaved = isDeliveryCard;
  const showPickupSaved = isPickupCard;
  const mainProductKey = normalizedTitleKey(mainProductName(stop));
  const visibleComponents = components.filter((item) => {
    if (normalizedTitleKey(item.title) === mainProductKey) return false;

    return !componentIsCoveredByOption(item, options);
  });

  const typeColorClass = isBreakCard
    ? "text-[#9a7a49]"
    : isDeliveryCard
      ? "text-[#b47316]"
      : isPickupCard
        ? "text-[#2f6fa3]"
        : "text-[#9a7a49]";

  const numberClass =
    numberTone === "delivery"
      ? "bg-emerald-600"
      : numberTone === "pickup"
        ? "bg-red-600"
        : "bg-[#23313f]";

  const bookingMarkerColor =
    !isBreakCard && booking
      ? getBookingMarkerColor(booking, options as any[])
      : null;

  return (
    <article
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: "#ffffff",
        borderColor: "rgba(0,0,0,0.05)",
      }}
      className={[
        "w-full min-w-0 max-w-full overflow-hidden rounded-[22px] border shadow-[0_10px_28px_rgba(0,0,0,0.04)] sm:rounded-[28px] sm:shadow-[0_12px_35px_rgba(0,0,0,0.04)]",
        isDragging ? "opacity-70 ring-2 ring-[#c9964f]" : "",
      ].join(" ")}
    >
      <div
        className="grid w-full min-w-0 max-w-full gap-3 border-l-[6px] px-3 py-3 sm:border-l-[8px] sm:px-5 lg:grid-cols-[86px_1fr_220px]"
        style={{ borderLeftColor: bookingMarkerColor || color }}
      >
        <div
          {...attributes}
          {...listeners}
          className="flex cursor-grab select-none items-center gap-3 touch-none lg:block active:cursor-grabbing"
          style={{ touchAction: "none" }}
          title="Drag to reorder"
        >
          {isBreakCard ? (
            <button
              type="button"
              className="pointer-events-none rounded-xl bg-[#9a7a49] px-2.5 py-1.5 text-xs font-semibold text-white sm:rounded-2xl sm:px-3 sm:py-2 sm:text-sm"
            >
              Break
            </button>
          ) : (
            <button
              type="button"
              className={[
                "pointer-events-none rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white sm:rounded-2xl sm:px-3 sm:py-2 sm:text-sm",
                numberClass,
              ].join(" ")}
            >
              #{sequenceNumber}
            </button>
          )}

          <div className="mt-0 min-w-0 lg:mt-2">
            <div
              className={[
                "text-[10px] font-semibold uppercase tracking-[0.14em] sm:text-xs",
                typeColorClass,
              ].join(" ")}
            >
              {isBreakCard ? "Break" : stopTypeLabel(stop.stop_type)}
            </div>
            <div
              className={[
                "mt-0.5 whitespace-nowrap text-2xl font-bold leading-none tracking-tight tabular-nums sm:text-[26px] lg:text-xl",
                typeColorClass,
              ].join(" ")}
            >
              {formatTime(
                liveCurrentTiming?.startTime ||
                  timeValue(stop.scheduled_start_time) ||
                  currentRouteStop.scheduled_start_time,
              )}
            </div>
          </div>
        </div>

        <div className="min-w-0 max-w-full">
          <div className="flex min-w-0 max-w-full flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div className="flex min-w-0 max-w-full flex-col items-start gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
              <h3 className="min-w-0 max-w-full break-words text-base font-semibold text-[#3e3a35]">
  <span className="hidden sm:inline">🏰 </span>{mainProductName(stop)}
</h3>

              <form
                action={quickUpdateRouteStopStatusAction}
                className="inline-flex max-w-full shrink-0 self-start"
              >
                <input type="hidden" name="stopId" value={stop.id} />
                <input type="hidden" name="stopDate" value={selectedDate} />
                <select
                  name="status"
                  defaultValue={stop.status || "scheduled"}
                  onChange={(event) =>
                    event.currentTarget.form?.requestSubmit()
                  }
                  className={[
                    "appearance-none rounded-full px-2.5 py-0.5 text-xs font-semibold outline-none ring-1",
                    statusTone(stop.status),
                  ].join(" ")}
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </form>
            </div>

            {(showDeliverySaved || showPickupSaved) && (
              <div
                className={[
                  "w-full min-w-0 max-w-full overflow-hidden rounded-2xl px-3 py-1 ring-1 md:w-[calc(50%-0.25rem)]",
                  showDeliverySaved
                    ? "bg-[#fff7eb] ring-[#f0d8b2]"
                    : "bg-[#edf6ff] ring-[#c9ddf3]",
                ].join(" ")}
              >
                <div
                  className={[
                    "text-[11px] font-semibold uppercase tracking-[0.14em]",
                    showDeliverySaved ? "text-[#b47316]" : "text-[#2f6fa3]",
                  ].join(" ")}
                >
                  {showDeliverySaved ? "Delivery route" : "Pickup route"}
                </div>
                <div
                  className={[
                    "mt-0 text-sm font-semibold leading-4",
                    showDeliverySaved ? "text-[#b47316]" : "text-[#2f6fa3]",
                  ].join(" ")}
                >
                  {showDeliverySaved
                    ? routeTimingSummary(
                        liveCurrentTiming?.date ||
                          stop.stop_date ||
                          selectedDate,
                        liveCurrentTiming?.startTime ||
                          timeValue(stop.scheduled_start_time) ||
                          deliveryStartTime,
                        liveCurrentTiming?.endTime ||
                          timeValue(stop.scheduled_end_time) ||
                          deliveryEndTime,
                      )
                    : routeTimingSummary(
                        liveCurrentTiming?.date ||
                          stop.stop_date ||
                          selectedDate,
                        liveCurrentTiming?.startTime ||
                          timeValue(stop.scheduled_start_time) ||
                          pickupStartTime,
                        liveCurrentTiming?.endTime ||
                          timeValue(stop.scheduled_end_time) ||
                          pickupEndTime,
                      )}
                </div>
                {showPickupSaved && !pickupStop && (
                  <div className="mt-0 text-xs font-medium leading-4 text-[#4b83b1]">
                    No pickup stop yet. Showing booking timing.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-0.5 text-sm leading-4 text-[#8a8177]">
            <span className="sm:hidden">{bookingEventTime(stop)}</span><span className="hidden sm:inline">🕒 Event {bookingEventTime(stop)}</span>
          </div>

          <div className="mt-1 truncate text-lg font-bold leading-6 tracking-tight text-[#1b1b1b] sm:text-xl">
            {customer.name}
          </div>

          {isBreakCard && breakMinutes && (
            <div className="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Break duration: {breakMinutes} min
            </div>
          )}

          {!isBreakCard && (
            <div className="mt-0.5 flex w-full min-w-0 max-w-full items-center gap-2 overflow-hidden text-sm leading-5 text-[#6c6258] sm:flex-wrap">
              {phone ? (
                <a href={phone} className="inline-flex min-h-9 items-center justify-center rounded-full bg-[#eaf2f8] px-3 text-xs font-bold text-[#2d6d8b] sm:min-h-0 sm:bg-transparent sm:px-0 sm:text-sm sm:font-medium">
                  <span className="sm:hidden">Call</span>
                  <span className="hidden sm:inline">{customer.phone}</span>
                </a>
              ) : (
                <span>No phone</span>
              )}

              <span className="hidden sm:inline">·</span>

              <span className="block max-w-full min-w-0 flex-1 truncate text-xs font-medium text-[#7a736c] sm:whitespace-normal sm:text-sm sm:font-normal sm:text-[#8c857d]">{bookingAddress(stop)}</span>
            </div>
          )}

          <div className="mt-2 grid w-full min-w-0 max-w-full grid-cols-[repeat(3,minmax(0,1fr))] gap-2 overflow-hidden sm:mt-1.5 sm:flex sm:flex-wrap sm:overflow-visible">
            {isBreakCard && (
              <form
                action={deleteRouteStopAction}
                onSubmit={(event) => {
                  if (!window.confirm("Delete this break module?")) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="stopId" value={stop.id} />
                <input type="hidden" name="stopDate" value={selectedDate} />

                <button
                  type="submit"
                  className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Delete break
                </button>
              </form>
            )}

            {!isBreakCard && url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 min-w-0 w-full items-center justify-center rounded-xl bg-[#c9964f] px-2 py-2 text-xs font-semibold text-white sm:min-h-0 sm:w-auto sm:rounded-full sm:px-4"
              >
                Maps
              </a>
            )}

            {!isBreakCard && stop.booking_id && (
              <>
                <a
                  href={`/admin/bookings/${stop.booking_id}`}
                  className="inline-flex min-h-10 min-w-0 w-full items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2 py-2 text-xs font-semibold text-[#2b2a28] sm:min-h-0 sm:w-auto sm:rounded-full sm:px-4"
                >
                  <span className="sm:hidden">Open</span>
                  <span className="hidden sm:inline">Booking</span>
                </a>

                <a
                  href={`/admin/bookings/${stop.booking_id}/photos`}
                  className="inline-flex min-h-10 min-w-0 w-full items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2 py-2 text-xs font-semibold text-[#2b2a28] sm:min-h-0 sm:w-auto sm:rounded-full sm:px-4"
                >
                  Photos
                </a>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="min-w-0 rounded-xl bg-[#fcfaf7] p-2.5 ring-1 ring-[#eee5d9] sm:min-w-[150px] sm:rounded-2xl sm:p-4">
            <div className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49] sm:block">
              Driver
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-semibold text-[#1f1e1b]">
                {stop.driver_name || "Unassigned"}
              </span>
            </div>

            <div className="mt-1 hidden text-xs text-[#8b8177] sm:block">
              {stop.truck_name || "No truck"}
            </div>

            {Number(stop.balance_due || 0) > 0 && (
              <div className="mt-2 inline-flex rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-100 sm:mt-3 sm:block sm:rounded-xl sm:px-3 sm:py-2 sm:font-semibold">
                Collect: {money(stop.balance_due)}
              </div>
            )}
          </div>
        </div>
      </div>

      <details className="group border-t border-[#eee5d9]">
        <summary className="cursor-pointer bg-[#fcfaf7] px-3 py-2.5 text-sm font-semibold text-[#23313f] hover:bg-[#f7f1e8] sm:px-5 sm:py-3">
          <span className="sm:hidden">Details</span>
          <span className="hidden sm:inline">Details / edit route info</span>
        </summary>

        <div className="grid min-w-0 gap-3 bg-[#fcfaf7] p-2.5 pb-28 sm:gap-5 sm:p-5 sm:pb-5 xl:grid-cols-[1fr_360px]">
          <form
            action={updateRouteStopCompactAction}
            className="grid min-w-0 gap-3 rounded-[18px] bg-white p-3 ring-1 ring-[#eee5d9] sm:gap-4 sm:rounded-[24px] sm:p-5 md:grid-cols-2"
          >
            <input
              type="hidden"
              name="deliveryStopId"
              value={deliveryStop.id}
            />
            {pickupStop ? (
              <input type="hidden" name="pickupStopId" value={pickupStop.id} />
            ) : null}

            <div className="min-w-0 rounded-[18px] bg-[#fcfaf7] p-3 ring-1 ring-[#eee5d9] sm:rounded-[24px] sm:p-4 md:col-span-2">
              <div className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7a49]">
                    Route timing
                  </div>
                  <div className="mt-1 hidden text-sm text-[#6c6258] sm:block">
                    Route timing is separate from the booking event.
                  </div>
                </div>
                <div className="max-w-full break-words text-left text-[10px] font-semibold uppercase leading-4 tracking-[0.08em] text-[#9a7a49] sm:shrink-0 sm:text-right sm:text-xs sm:tracking-[0.12em]">
                  Event: {bookingEventTime(stop)}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:mt-4 sm:gap-4 lg:grid-cols-2">
                <label className="block min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b47316] sm:text-xs sm:tracking-[0.12em]">
                    Delivery driver
                  </span>
                  <select
                    name="deliveryDriverName"
                    value={deliveryDriverName}
                    onChange={(event) => {
  const nextDriver = event.target.value;
  const previousDriver = deliveryDriverName;

  setDeliveryDriverName(nextDriver);
  onDriverDraftChange(deliveryStop.id, nextDriver);

  saveDriverImmediately(
    deliveryStop.id,
    nextDriver,
    () => {
      setDeliveryDriverName(previousDriver);
      onDriverDraftChange(deliveryStop.id, previousDriver);
    },
  );
}}
                    className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-2.5 py-2.5 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
                  >
                    <option value="">Unassigned</option>
                    {drivers
                      .filter((driver) => driver.name !== "Unassigned")
                      .map((driver) => (
                        <option key={driver.id} value={driver.name}>
                          {driver.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="block min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#2f6fa3] sm:text-xs sm:tracking-[0.12em]">
                    Pickup driver
                  </span>
                  <select
                    name="pickupDriverName"
                    value={pickupDriverName}
                    disabled={!pickupStop}
                    onChange={(event) => {
  const nextDriver = event.target.value;
  const previousDriver = pickupDriverName;

  setPickupDriverName(nextDriver);

  if (pickupStop?.id) {
    onDriverDraftChange(pickupStop.id, nextDriver);
  }

  saveDriverImmediately(
    pickupStop?.id,
    nextDriver,
    () => {
      setPickupDriverName(previousDriver);

      if (pickupStop?.id) {
        onDriverDraftChange(pickupStop.id, previousDriver);
      }
    },
  );
}}
                    className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-2.5 py-2.5 text-xs outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] disabled:cursor-not-allowed disabled:bg-[#f2eee8] disabled:text-[#9a9188] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
                  >
                    <option value="">Unassigned</option>
                    {drivers
                      .filter((driver) => driver.name !== "Unassigned")
                      .map((driver) => (
                        <option key={driver.id} value={driver.name}>
                          {driver.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="mt-1 min-h-4 text-right text-[11px] font-medium text-[#6c6258] sm:mt-2 sm:min-h-5 sm:text-xs">
                {isDriverSaving ? "Saving driver…" : driverSaveMessage}
              </div>

              <div className="mt-3 grid gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-2">
                <div className="min-w-0 rounded-xl bg-[#fffaf2] p-3 ring-1 ring-[#f3e2c7] sm:rounded-2xl sm:p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b47316]">
                    Delivery route
                  </div>
                  <div className="mt-1 hidden text-sm text-[#6c6258] sm:block">
                    {isBreakCard
                      ? `Break timing. End = start + break min (${effectiveDeliveryDurationMin}m).`
                      : `Delivery timing is for route planning only. End = start + setup min (${setupDurationMin}m).`}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:mt-4 sm:gap-3 xl:grid-cols-2">
                    {isBreakCard && (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#b47316]">
                            Break route type
                          </span>
                          <select
                            name="breakStopType"
                            value={breakEditStopType}
                            onChange={(event) =>
                              setBreakEditStopType(
                                event.target.value === "pickup"
                                  ? "pickup"
                                  : "delivery",
                              )
                            }
                            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#b47316] focus:ring-2 focus:ring-[#f7e2bf]"
                          >
                            <option value="delivery">Delivery route</option>
                            <option value="pickup">Pickup route</option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#b47316]">
                            Break minutes
                          </span>
                          <input
                            name="breakMinutes"
                            type="number"
                            min={5}
                            max={720}
                            step={5}
                            value={breakEditMinutes}
                            onChange={(event) => {
                              const nextMinutes = event.target.value;
                              const parsedMinutes = Number(nextMinutes || 0);
                              setBreakEditMinutes(nextMinutes);

                              if (
                                Number.isFinite(parsedMinutes) &&
                                parsedMinutes > 0
                              ) {
                                const nextEnd = addMinutesToTime(
                                  deliveryStartTime,
                                  parsedMinutes,
                                );
                                setDeliveryEndTime(nextEnd);
                                onTimingDraftChange(deliveryStop.id, {
                                  endTime: nextEnd,
                                });
                              }
                            }}
                            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#b47316] focus:ring-2 focus:ring-[#f7e2bf]"
                          />
                        </label>
                      </>
                    )}

                    <label className="block min-w-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b47316] sm:text-xs sm:tracking-[0.12em]">
                        Delivery date
                      </span>
                      <input
                        name="deliveryStopDate"
                        type="date"
                        value={deliveryDate}
                        onChange={(event) => {
                          const nextDate = event.target.value;
                          setDeliveryDate(nextDate);
                          onTimingDraftChange(deliveryStop.id, {
                            date: nextDate,
                          });
                        }}
                        className="block w-full max-w-[360px] xl:max-w-none max-w-full min-w-0 rounded-xl xl:rounded-2xl border border-[#d8cec0] bg-white px-4 py-2.5 xl:py-3 text-sm outline-none focus:border-[#b47316] focus:ring-2 focus:ring-[#f7e2bf]"
                      />
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b47316] sm:text-xs sm:tracking-[0.12em]">
                        Delivery start
                      </span>
                      <input
                        name="deliveryScheduledStartTime"
                        type="time"
                        value={deliveryStartTime}
                        onChange={(event) => {
                          const nextStart = event.target.value;
                          const nextEnd = addMinutesToTime(
                            nextStart,
                            effectiveDeliveryDurationMin,
                          );
                          setDeliveryStartTime(nextStart);
                          setDeliveryEndTime(nextEnd);
                          onTimingDraftChange(deliveryStop.id, {
                            startTime: nextStart,
                            endTime: nextEnd,
                          });
                        }}
                        className="block w-full max-w-[360px] xl:max-w-none max-w-full min-w-0 rounded-xl xl:rounded-2xl border border-[#d8cec0] bg-white px-4 py-2.5 xl:py-3 text-sm font-semibold text-[#b47316] outline-none focus:border-[#b47316] focus:ring-2 focus:ring-[#f7e2bf]"
                      />
                    </label>

                    <label className="block min-w-0 xl:col-span-2">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b47316] sm:text-xs sm:tracking-[0.12em]">
                        Delivery end
                      </span>
                      <input
                        name="deliveryScheduledEndTime"
                        type="time"
                        value={deliveryEndTime}
                        readOnly={isBreakCard || !deliveryTimeLocked}
                        onChange={(event) => {
                          const nextEnd = event.target.value;
                          setDeliveryEndTime(nextEnd);
                          onTimingDraftChange(deliveryStop.id, {
                            endTime: nextEnd,
                          });
                        }}
                        className="block w-full max-w-[360px] xl:max-w-none max-w-full min-w-0 rounded-xl xl:rounded-2xl border border-[#d8cec0] bg-white px-4 py-2.5 xl:py-3 text-sm font-semibold text-[#b47316] outline-none focus:border-[#b47316] focus:ring-2 focus:ring-[#f7e2bf]"
                      />
                    </label>
                  </div>

                  <label className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 sm:mt-4 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
                    <input
                      type="checkbox"
                      name="deliveryTimeLocked"
                      checked={deliveryTimeLocked}
                      onChange={(event) => {
  const locked = event.target.checked;
  setDeliveryTimeLocked(locked);

  if (!locked) {
    const nextEnd = addMinutesToTime(
      deliveryStartTime,
      effectiveDeliveryDurationMin,
    );

    setDeliveryEndTime(nextEnd);

    onTimingDraftChange(deliveryStop.id, {
      locked,
      endTime: nextEnd,
    });
  } else {
    onTimingDraftChange(deliveryStop.id, { locked });
  }
}}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-amber-900">
                        Fixed delivery time
                      </span>
                      <span className="mt-1 hidden text-xs text-amber-800 sm:block">
                        Keep this exact time during route recalculation. Later stops
                        will be recalculated after this stop.
                      </span>
                    </span>
                  </label>

                  {supportsRouteStopWindows && (
                    <div className="mt-4">
                      <WindowEditor
                        name="clientDeliveryWindows"
                        label="Client delivery windows"
                        initialValue={deliveryWindows}
                      />
                    </div>
                  )}
                </div>

                <div className="min-w-0 rounded-xl bg-[#f3f8fe] p-3 ring-1 ring-[#d9e7f5] sm:rounded-2xl sm:p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#2f6fa3]">
                    Pickup route
                  </div>
                  <div className="mt-1 hidden text-sm text-[#6c6258] sm:block">
                    Pickup timing is also separate from the booking event. End =
                    start + teardown min ({teardownDurationMin}m).
                  </div>

                  {pickupStop ? (
                    <>
                      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:mt-4 sm:gap-3 xl:grid-cols-2">
                        <label className="block min-w-0">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#2f6fa3]">
                            Pickup date
                          </span>
                          <input
                            name="pickupStopDate"
                            type="date"
                            value={pickupDate}
                            onChange={(event) => {
                              const nextDate = event.target.value;
                              setPickupDate(nextDate);

                              if (pickupStop) {
                                onTimingDraftChange(pickupStop.id, {
                                  date: nextDate,
                                });
                              }
                            }}
                            className="block w-full max-w-[360px] xl:max-w-none max-w-full min-w-0 rounded-xl xl:rounded-2xl border border-[#d8cec0] bg-white px-4 py-2.5 xl:py-3 text-sm outline-none focus:border-[#2f6fa3] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </label>

                        <label className="block min-w-0">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#2f6fa3] sm:text-xs sm:tracking-[0.12em]">
                            Pickup start
                          </span>
                          <input
                            name="pickupScheduledStartTime"
                            type="time"
                            value={pickupStartTime}
                            onChange={(event) => {
                              const nextStart = event.target.value;
                              const nextEnd = addMinutesToTime(
                                nextStart,
                                teardownDurationMin,
                              );
                              setPickupStartTime(nextStart);
                              setPickupEndTime(nextEnd);

                              if (pickupStop) {
                                onTimingDraftChange(pickupStop.id, {
                                  startTime: nextStart,
                                  endTime: nextEnd,
                                });
                              }
                            }}
                            className="block w-full max-w-[360px] xl:max-w-none max-w-full min-w-0 rounded-xl xl:rounded-2xl border border-[#d8cec0] bg-white px-4 py-2.5 xl:py-3 text-sm font-semibold text-[#2f6fa3] outline-none focus:border-[#2f6fa3] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </label>

                        <label className="block min-w-0 xl:col-span-2">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#2f6fa3] sm:text-xs sm:tracking-[0.12em]">
                            Pickup end
                          </span>
                          <input
                            name="pickupScheduledEndTime"
                            type="time"
                            value={pickupEndTime}
                            readOnly={!pickupTimeLocked}
                            onChange={(event) => {
                              const nextEnd = event.target.value;
                              setPickupEndTime(nextEnd);

                              if (pickupStop) {
                                onTimingDraftChange(pickupStop.id, {
                                  endTime: nextEnd,
                                });
                              }
                            }}
                            className="block w-full max-w-[360px] xl:max-w-none max-w-full min-w-0 rounded-xl xl:rounded-2xl border border-[#d8cec0] bg-white px-4 py-2.5 xl:py-3 text-sm font-semibold text-[#2f6fa3] outline-none focus:border-[#2f6fa3] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </label>
                      </div>

                      <label className="mt-3 flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 sm:mt-4 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
                        <input
                          type="checkbox"
                          name="pickupTimeLocked"
                          checked={pickupTimeLocked}
                         onChange={(event) => {
  const locked = event.target.checked;
  setPickupTimeLocked(locked);

  if (pickupStop) {
    if (!locked) {
      const nextEnd = addMinutesToTime(
        pickupStartTime,
        teardownDurationMin,
      );

      setPickupEndTime(nextEnd);

      onTimingDraftChange(pickupStop.id, {
        locked,
        endTime: nextEnd,
      });
    } else {
      onTimingDraftChange(pickupStop.id, { locked });
    }
  }
}}
                          className="mt-0.5 h-4 w-4"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-blue-900">
                            Fixed pickup time
                          </span>
                          <span className="mt-1 hidden text-xs text-blue-800 sm:block">
                            Keep this exact time during route recalculation. Pickup
                            still cannot begin before the event ends.
                          </span>
                        </span>
                      </label>

                      {supportsRouteStopWindows && (
                        <div className="mt-4">
                          <WindowEditor
                            name="clientPickupWindows"
                            label="Client pickup windows"
                            initialValue={pickupWindows}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                      No pickup stop found for this booking.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-end md:col-span-2">
              <button
                type="submit"
                className="w-full rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3"
              >
                Save route info
              </button>
            </div>
          </form>

          <aside className="space-y-3 sm:space-y-4">
            <details className="group rounded-[18px] bg-white ring-1 ring-[#eee5d9] sm:rounded-[24px]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-semibold text-[#1f1e1b] sm:px-5 sm:py-4">
                <span>Components</span>
                <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-[#8b8177]">
                  <span>{visibleComponents.length || (stop.items_summary ? 1 : 0)}</span>
                  <span className="transition-transform group-open:rotate-180">⌄</span>
                </span>
              </summary>

              <div className="border-t border-[#eee5d9] px-3.5 pb-3.5 pt-3 text-sm text-[#6c6258] sm:px-5 sm:pb-5 sm:pt-4">
                <div className="space-y-2">
                  {visibleComponents.length > 0 ? (
                    visibleComponents.map((item) => {
                      const inventoryItem = getOne(item.inventory_items);
                      const unit = getOne(item.inventory_units);
                      const primaryLabel = formatChecklistItem(item);
                      const secondaryPieces = [
                        inventoryItem?.name &&
                        cleanDetailText(inventoryItem.name) !==
                          cleanDetailText(item.title)
                          ? cleanDetailText(inventoryItem.name)
                          : "",
                        unit?.unit_code ? cleanDetailText(unit.unit_code) : "",
                      ].filter(Boolean);

                      return (
                        <div
                          key={item.id}
                          className="rounded-xl bg-[#fcfaf7] px-3 py-2 ring-1 ring-[#eee5d9] sm:rounded-2xl"
                        >
                          <div className="font-medium text-[#1f1e1b]">
                            {primaryLabel}
                          </div>
                          {secondaryPieces.length > 0 && (
                            <div className="mt-1 text-xs text-[#8b8177]">
                              {secondaryPieces.join(" · ")}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : stop.items_summary ? (
                    <div className="whitespace-pre-wrap">
                      {stop.items_summary}
                    </div>
                  ) : (
                    <div>No components</div>
                  )}
                </div>
              </div>
            </details>

            <details className="group rounded-[18px] bg-white ring-1 ring-[#eee5d9] sm:rounded-[24px]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-semibold text-[#1f1e1b] sm:px-5 sm:py-4">
                <span>Options</span>
                <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-[#8b8177]">
                  <span>{options.length}</span>
                  <span className="transition-transform group-open:rotate-180">⌄</span>
                </span>
              </summary>

              <div className="border-t border-[#eee5d9] px-3.5 pb-3.5 pt-3 text-sm text-[#6c6258] sm:px-5 sm:pb-5 sm:pt-4">
                <div className="space-y-2">
                  {options.length > 0 ? (
                    options.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl bg-[#fcfaf7] px-3 py-2 ring-1 ring-[#eee5d9] sm:rounded-2xl"
                      >
                        <div className="font-medium text-[#1f1e1b]">
                          {formatModifierItem(item)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div>No options</div>
                  )}
                </div>
              </div>
            </details>

            <details className="group rounded-[18px] bg-red-50 ring-1 ring-red-100 sm:rounded-[24px]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-sm font-semibold text-red-800 sm:px-5 sm:py-4">
                <span>Danger zone</span>
                <span className="text-xs font-semibold text-red-600 transition-transform group-open:rotate-180">⌄</span>
              </summary>

              <form
                action={deleteRouteStopAction}
                className="border-t border-red-100 px-3.5 pb-3.5 pt-3 sm:px-5 sm:pb-5 sm:pt-4"
                onSubmit={(event) => {
                  if (!window.confirm("Delete this route stop?")) {
                    event.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="stopId" value={stop.id} />
                <input type="hidden" name="stopDate" value={selectedDate} />

                <div className="text-sm font-semibold text-red-800">
                  Delete stop
                </div>

                <p className="mt-1 text-xs leading-5 text-red-700">
                  Use only for an incorrect manual stop or break module.
                </p>

                <button
                  type="submit"
                  className="mt-3 w-full rounded-xl bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-700 sm:mt-4 sm:rounded-full sm:py-2"
                >
                  Delete stop
                </button>
              </form>
            </details>
          </aside>
        </div>
      </details>
    </article>
  );
}

export default function RouteBoardClient({
  stops,
  drivers,
  checklistItems,
  modifiers,
  selectedDate,
  selectedType,
  selectedStatus,
  query,
  driverSettingsReady,
  googleMapsApiKey,
  warehouseOriginAddress,
  bookingRouteStops,
  supportsRouteStopWindows,
}: {
  stops: RouteStop[];
  drivers: Driver[];
  checklistItems: ChecklistItem[];
  modifiers: BookingModifier[];
  selectedDate: string;
  selectedType: string;
  selectedStatus: string;
  query: string;
  driverSettingsReady: boolean;
  googleMapsApiKey: string;
  warehouseOriginAddress: string;
  bookingRouteStops: RouteStop[];
  supportsRouteStopWindows: boolean;
}) {
  const [selectedDriver, setSelectedDriver] = useState("all");
  const [selectedStopKind, setSelectedStopKind] = useState<
    "all" | "delivery" | "pickup"
  >("all");
  const [selectedTimingFilter, setSelectedTimingFilter] = useState<
    "all" | "issues"
  >("all");
  const [orderedStops, setOrderedStops] = useState<RouteStop[]>(stops);
  const [manualAddress, setManualAddress] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualState, setManualState] = useState("CA");
  const [manualZip, setManualZip] = useState("");
  const [breakDate, setBreakDate] = useState(selectedDate);
  const [breakStartTime, setBreakStartTime] = useState("13:00");
  const [breakMinutes, setBreakMinutes] = useState("30");
  const [breakAppliesTo, setBreakAppliesTo] = useState<"delivery" | "pickup">(
    "delivery",
  );
  const [breakDriverName, setBreakDriverName] = useState("");
  const [timingDraftByStopId, setTimingDraftByStopId] = useState<
    Record<string, TimingDraft>
  >({});
  const [driverDraftByStopId, setDriverDraftByStopId] = useState<
    Record<string, string>
  >({});
  const [routeSegmentsByChainId, setRouteSegmentsByChainId] = useState<
    Record<string, RouteSegment[]>
  >({});
  const [routeCalculationVersion, setRouteCalculationVersion] = useState(0);
const [routeSaveError, setRouteSaveError] = useState("");
const [isPending, startTransition] = useTransition();
  useEffect(() => {
    setOrderedStops(stops);
    setTimingDraftByStopId({});
    setDriverDraftByStopId({});
  }, [stops, selectedDate]);

  function handleDriverDraftChange(stopId: string, driverName: string) {
    const allKnownStops = [...orderedStops, ...bookingRouteStops];
    const sourceStop = allKnownStops.find((candidate) => candidate.id === stopId);

    const synchronizedStopIds = sourceStop?.booking_id
      ? Array.from(
          new Set(
            allKnownStops
              .filter(
                (candidate) =>
                  candidate.booking_id === sourceStop.booking_id &&
                  candidate.stop_type === sourceStop.stop_type,
              )
              .map((candidate) => candidate.id),
          ),
        )
      : [stopId];

    setDriverDraftByStopId((current) => {
  const next = { ...current };

  synchronizedStopIds.forEach((id) => {
    next[id] = driverName;
  });

  return next;
});

setOrderedStops((currentStops) =>
  currentStops.map((stop) =>
    synchronizedStopIds.includes(stop.id)
      ? { ...stop, driver_name: driverName || null }
      : stop,
  ),
);

setRouteSegmentsByChainId({});
  }

  function handleTimingDraftChange(stopId: string, draft: TimingDraft) {
    const allKnownStops = [...orderedStops, ...bookingRouteStops];
    const sourceStop = allKnownStops.find((candidate) => candidate.id === stopId);

    // One booking can temporarily have more than one row for the same stop type
    // after older route-board migrations. All cards for that booking must still
    // share one live draft, otherwise the delivery card and pickup card can show
    // different values until the page is refreshed.
    const synchronizedStopIds = sourceStop?.booking_id
      ? Array.from(
          new Set(
            allKnownStops
              .filter(
                (candidate) =>
                  candidate.booking_id === sourceStop.booking_id &&
                  candidate.stop_type === sourceStop.stop_type,
              )
              .map((candidate) => candidate.id),
          ),
        )
      : [stopId];

    setTimingDraftByStopId((current) => {
  const next = { ...current };

  synchronizedStopIds.forEach((id) => {
    next[id] = {
      ...(next[id] || {}),
      ...draft,
    };
  });

  return next;
});
if (draft.date !== undefined) {

  setRouteSegmentsByChainId({});

}
if (
  sourceStop &&
  isBreakRouteStop(sourceStop) &&
  (draft.startTime !== undefined || draft.date !== undefined)
) {
  const currentDraft = timingDraftByStopId[stopId] || {};

  const nextDate = String(
    draft.date ||
      currentDraft.date ||
      sourceStop.stop_date ||
      selectedDate,
  ).slice(0, 10);

  const nextStartTime = timeValue(
    draft.startTime ||
      currentDraft.startTime ||
      sourceStop.scheduled_start_time,
  );

  const targetStartMinutes = minutesFromTime(nextStartTime);

  if (targetStartMinutes != null) {
    setOrderedStops((currentStops) => {
      const liveSourceStop =
        currentStops.find((candidate) => candidate.id === stopId) ||
        sourceStop;

      const sourceDriver = String(liveSourceStop.driver_name || "");

      const timelineStops = currentStops.filter((candidate) => {
        const candidateDraft = timingDraftByStopId[candidate.id] || {};

        const candidateDate = String(
          candidateDraft.date ||
            candidate.stop_date ||
            selectedDate,
        ).slice(0, 10);

        return (
          candidate.id === stopId ||
          (candidateDate === nextDate &&
            String(candidate.driver_name || "") === sourceDriver)
        );
      });

      if (timelineStops.length <= 1) {
        return currentStops;
      }

      const withoutBreak = timelineStops.filter(
        (candidate) => candidate.id !== stopId,
      );

      let insertIndex = withoutBreak.findIndex((candidate) => {
        const candidateDraft = timingDraftByStopId[candidate.id] || {};

        const candidateStartMinutes = minutesFromTime(
          candidateDraft.startTime ||
            candidate.scheduled_start_time,
        );

        return (
          candidateStartMinutes != null &&
          candidateStartMinutes >= targetStartMinutes
        );
      });

      if (insertIndex < 0) {
        insertIndex = withoutBreak.length;
      }

      const reorderedTimeline = [...withoutBreak];

      reorderedTimeline.splice(
        insertIndex,
        0,
        liveSourceStop,
      );

      const timelineIds = new Set(
        timelineStops.map((candidate) => candidate.id),
      );

      let replacementIndex = 0;

      return currentStops.map((candidate) =>
        timelineIds.has(candidate.id)
          ? reorderedTimeline[replacementIndex++]
          : candidate,
      );
    });
  }
}
  }

  const countableStops = useMemo(
    () => orderedStops.filter((stop) => !isBreakRouteStop(stop)),
    [orderedStops],
  );

  const stopSequenceById = useMemo(() => {
    const counters = new Map<
      string,
      { delivery: number; pickup: number; other: number }
    >();
    const sequence = new Map<
      string,
      { number: number; tone: "delivery" | "pickup" | "other" }
    >();

    orderedStops.forEach((stop) => {
      if (isBreakRouteStop(stop)) return;

      const driverName = String(stop.driver_name || "Unassigned");
      const current = counters.get(driverName) || {
        delivery: 0,
        pickup: 0,
        other: 0,
      };

      if (stop.stop_type === "delivery") {
        current.delivery += 1;
        sequence.set(stop.id, { number: current.delivery, tone: "delivery" });
      } else if (stop.stop_type === "pickup") {
        current.pickup += 1;
        sequence.set(stop.id, { number: current.pickup, tone: "pickup" });
      } else {
        current.other += 1;
        sequence.set(stop.id, { number: current.other, tone: "other" });
      }

      counters.set(driverName, current);
    });

    return sequence;
  }, [orderedStops]);
  const routeTravelMinutesByEdgeKey = useMemo(() => {
    const result = new Map<string, number>();

    Object.values(routeSegmentsByChainId).forEach((segments) => {
      segments.forEach((segment) => {
        const parsedMinutes = parseSegmentDurationMinutes(segment.durationText);

        if (parsedMinutes == null) {
          return;
        }

        const fromStopId = String(segment.fromStopId || "").trim();
        const toStopId = String(segment.toStopId || "").trim();

        if (fromStopId && toStopId) {
          result.set(`edge:${fromStopId}:${toStopId}`, parsedMinutes);
        }
      });
    });

    return result;
  }, [routeSegmentsByChainId]);

  function getDriverIdForStop(stop: RouteStop) {
    const driverName = String(stop.driver_name || "Unassigned");
    const matchedDriver = drivers.find(
      (driver) => driver.name.toLowerCase() === driverName.toLowerCase(),
    );

    return matchedDriver?.id || `extra-${driverName}`;
  }

  function getChainIdForStop(stop: RouteStop) {
    return `${getDriverIdForStop(stop)}::${String(
      stop.stop_type || "other",
    )}`;
  }

  function segmentTravelMinutes(
    previousStop: RouteStop,
    currentStop: RouteStop,
  ) {
    if (isBreakRouteStop(previousStop) || isBreakRouteStop(currentStop)) {
      return 0;
    }

    const chainId = getChainIdForStop(currentStop);
    const chainSegments = routeSegmentsByChainId[chainId] || [];

    const exactEdgeMinutes = routeTravelMinutesByEdgeKey.get(
      `edge:${previousStop.id}:${currentStop.id}`,
    );

    if (exactEdgeMinutes != null) {
      return exactEdgeMinutes;
    }

    const exactSegmentById = chainSegments.find(
      (segment) =>
        String(segment.fromStopId || "") === String(previousStop.id) &&
        String(segment.toStopId || "") === String(currentStop.id),
    );

    const exactSegmentByIdMinutes = parseSegmentDurationMinutes(
      exactSegmentById?.durationText,
    );

    if (exactSegmentByIdMinutes != null) {
      return exactSegmentByIdMinutes;
    }

    const previousSequence = stopSequenceById.get(previousStop.id);
    const currentSequence = stopSequenceById.get(currentStop.id);

    if (previousSequence && currentSequence) {
      const exactSegmentBySequence = chainSegments.find(
        (segment) =>
          segment.fromSequence === previousSequence.number &&
          segment.toSequence === currentSequence.number &&
          segment.fromStopType === previousStop.stop_type &&
          segment.toStopType === currentStop.stop_type,
      );

      const exactSegmentBySequenceMinutes = parseSegmentDurationMinutes(
        exactSegmentBySequence?.durationText,
      );

      if (exactSegmentBySequenceMinutes != null) {
        return exactSegmentBySequenceMinutes;
      }
    }

    if (currentSequence) {
      const destinationSegment = chainSegments.find(
        (segment) =>
          segment.toSequence === currentSequence.number &&
          segment.toStopType === currentStop.stop_type,
      );

      const destinationSegmentMinutes = parseSegmentDurationMinutes(
        destinationSegment?.durationText,
      );

      if (destinationSegmentMinutes != null) {
        return destinationSegmentMinutes;
      }
    }

    return null;
  }

  const liveTimingByStopId = useMemo(() => {
    const result = new Map<string, LiveTiming>();
    const chainGroups = new Map<string, RouteStop[]>();

    orderedStops.forEach((stop) => {
      const stopType = String(stop.stop_type || "");

      if (stopType !== "delivery" && stopType !== "pickup") return;

      const draft = timingDraftByStopId[stop.id] || {};
const effectiveLocked =
  draft.locked !== undefined ? draft.locked : Boolean(stop.time_locked);

const date = String(draft.date || stop.stop_date || selectedDate).slice(
        0,
        10,
      );
      const driver = String(stop.driver_name || "");
      const key = `${date}::${driver}::${stopType}`;
      const group = chainGroups.get(key) || [];

      group.push(stop);
      chainGroups.set(key, group);
    });

    // Build a filtered list (delivery + pickup only) in global sort order,
    // so we can detect cross-type stops interleaved between chain stops.
    const deliveryPickupStops = orderedStops.filter(
      (s) => s.stop_type === "delivery" || s.stop_type === "pickup",
    );
    const globalPositionById = new Map<string, number>(
      deliveryPickupStops.map((s, i) => [String(s.id), i]),
    );

    chainGroups.forEach((chainStops) => {
      let previousStop: RouteStop | null = null;
      let previousGeoStop: RouteStop | null = null;
      let previousEndTime = "";

      chainStops.forEach((stop, index) => {
        const draft = timingDraftByStopId[stop.id] || {};
        const date = String(draft.date || stop.stop_date || selectedDate).slice(
          0,
          10,
        );

        const savedStartTime = timeValue(stop.scheduled_start_time);
        const savedEndTime = timeValue(stop.scheduled_end_time);

        let startTime = timeValue(draft.startTime || savedStartTime);
        let endTime = timeValue(draft.endTime || savedEndTime);

        const savedDuration = durationBetweenTimes(
          savedStartTime,
          savedEndTime,
        );
        const draftDuration = durationBetweenTimes(startTime, endTime);
        const booking = getOne(stop.bookings);
        const bookingItems = Array.isArray(booking?.booking_items)
          ? booking.booking_items
          : [];
        const routeDurations = bookingRouteDurations(stop, bookingItems);
        const productDuration =
          stop.stop_type === "pickup"
            ? routeDurations.teardownMinutes
            : routeDurations.setupMinutes;
        const currentDuration = isBreakRouteStop(stop)
          ? draftDuration ||
            breakMinutesFromRouteStop(stop) ||
            savedDuration ||
            30
          : productDuration ||
            draftDuration ||
            savedDuration ||
            60;

        // Cross-type interleave check: if a stop of a different type falls
        // between the previous chain-stop and this stop in global sort order
        // (e.g. a delivery placed after some pickups), use that stop's end
        // time as the cascade base so timing flows across type boundaries.
        if (
          index > 0 &&
          !stop.time_locked &&
          !draft.locked &&
          !draft.startTime &&
          !draft.endTime
        ) {
          const prevChainStop = chainStops[index - 1];
          const prevGlobalPos = globalPositionById.get(String(prevChainStop.id)) ?? -1;
          const curGlobalPos = globalPositionById.get(String(stop.id)) ?? -1;
          for (let gPos = curGlobalPos - 1; gPos > prevGlobalPos; gPos--) {
  const between = deliveryPickupStops[gPos];

  if (!between || between.stop_type === stop.stop_type) {
  continue;
}

const betweenDraft = timingDraftByStopId[between.id] || {};

const betweenDate = String(
  betweenDraft.date || between.stop_date || selectedDate,
).slice(0, 10);

const betweenDriver = String(between.driver_name || "");

if (
  betweenDate !== date ||
  betweenDriver !== String(stop.driver_name || "")
) {
  continue;
}

// Use the computed timing if available, else fall back to saved time.

  const betweenTiming = result.get(String(between.id));
  const betweenEnd =
    betweenTiming?.endTime || timeValue(between.scheduled_end_time);

  if (betweenEnd && betweenEnd > (previousEndTime || "")) {
    previousEndTime = betweenEnd;
  }

  if (isBreakRouteStop(between)) {
    continue;
  }

  previousStop = between;
  previousGeoStop = between;
  break;
}
        }
const effectiveLocked =
  draft.locked !== undefined ? draft.locked : Boolean(stop.time_locked);
  const hasManualAnchor = Boolean(
  effectiveLocked ||
  draft.date ||
  draft.startTime ||
  (effectiveLocked && draft.endTime) ||
  (index === 0 && (startTime || endTime)),
);

        if (index === 0) {
          if (startTime && !endTime) {
            endTime = addMinutesToTime(startTime, currentDuration);
          }

          if (!startTime && endTime) {
            startTime = addMinutesToTime(endTime, -currentDuration);
          }

          if (!startTime) {
            startTime = savedStartTime || "08:00";
          }

          if (!endTime) {
            endTime = addMinutesToTime(startTime, currentDuration);
          }
        } else if (hasManualAnchor) {
          if (startTime && !effectiveLocked) {
  endTime = addMinutesToTime(startTime, currentDuration);
}

          if (!startTime && endTime) {
            startTime = addMinutesToTime(endTime, -currentDuration);
          }

          if (!startTime) {
            const mapTravelMinutes =
              previousStop && previousEndTime
                ? segmentTravelMinutes(previousGeoStop || previousStop, stop)
                : null;

            const fallbackMinutes =
              previousStop && previousEndTime
                ? estimateTravelMinutes(previousGeoStop || previousStop, stop)
                : 0;

            startTime = addMinutesToTime(
              previousEndTime,
              mapTravelMinutes ?? fallbackMinutes,
            );
          }

          if (!endTime) {
            endTime = addMinutesToTime(startTime, currentDuration);
          }
        } else if (previousStop && previousEndTime) {
          const mapTravelMinutes = segmentTravelMinutes(
            previousGeoStop || previousStop,
            stop,
          );
          const fallbackMinutes = estimateTravelMinutes(
            previousGeoStop || previousStop,
            stop,
          );

          startTime = addMinutesToTime(
            previousEndTime,
            mapTravelMinutes ?? fallbackMinutes,
          );
          endTime = addMinutesToTime(startTime, currentDuration);
        } else {
          if (!startTime) {
            startTime = savedStartTime || "08:00";
          }

          if (!endTime) {
            endTime = addMinutesToTime(startTime, currentDuration);
          }
        }

        if (startTime && !stop.time_locked && !draft.locked && !draft.endTime) {
          endTime = addMinutesToTime(startTime, currentDuration);
        }

        result.set(stop.id, {
          date,
          startTime,
          endTime,
        });

        previousStop = stop;

        if (!isBreakRouteStop(stop)) {
          previousGeoStop = stop;
        }

        previousEndTime = endTime;
      });
    });

    return result;
  }, [
    orderedStops,
    selectedDate,
    timingDraftByStopId,
    routeSegmentsByChainId,
    routeTravelMinutesByEdgeKey,
    stopSequenceById,
  ]);


  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 3,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    }),
  );

  const routeTimingHealthByStopId = useMemo(() => {
    const result = new Map<string, RouteTimingHealth>();

    orderedStops.forEach((stop) => {
      const booking = getOne(stop.bookings);
      const liveTiming = liveTimingByStopId.get(stop.id);
      const deliveryStop =
        bookingStopByType(stop.booking_id, "delivery", bookingRouteStops) ||
        stop;
      const pickupStop =
        bookingStopByType(stop.booking_id, "pickup", bookingRouteStops) ||
        (stop.stop_type === "pickup" ? stop : null);

      const deliveryWindows = parseWindows(
        (deliveryStop as any)?.client_delivery_windows,
      );
      const pickupWindows = parseWindows(
        (pickupStop as any)?.client_pickup_windows,
      );

      const isDelivery = stop.stop_type === "delivery";

      result.set(
        stop.id,
        evaluateRouteTimingHealth({
          stopType: stop.stop_type,
          routeDate: liveTiming?.date || stop.stop_date || selectedDate,
          routeStartTime:
            liveTiming?.startTime || timeValue(stop.scheduled_start_time),
          routeEndTime:
            liveTiming?.endTime || timeValue(stop.scheduled_end_time),
          eventDate: (booking as any)?.event_date,
          eventStartTime: timeFromAny((booking as any)?.event_start_time),
          eventEndTime: timeFromAny((booking as any)?.event_end_time),
          clientWindows: isDelivery ? deliveryWindows : pickupWindows,
          bookingWindowStart: isDelivery
            ? timeFromAny((booking as any)?.delivery_window_start)
            : timeFromAny((booking as any)?.pickup_window_start),
          bookingWindowEnd: isDelivery
            ? timeFromAny((booking as any)?.delivery_window_end)
            : timeFromAny((booking as any)?.pickup_window_end),
        }),
      );
    });

    return result;
  }, [
    orderedStops,
    liveTimingByStopId,
    bookingRouteStops,
    selectedDate,
  ]);

  const filteredStopsInRouteOrder = useMemo(() => {
    return orderedStops.filter((stop) => {
      if (selectedStopKind === "delivery" && stop.stop_type !== "delivery") {
        return false;
      }

      if (selectedStopKind === "pickup" && stop.stop_type !== "pickup") {
        return false;
      }

      if (selectedDriver !== "all") {
        if (selectedDriver === "Unassigned") {
          if (stop.driver_name) return false;
        } else if (String(stop.driver_name || "") !== selectedDriver) {
          return false;
        }
      }

      if (selectedTimingFilter === "issues") {
        const health = routeTimingHealthByStopId.get(stop.id);

        if (
          health?.tone !== "warning" &&
          health?.tone !== "conflict"
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    orderedStops,
    selectedDriver,
    selectedStopKind,
    selectedTimingFilter,
    routeTimingHealthByStopId,
  ]);

  const visibleStops = useMemo(() => {
    return filteredStopsInRouteOrder;
  }, [filteredStopsInRouteOrder]);

  const visibleRouteIssueCount = useMemo(() => {
    return visibleStops.reduce((count, stop) => {
      const health = routeTimingHealthByStopId.get(stop.id);

      return health?.tone === "warning" || health?.tone === "conflict"
        ? count + 1
        : count;
    }, 0);
  }, [visibleStops, routeTimingHealthByStopId]);

  const displaySequenceById = useMemo(() => {
    const counters = new Map<
      string,
      { delivery: number; pickup: number; other: number }
    >();
    const sequence = new Map<
      string,
      { number: number; tone: "delivery" | "pickup" | "other" }
    >();

    visibleStops.forEach((stop) => {
      if (isBreakRouteStop(stop)) return;

      const driverName = String(stop.driver_name || "Unassigned");
      const current = counters.get(driverName) || {
        delivery: 0,
        pickup: 0,
        other: 0,
      };

      if (stop.stop_type === "delivery") {
        current.delivery += 1;
        sequence.set(stop.id, { number: current.delivery, tone: "delivery" });
      } else if (stop.stop_type === "pickup") {
        current.pickup += 1;
        sequence.set(stop.id, { number: current.pickup, tone: "pickup" });
      } else {
        current.other += 1;
        sequence.set(stop.id, { number: current.other, tone: "other" });
      }

      counters.set(driverName, current);
    });

    return sequence;
  }, [visibleStops]);

  const hasUnsavedRouteBoardChanges = useMemo(() => {
    const orderChanged =
      orderedStops.length !== stops.length ||
      orderedStops.some((stop, index) => stop.id !== stops[index]?.id);
    const hasTimingDrafts = Object.keys(timingDraftByStopId).length > 0;
    const hasDriverDrafts = Object.keys(driverDraftByStopId).length > 0;
    const hasRouteSegments = Object.values(routeSegmentsByChainId).some(
      (segments) => segments.length > 0,
    );

    return (
      orderChanged || hasTimingDrafts || hasDriverDrafts || hasRouteSegments
    );
  }, [
    orderedStops,
    stops,
    timingDraftByStopId,
    driverDraftByStopId,
    routeSegmentsByChainId,
  ]);

  const mappableVisibleStops = useMemo(
    () => visibleStops.filter((stop) => !isBreakRouteStop(stop)),
    [visibleStops],
  );

  function routeOriginAddressForStops(stopsForRoute: RouteStop[]) {
    const firstStop = stopsForRoute[0];

    if (!firstStop || firstStop.stop_type !== "pickup") {
      return warehouseOriginAddress;
    }

    const driverName = String(firstStop.driver_name || "Unassigned");
    const driverStops = orderedStops.filter(
      (stop) =>
        !isBreakRouteStop(stop) &&
        String(stop.driver_name || "Unassigned") === driverName,
    );

    const firstStopIndex = driverStops.findIndex(
      (stop) => String(stop.id) === String(firstStop.id),
    );

    if (firstStopIndex > 0) {
      const originAddress = resolvedStopAddress(driverStops[firstStopIndex - 1]);

      if (originAddress) {
        return originAddress;
      }
    }

    return warehouseOriginAddress;
  }

  const routeUrl = googleRouteUrl(
    mappableVisibleStops,
    routeOriginAddressForStops(mappableVisibleStops),
  );

  const driverStats = useMemo(() => {
    const visibleTypeStops =
      selectedStopKind === "all"
        ? countableStops
        : countableStops.filter((stop) => stop.stop_type === selectedStopKind);

    const result = drivers.map((driver) => {
      const driverStops =
        driver.name === "Unassigned"
          ? visibleTypeStops.filter((stop) => !stop.driver_name)
          : visibleTypeStops.filter((stop) => stop.driver_name === driver.name);

      const completed = driverStops.filter((stop) =>
        ["installed", "picked_up", "completed"].includes(
          String(stop.status || ""),
        ),
      ).length;

      return {
        ...driver,
        stops: driverStops.length,
        completed,
      };
    });

    const existingDriverNames = new Set(drivers.map((driver) => driver.name));

    const extraDrivers = Array.from(
      new Set(
        countableStops
          .map((stop) => String(stop.driver_name || ""))
          .filter((name) => name && !existingDriverNames.has(name)),
      ),
    ).map((name, index) => ({
      id: `extra-${name}`,
      name,
      color: ["#5b7c99", "#9a723e", "#6b7280"][index % 3],
      phone: null,
      account_email: null,
      auth_user_id: null,
      notes: null,
      active: true,
      sort_order: 1000 + index,
      stops:
        selectedStopKind === "all"
          ? countableStops.filter((stop) => stop.driver_name === name).length
          : countableStops.filter(
              (stop) =>
                stop.driver_name === name &&
                stop.stop_type === selectedStopKind,
            ).length,
      completed: countableStops.filter(
        (stop) =>
          stop.driver_name === name &&
          ["installed", "picked_up", "completed"].includes(
            String(stop.status || ""),
          ),
      ).length,
    }));

    return [...result, ...extraDrivers];
  }, [drivers, countableStops, selectedStopKind]);

  const groupedDriverRoutes = useMemo(() => {
    const groups = new Map<string, { driver: Driver; stops: RouteStop[] }>();

    visibleStops.forEach((stop) => {
      if (isBreakRouteStop(stop)) return;

      const name = String(stop.driver_name || "Unassigned");
      const statsDriver = driverStats.find((driver) => driver.name === name);
      const matchedDriver =
        drivers.find((driver) => driver.name === name) ||
        ({
          id: `extra-${name}`,
          name,
          color: statsDriver?.color || "#8b8177",
          phone: null,
          account_email: null,
          auth_user_id: null,
          notes: null,
          active: true,
          sort_order: 999,
        } as Driver);

      const existing = groups.get(name);

      if (!existing) {
        groups.set(name, { driver: matchedDriver, stops: [stop] });
        return;
      }

      existing.stops.push(stop);
    });

    const driverOrder = new Map(
      driverStats.map((driver, index) => [driver.name, index]),
    );

    return Array.from(groups.values()).sort((a, b) => {
      const orderA = driverOrder.get(a.driver.name) ?? 10_000;
      const orderB = driverOrder.get(b.driver.name) ?? 10_000;

      if (orderA !== orderB) return orderA - orderB;

      return a.driver.name.localeCompare(b.driver.name);
    });
  }, [visibleStops, drivers, driverStats]);

  const driverTimelineStopsByName = useMemo(() => {
    const result = new Map<string, RouteStop[]>();

    visibleStops.forEach((stop) => {
      if (isBreakRouteStop(stop)) return;

      const driverName = String(stop.driver_name || "Unassigned");
      const existingStops = result.get(driverName);

      if (!existingStops) {
        result.set(driverName, [stop]);
        return;
      }

      existingStops.push(stop);
    });

    return result;
  }, [visibleStops]);

  const driverRouteStopsByName = useMemo(() => {
    const result = new Map<string, RouteStop[]>();

    orderedStops.forEach((stop) => {
      if (isBreakRouteStop(stop)) return;

      const driverName = String(stop.driver_name || "Unassigned");
      const existingStops = result.get(driverName);

      if (!existingStops) {
        result.set(driverName, [stop]);
        return;
      }

      existingStops.push(stop);
    });

    return result;
  }, [orderedStops]);

  const multiDriverMapGroups = useMemo(
    () =>
      groupedDriverRoutes.flatMap((group) =>
        (["delivery", "pickup"] as const)
          .map((stopType) => {
            const chainStops = group.stops.filter(
              (stop) => stop.stop_type === stopType,
            );

            if (chainStops.length === 0) {
              return null;
            }

            const driverRouteStops =
              driverRouteStopsByName.get(group.driver.name) || [];
            const driverTimelineStops =
              driverTimelineStopsByName.get(group.driver.name) || [];
            const firstChainStopId = String(chainStops[0]?.id || "");
            const resolveOriginFromStops = (stops: RouteStop[]) => {
              const firstChainStopIndex = stops.findIndex(
                (stop) => String(stop.id) === firstChainStopId,
              );

              if (firstChainStopIndex <= 0) {
                return null;
              }

              // Return the nearest preceding non-break stop of any type.
              for (let index = firstChainStopIndex - 1; index >= 0; index -= 1) {
                const candidate = stops[index];
                if (candidate && !isBreakRouteStop(candidate)) {
                  return candidate;
                }
              }

              return null;
            };

            const chainOriginCandidate =
              resolveOriginFromStops(driverTimelineStops) ||
              resolveOriginFromStops(driverRouteStops);

            return {
              driverId: `${group.driver.id}::${stopType}`,
              driverName: group.driver.name,
              color: group.driver.color || "#8b8177",
              originStop: chainOriginCandidate
                ? {
                    id: chainOriginCandidate.id,
                    ...resolvedStopAddressParts(chainOriginCandidate),
                    title: mainProductName(chainOriginCandidate),
                    stopType: chainOriginCandidate.stop_type,
                    sequenceNumber:
                      displaySequenceById.get(chainOriginCandidate.id)
                        ?.number ||
                      0,
                    stopDate:
                      liveTimingByStopId.get(chainOriginCandidate.id)?.date ||
                      chainOriginCandidate.stop_date,
                    scheduledStartTime:
                      liveTimingByStopId.get(chainOriginCandidate.id)
                        ?.startTime ||
                      timeValue(chainOriginCandidate.scheduled_start_time),
                  }
                : null,
              stops: chainStops.map((stop) => ({
                id: stop.id,
                ...resolvedStopAddressParts(stop),
                title: mainProductName(stop),
                stopType: stop.stop_type,
                sequenceNumber:
                  displaySequenceById.get(stop.id)?.number || 1,
                stopDate:
                  liveTimingByStopId.get(stop.id)?.date || stop.stop_date,
                scheduledStartTime:
                  liveTimingByStopId.get(stop.id)?.startTime ||
                  timeValue(stop.scheduled_start_time),
              })),
            };
          })
          .filter(
            (
              group,
            ): group is {
              driverId: string;
              driverName: string;
              color: string;
              originStop: {
                id: string;
                address: string | null;
                city: string | null;
                state: string | null;
                zip: string | null;
                title: string;
                stopType: string | null;
                sequenceNumber: number;
                stopDate: string | null;
                scheduledStartTime: string;
              } | null;
              stops: Array<{
                id: string;
                address: string | null;
                city: string | null;
                state: string | null;
                zip: string | null;
                title: string;
                stopType: string | null;
                sequenceNumber: number;
                stopDate: string | null;
                scheduledStartTime: string;
              }>;
            } => group !== null,
          ),
      ),
    [
      groupedDriverRoutes,
      driverRouteStopsByName,
      driverTimelineStopsByName,
      displaySequenceById,
      stopSequenceById,
      liveTimingByStopId,
    ],
  );

  const mapGroupsByChainId = useMemo(
    () => new Map(multiDriverMapGroups.map((group) => [group.driverId, group])),
    [multiDriverMapGroups],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || String(active.id) === String(over.id)) return;

    setOrderedStops((items) => {
      const isVisible = (stop: RouteStop) => {
        if (selectedStopKind === "delivery" && stop.stop_type !== "delivery") return false;
        if (selectedStopKind === "pickup" && stop.stop_type !== "pickup") return false;

        if (selectedDriver !== "all") {
          if (selectedDriver === "Unassigned") {
            if (stop.driver_name) return false;
          } else if (String(stop.driver_name || "") !== selectedDriver) {
            return false;
          }
        }

        if (selectedTimingFilter === "issues") {
          const health = routeTimingHealthByStopId.get(stop.id);
          if (health?.tone !== "warning" && health?.tone !== "conflict") return false;
        }

        return true;
      };

      const currentVisible = items.filter(isVisible);
      const visibleIds = currentVisible.map((stop) => stop.id);
      const oldVisibleIndex = visibleIds.indexOf(String(active.id));
      const newVisibleIndex = visibleIds.indexOf(String(over.id));

      if (oldVisibleIndex < 0 || newVisibleIndex < 0) return items;

      const reorderedVisible = arrayMove(
        currentVisible,
        oldVisibleIndex,
        newVisibleIndex,
      );

      let replacementIndex = 0;

      return items.map((item) =>
       visibleIds.includes(item.id)
       ? reorderedVisible[replacementIndex++]
       : item,
 );
 });
setRouteSegmentsByChainId({});
}

 const handleRouteSegmentsChange = useCallback(
  (nextSegments: Record<string, RouteSegment[]>) => {
    setRouteSegmentsByChainId((currentSegments) => {
      const mergedSegments = {
        ...currentSegments,
        ...nextSegments,
      };

      const currentJson = JSON.stringify(currentSegments);
      const mergedJson = JSON.stringify(mergedSegments);

      return currentJson === mergedJson
        ? currentSegments
        : mergedSegments;
    });
  },
  [],
);

  function recalculateRoute() {
    setRouteSegmentsByChainId({});
    setRouteCalculationVersion((current) => current + 1);
  }

 function saveOrder() {
  setRouteSaveError("");

  const formData = new FormData();
  const routeStopsToSave = orderedStops;

  formData.set("stopDate", selectedDate);

  formData.set(
    "orderedIds",
    JSON.stringify(routeStopsToSave.map((stop) => stop.id)),
  );

  startTransition(() => {
    void saveRouteOrderAction(formData)
      .then(() => {
        window.location.reload();
      })
      .catch((error: unknown) => {
        setRouteSaveError(
          error instanceof Error
            ? error.message
            : "Could not save route order.",
        );
      });
  });
}

  function resetRouteBoardChanges() {
    setOrderedStops(stops);
    setTimingDraftByStopId({});
    setDriverDraftByStopId({});
    setRouteSegmentsByChainId({});
    setRouteCalculationVersion((current) => current + 1);
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden pb-24 sm:space-y-6 sm:pb-0">
      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="min-w-0 space-y-4">
          <section className="rounded-[20px] border border-black/5 bg-white p-3 shadow-sm sm:rounded-[30px] sm:p-5 sm:shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold tracking-tight text-[#1f1e1b] sm:text-xl">
                  Route overview
                </h3>
                <p className="mt-1 hidden text-sm leading-6 text-[#8b8177] sm:block">
                  Filter by driver, stop type, or timing issue.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDriver("all")}
                className={[
                  "inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-xs font-semibold sm:min-h-0",
                  selectedDriver === "all"
                    ? "bg-[#23313f] text-white"
                    : "bg-[#f4ede2] text-[#6c6258]",
                ].join(" ")}
              >
                All
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2">
              {[
                { value: "all", label: "All" },
                { value: "delivery", label: "Delivery" },
                { value: "pickup", label: "Pickup" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() =>
                    setSelectedStopKind(
                      item.value as "all" | "delivery" | "pickup",
                    )
                  }
                  className={[
                    "min-h-10 rounded-xl px-2.5 py-2 text-xs font-semibold sm:min-h-0 sm:px-3",
                    selectedStopKind === item.value
                      ? "bg-[#23313f] text-white"
                      : "bg-[#f4ede2] text-[#6c6258]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedTimingFilter("all")}
                className={[
                  "min-h-10 rounded-xl px-2.5 py-2 text-xs font-semibold sm:min-h-0 sm:px-3",
                  selectedTimingFilter === "all"
                    ? "bg-[#23313f] text-white"
                    : "bg-[#f4ede2] text-[#6c6258]",
                ].join(" ")}
              >
                All timing
              </button>

              <button
                type="button"
                onClick={() => setSelectedTimingFilter("issues")}
                className={[
                  "min-h-10 rounded-xl px-2.5 py-2 text-xs font-semibold sm:min-h-0 sm:px-3",
                  selectedTimingFilter === "issues"
                    ? "bg-red-600 text-white"
                    : "bg-red-50 text-red-700 ring-1 ring-red-100",
                ].join(" ")}
              >
                Timing issues
              </button>
            </div>

            <div className="-mx-1 mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 xl:mx-0 xl:block xl:space-y-2 xl:overflow-visible xl:px-0 xl:pb-0">
              {driverStats.map((driver) => (
                <button
                  key={driver.id}
                  type="button"
                  onClick={() => setSelectedDriver(driver.name)}
                  className={[
                    "min-w-[145px] shrink-0 snap-start rounded-xl border px-3 py-2.5 text-left transition sm:min-w-[190px] sm:rounded-2xl sm:px-3.5 sm:py-3 xl:w-full xl:min-w-0 xl:px-4",
                    selectedDriver === driver.name
                      ? "border-[#23313f] bg-[#f7f1e8]"
                      : "border-[#eee5d9] bg-white hover:bg-[#fcfaf7]",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex items-center gap-2.5 sm:gap-3">
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-white sm:h-4 sm:w-4"
                        style={{ backgroundColor: driver.color }}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold tracking-tight text-[#1f1e1b]">
                          {driver.name}
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-[#8b8177]">
                          <span className="sm:hidden">{driver.completed}/{driver.stops}</span>
                          <span className="hidden sm:inline">{driver.completed}/{driver.stops} completed</span>
                        </div>
                        <div className="mt-1.5 hidden h-1.5 w-24 overflow-hidden rounded-full bg-[#eee5d9] sm:block">
                          <div
                            className="h-full rounded-full bg-[#7aa784] transition-[width]"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  driver.stops > 0
                                    ? (driver.completed / driver.stops) * 100
                                    : 0,
                                ),
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-xl font-bold tabular-nums text-[#1f1e1b] sm:block">
                      {driver.stops}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {driverSettingsReady && (
            <details className="hidden sm:block rounded-[24px] border border-black/5 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
              <summary className="cursor-pointer px-4 py-4 text-sm font-bold text-[#23313f] sm:px-5">
                + Driver profiles and marker colors
              </summary>

              <div className="space-y-3 border-t border-[#eee5d9] p-3.5 sm:space-y-4 sm:p-5">
                <a
                  href="/admin/staff"
                  className="inline-flex rounded-full bg-[#c9964f] px-4 py-2 text-xs font-semibold text-white"
                >
                  Open full Staff management
                </a>

                {drivers
                  .filter((driver) => driver.name !== "Unassigned")
                  .map((driver) => (
                    <form
                      key={driver.id}
                      action={createOrUpdateRouteDriverAction}
                      className="grid gap-2 rounded-2xl bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]"
                    >
                      <input type="hidden" name="driverId" value={driver.id} />
                      <input
                        type="hidden"
                        name="phone"
                        value={driver.phone || ""}
                      />
                      <input
                        type="hidden"
                        name="accountEmail"
                        value={driver.account_email || ""}
                      />
                      <input
                        type="hidden"
                        name="authUserId"
                        value={driver.auth_user_id || ""}
                      />
                      <input
                        type="hidden"
                        name="notes"
                        value={driver.notes || ""}
                      />
                      <input
                        name="name"
                        defaultValue={driver.name}
                        className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm"
                      />
                      <div className="grid grid-cols-[1fr_80px] gap-2">
                        <input
                          name="color"
                          type="color"
                          defaultValue={driver.color || "#23313f"}
                          className="h-10 w-full rounded-xl border border-[#d8cec0] bg-white px-2"
                        />
                        <input
                          name="sortOrder"
                          type="number"
                          defaultValue={driver.sort_order || 100}
                          className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white"
                      >
                        Save driver
                      </button>
                      <button
                        type="submit"
                        formAction={deleteRouteDriverAction}
                        className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white"
                      >
                        Delete driver
                      </button>
                    </form>
                  ))}

                <form
                  action={createOrUpdateRouteDriverAction}
                  className="grid gap-2 rounded-2xl bg-[#fff4d8] p-4 ring-1 ring-[#efd582]"
                >
                  <input type="hidden" name="phone" value="" />
                  <input type="hidden" name="accountEmail" value="" />
                  <input type="hidden" name="authUserId" value="" />
                  <input type="hidden" name="notes" value="" />
                  <input
                    name="name"
                    placeholder="New driver name"
                    className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-[1fr_80px] gap-2">
                    <input
                      name="color"
                      type="color"
                      defaultValue="#23313f"
                      className="h-10 w-full rounded-xl border border-[#d8cec0] bg-white px-2"
                    />
                    <input
                      name="sortOrder"
                      type="number"
                      defaultValue="100"
                      className="rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-full bg-[#c9964f] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Add driver
                  </button>
                </form>
              </div>
            </details>
          )}
        </aside>

        <section className="rounded-[22px] sm:rounded-[30px] border border-black/5 bg-white p-3.5 sm:p-5 shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-2 sm:gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Route map
              </h3>
              <p className="hidden sm:block mt-1 text-sm text-[#6c6258]">
                One map for selected filters. Route color = driver color. Marker
                number color: delivery green, pickup red.
              </p>
            </div>

            {selectedDriver !== "all" && routeUrl && (
              <a
                href={routeUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white"
              >
                Open route in Google Maps
              </a>
            )}
          </div>

          <div className="mt-4 min-w-0 space-y-3 sm:mt-5 sm:space-y-4">
            <MultiDriverRouteMap
              key={`route-map-${routeCalculationVersion}`}
              apiKey={googleMapsApiKey}
              warehouseOriginAddress={warehouseOriginAddress}
              groups={multiDriverMapGroups}
              className="relative h-[38vh] min-h-[250px] max-h-[330px] w-full min-w-0 overflow-hidden rounded-[18px] border border-[#eee5d9] sm:h-auto sm:min-h-[420px] sm:max-h-none sm:rounded-[28px]"
              onRouteSegmentsChange={handleRouteSegmentsChange}
            />

            <div className="grid min-w-0 gap-3 xl:grid-cols-2">
              {groupedDriverRoutes.map((group) => {
                const deliveryChainId = `${group.driver.id}::delivery`;
                const pickupChainId = `${group.driver.id}::pickup`;
                const deliveryMapGroup =
                  mapGroupsByChainId.get(deliveryChainId);
                const pickupMapGroup = mapGroupsByChainId.get(pickupChainId);
                const driverMappableStops = group.stops.filter(
                  (stop) => !isBreakRouteStop(stop),
                );
                const driverRouteUrl = googleRouteUrl(
                  driverMappableStops,
                  routeOriginAddressForStops(driverMappableStops),
                );

                const deliveries = deliveryMapGroup?.stops || [];
                const pickups = pickupMapGroup?.stops || [];
                const deliveryRouteSegments =
                  routeSegmentsByChainId[deliveryChainId] || [];
                const pickupRouteSegments =
                  routeSegmentsByChainId[pickupChainId] || [];

                function renderStopBadges(
                  stops: typeof deliveries,
                  routeSegments: RouteSegment[],
                  stopClassName: string,
                  segmentClassName: string,
                ) {
                  const incomingStopClassName = (segment: RouteSegment) => {
                    if (segment.fromStopType === "delivery") {
                      return "bg-emerald-600";
                    }

                    if (segment.fromStopType === "pickup") {
                      return "bg-red-600";
                    }

                    return stopClassName;
                  };

                  const relevantSegments = routeSegments.filter(
                    (segment) =>
                      segment.toStopType === stops[0]?.stopType ||
                      (segment.fromStopType === stops[0]?.stopType &&
                        segment.toStopType === stops[0]?.stopType),
                  );

                  const firstStopSequence = Number(
                    stops[0]?.sequenceNumber || 0,
                  );
                  const incomingFirstSegment = relevantSegments.find(
                    (segment) =>
                      segment.toSequence === firstStopSequence,
                  );

                  return stops.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {incomingFirstSegment && (
                        <>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-white ${incomingStopClassName(
                              incomingFirstSegment,
                            )}`}
                            title={incomingFirstSegment.from}
                          >
                            #{incomingFirstSegment.fromSequence || 0}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-1.5 py-1 text-[10px] font-semibold leading-none ${segmentClassName}`}
                            title={`${incomingFirstSegment.from} → ${incomingFirstSegment.to}`}
                          >
                            {compactSegmentLabel(incomingFirstSegment)}
                          </span>
                        </>
                      )}

                      {stops.map((stop, index) => {
                        const currentSequence = Number(
                          stop.sequenceNumber || 0,
                        );
                        const nextSequence = Number(
                          stops[index + 1]?.sequenceNumber || 0,
                        );
                        const segment = relevantSegments.find(
                          (item) =>
                            item.fromSequence === currentSequence &&
                            item.toSequence === nextSequence &&
                            item.fromStopType === stop.stopType &&
                            item.toStopType === stops[index + 1]?.stopType,
                        );
                        const showSegment = index < stops.length - 1 && segment;

                        return (
                          <Fragment key={`${group.driver.id}-${stop.id}`}>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-white ${stopClassName}`}
                              title={stop.title}
                            >
                              #{stop.sequenceNumber || 1}
                            </span>

                            {showSegment && (
                              <span
                                className={`inline-flex items-center rounded-full px-1.5 py-1 text-[10px] font-semibold leading-none ${segmentClassName}`}
                                title={`${segment.from} → ${segment.to}`}
                              >
                                {compactSegmentLabel(segment)}
                              </span>
                            )}
                          </Fragment>
                        );
                      })}
                    </div>
                  ) : null;
                }

                return (
                  <article
                    key={`sequence-${group.driver.id}`}
                    className="rounded-[20px] border border-[#eee5d9] bg-[#fcfaf7] px-3 py-3 sm:px-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded-full"
                          style={{ backgroundColor: group.driver.color }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-base font-bold tracking-tight text-[#1f1e1b]">
                            {group.driver.name}
                          </div>
                          <div className="text-xs font-medium text-[#8b8177]">
                            {group.stops.length} stops
                          </div>
                        </div>
                      </div>

                      {driverRouteUrl && (
                        <a
                          href={driverRouteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-[#23313f] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Open
                        </a>
                      )}
                    </div>

                    <div className="mt-2 space-y-2 text-xs">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <div className="font-semibold uppercase tracking-[0.12em] text-emerald-700">
                          Deliveries
                        </div>
                        {deliveries.length > 0 ? (
                          renderStopBadges(
                            deliveries,
                            deliveryRouteSegments,
                            "bg-emerald-600",
                            "bg-white/80 text-emerald-800 ring-1 ring-emerald-200",
                          )
                        ) : (
                          <span className="mt-1 block text-emerald-700/80">
                            No deliveries
                          </span>
                        )}
                      </div>

                      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                        <div className="font-semibold uppercase tracking-[0.12em] text-red-700">
                          Pickups
                        </div>
                        {pickups.length > 0 ? (
                          renderStopBadges(
                            pickups,
                            pickupRouteSegments,
                            "bg-red-600",
                            "bg-white/80 text-red-800 ring-1 ring-red-200",
                          )
                        ) : (
                          <span className="mt-1 block text-red-700/80">
                            No pickups
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </section>

      <section className="rounded-[24px] border border-black/5 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3 py-3 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="min-w-0 truncate text-lg font-bold tracking-tight text-[#1f1e1b] sm:text-2xl">
                  Today&apos;s routes
                </h3>

                {visibleRouteIssueCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSelectedTimingFilter("issues")}
                    className="inline-flex min-h-7 shrink-0 items-center justify-center rounded-full bg-red-50 px-2.5 text-[11px] font-bold text-red-700 ring-1 ring-red-100 sm:min-h-9 sm:px-3 sm:text-xs"
                  >
                    {visibleRouteIssueCount}{" "}
                    {visibleRouteIssueCount === 1 ? "issue" : "issues"}
                  </button>
                ) : (
                  <span className="inline-flex min-h-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100 sm:min-h-9 sm:px-3 sm:text-xs">
                    All clear
                  </span>
                )}
              </div>

              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[#6c6258] sm:gap-2 sm:text-xs">
                <span className="rounded-full bg-[#f4ede2] px-2.5 py-1 sm:px-3 sm:py-1.5">
                  {visibleStops.length} stops
                </span>
                <span className="rounded-full bg-[#f4ede2] px-2.5 py-1 sm:px-3 sm:py-1.5">
                  {driverStats.filter((driver) => driver.stops > 0).length} active drivers
                </span>
                {selectedDriver !== "all" ? (
                  <span className="max-w-full truncate rounded-full bg-[#eaf2f8] px-2.5 py-1 text-[#2f6fa3] sm:px-3 sm:py-1.5">
                    {selectedDriver}
                  </span>
                ) : null}
              </div>

              <p className="mt-2 hidden text-sm leading-6 text-[#8b8177] sm:block">
                Drag cards to change route order. Open details only when you need them.
              </p>
            </div>

            <div className="hidden sm:flex sm:flex-wrap sm:gap-2">
              <button type="button" onClick={recalculateRoute} disabled={isPending} className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#23313f] transition hover:bg-[#f7f1e8] disabled:opacity-60">Recalculate route</button>
              <button type="button" onClick={resetRouteBoardChanges} disabled={isPending || !hasUnsavedRouteBoardChanges} className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#7a3f2a] transition hover:bg-[#fff1ea] disabled:opacity-50">Cancel changes</button>
              <button type="button" onClick={saveOrder} disabled={isPending} className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744] disabled:opacity-60">{isPending ? "Saving..." : "Save route order"}</button>
              <a href={`/admin/routes/driver/checklists?date=${selectedDate}`} className="inline-flex items-center justify-center rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]">Driver checklist</a>
            </div>
          </div>

          {routeSaveError ? (
            <p className="mt-2 text-sm font-medium text-red-700">{routeSaveError}</p>
          ) : null}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 px-3 pt-2 shadow-[0_-10px_26px_rgba(0,0,0,0.12)] backdrop-blur-md sm:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto grid w-full max-w-lg grid-cols-4 gap-2">
            <button type="button" onClick={recalculateRoute} disabled={isPending} className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-[#f4ede2] px-2 text-[11px] font-bold text-[#23313f] disabled:opacity-50"><span className="text-base">↻</span>Recalc</button>
            <button type="button" onClick={resetRouteBoardChanges} disabled={isPending || !hasUnsavedRouteBoardChanges} className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-[#fff1ea] px-2 text-[11px] font-bold text-[#7a3f2a] disabled:opacity-40"><span className="text-base">×</span>Cancel</button>
            <button type="button" onClick={saveOrder} disabled={isPending} className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-[#c9964f] px-2 text-[11px] font-bold text-white disabled:opacity-50"><span className="text-base">✓</span>{isPending ? "Saving" : "Save"}</button>
            <a href={`/admin/routes/driver/checklists?date=${selectedDate}`} className="flex min-h-14 flex-col items-center justify-center rounded-xl bg-[#23313f] px-2 text-center text-[11px] font-bold text-white"><span className="text-base">☑</span>Checklist</a>
          </div>
        </div>

        <details className="border-b border-[#eee5d9] sm:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-bold text-[#23313f]">
            <span className="inline-flex items-center gap-2">
              <span>Filters</span>
              <span className="rounded-full bg-[#f4ede2] px-2.5 py-1 text-[11px] font-semibold text-[#6c6258]">{selectedDate}</span>
            </span>
            <span className="text-xs text-[#8b8177]">Open</span>
          </summary>

          <form className="grid grid-cols-2 gap-2 border-t border-[#eee5d9] px-3 pb-3 pt-3">
            <input name="date" type="date" defaultValue={selectedDate} className="col-span-2 w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />
            <input name="q" defaultValue={query} placeholder="Search route..." className="col-span-2 w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />
            <select name="type" defaultValue={selectedType} className="min-w-0 w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]">
              <option value="all">All types</option>
              {stopTypes.map((type) => (<option key={type.value} value={type.value}>{type.label}</option>))}
            </select>
            <select name="status" defaultValue={selectedStatus} className="min-w-0 w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]">
              <option value="all">All statuses</option>
              {statuses.map((status) => (<option key={status.value} value={status.value}>{status.label}</option>))}
            </select>
            <button type="submit" className="col-span-2 rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18222d]">Apply filters</button>
          </form>
        </details>

        <div className="hidden border-b border-[#eee5d9] px-6 py-5 sm:block">
          <form className="grid gap-3 xl:grid-cols-[160px_1fr_160px_160px_120px]">
            <input name="date" type="date" defaultValue={selectedDate} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />
            <input name="q" defaultValue={query} placeholder="Search route..." className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]" />
            <select name="type" defaultValue={selectedType} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]">
              <option value="all">All types</option>
              {stopTypes.map((type) => (<option key={type.value} value={type.value}>{type.label}</option>))}
            </select>
            <select name="status" defaultValue={selectedStatus} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]">
              <option value="all">All statuses</option>
              {statuses.map((status) => (<option key={status.value} value={status.value}>{status.label}</option>))}
            </select>
            <button type="submit" className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]">Filter</button>
          </form>
        </div>

        <div className="space-y-3 p-3 sm:space-y-4 sm:p-6">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleStops.map((stop) => stop.id)}
              strategy={verticalListSortingStrategy}
            >
              {visibleStops.map((stop, index) => {
                const sequence = displaySequenceById.get(stop.id);

                return (
                  <SortableStopCard
                    key={stop.id}
                    stop={stop}
                    sequenceNumber={
                      isBreakRouteStop(stop)
                        ? null
                        : sequence?.number || index + 1
                    }
                    numberTone={sequence?.tone || "other"}
                    liveTimingByStopId={liveTimingByStopId}
                    onTimingDraftChange={handleTimingDraftChange}
                    driverDraftByStopId={driverDraftByStopId}
                    onDriverDraftChange={handleDriverDraftChange}
                    drivers={drivers}
                    checklistItems={checklistItems}
                    modifiers={modifiers}
                    selectedDate={selectedDate}
                    bookingRouteStops={bookingRouteStops}
                    supportsRouteStopWindows={supportsRouteStopWindows}
                  />
                );
              })}
            </SortableContext>
          </DndContext>

          {visibleStops.length === 0 && (
            <div className="rounded-[22px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-4 py-10 text-center sm:rounded-[28px] sm:px-6 sm:py-16">
              <div className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-lg">
                No route stops
              </div>

              <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-[#8b8177] sm:mt-2 sm:text-sm">
                Try another date, filter, or driver.
              </p>
            </div>
          )}
        </div>
      </section>

      <details className="hidden sm:block rounded-[24px] border border-black/5 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <summary className="cursor-pointer px-4 py-4 text-sm font-bold text-[#23313f] sm:px-6 sm:py-5">
          + Manual stop
        </summary>

        <form
          action={createRouteStopAction}
          className="border-t border-[#eee5d9] p-3.5 sm:p-6"
        >
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
            <input
              name="stopDate"
              type="date"
              defaultValue={selectedDate}
              required
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <select
              name="stopType"
              defaultValue="delivery"
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            >
              {stopTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            <input
              name="customerName"
              placeholder="Customer"
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <input
              name="customerPhone"
              placeholder="Phone"
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <GoogleAddressInput
              apiKey={googleMapsApiKey}
              name="address"
              value={manualAddress}
              onChange={setManualAddress}
              onResolved={(parts) => {
                if (parts.addressLine) {
                  setManualAddress(parts.addressLine);
                }

                if (parts.city) {
                  setManualCity(parts.city);
                }

                if (parts.state) {
                  setManualState(parts.state);
                }

                if (parts.zip) {
                  setManualZip(parts.zip);
                }
              }}
              placeholder="Address"
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm md:col-span-2"
            />

            <input
              name="city"
              placeholder="City"
              value={manualCity}
              onChange={(event) => setManualCity(event.target.value)}
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <input
              name="zip"
              placeholder="ZIP"
              value={manualZip}
              onChange={(event) => setManualZip(event.target.value)}
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <input type="hidden" name="state" value={manualState} />
            <input type="hidden" name="status" value="scheduled" />

            <input
              name="scheduledStartTime"
              type="time"
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <input
              name="scheduledEndTime"
              type="time"
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <select
              name="driverName"
              defaultValue=""
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            >
              <option value="">Unassigned</option>
              {drivers
                .filter((driver) => driver.name !== "Unassigned")
                .map((driver) => (
                  <option key={driver.id} value={driver.name}>
                    {driver.name}
                  </option>
                ))}
            </select>

            <input
              name="truckName"
              placeholder="Truck"
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <textarea
              name="itemsSummary"
              placeholder="Items"
              rows={2}
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm md:col-span-2 xl:col-span-4"
            />

            <button
              type="submit"
              className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white xl:col-span-4"
            >
              Add manual stop
            </button>
          </div>
        </form>
      </details>

      <details className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <summary className="cursor-pointer px-6 py-5 text-sm font-semibold text-[#23313f]">
          + Break module
        </summary>

        <form
          action={createRouteStopAction}
          className="border-t border-[#eee5d9] p-6"
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <input
              name="stopDate"
              type="date"
              value={breakDate}
              onChange={(event) => setBreakDate(event.target.value)}
              required
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <select
              value={breakAppliesTo}
              onChange={(event) =>
                setBreakAppliesTo(
                  event.target.value === "pickup" ? "pickup" : "delivery",
                )
              }
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            >
              <option value="delivery">Break in delivery route</option>
              <option value="pickup">Break in pickup route</option>
            </select>

            <input
              type="time"
              value={breakStartTime}
              onChange={(event) => setBreakStartTime(event.target.value)}
              required
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            />

            <input
              type="number"
              min={5}
              max={240}
              step={5}
              value={breakMinutes}
              onChange={(event) => setBreakMinutes(event.target.value)}
              required
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
              placeholder="Break minutes"
            />

            <select
              value={breakDriverName}
              onChange={(event) => setBreakDriverName(event.target.value)}
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            >
              <option value="">Unassigned</option>
              {drivers
                .filter((driver) => driver.name !== "Unassigned")
                .map((driver) => (
                  <option key={`break-${driver.id}`} value={driver.name}>
                    {driver.name}
                  </option>
                ))}
            </select>

            <input type="hidden" name="stopType" value={breakAppliesTo} />
            <input type="hidden" name="status" value="scheduled" />
            <input type="hidden" name="customerName" value="Break" />
            <input
              type="hidden"
              name="itemsSummary"
              value={`Break (${Number(breakMinutes || 0)} min)`}
            />
            <input
              type="hidden"
              name="setupNotes"
              value={`break_minutes:${Number(breakMinutes || 0)}`}
            />
            <input type="hidden" name="driverName" value={breakDriverName} />
            <input
              type="hidden"
              name="scheduledStartTime"
              value={breakStartTime}
            />
            <input
              type="hidden"
              name="scheduledEndTime"
              value={addMinutesToTime(
                breakStartTime,
                Number(breakMinutes || 0),
              )}
            />

            <button
              type="submit"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white xl:col-span-5"
            >
              Add break module
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}

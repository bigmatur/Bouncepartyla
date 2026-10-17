"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getAvailabilitySnapshotAction } from "./actions";

type SnapshotItem = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string;
  available: boolean;
  remainingQuantity: number;
  message: string | null;
  checkFailed: boolean;
};

type SnapshotCategory = {
  id: string;
  name: string;
  count: number;
};

type SnapshotPayload = {
  ok: boolean;
  message: string | null;
  selectedDate: string;
  eventStartTime: string;
  eventEndTime: string;
  bookingActor: "cashier" | "customer";
  categories: SnapshotCategory[];
  items: SnapshotItem[];
};

type StatusKind = "available" | "unavailable" | "failed";
type StatusFilter = "all" | "available" | "unavailable";

function shiftIsoDate(date: string, deltaDays: number) {
  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const year = Number(yearRaw || 0);
  const month = Number(monthRaw || 1);
  const day = Number(dayRaw || 1);

  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));

  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function isValidTimeString(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function normalizeTimeInput(value: string, fallback: string) {
  if (!isValidTimeString(value)) {
    return fallback;
  }

  return value;
}

function getStatus(item: SnapshotItem): StatusKind {
  if (item.checkFailed) {
    return "failed";
  }

  if (!item.available) {
    return "unavailable";
  }

  return "available";
}

function getStatusBadge(status: StatusKind) {
  if (status === "available") {
    return {
      label: "Available",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    };
  }

  if (status === "failed") {
    return {
      label: "Check failed",
      className: "bg-slate-100 text-slate-700 ring-slate-300",
    };
  }

  return {
    label: "Unavailable",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
  };
}

function buildNewBookingHref(params: {
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  selectedProductIds: string[];
}) {
    const queryParams = new URLSearchParams();

  if (params.eventDate) {
      queryParams.set("eventDate", params.eventDate);
  }

  if (params.eventStartTime) {
      queryParams.set("eventStartTime", params.eventStartTime);
  }

  if (params.eventEndTime) {
      queryParams.set("eventEndTime", params.eventEndTime);
  }

  if (params.selectedProductIds.length > 0) {
      queryParams.set("productIds", params.selectedProductIds.join(","));
  }

    const query = queryParams.toString();
  return query ? `/admin/bookings/new?${query}` : "/admin/bookings/new";
}

function ProductRow({
  item,
  status,
  selected,
  selectable,
  selectionDisabled,
  toggle,
}: {
  item: SnapshotItem;
  status: StatusKind;
  selected: boolean;
  selectable: boolean;
  selectionDisabled: boolean;
  toggle: (productId: string) => void;
}) {
  const [showReasonDetails, setShowReasonDetails] = useState(false);
  const badge = getStatusBadge(status);
  const reasonText = item.message || (status === "failed" ? "Snapshot check failed for this product." : "");
  const stockLine =
    status === "available"
      ? `${Math.max(0, item.remainingQuantity)} left`
      : status === "failed"
        ? "Could not verify"
        : "Not available";
  const hasLongReason = reasonText.length > 120;
  const renderedReason = hasLongReason && !showReasonDetails ? `${reasonText.slice(0, 120).trimEnd()}...` : reasonText;
  const selectedButIneligible = selected && !selectable;

  return (
    <div
      className={[
        "rounded-xl border bg-white px-2.5 py-2 transition sm:rounded-2xl sm:px-3 sm:py-2.5",
        selected ? "border-[#1f6f5f] ring-2 ring-[#c6e4dc]" : "border-[#e6dfd4]",
        selectable ? "hover:border-[#c7b69f]" : "opacity-90",
      ].join(" ")}
    >
      <div className="flex min-h-[40px] items-start gap-2">
        <label className="inline-flex h-10 items-center justify-center sm:h-11">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggle(item.productId)}
            disabled={selectionDisabled || (!selectable && !selected)}
            className="h-4 w-4 rounded border-[#c8b8a3] text-[#1f6f5f] focus:ring-[#1f6f5f]"
          />
        </label>

        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.productName}
            className="h-10 w-10 shrink-0 rounded-lg object-cover sm:h-11 sm:w-11 sm:rounded-xl"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f4efe7] text-[10px] font-semibold text-[#8f7f69] sm:h-11 sm:w-11 sm:rounded-xl">
            No img
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h3 className="truncate text-sm font-semibold text-[#1c1b19]">{item.productName}</h3>
            <span className={["rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1", badge.className].join(" ")}>
              {badge.label}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#6f6457]">
            <span>{stockLine}</span>
            <span className="text-[#9a8a77]">{item.categoryName}</span>
            {selectedButIneligible ? <span className="text-[#9a5f2f]">Excluded from booking</span> : null}
          </div>

          {reasonText ? (
            <div className="mt-1">
              <p className={[
                "text-xs leading-5",
                status === "failed" ? "text-slate-600" : "text-[#7b3f2b]",
              ].join(" ")}>
                {renderedReason}
              </p>
              {hasLongReason ? (
                <button
                  type="button"
                  onClick={() => setShowReasonDetails((value) => !value)}
                  className="mt-0.5 text-[11px] font-semibold text-[#5a6d82]"
                >
                  {showReasonDetails ? "Hide details" : "Show details"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AvailabilityQuickCheckClient({
  initialSnapshot,
  canCreateBooking,
}: {
  initialSnapshot: SnapshotPayload;
  canCreateBooking: boolean;
}) {
  const [eventDate, setEventDate] = useState(initialSnapshot.selectedDate || "");
  const [eventStartTime, setEventStartTime] = useState(initialSnapshot.eventStartTime || "09:00");
  const [eventEndTime, setEventEndTime] = useState(initialSnapshot.eventEndTime || "21:00");
  const [snapshot, setSnapshot] = useState<SnapshotPayload>(initialSnapshot);
  const [loading, setLoading] = useState(false);
  const [activeRequestParamsKey, setActiveRequestParamsKey] = useState<string | null>(null);
  const [staleSinceInputChange, setStaleSinceInputChange] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(new Date().toISOString());

  const requestCounterRef = useRef(0);
  const hasMountedRef = useRef(false);

  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const normalizedStartTime = normalizeTimeInput(eventStartTime, "09:00");
  const normalizedEndTime = normalizeTimeInput(eventEndTime, "21:00");
  const currentParamsKey = `${eventDate}|${normalizedStartTime}|${normalizedEndTime}`;

  const snapshotMatchesCurrentInputs =
    snapshot.selectedDate === eventDate &&
    snapshot.eventStartTime === normalizedStartTime &&
    snapshot.eventEndTime === normalizedEndTime;

  const refreshPendingForCurrentInputs = loading && activeRequestParamsKey === currentParamsKey;
  const snapshotIsValid =
    snapshot.ok === true &&
    snapshotMatchesCurrentInputs &&
    staleSinceInputChange === false &&
    refreshPendingForCurrentInputs === false;
  const selectionLocked = !snapshotIsValid;

  const items = snapshot.items || [];
  const categories = snapshot.categories || [];

  const itemById = useMemo(() => {
    return new Map(items.map((item) => [item.productId, item]));
  }, [items]);

  useEffect(() => {
    setSelectedProductIds((current) => current.filter((id) => itemById.has(id)));
  }, [itemById]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return items.filter((item) => {
      const status = getStatus(item);
      const categoryKey = item.categoryId || "uncategorized";

      if (categoryFilter !== "all" && categoryKey !== categoryFilter) {
        return false;
      }

      if (statusFilter !== "all" && status !== statusFilter) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = `${item.productName} ${item.categoryName}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      return true;
    });
  }, [items, categoryFilter, search, statusFilter]);

  const selectableByProductId = useMemo(() => {
    const result = new Map<string, boolean>();

    for (const item of items) {
      const status = getStatus(item);
      result.set(
        item.productId,
        snapshotIsValid && status !== "failed" && item.available === true
      );
    }

    return result;
  }, [items, snapshotIsValid]);

  const selectedEligibleIds = useMemo(() => {
    if (!snapshotIsValid) {
      return [];
    }

    return selectedProductIds.filter((id) => selectableByProductId.get(id) === true);
  }, [selectedProductIds, selectableByProductId, snapshotIsValid]);

  const selectedEligibleCount = selectedEligibleIds.length;

  const selectedTotalCount = selectedProductIds.length;

  const statusCounts = useMemo(() => {
    let available = 0;
    let unavailable = 0;
    let failed = 0;

    for (const item of items) {
      const status = getStatus(item);

      if (status === "available") available += 1;
      if (status === "unavailable") unavailable += 1;
      if (status === "failed") failed += 1;
    }

    return {
      available,
      unavailable,
      failed,
    };
  }, [items]);

  const newBookingHref = useMemo(
    () =>
      buildNewBookingHref({
        eventDate,
        eventStartTime,
        eventEndTime,
        selectedProductIds: selectedEligibleIds,
      }),
    [eventDate, eventStartTime, eventEndTime, selectedEligibleIds]
  );

  async function refreshSnapshot() {
    const normalizedStart = normalizeTimeInput(eventStartTime, "09:00");
    const normalizedEnd = normalizeTimeInput(eventEndTime, "21:00");
    const requestParamsKey = `${eventDate}|${normalizedStart}|${normalizedEnd}`;
    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;

    setLoading(true);
    setActiveRequestParamsKey(requestParamsKey);

    const formData = new FormData();
    formData.set("eventDate", eventDate);
    formData.set("eventStartTime", normalizedStart);
    formData.set("eventEndTime", normalizedEnd);

    try {
      const result = await getAvailabilitySnapshotAction(formData);

      if (requestCounterRef.current !== requestId) {
        return;
      }

      setSnapshot(result as SnapshotPayload);
      setLastUpdatedAt(new Date().toISOString());

      const typedResult = result as SnapshotPayload;
      if (
        typedResult.ok === true &&
        typedResult.selectedDate === eventDate &&
        typedResult.eventStartTime === normalizedStart &&
        typedResult.eventEndTime === normalizedEnd
      ) {
        setStaleSinceInputChange(false);
      }
    } catch {
      if (requestCounterRef.current !== requestId) {
        return;
      }

      setSnapshot((current) => ({
        ...current,
        ok: false,
        message: "Snapshot refresh failed. Please retry.",
        selectedDate: eventDate,
        eventStartTime: normalizedStart,
        eventEndTime: normalizedEnd,
      }));
    } finally {
      if (requestCounterRef.current === requestId) {
        setLoading(false);
        setActiveRequestParamsKey(null);
      }
    }
  }

  function markInputsChanged() {
    requestCounterRef.current += 1;
    setLoading(false);
    setActiveRequestParamsKey(null);
    setStaleSinceInputChange(true);
  }

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshSnapshot();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [eventDate, eventStartTime, eventEndTime]);

  function selectAllVisibleSelectable() {
    if (selectionLocked) {
      return;
    }

    const visibleSelectable = filteredItems
      .filter((item) => selectableByProductId.get(item.productId) === true)
      .map((item) => item.productId);

    setSelectedProductIds((current) => Array.from(new Set([...current, ...visibleSelectable])));
  }

  function toggle(productId: string) {
    if (selectionLocked) {
      return;
    }

    setSelectedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : selectableByProductId.get(productId) === true
          ? [...current, productId]
          : current
    );
  }

  function clearSelection() {
    setSelectedProductIds([]);
  }

  const previousDate = shiftIsoDate(eventDate, -1);
  const nextDate = shiftIsoDate(eventDate, 1);
  const showCheckingIndicator = staleSinceInputChange || refreshPendingForCurrentInputs;
  const showMobileFloatingNewBooking = canCreateBooking && snapshotIsValid && selectedEligibleCount > 0;

  return (
    <div className="overflow-x-hidden pb-[calc(9rem+env(safe-area-inset-bottom))] lg:pb-[calc(5.75rem+env(safe-area-inset-bottom))]">
      <section className="rounded-[24px] border border-[#e7ddd1] bg-white p-4 shadow-[0_14px_40px_rgba(21,31,43,0.07)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#1d1b18] sm:text-2xl">Availability</h1>
            <p className="mt-0.5 text-[11px] text-[#6f6457]">America/Los_Angeles</p>
          </div>

          <a
            href="/admin/bookings"
            className="rounded-full border border-[#d7c8b3] bg-white px-3.5 py-2 text-xs font-semibold text-[#3f3427] transition hover:bg-[#fbf7f0]"
          >
            Back to bookings
          </a>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f7651]">Date</span>
            <div className="grid grid-cols-[auto,1fr,auto] gap-1.5">
              <button
                type="button"
                onClick={() => {
                  markInputsChanged();
                  setEventDate(previousDate);
                }}
                className="h-10 rounded-xl border border-[#d8ccb8] bg-white px-2.5 text-xs font-semibold text-[#4c4032] transition hover:bg-[#faf5ed]"
              >
                Prev
              </button>
              <input
                type="date"
                value={eventDate}
                onChange={(event) => {
                  markInputsChanged();
                  setEventDate(event.target.value);
                }}
                className="h-10 w-full rounded-xl border border-[#d9cdbf] bg-white px-3 text-sm text-[#1f1e1b] outline-none focus:border-[#1f6f5f] focus:ring-2 focus:ring-[#d4ede6]"
              />
              <button
                type="button"
                onClick={() => {
                  markInputsChanged();
                  setEventDate(nextDate);
                }}
                className="h-10 rounded-xl border border-[#d8ccb8] bg-white px-2.5 text-xs font-semibold text-[#4c4032] transition hover:bg-[#faf5ed]"
              >
                Next
              </button>
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f7651]">Start</span>
            <input
              type="time"
              value={eventStartTime}
              onChange={(event) => {
                markInputsChanged();
                setEventStartTime(event.target.value);
              }}
              className="h-10 w-full rounded-xl border border-[#d9cdbf] bg-white px-3 text-sm text-[#1f1e1b] outline-none focus:border-[#1f6f5f] focus:ring-2 focus:ring-[#d4ede6]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f7651]">End</span>
            <input
              type="time"
              value={eventEndTime}
              onChange={(event) => {
                markInputsChanged();
                setEventEndTime(event.target.value);
              }}
              className="h-10 w-full rounded-xl border border-[#d9cdbf] bg-white px-3 text-sm text-[#1f1e1b] outline-none focus:border-[#1f6f5f] focus:ring-2 focus:ring-[#d4ede6]"
            />
          </label>

          <div className="sm:col-span-4 flex items-center gap-2">
            <button
              type="button"
              onClick={refreshSnapshot}
              disabled={loading || !eventDate}
              className="h-10 min-w-[100px] rounded-xl bg-[#243649] px-3.5 text-sm font-semibold text-white transition hover:bg-[#1a2938] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Checking..." : "Refresh"}
            </button>

            {showCheckingIndicator ? (
              <span className="text-xs font-semibold text-[#5a6d82]">Checking availability...</span>
            ) : (
              <span className="text-xs text-[#6f6457]">
                Updated {new Date(lastUpdatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>

        {!snapshotIsValid && !showCheckingIndicator && snapshot.message ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{snapshot.message}</span>
              <button
                type="button"
                onClick={refreshSnapshot}
                disabled={loading || !eventDate}
                className="rounded-full border border-rose-300 bg-white px-3 py-1 text-[11px] font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="sticky top-0 z-20 mt-3 rounded-2xl border border-[#e7ddd1] bg-white/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 ring-1 ring-emerald-200">Available {statusCounts.available}</span>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700 ring-1 ring-rose-200">Unavailable {statusCounts.unavailable}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 ring-1 ring-slate-300">Check failed {statusCounts.failed}</span>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product or category"
            className="h-11 rounded-xl border border-[#d9cdbf] bg-white px-3 text-sm text-[#1f1e1b] outline-none focus:border-[#1f6f5f] focus:ring-2 focus:ring-[#d4ede6]"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="h-11 rounded-xl border border-[#d9cdbf] bg-white px-3 text-sm text-[#1f1e1b] outline-none focus:border-[#1f6f5f] focus:ring-2 focus:ring-[#d4ede6]"
          >
            <option value="all">All statuses</option>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAllVisibleSelectable}
              disabled={selectionLocked}
              className="h-11 flex-1 rounded-xl border border-[#d9cbb8] bg-white px-3 text-xs font-semibold text-[#4a4034] hover:bg-[#fbf7f1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Select visible
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="h-11 flex-1 rounded-xl border border-[#e0d8cc] bg-white px-3 text-xs font-semibold text-[#706152] hover:bg-[#faf8f5]"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="mt-2 overflow-x-auto">
          <div className="flex min-w-max gap-2 pb-1">
            <button
              type="button"
              onClick={() => setCategoryFilter("all")}
              className={[
                "h-9 rounded-full px-3 text-xs font-semibold ring-1",
                categoryFilter === "all"
                  ? "bg-[#23313f] text-white ring-[#23313f]"
                  : "bg-white text-[#4a4034] ring-[#d8ccb8]",
              ].join(" ")}
            >
              All ({items.length})
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryFilter(category.id)}
                className={[
                  "h-9 rounded-full px-3 text-xs font-semibold ring-1",
                  categoryFilter === category.id
                    ? "bg-[#23313f] text-white ring-[#23313f]"
                    : "bg-white text-[#4a4034] ring-[#d8ccb8]",
                ].join(" ")}
              >
                {category.name} ({category.count})
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-3 space-y-2">
        {snapshotIsValid
          ? filteredItems.map((item) => {
          const status = getStatus(item);

          return (
            <ProductRow
              key={item.productId}
              item={item}
              status={status}
              selected={selectedProductIds.includes(item.productId)}
              selectable={selectableByProductId.get(item.productId) === true}
              selectionDisabled={selectionLocked}
              toggle={toggle}
            />
          );
            })
          : null}

        {snapshotIsValid && filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-[#e6dfd4] bg-white px-4 py-5 text-sm text-[#7a7063]">
            No products match the current filters.
          </div>
        ) : null}

        {!snapshotIsValid && showCheckingIndicator ? (
          <div className="rounded-2xl border border-[#d7e1ea] bg-[#f7fbff] px-4 py-5 text-sm font-semibold text-[#4d6378]">
            Checking availability for {eventDate || "selected date"} ({normalizedStartTime} - {normalizedEndTime})...
          </div>
        ) : null}

        {!snapshotIsValid && !showCheckingIndicator && !snapshot.message ? (
          <div className="rounded-2xl border border-[#e6dfd4] bg-white px-4 py-5 text-sm text-[#7a7063]">
            Update date or time, then refresh to load current availability.
          </div>
        ) : null}
      </section>

      {showMobileFloatingNewBooking ? (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] lg:hidden">
          <div className="mx-auto flex max-w-7xl justify-end px-3 sm:px-6">
            <Link
              href={newBookingHref}
              className="rounded-full bg-[#1f6f5f] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(25,88,73,0.28)] hover:bg-[#195849]"
            >
              New Booking ({selectedEligibleCount})
            </Link>
          </div>
        </div>
      ) : null}

      <div
        className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-[#d8cebf] bg-[#fffaf2]/95 backdrop-blur lg:block"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-3 pt-2.5 sm:px-6 lg:px-8">
          <div className="text-sm text-[#4a4034]">
            Selected <span className="font-semibold">{selectedTotalCount}</span>
            <span className="ml-1 text-xs text-[#7b6e5e]">eligible {selectedEligibleCount}</span>
          </div>

          <div className="flex items-center gap-2">
            {canCreateBooking ? (
              <Link
                href="/admin/bookings/new"
                className="rounded-full border border-[#cdbba3] bg-white px-4 py-2 text-sm font-semibold text-[#4a4034] hover:bg-[#f9f4ec]"
              >
                Blank
              </Link>
            ) : (
              <span className="rounded-full border border-[#d8cdc0] bg-white px-4 py-2 text-sm font-semibold text-[#8d7f6e]">
                Create permission required
              </span>
            )}

            {canCreateBooking && snapshotIsValid && selectedEligibleCount > 0 ? (
              <Link
                href={newBookingHref}
                className="rounded-full bg-[#1f6f5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#195849]"
              >
                New Booking ({selectedEligibleCount})
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-full bg-[#9cb9b1] px-4 py-2 text-sm font-semibold text-white"
              >
                {snapshotIsValid ? "New Booking (0)" : "New Booking (waiting)"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

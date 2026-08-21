"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Booking = {
  id: string;
  booking_number?: string | null;
  event_date?: string | null;
  setup_city?: string | null;
  customers?:
    | {
        full_name?: string | null;
      }
    | {
        full_name?: string | null;
      }[]
    | null;
};

function bookingLabel(booking: Booking) {
  return booking.booking_number || "Booking";
}

function bookingDetails(booking: Booking) {
  const customer = Array.isArray(booking.customers)
    ? booking.customers[0]
    : booking.customers;

  return [
    booking.event_date || "No date",
    customer?.full_name || "Customer",
  ].join(" · ");
}

function bookingSearchText(booking: Booking) {
  const customer = Array.isArray(booking.customers)
    ? booking.customers[0]
    : booking.customers;

  return [
    booking.booking_number,
    booking.event_date,
    booking.setup_city,
    customer?.full_name,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

export default function BookingSearchSelect({
  bookings,
}: {
  bookings: Booking[];
}) {
  const [query, setQuery] = useState("");
  const [selectedBooking, setSelectedBooking] =
    useState<Booking | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeOnOutsidePointerDown,
      );
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const filteredBookings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return bookings.slice(0, 20);
    }

    return bookings
      .filter((booking) => bookingSearchText(booking).includes(normalizedQuery))
      .slice(0, 20);
  }, [bookings, query]);

  function chooseBooking(booking: Booking) {
    setSelectedBooking(booking);
    setQuery(bookingLabel(booking));
    setOpen(false);
  }

  function clearSelection() {
    setSelectedBooking(null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="hidden"
        name="bookingId"
        value={selectedBooking?.id || ""}
      />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedBooking(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search booking or customer"
        autoComplete="off"
        aria-label="Search booking by number, date or customer"
        className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
      />

      {query && (
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Clear booking search"
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-lg text-[#8b8177] hover:bg-[#f5efe7]"
        >
          ×
        </button>
      )}

      {open && filteredBookings.length > 0 && (
        <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#ddd2c4] bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
          {filteredBookings.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseBooking(booking)}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[#3a342d] transition hover:bg-[#f5efe7]"
            >
              <span className="block truncate font-semibold">
                {bookingLabel(booking)}
              </span>
              <span className="mt-0.5 block truncate text-xs text-[#8b8177]">
                {bookingDetails(booking)}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && query && filteredBookings.length === 0 && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-[#ddd2c4] bg-white px-3 py-3 text-sm text-[#8b8177] shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
          No bookings found
        </div>
      )}
    </div>
  );
}
"use client";

import {
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import {
  checkPublicBookingItemAvailabilityAction,
} from "@/lib/booking/check-booking-item-availability";

type Props = {
  productId: string;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
};

type AvailabilityState = {
  available: boolean;
  message: string;
};

export default function PublicAvailabilityCard({
  productId,
  initialDate = "",
  initialStartTime = "10:00",
  initialEndTime = "18:00",
}: Props) {
  const router = useRouter();

  const [eventDate, setEventDate] =
    useState(initialDate);

  const [eventStartTime, setEventStartTime] =
    useState(initialStartTime);

  const [eventEndTime, setEventEndTime] =
    useState(initialEndTime);

  const [availability, setAvailability] =
    useState<AvailabilityState | null>(null);

  const [isPending, startTransition] =
    useTransition();

  const canCheck = Boolean(
    productId &&
    eventDate &&
    eventStartTime &&
    eventEndTime,
  );

  const bookingHref =
    useMemo(() => {
      const query =
        new URLSearchParams({
          productId,
          date: eventDate,
          startTime: eventStartTime,
          endTime: eventEndTime,
        });

      return `/book?${query.toString()}`;
    }, [
      productId,
      eventDate,
      eventStartTime,
      eventEndTime,
    ]);

  function resetAvailability() {
    setAvailability(null);
  }

  function checkAvailability() {
    if (!canCheck || isPending) {
      return;
    }

    startTransition(async () => {
      const formData =
        new FormData();

      formData.set(
        "productId",
        productId,
      );

      formData.set(
        "eventDate",
        eventDate,
      );

      formData.set(
        "eventStartTime",
        eventStartTime,
      );

      formData.set(
        "eventEndTime",
        eventEndTime,
      );

      try {
        const result =
          await checkPublicBookingItemAvailabilityAction(
            formData,
          );

        setAvailability({
          available:
            Boolean(result.available),
          message:
            String(result.message || ""),
        });
      } catch {
        setAvailability({
          available: false,
          message:
            "We could not check availability right now. Please try again.",
        });
      }
    });
  }

  return (
    <div className="mt-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-black/55">
            Party date
          </span>

          <input
            type="date"
            value={eventDate}
            onChange={(event) => {
              setEventDate(
                event.target.value,
              );
              resetAvailability();
            }}
            className="h-12 w-full rounded-2xl border border-black/10 bg-white px-3 text-base outline-none focus:border-black/30"
          />
        </label>

        <label>
          <span className="mb-1.5 block text-xs font-semibold text-black/55">
            Start time
          </span>

          <input
            type="time"
            step={1800}
            value={eventStartTime}
            onChange={(event) => {
              setEventStartTime(
                event.target.value,
              );
              resetAvailability();
            }}
            className="h-12 w-full rounded-2xl border border-black/10 bg-white px-3 text-base outline-none focus:border-black/30"
          />
        </label>

        <label>
          <span className="mb-1.5 block text-xs font-semibold text-black/55">
            End time
          </span>

          <input
            type="time"
            step={1800}
            value={eventEndTime}
            onChange={(event) => {
              setEventEndTime(
                event.target.value,
              );
              resetAvailability();
            }}
            className="h-12 w-full rounded-2xl border border-black/10 bg-white px-3 text-base outline-none focus:border-black/30"
          />
        </label>
      </div>

      {availability && (
        <div
          className={[
            "mt-3 rounded-2xl border px-4 py-3 text-sm font-semibold",
            availability.available
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700",
          ].join(" ")}
        >
          {availability.available ? "✓ " : "✕ "}
          {availability.message}
        </div>
      )}

      {!availability?.available ? (
        <button
          type="button"
          disabled={!canCheck || isPending}
          onClick={checkAvailability}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isPending
            ? "Checking availability…"
            : "Check availability"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() =>
            router.push(
              bookingHref,
            )
          }
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white transition hover:bg-black"
        >
          Continue to booking
        </button>
      )}

      <p className="mt-3 text-xs leading-5 text-black/45">
        Availability is checked again before the booking is finalized.
      </p>
    </div>
  );
}

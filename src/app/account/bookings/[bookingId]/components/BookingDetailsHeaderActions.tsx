"use client";

import { useState } from "react";

import {
  buildGoogleCalendarUrl,
  copyBookingDetails,
} from "../booking-action-utils";

import BookingHeaderAction from "./BookingHeaderAction";

type BookingDetailsHeaderActionsProps = {
  bookingNumber: string | null;
  setupAddress: string;
  eventDate: string;
  eventStartTime: string | null;
  eventEndTime: string | null;
  eventTitle: string;
};

type CopyState = "idle" | "copied" | "error";


export default function BookingDetailsHeaderActions({
  bookingNumber,
  setupAddress,
  eventDate,
  eventStartTime,
  eventEndTime,
  eventTitle,
}: BookingDetailsHeaderActionsProps) {
  const [copyState, setCopyState] =
    useState<CopyState>("idle");

  function handlePrint() {
    window.print();
  }

  async function handleCopy() {
    try {
      await copyBookingDetails({
        bookingNumber,
        setupAddress,
        pageUrl: window.location.href,
      });

      setCopyState("copied");

      window.setTimeout(() => {
        setCopyState("idle");
      }, 1800);
    } catch (error) {
      console.error(
        "Could not copy booking details:",
        error,
      );

      setCopyState("error");

      window.setTimeout(() => {
        setCopyState("idle");
      }, 1800);
    }
  }

  const copyLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "error"
        ? "Copy failed"
        : "Copy details";


  const calendarUrl = buildGoogleCalendarUrl({
    title: eventTitle,
    eventDate,
    eventStartTime,
    eventEndTime,
    setupAddress,
    bookingNumber,
  });

  return (
    <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
      {calendarUrl ? (
        <BookingHeaderAction
          href={calendarUrl}
          ariaLabel="Add this booking to Google Calendar"
          icon={
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path
                d="M7 3v3M17 3v3M4 9h16M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm6 7v5m-2.5-2.5h5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
              />
            </svg>
          }
          label="Add to Calendar"
          compactLabel="Calendar"
          fullLabelFrom="xl"
        />
      ) : null}


      <BookingHeaderAction
        onClick={handleCopy}
        ariaLabel={copyLabel}
        ariaLive="polite"
        icon={
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              d="M9 8.5V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1.5M7 8h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        }
        label={copyLabel}
        compactLabel={
          copyState === "copied"
            ? "Copied"
            : "Copy"
        }
        fullLabelFrom="sm"
      />

      <BookingHeaderAction
        onClick={handlePrint}
        ariaLabel={
          bookingNumber
            ? `Print booking ${bookingNumber}`
            : "Print booking"
        }
        icon={
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        }
        label="Print booking"
        compactLabel="Print"
        fullLabelFrom="sm"
      />
    </div>
  );
}

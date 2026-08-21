"use client";

import { useState } from "react";
import {
  archiveBookingAction,
  cancelBookingAction,
  deleteBookingPermanentlyAction,
  restoreArchivedBookingAction,
} from "./booking-admin-actions";

export default function BookingDangerZone({
  bookingId,
  bookingLabel,
  bookingStatus,
  archivedAt,
}: {
  bookingId: string;
  bookingLabel: string;
  bookingStatus: string;
  archivedAt?: string | null;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [archiveReason, setArchiveReason] = useState("");

  const cancelled =
    String(bookingStatus || "").trim().toLowerCase() === "cancelled";
  const archived = Boolean(archivedAt);

  const normalizedConfirmation = confirmation.trim().toLowerCase();
  const normalizedBookingLabel = bookingLabel.trim().toLowerCase();

  const confirmationMatches =
    normalizedConfirmation.length > 0 &&
    normalizedConfirmation === normalizedBookingLabel;

  return (
    <section className="rounded-[30px] border border-red-200 bg-red-50 p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <h3 className="text-lg font-semibold text-red-900">
        Admin danger zone
      </h3>

      <p className="mt-2 text-sm leading-6 text-red-800">
        Cancel releases inventory and route stops but keeps the booking
        history. Permanent deletion is available only after cancellation.
      </p>

      <div className="mt-5 grid gap-3">
        {archived ? (
          <form action={restoreArchivedBookingAction}>
            <input type="hidden" name="bookingId" value={bookingId} />

            <button
              type="submit"
              className="w-full rounded-full border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              Restore from archive
            </button>
          </form>
        ) : (
          <form action={archiveBookingAction}>
            <input type="hidden" name="bookingId" value={bookingId} />

            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-red-800">
                Archive reason (optional)
              </span>

              <select
                name="archiveReason"
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                className="w-full rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-200"
              >
                <option value="">No reason</option>
                <option value="Completed">Completed</option>
                <option value="Old booking">Old booking</option>
                <option value="Duplicate">Duplicate</option>
                <option value="Test booking">Test booking</option>
                <option value="Customer cancelled">Customer cancelled</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <button
              type="submit"
              disabled={cancelled}
              onClick={(event) => {
                const confirmed = window.confirm(
                  `Archive ${bookingLabel}? It will be hidden from active booking and route lists.`
                );

                if (!confirmed) {
                  event.preventDefault();
                }
              }}
              className="w-full rounded-full border border-[#d8cec0] bg-white px-4 py-2.5 text-sm font-semibold text-[#2b2a28] hover:bg-[#faf8f5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Archive booking
            </button>
          </form>
        )}
      </div>

      <form action={cancelBookingAction} className="mt-5">
        <input type="hidden" name="bookingId" value={bookingId} />

        <button
          type="submit"
          disabled={cancelled}
          onClick={(event) => {
            const confirmed = window.confirm(
              `Cancel ${bookingLabel} and release inventory?`
            );

            if (!confirmed) {
              event.preventDefault();
            }
          }}
          className="w-full rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cancelled ? "Booking is cancelled" : "Cancel booking"}
        </button>
      </form>

      <div className="my-5 border-t border-red-200" />

      <label
        htmlFor="permanent-delete-confirmation"
        className="block text-xs font-semibold uppercase tracking-[0.12em] text-red-800"
      >
        Type {bookingLabel} to delete permanently
      </label>

      <input
        id="permanent-delete-confirmation"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        placeholder={bookingLabel}
        autoComplete="off"
        spellCheck={false}
        disabled={!cancelled}
        className="mt-2 w-full rounded-2xl border border-red-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:bg-red-100 disabled:opacity-60"
      />

      <form action={deleteBookingPermanentlyAction} className="mt-3">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="confirmation" value={confirmation.trim()} />
        <input type="hidden" name="confirmDelete" value="true" />

        <button
          type="submit"
          disabled={!cancelled || !confirmationMatches}
          onClick={(event) => {
            const confirmed = window.confirm(
              `Permanently delete ${bookingLabel}? This cannot be undone.`
            );

            if (!confirmed) {
              event.preventDefault();
            }
          }}
          className="w-full rounded-full border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Delete permanently
        </button>
      </form>
    </section>
  );
}
"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  payApprovedCustomerBookingDepositAction,
} from "../actions";
import type { CustomerManualPaymentMethod } from "../booking-types";
import ActionButton from "@/components/ui/ActionButton";
import CustomerBalancePaymentOptions from "./CustomerBalancePaymentOptions";

function money(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safeValue);
}

type MobileBalancePaymentBarProps = {
  bookingId: string;
  balanceDue: number;
  isApprovalFlow?: boolean;
  bookingPaymentReference: string;
  manualPaymentMethods?: CustomerManualPaymentMethod[];
};

export default function MobileBalancePaymentBar({
  bookingId,
  balanceDue,
  isApprovalFlow = false,
  bookingPaymentReference,
  manualPaymentMethods = [],
}: MobileBalancePaymentBarProps) {
  const [showOptions, setShowOptions] = useState(false);
  const payButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dialogTitleId = useId();

  const closeOptions = () => {
    setShowOptions(false);
  };

  useEffect(() => {
    if (!showOptions) {
      return;
    }

    const triggerButton = payButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOptions();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const dialogElement = dialogRef.current;
      if (!dialogElement) {
        return;
      }

      const focusable = Array.from(
        dialogElement.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (current === first || !dialogElement.contains(current)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (current === last || !dialogElement.contains(current)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      triggerButton?.focus();
    };
  }, [showOptions]);

  return (
    <>
      <div className="fixed inset-x-3 bottom-3 z-50 rounded-[20px] border border-black/10 bg-white/95 p-2 shadow-[0_16px_45px_rgba(0,0,0,0.16)] backdrop-blur-xl print:hidden lg:hidden">
        <div className="flex items-center gap-2 rounded-2xl bg-[#f7f4ef] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a723e]">
              Balance due
            </div>
            <div className="mt-0.5 truncate text-lg font-semibold text-red-700">
              {money(balanceDue)}
            </div>
          </div>

          {isApprovalFlow ? (
            <form action={payApprovedCustomerBookingDepositAction}>
              <input type="hidden" name="bookingId" value={bookingId} />
              <ActionButton
                pendingText="Opening payment..."
                className="min-h-11 px-4"
              >
                Continue to payment
              </ActionButton>
            </form>
          ) : (
            <button
              ref={payButtonRef}
              type="button"
              onClick={() => setShowOptions(true)}
              className="min-h-11 rounded-full bg-[#23313f] px-4 text-sm font-semibold text-white"
              aria-haspopup="dialog"
              aria-expanded={showOptions}
              aria-controls="mobile-balance-payment-dialog"
            >
              Pay balance
            </button>
          )}
        </div>
      </div>

      {showOptions && !isApprovalFlow ? (
        <div className="fixed inset-0 z-[60] bg-black/45 lg:hidden" onClick={closeOptions}>
          <div
            id="mobile-balance-payment-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="absolute inset-x-0 bottom-0 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-[0_-16px_44px_rgba(0,0,0,0.2)]"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 id={dialogTitleId} className="text-base font-semibold text-[#1f2f42]">Choose payment method</h3>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeOptions}
                className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-black/70"
              >
                Close
              </button>
            </div>

            <p className="mt-1 text-xs leading-5 text-black/60">
              Balance due: {money(balanceDue)}
            </p>

            <CustomerBalancePaymentOptions
              bookingId={bookingId}
              balanceDue={balanceDue}
              bookingPaymentReference={bookingPaymentReference}
              manualPaymentMethods={manualPaymentMethods}
              variant="mobile"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

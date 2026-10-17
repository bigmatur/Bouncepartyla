"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { CustomerManualPaymentMethod } from "../booking-types";

type CopyTarget = "account" | "reference";

type CopyState =
  | { status: "idle" }
  | { status: "copied"; target: CopyTarget }
  | { status: "error"; message: string };

type CustomerManualPaymentInstructionsProps = {
  method: CustomerManualPaymentMethod;
  bookingPaymentReference: string;
  balanceDue: number;
  className?: string;
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safeValue);
}

export default function CustomerManualPaymentInstructions({
  method,
  bookingPaymentReference,
  balanceDue,
  className,
}: CustomerManualPaymentInstructionsProps) {
  const [copyState, setCopyState] = useState<CopyState>({ status: "idle" });
  const resetTimerRef = useRef<number | null>(null);
  const methodDisplayName = method.display_name || (method.method === "zelle" ? "Zelle" : "Venmo");
  const accountLabel = method.account_label || "Account";
  const accountValue = String(method.account_value || "").trim();
  const reference = String(bookingPaymentReference || "").trim();

  const copyErrorMessage =
    copyState.status === "error"
      ? copyState.message
      : null;

  const helperId = useId();

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  async function copyToClipboard(value: string, target: CopyTarget) {
    if (!value) {
      setCopyState({
        status: "error",
        message: "Nothing to copy. Please select the text manually.",
      });
      return;
    }

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyState({
        status: "error",
        message: "Clipboard is unavailable on this device. Please select and copy manually.",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyState({ status: "copied", target });

      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }

      resetTimerRef.current = window.setTimeout(() => {
        setCopyState({ status: "idle" });
      }, 1800);
    } catch {
      setCopyState({
        status: "error",
        message: "Could not copy to clipboard. Please select and copy manually.",
      });
    }
  }

  return (
    <div className={className || "rounded-[14px] border border-[#d6e1ed] bg-white px-3 py-3 text-sm text-[#2a3d51]"}>
      <p className="font-semibold text-[#23313f]">
        Pay {money(balanceDue)} via {methodDisplayName}
      </p>

      <div className="mt-2 space-y-2 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5a6d82]">
            Recipient
          </p>
          <p className="mt-0.5 break-all font-medium text-[#1f2f42]">
            {accountLabel}:
          </p>
          <p className="select-all break-all font-medium text-[#1f2f42]">
            {accountValue}
          </p>
          <button
            type="button"
            onClick={() => copyToClipboard(accountValue, "account")}
            className="mt-1 rounded-full border border-[#c7d7e8] px-2.5 py-1 text-[11px] font-semibold text-[#2e4a66]"
            aria-describedby={helperId}
            aria-label={`Copy ${methodDisplayName} account details`}
          >
            {copyState.status === "copied" && copyState.target === "account" ? "Copied" : "Copy account details"}
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#5a6d82]">
            Booking reference
          </p>
          <p className="mt-0.5 select-all break-all font-mono text-sm font-semibold text-[#1f2f42]">{reference}</p>
          <button
            type="button"
            onClick={() => copyToClipboard(reference, "reference")}
            className="mt-1 rounded-full border border-[#c7d7e8] px-2.5 py-1 text-[11px] font-semibold text-[#2e4a66]"
            aria-describedby={helperId}
            aria-label="Copy booking reference"
          >
            {copyState.status === "copied" && copyState.target === "reference" ? "Copied" : "Copy booking number"}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs leading-5 text-[#4e6277]">
        Include this booking number in the payment memo/comment.
      </p>
      <p className="mt-1 text-xs leading-5 text-[#4e6277]">
        Manual payments are reviewed by admin before they are marked received.
      </p>

      <p id={helperId} className="mt-2 min-h-[1.25rem] text-xs" role="status" aria-live="polite">
        {copyErrorMessage ? <span className="text-amber-800">{copyErrorMessage}</span> : null}
      </p>
    </div>
  );
}

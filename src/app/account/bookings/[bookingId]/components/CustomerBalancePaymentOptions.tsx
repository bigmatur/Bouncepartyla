"use client";

import { useMemo, useState } from "react";

import { payCustomerBookingBalanceByCardAction } from "../actions";
import type { CustomerManualPaymentMethod } from "../booking-types";
import ActionButton from "@/components/ui/ActionButton";
import CustomerManualPaymentInstructions from "./CustomerManualPaymentInstructions";

type PaymentChoice = "card" | "zelle" | "venmo";

type CustomerBalancePaymentOptionsProps = {
  bookingId: string;
  balanceDue: number;
  bookingPaymentReference: string;
  manualPaymentMethods: CustomerManualPaymentMethod[];
  variant?: "desktop" | "mobile";
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safeValue);
}

export default function CustomerBalancePaymentOptions({
  bookingId,
  balanceDue,
  bookingPaymentReference,
  manualPaymentMethods,
  variant = "desktop",
}: CustomerBalancePaymentOptionsProps) {
  const [selectedPaymentChoice, setSelectedPaymentChoice] = useState<PaymentChoice>("card");

  const manualMethods = useMemo(
    () =>
      (manualPaymentMethods || []).filter((method) => {
        const code = String(method?.method || "").toLowerCase();
        const accountValue = String(method?.account_value || "").trim();
        return (code === "zelle" || code === "venmo") && accountValue.length > 0;
      }),
    [manualPaymentMethods],
  );

  const selectedManualMethod =
    selectedPaymentChoice === "zelle" || selectedPaymentChoice === "venmo"
      ? manualMethods.find((item) => item.method === selectedPaymentChoice) || null
      : null;

  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
        <button
          type="button"
          onClick={() => setSelectedPaymentChoice("card")}
          className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 ${
            selectedPaymentChoice === "card"
              ? "bg-[#23313f] text-white ring-[#23313f]"
              : "bg-white text-[#2a3d51] ring-[#b9ccdf]"
          }`}
          aria-pressed={selectedPaymentChoice === "card"}
        >
          Card
        </button>

        {manualMethods.map((method) => (
          <button
            key={method.method}
            type="button"
            onClick={() => setSelectedPaymentChoice(method.method)}
            className={`rounded-full px-3 py-2 text-xs font-semibold ring-1 ${
              selectedPaymentChoice === method.method
                ? "bg-[#23313f] text-white ring-[#23313f]"
                : "bg-white text-[#2a3d51] ring-[#b9ccdf]"
            }`}
            aria-pressed={selectedPaymentChoice === method.method}
          >
            {method.display_name || (method.method === "zelle" ? "Zelle" : "Venmo")}
          </button>
        ))}
      </div>

      {selectedPaymentChoice === "card" ? (
        <form action={payCustomerBookingBalanceByCardAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <ActionButton
            pendingText="Opening payment..."
            className="mt-3 w-full rounded-full bg-[#23313f] px-4 py-3 text-sm font-semibold text-white sm:mt-4"
          >
            Pay {money(balanceDue)} by card
          </ActionButton>
        </form>
      ) : selectedManualMethod ? (
        <CustomerManualPaymentInstructions
          method={selectedManualMethod}
          balanceDue={balanceDue}
          bookingPaymentReference={bookingPaymentReference}
          className={
            variant === "mobile"
              ? "mt-3 rounded-2xl border border-[#d6e1ed] bg-[#f8fbff] px-3 py-3 text-sm text-[#2a3d51]"
              : "mt-3 rounded-[14px] border border-[#d6e1ed] bg-white px-3 py-3 text-sm text-[#2a3d51] sm:mt-4"
          }
        />
      ) : (
        <div className="mt-3 rounded-[14px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:mt-4">
          This payment method is currently unavailable.
        </div>
      )}
    </div>
  );
}

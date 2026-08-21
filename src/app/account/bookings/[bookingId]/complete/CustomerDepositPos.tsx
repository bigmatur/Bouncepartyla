"use client";

import { useEffect, useMemo, useState } from "react";
import { recordTemporaryBookingDepositAction } from "./actions";

type PaymentMethod = { method: string; display_name: string };

type TipSettings = {
  tipsEnabled: boolean;
  allowCustomTip: boolean;
  tipMode: "percent" | "amount";
  defaultTipPercent: number;
  defaultTipAmount: number;
  tipPercentOptions: number[];
  tipAmountOptions: number[];
};

type PaymentSummary = {
  productsSubtotal: number;
  modifiersSubtotal: number;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  depositAmount: number;
  totalAmount: number;
  balanceDue: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export default function CustomerDepositPos({
  bookingId,
  amountDue,
  paymentMethods,
  tipSettings,
  summary,
}: {
  bookingId: string;
  amountDue: number;
  paymentMethods: PaymentMethod[];
  tipSettings: TipSettings;
  summary: PaymentSummary;
}) {
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentAmountEdited, setPaymentAmountEdited] = useState(false);
  const [tipMode, setTipMode] = useState<"percent" | "amount">("percent");
  const [tipPercent, setTipPercent] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
  const [tipAmountEdited, setTipAmountEdited] = useState(false);

  const normalizedBalance = Math.max(0, Number(amountDue || 0));
  const safeDiscount = Number(Math.max(0, Number(summary.discountAmount || 0)).toFixed(2));
  const totalChargeNow = Number((paymentAmount + (tipSettings.tipsEnabled ? tipAmount : 0)).toFixed(2));

  const defaultMethod = useMemo(() => String(paymentMethods[0]?.method || "stripe"), [paymentMethods]);

  function openPos() {
    setPaymentMethod(defaultMethod);
    setPaymentAmount(normalizedBalance);
    setPaymentAmountEdited(false);

    const initialTipMode = tipSettings.tipMode === "amount" ? "amount" : "percent";
    setTipMode(initialTipMode);

    if (tipSettings.tipsEnabled) {
      if (initialTipMode === "amount") {
        const amt = Number(tipSettings.defaultTipAmount || 0);
        setTipAmount(amt);
        setTipPercent(normalizedBalance > 0 ? Number(((amt / normalizedBalance) * 100).toFixed(2)) : 0);
      } else {
        const pct = Number(tipSettings.defaultTipPercent || 0);
        setTipPercent(pct);
        setTipAmount(Number(((normalizedBalance * pct) / 100).toFixed(2)));
      }
      setTipAmountEdited(false);
    } else {
      setTipPercent(0);
      setTipAmount(0);
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open || paymentAmountEdited) return;
    setPaymentAmount(normalizedBalance);
    if (tipSettings.tipsEnabled && tipMode === "percent") {
      setTipAmount(Number(((normalizedBalance * tipPercent) / 100).toFixed(2)));
    }
  }, [open, paymentAmountEdited, normalizedBalance, tipSettings.tipsEnabled, tipMode, tipPercent]);

  function applyTipPercent(percent: number) {
    const safe = Math.max(0, Number(percent || 0));
    setTipPercent(safe);
    setTipAmount(Number(((paymentAmount * safe) / 100).toFixed(2)));
    setTipAmountEdited(false);
  }

  function applyTipAmount(amount: number) {
    const safe = Math.max(0, Number(amount || 0));
    setTipAmount(safe);
    setTipPercent(paymentAmount > 0 ? Number(((safe / paymentAmount) * 100).toFixed(2)) : 0);
    setTipAmountEdited(false);
  }

  const isStripe = String(paymentMethod).toLowerCase() === "stripe";

  return (
    <>
      <button
        type="button"
        onClick={openPos}
        className="mt-4 min-h-11 w-full rounded-xl bg-[#23313f] px-4 text-sm font-semibold text-white transition hover:bg-[#18222d]"
      >
        Pay deposit by card
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
            {/* Header */}
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">Payment before booking creation</h3>
              <p className="mt-1 text-sm text-[#6c6258]">Select payment method and amount to charge now.</p>
            </div>

            <form action={recordTemporaryBookingDepositAction} className="space-y-4 overflow-y-auto p-4 sm:p-6">
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="method" value={paymentMethod || defaultMethod} />
              <input type="hidden" name="baseAmount" value={paymentAmount.toFixed(2)} />
              <input type="hidden" name="tipAmount" value={(tipSettings.tipsEnabled ? tipAmount : 0).toFixed(2)} />
              <input type="hidden" name="amount" value={totalChargeNow.toFixed(2)} />

              {/* POS checkout summary card */}
              <div className="rounded-[20px] bg-[#23313f] p-4 text-white">
                <div className="text-xs uppercase tracking-[0.14em] text-white/65">POS checkout</div>
                <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-white/65">Base payment</div>
                    <div className="text-lg font-semibold">{money(paymentAmount)}</div>
                  </div>
                  <div>
                    <div className="text-white/65">Tip</div>
                    <div className="text-lg font-semibold">{money(tipSettings.tipsEnabled ? tipAmount : 0)}</div>
                  </div>
                </div>
                <div className="mt-3 border-t border-white/15 pt-3 text-right text-2xl font-semibold">
                  {money(totalChargeNow)}
                </div>
              </div>

              {/* Payment method */}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Payment method</span>
                <div className="flex flex-wrap gap-2">
                  {paymentMethods.map((row) => {
                    const active = String(row.method) === paymentMethod;
                    return (
                      <button
                        key={row.method}
                        type="button"
                        onClick={() => setPaymentMethod(String(row.method))}
                        className={[
                          "rounded-full border px-4 py-2 text-xs font-semibold transition",
                          active
                            ? "border-[#23313f] bg-[#23313f] text-white"
                            : "border-[#d8cec0] bg-white text-[#2b2a28]",
                        ].join(" ")}
                      >
                        {row.display_name}
                      </button>
                    );
                  })}
                </div>
              </label>

              {/* Amount */}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Amount to pay now</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentAmount}
                  onChange={(e) => {
                    const next = Number(e.target.value || 0);
                    setPaymentAmount(next);
                    setPaymentAmountEdited(true);
                    if (tipSettings.tipsEnabled && !tipAmountEdited && tipMode === "percent") {
                      setTipAmount(Number(((next * tipPercent) / 100).toFixed(2)));
                    }
                  }}
                  className="w-full rounded-2xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                />
              </label>

              {/* Tip section */}
              {tipSettings.tipsEnabled && (
                <div className="space-y-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Tip ($ mode from settings)
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {/* No tip button */}
                    <button
                      type="button"
                      onClick={() => { setTipPercent(0); setTipAmount(0); setTipAmountEdited(false); }}
                      className={[
                        "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
                        tipAmount === 0 && !tipAmountEdited
                          ? "border-[#23313f] bg-[#23313f] text-white"
                          : "border-[#d8cec0] bg-white text-[#2b2a28]",
                      ].join(" ")}
                    >
                      <span className="text-xl font-bold">0</span>
                      <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">No tip</span>
                    </button>

                    {tipMode === "percent"
                      ? tipSettings.tipPercentOptions.map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => applyTipPercent(pct)}
                            className={[
                              "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
                              pct === tipPercent && !tipAmountEdited
                                ? "border-[#23313f] bg-[#23313f] text-white"
                                : "border-[#d8cec0] bg-white text-[#2b2a28]",
                            ].join(" ")}
                          >
                            <span className="text-2xl font-bold">{pct}%</span>
                            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">Tip</span>
                          </button>
                        ))
                      : tipSettings.tipAmountOptions.map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => applyTipAmount(amt)}
                            className={[
                              "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
                              amt === tipAmount && !tipAmountEdited
                                ? "border-[#23313f] bg-[#23313f] text-white"
                                : "border-[#d8cec0] bg-white text-[#2b2a28]",
                            ].join(" ")}
                          >
                            <span className="text-2xl font-bold">{money(amt)}</span>
                            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">Tip</span>
                          </button>
                        ))}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-[#6c6258]">Custom tip amount</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={tipMode === "percent" ? tipPercent : tipAmount}
                        onChange={(e) => {
                          const next = Number(e.target.value || 0);
                          setTipAmountEdited(true);
                          if (tipMode === "percent") { applyTipPercent(next); setTipAmountEdited(true); }
                          else { setTipAmount(next); if (paymentAmount > 0) setTipPercent(Number(((next / paymentAmount) * 100).toFixed(2))); }
                        }}
                        disabled={!tipSettings.allowCustomTip}
                        className="w-full rounded-2xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-[#6c6258]">Tip %</span>
                      <input
                        type="number"
                        step="0.01"
                        value={tipMode === "percent" ? tipAmount : tipPercent}
                        readOnly
                        className="w-full rounded-2xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Summary</div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3"><span>Products</span><span className="font-semibold text-[#1f1e1b]">{money(summary.productsSubtotal)}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Options</span><span className="font-semibold text-[#1f1e1b]">{money(summary.modifiersSubtotal)}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Subtotal</span><span className="font-semibold text-[#1f1e1b]">{money(summary.subtotal)}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Discount</span><span className="font-semibold text-[#1f1e1b]">-{money(safeDiscount)}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Delivery</span><span className="font-semibold text-[#1f1e1b]">{money(summary.deliveryFee)}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Tax</span><span className="font-semibold text-[#1f1e1b]">{money(summary.taxAmount)}</span></div>
                  <div className="flex items-center justify-between gap-3"><span>Deposit</span><span className="font-semibold text-[#1f1e1b]">-{money(summary.depositAmount)}</span></div>
                  <div className="border-t border-[#e5dbce] pt-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#1f1e1b]">Total</span>
                      <span className="text-lg font-semibold text-[#1f1e1b]">{money(summary.totalAmount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#1f1e1b]">Balance due</span>
                      <span className="font-semibold text-red-700">{money(summary.balanceDue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reference / transaction ID */}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Reference / Transaction ID</span>
                <input
                  name="note"
                  placeholder="Optional"
                  className="w-full rounded-2xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                />
              </label>

              {/* Stripe note for card payments */}
              {isStripe && (
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  You will be redirected to Stripe secure checkout.
                </p>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 border-t border-[#eee5d9] pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[#d8cec0] bg-white px-5 py-2.5 text-sm font-semibold text-[#2b2a28]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#23313f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                >
                  {isStripe ? "Continue to card payment" : `Create booking (${money(totalChargeNow)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

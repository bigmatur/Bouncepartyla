"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type PaymentMethod = {
  method: string;
  display_name?: string;
};

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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function PaymentProcessingOverlay() {
  const { pending } = useFormStatus();

  if (!pending) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/85 p-6 backdrop-blur-[1px]">
      <div className="flex items-center gap-3 rounded-2xl border border-[#e1d5c7] bg-white px-4 py-3 text-sm font-semibold text-[#23313f] shadow-[0_12px_30px_rgba(35,49,63,0.14)]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d6c2ab] border-t-[#23313f]" aria-hidden="true" />
        Processing payment...
      </div>
    </div>
  );
}

function PaymentSubmitButton({ total }: { total: number }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-full bg-[#23313f] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-80"
    >
      {pending ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/45 border-t-white" aria-hidden="true" />
          Processing...
        </>
      ) : (
        `Pay now (${money(total)})`
      )}
    </button>
  );
}

export default function PaymentPosPanel({
  bookingId,
  balanceDue,
  paymentMethods,
  tipSettings,
  summary,
  paymentAction,
  autoOpen,
}: {
  bookingId: string;
  balanceDue: number;
  paymentMethods: PaymentMethod[];
  tipSettings: TipSettings;
  summary: PaymentSummary;
  paymentAction: (formData: FormData) => void | Promise<void>;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentAmountEdited, setPaymentAmountEdited] = useState(false);
  const [tipMode, setTipMode] = useState<"percent" | "amount">("percent");
  const [tipPercent, setTipPercent] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
  const [tipAmountEdited, setTipAmountEdited] = useState(false);
  const [autoOpenedOnce, setAutoOpenedOnce] = useState(false);

  const normalizedBalance = Math.max(0, Number(balanceDue || 0));
  const canPay = normalizedBalance > 0;
  const safeDiscountAmount = Number(Math.max(0, Number(summary.discountAmount || 0)).toFixed(2));
  const liveTaxAmount = Number(summary.taxAmount || 0);
  const liveTotalAmount = Number(summary.totalAmount || 0);
  const liveBalanceDue = Number(Math.max(0, Number(summary.balanceDue || 0)).toFixed(2));

  const defaultMethod = useMemo(() => {
    return String(paymentMethods[0]?.method || "cash");
  }, [paymentMethods]);

  const totalChargeNow = Number((paymentAmount + tipAmount).toFixed(2));

  function openPos() {
    setPaymentMethod(defaultMethod);
    setPaymentAmount(liveBalanceDue);
    setPaymentAmountEdited(false);

    const initialTipMode = tipSettings.tipMode === "amount" ? "amount" : "percent";
    setTipMode(initialTipMode);

    if (tipSettings.tipsEnabled) {
      if (initialTipMode === "amount") {
        const amountTip = Number(tipSettings.defaultTipAmount || 0);
        setTipAmount(amountTip);
        setTipPercent(
          liveBalanceDue > 0
            ? Number(((amountTip / liveBalanceDue) * 100).toFixed(2))
            : 0
        );
      } else {
        const percentTip = Number(tipSettings.defaultTipPercent || 0);
        setTipPercent(percentTip);
        setTipAmount(Number(((liveBalanceDue * percentTip) / 100).toFixed(2)));
      }
      setTipAmountEdited(false);
    } else {
      setTipPercent(0);
      setTipAmount(0);
      setTipAmountEdited(false);
    }

    setOpen(true);
  }

  useEffect(() => {
    if (!autoOpen || autoOpenedOnce || open || !canPay) {
      return;
    }

    openPos();
    setAutoOpenedOnce(true);
  }, [autoOpen, autoOpenedOnce, open, canPay]);

  function applyTipPercent(percent: number) {
    const safePercent = Math.max(0, Number(percent || 0));
    setTipPercent(safePercent);
    setTipAmount(Number(((paymentAmount * safePercent) / 100).toFixed(2)));
    setTipAmountEdited(false);
  }

  useEffect(() => {
    if (!open || paymentAmountEdited) {
      return;
    }

    setPaymentAmount(liveBalanceDue);

    if (tipSettings.tipsEnabled && tipMode === "percent") {
      setTipAmount(Number(((liveBalanceDue * tipPercent) / 100).toFixed(2)));
    }
  }, [
    open,
    paymentAmountEdited,
    liveBalanceDue,
    tipSettings.tipsEnabled,
    tipMode,
    tipPercent,
  ]);

  function applyTipAmount(amount: number) {
    const safeAmount = Math.max(0, Number(amount || 0));
    setTipAmount(safeAmount);

    if (paymentAmount > 0) {
      setTipPercent(Number(((safeAmount / paymentAmount) * 100).toFixed(2)));
    } else {
      setTipPercent(0);
    }

    setTipAmountEdited(false);
  }

  return (
    <>
      <div className="mt-2 border-t border-[#eee5d9] pt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          POS terminal
        </div>

        <button
          type="button"
          onClick={openPos}
          disabled={!canPay}
          className="mt-3 w-full rounded-full bg-[#23313f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {canPay ? "Pay" : "No balance due"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-[#1f1e1b]">POS payment</h3>
                <p className="mt-1 text-sm text-[#6c6258]">
                  Pay remaining balance for this booking.
                </p>
              </div>
            </div>

            <form action={paymentAction} className="relative space-y-4 overflow-y-auto p-4 sm:p-6">
              <input type="hidden" name="bookingId" value={bookingId} />
              <input type="hidden" name="method" value={paymentMethod || defaultMethod} />
              <input type="hidden" name="discountAmount" value={safeDiscountAmount.toFixed(2)} />
              <input type="hidden" name="baseAmount" value={paymentAmount.toFixed(2)} />
              <input type="hidden" name="tipAmount" value={(tipSettings.tipsEnabled ? tipAmount : 0).toFixed(2)} />
              <input type="hidden" name="amount" value={totalChargeNow.toFixed(2)} />

              <div className="rounded-[20px] bg-[#23313f] p-4 text-white">
                <div className="text-xs uppercase tracking-[0.14em] text-white/65">POS checkout</div>
                <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-white/65">Base payment</div>
                    <div className="text-lg font-semibold">{money(paymentAmount)}</div>
                  </div>
                  <div>
                    <div className="text-white/65">Tip</div>
                    <div className="text-lg font-semibold">
                      {money(tipSettings.tipsEnabled ? tipAmount : 0)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 border-t border-white/15 pt-3 text-right text-2xl font-semibold">
                  {money(totalChargeNow)}
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#6c6258]">Method</span>
                <div className="flex flex-wrap gap-2">
                  {paymentMethods.map((row) => {
                    const active = String(row.method) === paymentMethod;

                    return (
                      <button
                        key={String(row.method)}
                        type="button"
                        onClick={() => setPaymentMethod(String(row.method))}
                        className={[
                          "rounded-full border px-4 py-2 text-xs font-semibold transition",
                          active
                            ? "border-[#23313f] bg-[#23313f] text-white"
                            : "border-[#d8cec0] bg-white text-[#2b2a28]",
                        ].join(" ")}
                      >
                        {String(row.display_name || row.method)}
                      </button>
                    );
                  })}
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#6c6258]">Amount to pay now</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentAmount}
                  onChange={(event) => {
                    const next = Number(event.target.value || 0);
                    setPaymentAmount(next);
                    setPaymentAmountEdited(true);

                    if (tipSettings.tipsEnabled && !tipAmountEdited && tipMode === "percent") {
                      setTipAmount(Number(((next * tipPercent) / 100).toFixed(2)));
                    }
                  }}
                  className="w-full rounded-2xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                />
              </label>

              {tipSettings.tipsEnabled && (
                <div className="space-y-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Tip ({tipMode === "percent" ? "%" : "$"} mode from settings)
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => {
                        setTipPercent(0);
                        setTipAmount(0);
                        setTipAmountEdited(false);
                      }}
                      className={[
                        "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
                        Number(tipAmount) === 0 && !tipAmountEdited
                          ? "border-[#23313f] bg-[#23313f] text-white"
                          : "border-[#d8cec0] bg-white text-[#2b2a28]",
                      ].join(" ")}
                    >
                      <span className="text-xl font-bold">0</span>
                      <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">No tip</span>
                    </button>

                    {tipMode === "percent"
                      ? tipSettings.tipPercentOptions.map((percent) => (
                          <button
                            key={percent}
                            type="button"
                            onClick={() => applyTipPercent(percent)}
                            className={[
                              "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
                              Number(percent) === Number(tipPercent) && !tipAmountEdited
                                ? "border-[#23313f] bg-[#23313f] text-white"
                                : "border-[#d8cec0] bg-white text-[#2b2a28]",
                            ].join(" ")}
                          >
                            <span className="text-2xl font-bold">{percent}%</span>
                            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">Tip</span>
                          </button>
                        ))
                      : tipSettings.tipAmountOptions.map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => applyTipAmount(Number(amount || 0))}
                            className={[
                              "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
                              Number(amount) === Number(tipAmount) && !tipAmountEdited
                                ? "border-[#23313f] bg-[#23313f] text-white"
                                : "border-[#d8cec0] bg-white text-[#2b2a28]",
                            ].join(" ")}
                          >
                            <span className="text-2xl font-bold">{money(Number(amount || 0))}</span>
                            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">Tip</span>
                          </button>
                        ))}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-[#6c6258]">
                        {tipMode === "percent" ? "Custom tip %" : "Custom tip amount"}
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={tipMode === "percent" ? tipPercent : tipAmount}
                        onChange={(event) => {
                          const next = Number(event.target.value || 0);
                          setTipAmountEdited(true);

                          if (tipMode === "percent") {
                            applyTipPercent(next);
                            setTipAmountEdited(true);
                          } else {
                            setTipAmount(next);

                            if (paymentAmount > 0) {
                              setTipPercent(Number(((next / paymentAmount) * 100).toFixed(2)));
                            }
                          }
                        }}
                        disabled={!tipSettings.allowCustomTip}
                        className="w-full rounded-2xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-[#6c6258]">
                        {tipMode === "percent" ? "Tip amount" : "Tip %"}
                      </span>
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

              <div className="rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Summary
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span>Products</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(summary.productsSubtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Options</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(summary.modifiersSubtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Subtotal</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(summary.subtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Discount</span>
                    <span className="font-semibold text-[#1f1e1b]">-{money(safeDiscountAmount)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Delivery</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(summary.deliveryFee)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Tax</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(liveTaxAmount)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Deposit</span>
                    <span className="font-semibold text-[#1f1e1b]">-{money(summary.depositAmount)}</span>
                  </div>

                  <div className="border-t border-[#e5dbce] pt-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#1f1e1b]">Total</span>
                      <span className="text-lg font-semibold text-[#1f1e1b]">{money(liveTotalAmount)}</span>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#1f1e1b]">Balance due</span>
                      <span className="font-semibold text-red-700">{money(liveBalanceDue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#6c6258]">
                  Reference (optional)
                </span>
                <input
                  name="note"
                  placeholder="Terminal receipt / note"
                  className="w-full rounded-2xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                />
              </label>

              <div className="flex items-center justify-end gap-3 border-t border-[#eee5d9] bg-white pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-[#d8cec0] bg-white px-5 py-2.5 text-sm font-semibold text-[#2b2a28]"
                >
                  Cancel
                </button>

                <PaymentSubmitButton total={totalChargeNow} />
              </div>

              <PaymentProcessingOverlay />
            </form>
          </div>
        </div>
      )}
    </>
  );
}

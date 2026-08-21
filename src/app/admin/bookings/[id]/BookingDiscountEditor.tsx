"use client";

import { useState } from "react";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export default function BookingDiscountEditor({
  bookingId,
  subtotal,
  currentDiscount,
  passwordEnabled,
  passwordHint,
  action,
}: {
  bookingId: string;
  subtotal: number;
  currentDiscount: number;
  passwordEnabled: boolean;
  passwordHint?: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [discount, setDiscount] = useState(Number(currentDiscount || 0));
  const changed = Number(discount || 0).toFixed(2) !== Number(currentDiscount || 0).toFixed(2);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-[#6c6258]">Discount</span>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#1f1e1b]">-{money(currentDiscount)}</span>
          <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-[#d8cec0] px-3 py-1 text-xs font-semibold text-[#23313f]">Edit</button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="rounded-2xl border border-[#eadfce] bg-[#fcfaf7] p-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Discount</div>
      <label className="mt-2 block">
        <span className="mb-1 block text-xs text-[#6c6258]">Discount amount</span>
        <input name="discountAmount" type="number" min="0" max={Math.max(0, subtotal)} step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value || 0))} className="w-full rounded-xl border border-[#d8cec0] px-3 py-2 text-sm" />
      </label>
      {passwordEnabled && changed ? (
        <label className="mt-2 block">
          <span className="mb-1 block text-xs text-[#6c6258]">Authorization password</span>
          <input name="discountPassword" type="password" required placeholder={passwordHint || "Enter password"} className="w-full rounded-xl border border-[#d8cec0] px-3 py-2 text-sm" />
        </label>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => { setDiscount(Number(currentDiscount || 0)); setEditing(false); }} className="flex-1 rounded-full border border-[#d8cec0] px-3 py-2 text-xs font-semibold">Cancel</button>
        <button type="submit" disabled={!changed} className="flex-1 rounded-full bg-[#23313f] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save discount</button>
      </div>
    </form>
  );
}

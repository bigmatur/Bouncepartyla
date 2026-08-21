"use client";

import { useState } from "react";
import { updatePaymentPosSettingsAction } from "../actions";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default function PaymentPosSettingsForm({
  settings,
}: {
  settings: {
    tips_enabled?: boolean;
    allow_custom_tip?: boolean;
    tip_mode?: string;
    default_tip_percent?: number | string;
    default_tip_amount?: number | string;
    tip_percent_options?: string;
    tip_amount_options?: string;
  };
}) {
  const [tipMode, setTipMode] = useState<"percent" | "amount">(
    settings.tip_mode === "amount" ? "amount" : "percent"
  );

  const [defaultTipPercent, setDefaultTipPercent] = useState(
    String(settings.default_tip_percent ?? "15")
  );

  const [defaultTipAmount, setDefaultTipAmount] = useState(
    String(settings.default_tip_amount ?? "10")
  );

  const [tipPercentOptions, setTipPercentOptions] = useState(
    settings.tip_percent_options || "10,15,20"
  );

  const [tipAmountOptions, setTipAmountOptions] = useState(
    settings.tip_amount_options || "5,10,20"
  );

  return (
    <form action={updatePaymentPosSettingsAction} className="grid gap-4 p-6 md:grid-cols-2">
      <label className="flex items-center gap-3 rounded-2xl border border-[#d8cec0] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
        <input
          name="tipsEnabled"
          type="checkbox"
          defaultChecked={settings.tips_enabled !== false}
          className="h-5 w-5"
        />
        Tips enabled in POS
      </label>

      <label className="flex items-center gap-3 rounded-2xl border border-[#d8cec0] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
        <input
          name="allowCustomTip"
          type="checkbox"
          defaultChecked={settings.allow_custom_tip !== false}
          className="h-5 w-5"
        />
        Allow custom tip amount
      </label>

      <Field label="Tip type in POS">
        <select
          name="tipMode"
          aria-label="Tip type in POS"
          value={tipMode}
          onChange={(event) =>
            setTipMode(event.target.value === "amount" ? "amount" : "percent")
          }
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        >
          <option value="percent">Percent (%)</option>
          <option value="amount">Amount ($)</option>
        </select>
      </Field>

      {tipMode === "percent" ? (
        <>
          <Field label="Default tip %">
            <Input
              name="defaultTipPercent"
              type="number"
              step="0.01"
              value={defaultTipPercent}
              onChange={(event) => setDefaultTipPercent(event.target.value)}
            />
          </Field>

          <Field label="Tip percent options (comma-separated)">
            <Input
              name="tipPercentOptions"
              value={tipPercentOptions}
              onChange={(event) => setTipPercentOptions(event.target.value)}
              placeholder="10,15,20"
            />
          </Field>

          <input type="hidden" name="defaultTipAmount" value={defaultTipAmount} />
          <input type="hidden" name="tipAmountOptions" value={tipAmountOptions} />
        </>
      ) : (
        <>
          <Field label="Default tip amount ($)">
            <Input
              name="defaultTipAmount"
              type="number"
              step="0.01"
              value={defaultTipAmount}
              onChange={(event) => setDefaultTipAmount(event.target.value)}
            />
          </Field>

          <Field label="Tip amount options (comma-separated)">
            <Input
              name="tipAmountOptions"
              value={tipAmountOptions}
              onChange={(event) => setTipAmountOptions(event.target.value)}
              placeholder="5,10,20"
            />
          </Field>

          <input type="hidden" name="defaultTipPercent" value={defaultTipPercent} />
          <input type="hidden" name="tipPercentOptions" value={tipPercentOptions} />
        </>
      )}

      <div className="md:col-span-2 flex justify-end border-t border-[#eee5d9] pt-5">
        <button
          type="submit"
          className="rounded-full bg-[#23313f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
        >
          Save POS settings
        </button>
      </div>
    </form>
  );
}

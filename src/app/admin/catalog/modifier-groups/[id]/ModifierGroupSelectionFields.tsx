"use client";

import { useState } from "react";

type Props = {
  initialSelectionType: string | null | undefined;
  initialMaxTotalQuantity: number | string | null | undefined;
};

const inputClass =
  "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]";

export default function ModifierGroupSelectionFields({
  initialSelectionType,
  initialMaxTotalQuantity,
}: Props) {
  const normalizedInitialType = ["single", "multiple", "quantity"].includes(
    String(initialSelectionType || "")
  )
    ? String(initialSelectionType)
    : "single";

  const [selectionType, setSelectionType] = useState(normalizedInitialType);

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          Selection type
        </span>

        <select
          name="selectionType"
          value={selectionType}
          onChange={(event) => setSelectionType(event.target.value)}
          className={inputClass}
        >
          <option value="single">Single choice</option>
          <option value="multiple">Multiple choice</option>
          <option value="quantity">Quantity</option>
        </select>
      </label>

      {selectionType === "multiple" ? (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Maximum selections
          </span>

          <input
            name="maxTotalQuantity"
            type="number"
            min={1}
            step={1}
            defaultValue={initialMaxTotalQuantity ?? ""}
            placeholder="Unlimited"
            className={inputClass}
          />

          <span className="mt-2 block text-xs leading-5 text-[#6c6258]">
            Maximum total quantity a customer can select across this group.
            Leave blank for unlimited.
          </span>
        </label>
      ) : (
        <input type="hidden" name="maxTotalQuantity" value="" />
      )}
    </>
  );
}

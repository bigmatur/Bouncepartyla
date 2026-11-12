"use client";

import { useEffect, useState } from "react";
import {
  toggleWarehouseChecklistItemAction,
  toggleWarehousePickingItemAction,
} from "./actions";

type Props = {
  kind: "checklist" | "reservation";
  itemId: string;
  bookingId: string;
  date: string;
  initialChecked: boolean;
};

export function PickingToggleButton({
  kind,
  itemId,
  bookingId,
  date,
  initialChecked,
}: Props) {
  const [checked, setChecked] = useState(initialChecked);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setChecked(initialChecked);
  }, [initialChecked]);

  async function toggle() {
    if (saving) return;

    const previous = checked;
    const next = !previous;
    const formData = new FormData();
    formData.set(kind === "checklist" ? "checklistItemId" : "reservationId", itemId);
    formData.set("bookingId", bookingId);
    formData.set("date", date);
    formData.set(kind === "checklist" ? "loaded" : "picked", String(next));

    setChecked(next);
    setSaving(true);
    setError("");

    try {
      if (kind === "checklist") {
        await toggleWarehouseChecklistItemAction(formData);
      } else {
        await toggleWarehousePickingItemAction(formData);
      }
    } catch (toggleError) {
      setChecked(previous);
      setError(toggleError instanceof Error ? toggleError.message : "Could not save this item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ml-auto flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={saving}
        className={[
          "flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold ring-1 transition sm:h-14 sm:w-14",
          checked
            ? "bg-emerald-600 text-white ring-emerald-600"
            : "bg-white text-[#c2b8ad] ring-[#d8cec0]",
          saving ? "cursor-wait opacity-75" : "hover:scale-[1.03]",
        ].join(" ")}
        aria-label={checked ? "Mark not picked" : "Mark picked"}
        aria-pressed={checked}
        aria-busy={saving}
      >
        {checked ? "✓" : ""}
      </button>
      {error ? <span className="max-w-28 text-right text-[9px] font-semibold text-red-600">Not saved</span> : null}
    </div>
  );
}

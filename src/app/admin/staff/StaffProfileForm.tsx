"use client";

import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { StaffSaveState } from "./actions";

const initialState: StaffSaveState = {
  status: "idle",
  message: "",
};

export function StaffProfileForm({
  action,
  children,
  className,
}: {
  action: (
    previousState: StaffSaveState,
    formData: FormData,
  ) => Promise<StaffSaveState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.status !== "idle" ? (
        <p
          aria-live="polite"
          className={[
            "mt-3 rounded-xl border px-4 py-3 text-sm font-semibold md:col-span-2 xl:col-span-4",
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700",
          ].join(" ")}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function StaffSaveButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:py-2.5"
    >
      {pending ? "Saving…" : "Save profile"}
    </button>
  );
}

"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingText?: string;
  successText?: string;
  variant?: "primary" | "secondary" | "danger";
};

function getVariantClasses(
  variant: ActionButtonProps["variant"],
) {
  if (variant === "secondary") {
    return [
      "border border-[#d8d1c7]",
      "bg-white",
      "text-[#243442]",
      "hover:bg-[#f8f4ee]",
    ].join(" ");
  }

  if (variant === "danger") {
    return [
      "border border-[#efc7c7]",
      "bg-[#fff5f5]",
      "text-[#b42318]",
      "hover:bg-[#feecec]",
    ].join(" ");
  }

  return [
    "border border-[#243442]",
    "bg-[#243442]",
    "text-white",
    "hover:bg-[#192833]",
  ].join(" ");
}

export default function ActionButton({
  children,
  pendingText = "Working…",
  variant = "primary",
  className = "",
  disabled,
  ...props
}: ActionButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      {...props}
      type={props.type || "submit"}
      disabled={disabled || pending}
      aria-busy={pending}
      className={[
        "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition",
        "active:scale-[0.98]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        getVariantClasses(variant),
        className,
      ].join(" ")}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
          <span>{pendingText}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
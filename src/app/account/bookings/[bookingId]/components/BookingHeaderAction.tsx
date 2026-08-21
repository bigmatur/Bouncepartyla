"use client";

import type { ReactNode } from "react";

type ResponsiveBreakpoint =
  | "sm"
  | "md"
  | "lg"
  | "xl";

type BookingHeaderActionProps = {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  compactLabel: string;
  fullLabelFrom?: ResponsiveBreakpoint;
  href?: string;
  onClick?: () => void;
  ariaLive?: "off" | "polite" | "assertive";
};

const fullLabelClasses: Record<
  ResponsiveBreakpoint,
  {
    full: string;
    compact: string;
  }
> = {
  sm: {
    full: "hidden sm:inline",
    compact: "sm:hidden",
  },
  md: {
    full: "hidden md:inline",
    compact: "md:hidden",
  },
  lg: {
    full: "hidden lg:inline",
    compact: "lg:hidden",
  },
  xl: {
    full: "hidden xl:inline",
    compact: "xl:hidden",
  },
};

const actionClassName =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-black/10 bg-white px-4 text-sm font-semibold text-black transition hover:bg-black/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30";

export default function BookingHeaderAction({
  ariaLabel,
  icon,
  label,
  compactLabel,
  fullLabelFrom = "sm",
  href,
  onClick,
  ariaLive,
}: BookingHeaderActionProps) {
  const visibility =
    fullLabelClasses[fullLabelFrom];

  const content = (
    <>
      {icon}

      <span className={visibility.full}>
        {label}
      </span>

      <span className={visibility.compact}>
        {compactLabel}
      </span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={actionClassName}
        aria-label={ariaLabel}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={actionClassName}
      aria-label={ariaLabel}
      aria-live={ariaLive}
    >
      {content}
    </button>
  );
}

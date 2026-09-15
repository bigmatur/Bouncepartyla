"use client";

import { useFormStatus } from "react-dom";

type FormStatusButtonProps = {
  idleText: string;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
};

export default function FormStatusButton({
  idleText,
  pendingText = "Saving...",
  className = "",
  disabled = false,
  title,
}: FormStatusButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      title={title}
      disabled={disabled || pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? pendingText : idleText}
    </button>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";

type HiddenField = {
  name: string;
  value: string;
};

type SafePhotoUploadFormProps = {
  action: (formData: FormData) => Promise<void>;
  hiddenFields: HiddenField[];
  buttonLabel?: string;
  compact?: boolean;
};

function sanitizeFileName(fileName: string) {
  const dotIndex = fileName.lastIndexOf(".");
  const rawExtension = dotIndex >= 0 ? fileName.slice(dotIndex + 1) : "jpg";
  const rawBase = dotIndex >= 0 ? fileName.slice(0, dotIndex) : fileName;

  const extension = rawExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "") || "jpg";

  const base = rawBase
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "photo";

  return `${base.slice(0, 80)}.${extension.slice(0, 10)}`;
}

export default function SafePhotoUploadForm({
  action,
  hiddenFields,
  buttonLabel = "Upload photo",
  compact = false,
}: SafePhotoUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);

        const originalFile = fileInputRef.current?.files?.[0];

        if (!originalFile || originalFile.size === 0) {
          setError("Choose a photo first.");
          return;
        }

        const safeFile = new File(
          [originalFile],
          sanitizeFileName(originalFile.name),
          {
            type: originalFile.type || "image/jpeg",
            lastModified: originalFile.lastModified,
          }
        );

        const formData = new FormData();

        for (const field of hiddenFields) {
          formData.set(field.name, field.value);
        }

        formData.set("photo", safeFile);

        startTransition(async () => {
          try {
            await action(formData);
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          } catch (actionError) {
            setError(
              actionError instanceof Error
                ? actionError.message
                : "Photo upload failed."
            );
          }
        });
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        name="photo"
        accept="image/*"
        required
        disabled={isPending}
        className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none file:mr-3 file:rounded-full file:border-0 file:bg-[#efe7dc] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[#6c5435] disabled:cursor-not-allowed disabled:opacity-60"
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={[
          "w-full rounded-full bg-[#23313f] font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-60",
          compact ? "px-4 py-2 text-xs" : "px-5 py-3 text-sm",
        ].join(" ")}
      >
        {isPending ? "Uploading..." : buttonLabel}
      </button>
    </form>
  );
}

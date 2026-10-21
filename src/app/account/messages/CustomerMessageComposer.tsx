"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { CrmAttachment } from "@/lib/communication/types";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

type LocalFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

type Props = {
  conversationId: string | null;
  action: (formData: FormData) => Promise<void>;
};

function isAllowedFile(file: File) {
  return [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ].includes(file.type);
}

export default function CustomerMessageComposer({
  conversationId,
  action,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [files, setFiles] = useState<LocalFile[]>([]);
  const [phase, setPhase] = useState<"idle" | "uploading" | "sending">("idle");
  const [error, setError] = useState("");
  const [uploadProgressLabel, setUploadProgressLabel] = useState("");
  const pendingClientMessageIdRef = useRef<string | null>(null);
  const pendingUploadedAttachmentsRef = useRef<CrmAttachment[] | null>(null);
  const pendingBodyRef = useRef<string | null>(null);
  const pendingFilesFingerprintRef = useRef<string | null>(null);

  function buildFilesFingerprint(nextFiles: LocalFile[]) {
    return nextFiles
      .map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}:${item.file.type}`)
      .sort()
      .join("|");
  }

  function resetPendingSendState() {
    pendingClientMessageIdRef.current = null;
    pendingUploadedAttachmentsRef.current = null;
    pendingBodyRef.current = null;
    pendingFilesFingerprintRef.current = null;
  }

  async function cleanupPendingCustomerAttachments(attachments: CrmAttachment[]) {
    if (!conversationId || attachments.length === 0) {
      return;
    }

    try {
      const cleanupResponse = await fetch(
        "/api/account/messages/attachments/cleanup",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            conversationId,
            attachments,
          }),
        },
      );

      if (!cleanupResponse.ok) {
        console.error(
          "Customer attachment cleanup request failed while invalidating pending send state.",
        );
      }
    } catch {
      console.error(
        "Customer attachment cleanup failed while invalidating pending send state.",
      );
    }
  }

  function invalidatePendingIfChanged(nextBody: string, nextFiles: LocalFile[]) {
    const pendingBody = pendingBodyRef.current;
    const pendingAttachments = pendingUploadedAttachmentsRef.current;
    const pendingFilesFingerprint = pendingFilesFingerprintRef.current;

    if (pendingBody === null && pendingAttachments === null) {
      return;
    }

    if (pendingBody !== nextBody) {
      resetPendingSendState();

      if (pendingAttachments && pendingAttachments.length > 0) {
        void cleanupPendingCustomerAttachments(pendingAttachments);
      }

      return;
    }

    if (pendingFilesFingerprint !== buildFilesFingerprint(nextFiles)) {
      resetPendingSendState();

      if (pendingAttachments && pendingAttachments.length > 0) {
        void cleanupPendingCustomerAttachments(pendingAttachments);
      }
    }
  }

  useEffect(() => {
    return () => {
      for (const item of files) {
        if (item.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
      }
    };
  }, [files]);

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function clearFiles() {
    for (const item of files) {
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }

    setFiles([]);
    resetInput();
  }

  function onFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    setError("");

    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) {
      return;
    }

    const room = Math.max(0, MAX_FILES - files.length);
    const accepted: LocalFile[] = [];

    for (const file of selected.slice(0, room)) {
      if (!isAllowedFile(file)) {
        setError("Only JPG, PNG, WEBP, and PDF files are allowed.");
        continue;
      }

      if (file.size > MAX_BYTES) {
        setError(`${file.name} is larger than 10 MB.`);
        continue;
      }

      accepted.push({
        id: `${Date.now()}-${Math.random()}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      });
    }

    if (selected.length > room) {
      setError(`Maximum ${MAX_FILES} attachments per message.`);
    }

    setFiles((current) => [...current, ...accepted]);
    invalidatePendingIfChanged(
      String(textareaRef.current?.value || "").trim(),
      [...files, ...accepted],
    );
    resetInput();
  }

  function removeLocalFile(id: string) {
    const removed = files.find((item) => item.id === id);
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl);
    }

    const next = files.filter((item) => item.id !== id);
    setFiles(next);

    invalidatePendingIfChanged(
      String(textareaRef.current?.value || "").trim(),
      next,
    );
  }

  async function uploadFiles(targetConversationId: string): Promise<CrmAttachment[]> {
    const uploaded: CrmAttachment[] = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const item = files[index];
        setUploadProgressLabel(`Uploading ${index + 1} of ${files.length}...`);

        const payload = new FormData();
        payload.set("conversationId", targetConversationId);
        payload.set("file", item.file);

        const response = await fetch("/api/account/messages/attachments/upload", {
          method: "POST",
          body: payload,
        });

        const json = await response.json().catch(() => ({}));

        if (!response.ok || !json?.attachment) {
          throw new Error(
            String(json?.error || `Could not upload ${item.file.name}.`),
          );
        }

        uploaded.push(json.attachment as CrmAttachment);
      }
    } catch (error) {
      if (uploaded.length > 0) {
        try {
          const cleanupResponse = await fetch(
            "/api/account/messages/attachments/cleanup",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                conversationId: targetConversationId,
                attachments: uploaded,
              }),
            },
          );

          if (!cleanupResponse.ok) {
            console.error(
              "Customer attachment cleanup request failed after upload error.",
            );
          }
        } catch (cleanupError) {
          console.error(
            "Customer attachment cleanup failed after upload error.",
            cleanupError,
          );
        }
      }

      throw error;
    }

    return uploaded;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (phase !== "idle") {
      return;
    }

    setError("");

    const browserFormData = new FormData(event.currentTarget);
    const body = String(browserFormData.get("body") || "").trim();
    invalidatePendingIfChanged(body, files);

    if (!body && files.length === 0) {
      setError("Write a message or attach a file.");
      textareaRef.current?.focus();
      return;
    }

    if (!conversationId && files.length > 0) {
      setError("Send your first message to start the thread, then add attachments.");
      return;
    }

    try {
      const targetConversationId = String(conversationId || "").trim();
      const clientMessageId = pendingClientMessageIdRef.current || crypto.randomUUID();
      pendingClientMessageIdRef.current = clientMessageId;
      pendingBodyRef.current = body;
      pendingFilesFingerprintRef.current = buildFilesFingerprint(files);

      let attachments: CrmAttachment[] = pendingUploadedAttachmentsRef.current || [];
      if (files.length > 0 && targetConversationId && attachments.length === 0) {
        setPhase("uploading");
        attachments = await uploadFiles(targetConversationId);
        pendingUploadedAttachmentsRef.current = attachments;
      }

      setPhase("sending");

      const actionData = new FormData();
      actionData.set("body", body);
      actionData.set("attachmentsJson", JSON.stringify(attachments));
      actionData.set("clientMessageId", clientMessageId);
      await action(actionData);

      resetPendingSendState();

      formRef.current?.reset();
      clearFiles();
      textareaRef.current?.focus();
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not send the message.",
      );
    } finally {
      setPhase("idle");
      setUploadProgressLabel("");
    }
  }

  const pending = phase !== "idle";

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      {files.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((item) => (
            <div
              key={item.id}
              className="relative rounded-2xl border border-[#ddd5cb] bg-[#faf8f5] p-3"
            >
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="h-28 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-28 items-center justify-center rounded-xl bg-white text-sm font-semibold text-[#6c6258]">
                  PDF
                </div>
              )}

              <div className="mt-2 truncate text-xs font-semibold text-[#3f3a35]">
                {item.file.name}
              </div>

              <div className="mt-1 text-[11px] text-[#8b8177]">
                {(item.file.size / 1024 / 1024).toFixed(1)} MB
              </div>

              <button
                type="button"
                disabled={pending}
                onClick={() => removeLocalFile(item.id)}
                className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-bold text-[#8d3d3d] shadow disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-[#a33a32]">
          {error}
        </div>
      )}

      {phase === "uploading" && uploadProgressLabel ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-800">
          {uploadProgressLabel}
        </div>
      ) : null}

      <div className="flex items-end gap-2 rounded-[24px] border border-[#d8cec0] bg-white p-2 shadow-sm transition focus-within:border-[#23313f]">
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={onFilesSelected}
            disabled={pending || files.length >= MAX_FILES || !conversationId}
            className="hidden"
            id="customer-message-attachment-upload"
          />

          <label
            htmlFor="customer-message-attachment-upload"
            title="Attach file"
            className={[
              "inline-flex h-[46px] w-[46px] cursor-pointer items-center justify-center rounded-full border border-[#ddd5cb] bg-[#faf8f5] text-lg transition hover:bg-[#f1ece5]",
              pending || files.length >= MAX_FILES || !conversationId
                ? "pointer-events-none opacity-50"
                : "",
            ].join(" ")}
          >
            <span aria-hidden="true">📎</span>
          </label>
        </div>

        <textarea
          ref={textareaRef}
          name="body"
          rows={1}
          placeholder="Write a message to Bounce Party LA support…"
          disabled={pending}
          onChange={(event) => {
            invalidatePendingIfChanged(
              event.currentTarget.value.trim(),
              files,
            );
          }}
          className="min-h-[46px] max-h-[160px] min-w-0 flex-1 resize-y border-0 bg-transparent px-2 py-[13px] text-sm leading-5 outline-none disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex min-h-[46px] shrink-0 items-center justify-center rounded-full bg-[#23313f] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#192833] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {phase === "uploading"
            ? "Uploading…"
            : phase === "sending"
              ? "Sending…"
              : "Send"}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-2 text-[10px] text-[#91887f]">
        <span>JPG, PNG, WEBP, PDF · 10 MB each · max 5</span>
        <span>
          {conversationId
            ? "Internal support chat only"
            : "Send first message to activate attachments"}
        </span>
      </div>
    </form>
  );
}

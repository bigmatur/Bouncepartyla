"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { CrmAttachment } from "@/lib/communication/types";

type Props = {
  conversationId: string;
  replyChannel: string;
  action: (
    formData: FormData,
  ) => Promise<void>;
};

type LocalFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXTAREA_HEIGHT = 150;

const ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf";

function replyPlaceholder(
  channel: string,
) {
  if (channel === "sms") {
    return "Write an SMS reply…";
  }

  if (channel === "instagram") {
    return "Write an Instagram reply…";
  }

  if (channel === "whatsapp") {
    return "Write a WhatsApp reply…";
  }

  return "Write an email reply…";
}

function replyButtonLabel(
  channel: string,
) {
  if (channel === "sms") {
    return "Send SMS";
  }

  if (channel === "instagram") {
    return "Send Instagram DM";
  }

  if (channel === "whatsapp") {
    return "Send WhatsApp";
  }

  return "Send email";
}

function isAllowedFile(file: File) {
  return [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ].includes(file.type);
}

export default function CrmReplyForm({
  conversationId,
  replyChannel,
  action,
}: Props) {
  const formRef =
    useRef<HTMLFormElement>(null);

  const inputRef =
    useRef<HTMLInputElement>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  const [files, setFiles] =
    useState<LocalFile[]>([]);

  const [phase, setPhase] = useState<
    "idle" | "uploading" | "sending"
  >("idle");

  const [error, setError] =
    useState("");

  useEffect(() => {
    return () => {
      for (const item of files) {
        if (item.previewUrl) {
          URL.revokeObjectURL(
            item.previewUrl,
          );
        }
      }
    };
  }, [files]);

  function resetTextareaHeight() {
    const textarea =
      textareaRef.current;

    if (!textarea) return;

    textarea.style.height = "46px";
  }

  function resizeTextarea(
    textarea: HTMLTextAreaElement,
  ) {
    textarea.style.height = "0px";

    const nextHeight = Math.min(
      Math.max(
        textarea.scrollHeight,
        46,
      ),
      MAX_TEXTAREA_HEIGHT,
    );

    textarea.style.height =
      `${nextHeight}px`;

    textarea.style.overflowY =
      textarea.scrollHeight >
      MAX_TEXTAREA_HEIGHT
        ? "auto"
        : "hidden";
  }

  function clearFiles() {
    for (const item of files) {
      if (item.previewUrl) {
        URL.revokeObjectURL(
          item.previewUrl,
        );
      }
    }

    setFiles([]);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function onFilesSelected(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    setError("");

    const selected = Array.from(
      event.target.files || [],
    );

    if (selected.length === 0) {
      return;
    }

    const room = Math.max(
      0,
      MAX_FILES - files.length,
    );

    const accepted: LocalFile[] =
      [];

    for (
      const file of
      selected.slice(0, room)
    ) {
      if (!isAllowedFile(file)) {
        setError(
          "Only JPG, PNG, WEBP, and PDF files are allowed.",
        );

        continue;
      }

      if (
        file.size >
        MAX_BYTES
      ) {
        setError(
          `${file.name} is larger than 10 MB.`,
        );

        continue;
      }

      accepted.push({
        id:
          `${Date.now()}-${Math.random()}`,

        file,

        previewUrl:
          file.type.startsWith(
            "image/",
          )
            ? URL.createObjectURL(
                file,
              )
            : null,
      });
    }

    if (
      selected.length >
      room
    ) {
      setError(
        `Maximum ${MAX_FILES} attachments per message.`,
      );
    }

    setFiles(
      (current) => [
        ...current,
        ...accepted,
      ],
    );

    if (inputRef.current) {
      inputRef.current.value =
        "";
    }
  }

  function removeLocalFile(
    id: string,
  ) {
    setFiles((current) => {
      const removed =
        current.find(
          (item) =>
            item.id === id,
        );

      if (
        removed?.previewUrl
      ) {
        URL.revokeObjectURL(
          removed.previewUrl,
        );
      }

      return current.filter(
        (item) =>
          item.id !== id,
      );
    });
  }

  async function uploadFiles(): Promise<
    CrmAttachment[]
  > {
    const uploaded:
      CrmAttachment[] = [];

    for (const item of files) {
      const payload =
        new FormData();

      payload.set(
        "conversationId",
        conversationId,
      );

      payload.set(
        "file",
        item.file,
      );

      const response =
        await fetch(
          "/api/crm/attachments/upload",
          {
            method: "POST",
            body: payload,
          },
        );

      const json =
        await response
          .json()
          .catch(() => ({}));

      if (
        !response.ok ||
        !json?.attachment
      ) {
        throw new Error(
          String(
            json?.error ||
              `Could not upload ${item.file.name}.`,
          ),
        );
      }

      uploaded.push(
        json.attachment as CrmAttachment,
      );
    }

    return uploaded;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (phase !== "idle") {
      return;
    }

    setError("");

    const form =
      event.currentTarget;

    const browserFormData =
      new FormData(form);

    const body = String(
      browserFormData.get(
        "body",
      ) || "",
    ).trim();

    if (
      !body &&
      files.length === 0
    ) {
      setError(
        "Write a message or attach a file.",
      );

      textareaRef.current?.focus();

      return;
    }

    try {
      let attachments:
        CrmAttachment[] = [];

      if (files.length > 0) {
        setPhase(
          "uploading",
        );

        attachments =
          await uploadFiles();
      }

      setPhase(
        "sending",
      );

      const actionData =
        new FormData();

      actionData.set(
        "conversationId",
        conversationId,
      );

      actionData.set(
        "channel",
        replyChannel,
      );

      actionData.set(
        "body",
        body,
      );

      actionData.set(
        "attachmentsJson",
        JSON.stringify(
          attachments,
        ),
      );

      await action(
        actionData,
      );

      formRef.current?.reset();

      clearFiles();
      resetTextareaHeight();

      requestAnimationFrame(
        () => {
          textareaRef.current?.focus();
        },
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not send the message.",
      );
    } finally {
      setPhase(
        "idle",
      );
    }
  }

  function handleTextareaKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();

      formRef.current?.requestSubmit();
    }
  }

  const pending =
    phase !== "idle";

  const buttonText =
    phase === "uploading"
      ? "Uploading…"
      : phase === "sending"
        ? "Sending…"
        : replyButtonLabel(
            replyChannel,
          );

  const isInstagramReply =
    replyChannel === "instagram";

  const isIconOnlyReply =
    isInstagramReply;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="mt-3"
    >
      {files.length > 0 && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map(
            (item) => (
              <div
                key={item.id}
                className="relative rounded-2xl border border-[#ddd5cb] bg-[#faf8f5] p-3"
              >
                {item.previewUrl ? (
                  <img
                    src={
                      item.previewUrl
                    }
                    alt={
                      item.file.name
                    }
                    className="h-28 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center rounded-xl bg-white text-sm font-semibold text-[#6c6258]">
                    PDF
                  </div>
                )}

                <div className="mt-2 truncate text-xs font-semibold text-[#3f3a35]">
                  {
                    item.file.name
                  }
                </div>

                <div className="mt-1 text-[11px] text-[#8b8177]">
                  {(
                    item.file.size /
                    1024 /
                    1024
                  ).toFixed(1)}{" "}
                  MB
                </div>

                <button
                  type="button"
                  disabled={
                    pending
                  }
                  onClick={() =>
                    removeLocalFile(
                      item.id,
                    )
                  }
                  className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs font-bold text-[#8d3d3d] shadow disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ),
          )}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-2xl bg-[#fff1f0] px-4 py-3 text-sm font-medium text-[#a33a32]">
          {error}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-[24px] border border-[#d8cec0] bg-white p-2 shadow-sm transition focus-within:border-[#23313f]">
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={
              onFilesSelected
            }
            disabled={
              pending ||
              files.length >=
                MAX_FILES
            }
            className="hidden"
            id={`crm-attachment-${conversationId}`}
          />

          <label
            htmlFor={`crm-attachment-${conversationId}`}
            title="Attach file"
            className={[
              "inline-flex h-[46px] w-[46px] cursor-pointer items-center justify-center rounded-full border border-[#ddd5cb] bg-[#faf8f5] text-lg transition hover:bg-[#f1ece5]",
              pending ||
              files.length >=
                MAX_FILES
                ? "pointer-events-none opacity-50"
                : "",
            ].join(" ")}
          >
            <span aria-hidden="true">
              📎
            </span>
          </label>
        </div>

        <textarea
          ref={textareaRef}
          name="body"
          rows={1}
          placeholder={replyPlaceholder(
            replyChannel,
          )}
          disabled={pending}
          onInput={(event) =>
            resizeTextarea(
              event.currentTarget,
            )
          }
          onKeyDown={
            handleTextareaKeyDown
          }
          className="min-h-[46px] max-h-[150px] min-w-0 flex-1 resize-none overflow-y-hidden border-0 bg-transparent px-2 py-[13px] text-sm leading-5 outline-none disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          aria-label={buttonText}
          title={buttonText}
          className={[
            "inline-flex min-h-[46px] shrink-0 items-center justify-center rounded-full bg-[#23313f] text-white transition hover:bg-[#192833] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
            isIconOnlyReply
              ? "h-[46px] w-[46px] p-0 text-xl"
              : "gap-2 px-5 py-2.5 text-sm font-semibold",
          ].join(" ")}
        >
          {pending && (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            />
          )}

          {isIconOnlyReply && !pending ? (
            <span aria-hidden="true">✉</span>
          ) : (
            !isIconOnlyReply && buttonText
          )}
        </button>
      </div>

      <div className="hidden lg:flex mt-1.5 flex-wrap items-center justify-between gap-2 px-2 text-[10px] text-[#91887f]">
  <span>
    Enter to send · Shift+Enter for a new line
  </span>

  <span>
    JPG, PNG, WEBP, PDF · 10 MB · max 5
  </span>
</div>
    </form>
  );
}

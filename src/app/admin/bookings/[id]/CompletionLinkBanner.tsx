"use client";

import { useState } from "react";

type Props = {
  url: string;
  emailStatus: string;
};

export default function CompletionLinkBanner({ url, emailStatus }: Props) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const message =
    emailStatus === "sent"
      ? "Email sent to the customer."
      : emailStatus === "failed"
        ? "Email could not be sent. Copy the link and send it manually."
        : "Email sending is not configured. Copy the link and send it manually.";

  return (
    <section className="rounded-[24px] border border-amber-300 bg-amber-50 px-5 py-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-bold text-amber-950">Customer completion link</div>
          <div className="mt-1 text-sm text-amber-900">{message}</div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block break-all text-sm font-semibold text-blue-700 underline"
          >
            {url}
          </a>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-xl bg-black px-4 py-2 text-sm font-bold text-white"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-bold text-black"
          >
            Open link
          </a>
        </div>
      </div>
    </section>
  );
}

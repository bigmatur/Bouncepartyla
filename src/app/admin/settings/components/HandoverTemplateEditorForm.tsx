"use client";

import { useMemo, useRef, useState } from "react";
import { updateHandoverSettingsAction } from "../actions";

function isEmptyHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim().length === 0;
}

export default function HandoverTemplateEditorForm({
  settings,
  hasHandoverSettingsTable,
}: {
  settings: {
    template_html?: string | null;
    acknowledgement_label?: string | null;
    signature_label?: string | null;
    require_acknowledgement?: boolean | null;
    require_signature?: boolean | null;
  };
  hasHandoverSettingsTable: boolean;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initialHtml = useMemo(() => String(settings.template_html || "").trim(), [settings.template_html]);
  const [html, setHtml] = useState(initialHtml);
  const [error, setError] = useState("");

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setHtml(editorRef.current?.innerHTML || "");
  }

  return (
    <form
      action={updateHandoverSettingsAction}
      className="space-y-4 p-3.5 sm:space-y-5 sm:p-6"
      onSubmit={(event) => {
        const currentHtml = editorRef.current?.innerHTML || html;
        if (isEmptyHtml(currentHtml)) {
          event.preventDefault();
          setError("Handover text cannot be empty.");
          return;
        }
        setHtml(currentHtml);
        setError("");
      }}
    >
      <input type="hidden" name="templateHtml" value={html} />

      {!hasHandoverSettingsTable ? (
        <div className="rounded-2xl border border-[#efd582] bg-[#fff8eb] p-3 text-xs leading-5 text-[#8a6b20] sm:p-4 sm:text-sm">
          Handover settings are unavailable in the current database schema.
        </div>
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-4">
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-3.5 py-3 text-sm font-semibold text-[#1f1e1b] sm:px-4">
          <span>Require acknowledgement</span>
          <input type="checkbox" name="requireAcknowledgement" defaultChecked={settings.require_acknowledgement !== false} className="h-5 w-5 shrink-0" />
        </label>

        <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-3.5 py-3 text-sm font-semibold text-[#1f1e1b] sm:px-4">
          <span>Require signature</span>
          <input type="checkbox" name="requireSignature" defaultChecked={settings.require_signature !== false} className="h-5 w-5 shrink-0" />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs">Acknowledgement text</span>
        <textarea
          name="acknowledgementLabel"
          rows={3}
          defaultValue={settings.acknowledgement_label || "I confirm that I reviewed and accept the equipment and quantities listed above."}
          className="w-full resize-y rounded-2xl border border-[#d8cec0] bg-white px-3.5 py-3 text-sm leading-5 outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:px-4"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs">Signature label</span>
        <input
          name="signatureLabel"
          defaultValue={settings.signature_label || "Customer signature"}
          className="h-11 w-full rounded-2xl border border-[#d8cec0] bg-white px-3.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:h-12 sm:px-4"
        />
      </label>

      <div className="overflow-hidden rounded-[20px] border border-[#e6d9c9] bg-[#fcfaf7]">
        <div className="flex gap-2 overflow-x-auto border-b border-[#e9dfd3] p-2.5 sm:flex-wrap sm:p-4">
          <button type="button" onClick={() => runCommand("bold")} className="shrink-0 rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold">Bold</button>
          <button type="button" onClick={() => runCommand("formatBlock", "<h2>")} className="shrink-0 rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold">H2</button>
          <button type="button" onClick={() => runCommand("formatBlock", "<h3>")} className="shrink-0 rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold">H3</button>
          <button type="button" onClick={() => runCommand("formatBlock", "<p>")} className="shrink-0 rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold">Paragraph</button>
          <button type="button" onClick={() => runCommand("insertOrderedList")} className="shrink-0 rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold">Numbered list</button>
          <button type="button" onClick={() => runCommand("insertUnorderedList")} className="shrink-0 rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold">Bullet list</button>
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: initialHtml }}
          onInput={(event) => setHtml(event.currentTarget.innerHTML)}
          className="min-h-[220px] bg-white px-3.5 py-4 text-sm leading-6 text-[#2f2a26] outline-none sm:min-h-[280px] sm:px-5 sm:py-5"
        />
      </div>

      <div className="rounded-[20px] border border-[#e6d9c9] bg-white p-3.5 sm:p-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs">Preview</div>
        <div className="prose prose-sm mt-3 max-w-none text-[#3f3934]" dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div> : null}

      <button type="submit" disabled={!hasHandoverSettingsTable} className="min-h-11 w-full rounded-2xl bg-[#23313f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto sm:rounded-full">
        Save handover settings
      </button>
    </form>
  );
}

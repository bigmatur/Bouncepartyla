"use client";

import { useMemo, useRef, useState } from "react";
import { updateBookingContractSettingsAction } from "../actions";

const TEMPLATE_VARIABLES = [
  "{{customer_name}}",
  "{{customer_email}}",
  "{{event_date}}",
  "{{event_start_time}}",
  "{{event_end_time}}",
  "{{setup_address}}",
  "{{setup_city}}",
  "{{setup_state}}",
  "{{setup_zip}}",
  "{{subtotal}}",
  "{{delivery_fee}}",
  "{{tax_amount}}",
  "{{total_amount}}",
  "{{deposit_amount}}",
  "{{balance_due}}",
  "{{signature_name}}",
  "{{signature_manual}}",
  "{{signature_date}}",
  "{{signature_label}}",
];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withInlineFormatting(value: string) {
  const escaped = escapeHtml(value);
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function normalizeInitialTemplate(value: string | null | undefined) {
  const source = String(value || "").replace(/\r\n/g, "\n").trim();

  if (!source) {
    return "";
  }

  // Keep existing HTML templates as-is.
  if (/<\/?[a-z][\s\S]*>/i.test(source)) {
    return source;
  }

  const blocks = source
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return "";
      }

      if (lines.every((line) => /^\d+\.\s+/.test(line))) {
        const items = lines
          .map((line) => line.replace(/^\d+\.\s+/, ""))
          .map((line) => `<li>${withInlineFormatting(line)}</li>`)
          .join("");
        return `<ol>${items}</ol>`;
      }

      if (lines.every((line) => /^[-*]\s+/.test(line))) {
        const items = lines
          .map((line) => line.replace(/^[-*]\s+/, ""))
          .map((line) => `<li>${withInlineFormatting(line)}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }

      return `<p>${lines.map((line) => withInlineFormatting(line)).join("<br />")}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

function isEmptyHtml(value: string) {
  const plain = value
    .replace(/<br\s*\/?>(\n)?/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

  return plain.length === 0;
}

export default function ContractTemplateEditorForm({
  settings,
  hasContractSettingsTable,
}: {
  settings: {
    template_html?: string | null;
    require_contract_before_payment?: boolean | null;
    require_typed_signature?: boolean | null;
    signature_label?: string | null;
  };
  hasContractSettingsTable: boolean;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const initialHtml = useMemo(
    () => normalizeInitialTemplate(settings.template_html),
    [settings.template_html]
  );

  const [html, setHtml] = useState(initialHtml);
  const [error, setError] = useState("");

  const previewHtml = useMemo(() => html || "", [html]);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setHtml(editorRef.current?.innerHTML || "");
  }

  function insertVariable(value: string) {
    runCommand("insertText", value);
  }

  function insertLineBreak() {
    runCommand("insertHTML", "<br />");
  }

  return (
    <form
      action={updateBookingContractSettingsAction}
      className="space-y-5 p-6"
      onSubmit={(event) => {
        if (isEmptyHtml(html)) {
          event.preventDefault();
          setError("Contract template cannot be empty.");
          return;
        }

        setError("");
      }}
    >
      {!hasContractSettingsTable && (
        <div className="rounded-2xl border border-[#efd582] bg-[#fff8eb] p-4 text-sm text-[#8a6b20] ring-1 ring-[#efd582]">
          Contract settings table is missing in database schema. Template edits will not persist until migration is applied.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
          <span>Require contract before payment</span>
          <input
            type="checkbox"
            name="requireContractBeforePayment"
            defaultChecked={settings.require_contract_before_payment !== false}
            className="h-5 w-5"
          />
        </label>

        <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
          <span>Require typed signature</span>
          <input
            type="checkbox"
            name="requireTypedSignature"
            defaultChecked={settings.require_typed_signature !== false}
            className="h-5 w-5"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          Signature label
        </span>
        <input
          name="signatureLabel"
          defaultValue={settings.signature_label || "Client signature"}
          placeholder="Client signature"
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />
      </label>

      <div className="rounded-[22px] border border-[#e6d9c9] bg-[#fcfaf7] p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => runCommand("bold")}
            className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#1f1e1b] hover:bg-[#f5efe8]"
          >
            Bold
          </button>
          <button
            type="button"
            onClick={() => runCommand("formatBlock", "<h2>")}
            className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#1f1e1b] hover:bg-[#f5efe8]"
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => runCommand("formatBlock", "<h3>")}
            className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#1f1e1b] hover:bg-[#f5efe8]"
          >
            H3
          </button>
          <button
            type="button"
            onClick={() => runCommand("formatBlock", "<p>")}
            className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#1f1e1b] hover:bg-[#f5efe8]"
          >
            Paragraph
          </button>
          <button
            type="button"
            onClick={() => runCommand("insertOrderedList")}
            className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#1f1e1b] hover:bg-[#f5efe8]"
          >
            Numbered list
          </button>
          <button
            type="button"
            onClick={() => runCommand("insertUnorderedList")}
            className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#1f1e1b] hover:bg-[#f5efe8]"
          >
            Bulleted list
          </button>
          <button
            type="button"
            onClick={insertLineBreak}
            className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#1f1e1b] hover:bg-[#f5efe8]"
          >
            Line break
          </button>
        </div>

        <div className="rounded-2xl border border-[#d8cec0] bg-white p-3">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(event) => setHtml(event.currentTarget.innerHTML)}
            className="min-h-[340px] w-full whitespace-pre-wrap text-sm leading-7 text-[#2b2a28] outline-none"
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />
        </div>

        <input type="hidden" name="templateHtml" value={html} />

        {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}

        <div className="mt-3 rounded-2xl bg-white p-3 text-xs leading-6 text-[#6c6258] ring-1 ring-[#eee5d9]">
          Enter inserts paragraphs. Use Line break for a short line break inside a paragraph.
        </div>
      </div>

      <div className="rounded-2xl bg-[#fcfaf7] p-4 text-xs leading-6 text-[#6c6258] ring-1 ring-[#eee5d9]">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Variables</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TEMPLATE_VARIABLES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => insertVariable(item)}
              className="rounded-full border border-[#d8cec0] bg-white px-3 py-1.5 text-xs font-semibold text-[#355879] hover:bg-[#eef5fb]"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <details className="rounded-2xl border border-[#eee5d9] bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#355879]">
          Preview rendered HTML
        </summary>
        <div className="border-t border-[#eee5d9] p-4">
          <div
            className="max-h-[360px] overflow-y-auto rounded-2xl border border-[#eee5d9] p-4 text-sm leading-6 text-[#4b4339]"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </div>
      </details>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!hasContractSettingsTable}
          className="rounded-full bg-[#23313f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {hasContractSettingsTable ? "Save contract settings" : "Apply migration to enable save"}
        </button>
      </div>
    </form>
  );
}

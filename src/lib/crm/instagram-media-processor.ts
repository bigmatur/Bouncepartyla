import "server-only";

import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  isIP,
} from "node:net";
import {
  promises as dns,
} from "node:dns";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CRM_ATTACHMENT_BUCKET,
  CRM_ATTACHMENT_MAX_BYTES,
  isAllowedCrmAttachmentMimeType,
} from "@/lib/communication/attachments";
import type {
  CrmAttachment,
} from "@/lib/communication/types";
import { createServiceClient } from "@/lib/supabase/service";

type JsonRecord = Record<string, unknown>;
type UnknownRecord = Record<string, unknown>;

type InstagramAttachmentCandidate = {
  index: number;
  type: string;
  url: string;
  title: string;
  sourceHost: string;
};

type ProcessorReason =
  | "already_processed"
  | "retry_budget_exhausted"
  | "claim_busy"
  | "claim_invalid"
  | "invalid_source_url"
  | "untrusted_source_host"
  | "private_ip_blocked"
  | "source_fetch_failed"
  | "source_http_error"
  | "source_redirect_blocked"
  | "source_not_https"
  | "source_too_large"
  | "unsupported_mime"
  | "invalid_file_signature"
  | "empty_payload"
  | "storage_upload_failed"
  | "storage_conflict_mismatch"
  | "metadata_update_conflict"
  | "stale_claim"
  | "duplicate_message_lock";

type AttachmentFailure = {
  attachment_index: number;
  reason: ProcessorReason;
  detail?: string;
  retryable: boolean;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  provider_message_id: string | null;
  metadata: unknown;
  created_at: string | null;
};

type ClaimStatus =
  | "claimed"
  | "busy"
  | "completed"
  | "retry_not_due"
  | "exhausted"
  | "invalid";

type FinalizeStatus =
  | "finalized"
  | "stale_claim"
  | "invalid"
  | "already_finalized_idempotent";

type SelectionIngestionStatus = "pending" | "completed" | "partial" | "failed" | "";

export type InstagramMediaProcessorResult = {
  scanned: number;
  picked: number;
  processed: number;
  completed: number;
  partial: number;
  failed: number;
  skipped: number;
  blocked: number;
};

const MAX_MESSAGE_ATTEMPTS = 4;
const DEFAULT_BATCH_SIZE = 15;
const MAX_BATCH_SIZE = 50;
const REDIRECT_LIMIT = 1;
const USER_AGENT = "bouncepartyla-instagram-media-processor/1.0";
const MAX_SCAN_PAGES = 8;
const FETCH_REQUEST_TIMEOUT_MS = 45 * 1000;
const STORAGE_OPERATION_TIMEOUT_MS = 30 * 1000;

const DEFAULT_INVOCATION_BUDGET_MS = 3 * 60 * 1000;
const MIN_INVOCATION_BUDGET_MS = 60 * 1000;
const MAX_INVOCATION_BUDGET_MS = 7 * 60 * 1000;
const INVOCATION_CLEANUP_RESERVE_MS = 20 * 1000;
const MIN_MESSAGE_START_WINDOW_MS = 40 * 1000;
const FAIRNESS_ROTATION_WINDOW_MS = 5 * 60 * 1000;

const RETRY_BASE_SECONDS = 120;
const RETRY_MAX_SECONDS = 6 * 60 * 60;

const IMAGE_MIME_CANDIDATES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const TRUSTED_META_HOST_SUFFIXES = [
  ".lookaside.fbsbx.com",
  ".fbcdn.net",
  ".cdninstagram.com",
  ".fna.fbcdn.net",
  ".scontent.cdninstagram.com",
  ".scontent.xx.fbcdn.net",
  ".instagram.com",
  ".facebook.com",
];

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  [ipToInt("127.0.0.0"), ipToInt("127.255.255.255")],
  [ipToInt("169.254.0.0"), ipToInt("169.254.255.255")],
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
];

function ipToInt(ip: string) {
  const parts = ip.split(".").map((item) => Number(item));
  return (
    ((parts[0] || 0) << 24) +
    ((parts[1] || 0) << 16) +
    ((parts[2] || 0) << 8) +
    (parts[3] || 0)
  ) >>> 0;
}

function parseJsonRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function asUnknownRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as UnknownRecord;
}

function cleanHost(hostname: string) {
  return String(hostname || "").trim().toLowerCase();
}

function isTrustedMetaHost(hostname: string) {
  const host = cleanHost(hostname);

  if (!host) {
    return false;
  }

  return TRUSTED_META_HOST_SUFFIXES.some((suffix) => {
    return host === suffix.replace(/^\./, "") || host.endsWith(suffix);
  });
}

function isPrivateIPv4(address: string) {
  if (isIP(address) !== 4) {
    return false;
  }

  const value = ipToInt(address);

  return PRIVATE_IPV4_RANGES.some(([start, end]) => {
    return value >= start && value <= end;
  });
}

function isBlockedIPv6(address: string) {
  if (isIP(address) !== 6) {
    return false;
  }

  const normalized = address.toLowerCase();

  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:172.16.") ||
    normalized.startsWith("::ffff:172.17.") ||
    normalized.startsWith("::ffff:172.18.") ||
    normalized.startsWith("::ffff:172.19.") ||
    normalized.startsWith("::ffff:172.2") ||
    normalized.startsWith("::ffff:172.30.") ||
    normalized.startsWith("::ffff:172.31.")
  );
}

function isPrivateOrBlockedIp(address: string) {
  if (!address) {
    return true;
  }

  if (isPrivateIPv4(address)) {
    return true;
  }

  return isBlockedIPv6(address);
}

function mapDetectedMime(buffer: Buffer): string | null {
  if (buffer.length >= 12) {
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

    if (isJpeg) {
      return "image/jpeg";
    }

    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a;

    if (isPng) {
      return "image/png";
    }

    const isWebp =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50;

    if (isWebp) {
      return "image/webp";
    }

    const isPdf =
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46;

    if (isPdf) {
      return "application/pdf";
    }
  }

  return null;
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  if (mimeType === "application/pdf") {
    return "pdf";
  }

  return "bin";
}

function sanitizeFileName(value: string) {
  return String(value || "attachment")
    .trim()
    .replace(/[^a-zA-Z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "attachment";
}

function deterministicStoragePath(params: {
  conversationId: string;
  createdAt: Date;
  providerMessageId: string;
  attachmentIndex: number;
  mimeType: string;
}) {
  const year = String(params.createdAt.getUTCFullYear());
  const month = String(params.createdAt.getUTCMonth() + 1).padStart(2, "0");
  const hash = createHash("sha256")
    .update(
      `${params.conversationId}:${params.providerMessageId}:${params.attachmentIndex}:${params.mimeType}`,
      "utf8",
    )
    .digest("hex")
    .slice(0, 24);

  const extension = extensionForMime(params.mimeType);

  return `${params.conversationId}/${year}/${month}/ig-${sanitizeFileName(params.providerMessageId || "msg")}-${String(params.attachmentIndex).padStart(2, "0")}-${hash}.${extension}`;
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 260);
  }

  return String(error).slice(0, 260);
}

function getThrownReason(error: unknown): ProcessorReason {
  const payload = asUnknownRecord(error);

  return String(payload.reason || "source_fetch_failed") as ProcessorReason;
}

function getThrownRetryable(
  error: unknown,
  fallbackReason: ProcessorReason,
) {
  const payload = asUnknownRecord(error);

  if (typeof payload.retryable === "boolean") {
    return payload.retryable;
  }

  return shouldRetry(fallbackReason);
}

function retryDelaySeconds(attempt: number) {
  const candidate = RETRY_BASE_SECONDS * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(RETRY_MAX_SECONDS, candidate);
}

function contentSha256Hex(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function isStorageConflictError(error: unknown) {
  const payload = asUnknownRecord(error);
  const message = String(payload.message || "").toLowerCase();
  const statusCode = Number(payload.statusCode || payload.status || 0);

  if (statusCode === 409) {
    return true;
  }

  return (
    message.includes("already exists") ||
    message.includes("duplicate") ||
    message.includes("conflict")
  );
}

async function resolvePublicIps(hostname: string) {
  const host = cleanHost(hostname);

  if (!host) {
    return [] as string[];
  }

  const results = await dns.lookup(host, { all: true, verbatim: true });
  return (results || []).map((item) => String(item.address || "").trim()).filter(Boolean);
}

// DNS/IP prevalidation reduces risk, but does not fully eliminate DNS-rebinding TOCTOU.
async function validateMetaSourceUrl(rawUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      ok: false as const,
      reason: "invalid_source_url" as ProcessorReason,
      detail: "Could not parse source URL.",
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      ok: false as const,
      reason: "source_not_https" as ProcessorReason,
      detail: "Source URL protocol must be HTTPS.",
    };
  }

  const host = cleanHost(parsed.hostname);

  if (!isTrustedMetaHost(host)) {
    return {
      ok: false as const,
      reason: "untrusted_source_host" as ProcessorReason,
      detail: `Host ${host} is not in trusted Meta host list.`,
    };
  }

  const ipType = isIP(host);

  if (ipType > 0 && isPrivateOrBlockedIp(host)) {
    return {
      ok: false as const,
      reason: "private_ip_blocked" as ProcessorReason,
      detail: "Source URL uses a blocked private/internal IP.",
    };
  }

  try {
    const ips = await resolvePublicIps(host);

    if (ips.length === 0) {
      return {
        ok: false as const,
        reason: "source_fetch_failed" as ProcessorReason,
        detail: "Could not resolve source host IP addresses.",
      };
    }

    const blocked = ips.some((ip) => isPrivateOrBlockedIp(ip));

    if (blocked) {
      return {
        ok: false as const,
        reason: "private_ip_blocked" as ProcessorReason,
        detail: "Resolved source host includes private/internal IP.",
      };
    }
  } catch {
    return {
      ok: false as const,
      reason: "source_fetch_failed" as ProcessorReason,
      detail: "DNS validation failed for source host.",
    };
  }

  return {
    ok: true as const,
    parsed,
    host,
  };
}

async function fetchSourceBinary(params: {
  url: URL;
  host: string;
  timeoutMs: number;
  deadlineAt: number;
}) {
  let currentUrl = params.url;
  let redirectCount = 0;

  while (true) {
    const remainingMs = params.deadlineAt - Date.now();

    if (remainingMs <= 0) {
      throw Object.assign(new Error("Message processing deadline exceeded before fetch."), {
        reason: "source_fetch_failed" as ProcessorReason,
        retryable: true,
      });
    }

    const timeoutMs = Math.max(1_000, Math.min(params.timeoutMs, remainingMs));

    const response = await fetch(currentUrl.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount >= REDIRECT_LIMIT) {
        throw Object.assign(new Error("Redirect limit exceeded."), {
          reason: "source_redirect_blocked" as ProcessorReason,
          retryable: false,
        });
      }

      const location = String(response.headers.get("location") || "").trim();

      if (!location) {
        throw Object.assign(new Error("Redirect without location header."), {
          reason: "source_redirect_blocked" as ProcessorReason,
          retryable: false,
        });
      }

      let nextUrl: URL;

      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw Object.assign(new Error("Invalid redirect URL."), {
          reason: "source_redirect_blocked" as ProcessorReason,
          retryable: false,
        });
      }

      if (nextUrl.protocol !== "https:") {
        throw Object.assign(new Error("Redirect protocol must be HTTPS."), {
          reason: "source_redirect_blocked" as ProcessorReason,
          retryable: false,
        });
      }

      const nextHost = cleanHost(nextUrl.hostname);

      if (!isTrustedMetaHost(nextHost)) {
        throw Object.assign(new Error(`Redirect host ${nextHost} is untrusted.`), {
          reason: "source_redirect_blocked" as ProcessorReason,
          retryable: false,
        });
      }

      if (nextHost !== params.host) {
        throw Object.assign(new Error("Redirect host changed and is blocked."), {
          reason: "source_redirect_blocked" as ProcessorReason,
          retryable: false,
        });
      }

      redirectCount += 1;
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      const retryable = response.status >= 500 || response.status === 429;

      throw Object.assign(
        new Error(`Source HTTP error ${response.status}.`),
        {
          reason: "source_http_error" as ProcessorReason,
          retryable,
        },
      );
    }

    const contentLength = Number(response.headers.get("content-length") || 0);

    if (Number.isFinite(contentLength) && contentLength > 0 && contentLength > CRM_ATTACHMENT_MAX_BYTES) {
      throw Object.assign(
        new Error("Source content-length exceeds CRM attachment limit."),
        {
          reason: "source_too_large" as ProcessorReason,
          retryable: false,
        },
      );
    }

    const chunks: Buffer[] = [];
    let total = 0;

    if (!response.body) {
      throw Object.assign(new Error("Source response body is empty."), {
        reason: "empty_payload" as ProcessorReason,
        retryable: true,
      });
    }

    const reader = response.body.getReader();

    while (true) {
      if (Date.now() >= params.deadlineAt) {
        throw Object.assign(new Error("Message processing deadline exceeded while reading response."), {
          reason: "source_fetch_failed" as ProcessorReason,
          retryable: true,
        });
      }

      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      total += chunk.length;

      if (total > CRM_ATTACHMENT_MAX_BYTES) {
        throw Object.assign(new Error("Source payload exceeds max attachment size."), {
          reason: "source_too_large" as ProcessorReason,
          retryable: false,
        });
      }

      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      throw Object.assign(new Error("Downloaded payload is empty."), {
        reason: "empty_payload" as ProcessorReason,
        retryable: true,
      });
    }

    const declaredMime = String(response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    const detectedMime = mapDetectedMime(buffer);

    if (!detectedMime) {
      throw Object.assign(new Error("Could not detect allowed file signature."), {
        reason: "invalid_file_signature" as ProcessorReason,
        retryable: false,
      });
    }

    if (!isAllowedCrmAttachmentMimeType(detectedMime)) {
      throw Object.assign(new Error(`Detected MIME ${detectedMime} is not allowed.`), {
        reason: "unsupported_mime" as ProcessorReason,
        retryable: false,
      });
    }

    if (declaredMime && declaredMime !== detectedMime) {
      throw Object.assign(
        new Error(`Declared MIME ${declaredMime} mismatches detected ${detectedMime}.`),
        {
          reason: "unsupported_mime" as ProcessorReason,
          retryable: false,
        },
      );
    }

    return {
      buffer,
      mimeType: detectedMime,
      size: buffer.length,
      hash: contentSha256Hex(buffer),
    };
  }
}

function parseAttachmentCandidates(metadata: JsonRecord) {
  const message = parseJsonRecord(metadata.message);
  const raw = Array.isArray(message.attachments)
    ? message.attachments
    : [];

  const candidates: InstagramAttachmentCandidate[] = [];

  raw.forEach((itemValue, index: number) => {
    const item = parseJsonRecord(itemValue);
    const type = String(item.type || "").trim().toLowerCase();
    const payload = parseJsonRecord(item.payload);
    const url = String(payload.url || "").trim();
    const title = String(payload.title || "").trim();

    if (!url) {
      return;
    }

    let host = "";

    try {
      host = cleanHost(new URL(url).hostname);
    } catch {
      host = "";
    }

    candidates.push({
      index,
      type,
      url,
      title,
      sourceHost: host,
    });
  });

  return candidates;
}

function parseExistingAttachments(metadata: JsonRecord) {
  const current = Array.isArray(metadata.attachments)
    ? metadata.attachments
    : [];

  const normalized: CrmAttachment[] = [];

  current.forEach((itemValue) => {
    const item = parseJsonRecord(itemValue);
    const storagePath = String(item.storagePath || item.storage_path || "").trim();

    if (!storagePath) {
      return;
    }

    normalized.push({
      storagePath,
      name: String(item.name || "Attachment").trim() || "Attachment",
      mimeType: String(item.mimeType || item.mime_type || "").trim().toLowerCase(),
      size: Number(item.size || 0),
      type: item.type === "image" ? "image" : "file",
    });
  });

  return normalized;
}

function parsePriorFailures(metadata: JsonRecord) {
  const ingestion = parseJsonRecord(metadata.instagram_media_ingestion);
  const raw = Array.isArray(ingestion.failures) ? ingestion.failures : [];
  const byIndex = new Map<number, AttachmentFailure>();

  for (const itemValue of raw) {
    const item = parseJsonRecord(itemValue);
    const index = Number(item.attachment_index);

    if (!Number.isInteger(index) || index < 0) {
      continue;
    }

    byIndex.set(index, {
      attachment_index: index,
      reason: String(item.reason || "source_fetch_failed") as ProcessorReason,
      detail: item.detail ? String(item.detail).slice(0, 260) : undefined,
      retryable: Boolean(item.retryable),
    });
  }

  return byIndex;
}

function candidateHasNormalizedAttachment(params: {
  existingByStorage: Set<string>;
  conversationId: string;
  createdAt: Date;
  providerMessageId: string;
  attachmentIndex: number;
}) {
  for (const mimeType of IMAGE_MIME_CANDIDATES) {
    const storagePath = deterministicStoragePath({
      conversationId: params.conversationId,
      createdAt: params.createdAt,
      providerMessageId: params.providerMessageId,
      attachmentIndex: params.attachmentIndex,
      mimeType,
    });

    if (params.existingByStorage.has(storagePath)) {
      return true;
    }
  }

  return false;
}

function buildAttachmentName(params: {
  index: number;
  candidate: InstagramAttachmentCandidate;
  mimeType: string;
}) {
  const ext = extensionForMime(params.mimeType);
  const title = sanitizeFileName(params.candidate.title || "instagram-image");
  return `${title || "instagram-image"}-${String(params.index + 1).padStart(2, "0")}.${ext}`;
}

function getClaimStatus(payload: JsonRecord): ClaimStatus {
  return String(payload.status || "invalid").trim().toLowerCase() as ClaimStatus;
}

function getFinalizeStatus(payload: JsonRecord): FinalizeStatus {
  return String(payload.status || "invalid").trim().toLowerCase() as FinalizeStatus;
}

function parsePositiveInteger(value: unknown) {
  const text = String(value ?? "").trim();

  if (!/^[0-9]+$/.test(text)) {
    return null;
  }

  const parsed = Number(text);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function resolveExecutionBudgetMs() {
  const configured = parsePositiveInteger(
    process.env.INSTAGRAM_MEDIA_PROCESSOR_EXECUTION_BUDGET_MS,
  );

  const rawBudget = configured ?? DEFAULT_INVOCATION_BUDGET_MS;

  return Math.max(
    MIN_INVOCATION_BUDGET_MS,
    Math.min(MAX_INVOCATION_BUDGET_MS, rawBudget),
  );
}

function remainingMs(deadlineAt: number) {
  return deadlineAt - Date.now();
}

function ensureDeadlineRemaining(params: {
  deadlineAt: number;
  minRemainingMs?: number;
  reason: ProcessorReason;
  message: string;
  retryable?: boolean;
}) {
  const minimum = params.minRemainingMs ?? 1;

  if (remainingMs(params.deadlineAt) >= minimum) {
    return;
  }

  throw Object.assign(new Error(params.message), {
    reason: params.reason,
    retryable: params.retryable ?? true,
  });
}

function computeFairnessOffset(params: {
  pageIndex: number;
  pageSize: number;
  rotationSeed: number;
}) {
  const normalizedSeed = Math.max(0, params.rotationSeed) % MAX_SCAN_PAGES;
  const windowIndex = (normalizedSeed + params.pageIndex) % MAX_SCAN_PAGES;
  return windowIndex * params.pageSize;
}

function parseSelectionIngestion(metadata: JsonRecord) {
  const ingestion = parseJsonRecord(metadata.instagram_media_ingestion);
  const status = String(ingestion.status || "").trim().toLowerCase() as SelectionIngestionStatus;
  const attempts = Number(ingestion.attempts || 0);

  return {
    status,
    attempts: Number.isFinite(attempts) ? attempts : 0,
  };
}

function shouldSkipSelectionTerminal(metadata: JsonRecord) {
  const ingestion = parseSelectionIngestion(metadata);

  if (ingestion.status === "completed") {
    return true;
  }

  if (ingestion.attempts >= MAX_MESSAGE_ATTEMPTS && ingestion.status !== "pending") {
    return true;
  }

  return false;
}

function shouldRetry(reason: ProcessorReason) {
  return (
    reason === "source_fetch_failed" ||
    reason === "source_http_error" ||
    reason === "storage_upload_failed" ||
    reason === "empty_payload" ||
    reason === "metadata_update_conflict"
  );
}

function mapClaimSkipReason(status: ClaimStatus): ProcessorReason {
  if (status === "completed") {
    return "already_processed";
  }

  if (status === "busy") {
    return "claim_busy";
  }

  if (status === "retry_not_due" || status === "exhausted") {
    return "retry_budget_exhausted";
  }

  return "claim_invalid";
}

async function verifyExistingStorageObject(params: {
  supabase: SupabaseClient;
  storagePath: string;
  deadlineAt: number;
  expected: {
    mimeType: string;
    size: number;
    hash: string;
  };
}) {
  ensureDeadlineRemaining({
    deadlineAt: params.deadlineAt,
    minRemainingMs: 1_000,
    reason: "storage_upload_failed",
    message: "Deadline exceeded before storage conflict verification download.",
    retryable: true,
  });

  const downloadTimeoutMs = Math.max(
    1_000,
    Math.min(STORAGE_OPERATION_TIMEOUT_MS, remainingMs(params.deadlineAt)),
  );

  const downloaded = await params.supabase.storage
    .from(CRM_ATTACHMENT_BUCKET)
    .download(
      params.storagePath,
      undefined,
      {
        signal: AbortSignal.timeout(downloadTimeoutMs),
      },
    );

  ensureDeadlineRemaining({
    deadlineAt: params.deadlineAt,
    reason: "storage_upload_failed",
    message: "Deadline exceeded after storage conflict verification download.",
    retryable: true,
  });

  if (downloaded.error || !downloaded.data) {
    return false;
  }

  const arrayBuffer = await downloaded.data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length !== params.expected.size) {
    return false;
  }

  const detectedMime = mapDetectedMime(buffer);

  if (!detectedMime || detectedMime !== params.expected.mimeType) {
    return false;
  }

  const hash = contentSha256Hex(buffer);
  return hash === params.expected.hash;
}

async function processSingleMessage(params: {
  supabase: SupabaseClient;
  row: MessageRow;
  workerId: string;
  deadlineAt: number;
}) {
  ensureDeadlineRemaining({
    deadlineAt: params.deadlineAt,
    minRemainingMs: MIN_MESSAGE_START_WINDOW_MS,
    reason: "source_fetch_failed",
    message: "Not enough budget remaining to start processing message safely.",
    retryable: true,
  });

  const requestedClaimToken = randomUUID().replace(/-/g, "");

  const claimResult = await params.supabase.rpc("crm_claim_instagram_media_message", {
    p_message_id: params.row.id,
    p_worker_id: params.workerId,
    p_claim_token: requestedClaimToken,
  });

  if (claimResult.error) {
    throw new Error(claimResult.error.message);
  }

  const claimPayload = parseJsonRecord(claimResult.data);
  const claimStatus = getClaimStatus(claimPayload);

  if (claimStatus !== "claimed") {
    return {
      status: "skipped" as const,
      reason: mapClaimSkipReason(claimStatus),
    };
  }

  const claimToken = String(claimPayload.claim_token || "").trim();
  const claimLockExpiresAtRaw = String(claimPayload.lock_expires_at || "").trim();
  let claimLockExpiresAtMs: number | null = null;

  if (claimLockExpiresAtRaw) {
    const parsed = Date.parse(claimLockExpiresAtRaw);

    if (Number.isFinite(parsed)) {
      claimLockExpiresAtMs = parsed;
    }
  }

  if (!claimToken) {
    return {
      status: "skipped" as const,
      reason: "claim_invalid" as ProcessorReason,
    };
  }

  const metadata = parseJsonRecord(claimPayload.metadata);
  const attempts = Math.max(1, Number(claimPayload.attempts || 1));

  const existingAttachments = parseExistingAttachments(metadata);
  const existingByStorage = new Set(existingAttachments.map((item) => item.storagePath));
  const candidates = parseAttachmentCandidates(metadata).filter((item) => item.type === "image");

  const failuresByIndex = parsePriorFailures(metadata);
  const successfulCandidateIndexes = new Set<number>();
  const added: CrmAttachment[] = [];
  const sourceHosts = Array.from(new Set(candidates.map((item) => item.sourceHost).filter(Boolean)));
  const createdAt = params.row.created_at
    ? new Date(params.row.created_at)
    : new Date();
  const providerMessageId = String(params.row.provider_message_id || "").trim() || params.row.id;

  for (const candidate of candidates) {
    const alreadyNormalized = candidateHasNormalizedAttachment({
      existingByStorage,
      conversationId: params.row.conversation_id,
      createdAt,
      providerMessageId,
      attachmentIndex: candidate.index,
    });

    if (alreadyNormalized) {
      successfulCandidateIndexes.add(candidate.index);
      failuresByIndex.delete(candidate.index);
      continue;
    }

    const priorFailure = failuresByIndex.get(candidate.index);

    if (priorFailure && !priorFailure.retryable) {
      continue;
    }

    const remainingForMessageMs = params.deadlineAt - Date.now();

    if (remainingForMessageMs <= 0) {
      failuresByIndex.set(candidate.index, {
        attachment_index: candidate.index,
        reason: "source_fetch_failed",
        detail: "Message processing deadline exceeded before attachment processing completed.",
        retryable: true,
      });
      continue;
    }

    const sourceValidation = await validateMetaSourceUrl(candidate.url);

    if (!sourceValidation.ok) {
      failuresByIndex.set(candidate.index, {
        attachment_index: candidate.index,
        reason: sourceValidation.reason,
        detail: sourceValidation.detail,
        retryable: shouldRetry(sourceValidation.reason),
      });
      continue;
    }

    let payload: {
      buffer: Buffer;
      mimeType: string;
      size: number;
      hash: string;
    };

    try {
      payload = await fetchSourceBinary({
        url: sourceValidation.parsed,
        host: sourceValidation.host,
        timeoutMs: FETCH_REQUEST_TIMEOUT_MS,
        deadlineAt: params.deadlineAt,
      });
    } catch (error: unknown) {
      const reason = getThrownReason(error);
      const retryable = getThrownRetryable(error, reason);

      failuresByIndex.set(candidate.index, {
        attachment_index: candidate.index,
        reason,
        detail: safeErrorMessage(error),
        retryable,
      });
      continue;
    }

    const storagePath = deterministicStoragePath({
      conversationId: params.row.conversation_id,
      createdAt,
      providerMessageId,
      attachmentIndex: candidate.index,
      mimeType: payload.mimeType,
    });

    if (existingByStorage.has(storagePath)) {
      successfulCandidateIndexes.add(candidate.index);
      failuresByIndex.delete(candidate.index);
      continue;
    }

    ensureDeadlineRemaining({
      deadlineAt: params.deadlineAt,
      minRemainingMs: 1_000,
      reason: "storage_upload_failed",
      message: "Deadline exceeded before storage upload.",
      retryable: true,
    });

    const uploadTimeoutMs = Math.max(
      1_000,
      Math.min(STORAGE_OPERATION_TIMEOUT_MS, remainingMs(params.deadlineAt)),
    );

    let uploaded: {
      data: unknown;
      error: unknown;
    };
    let uploadTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      uploaded = await Promise.race([
        params.supabase.storage
          .from(CRM_ATTACHMENT_BUCKET)
          .upload(storagePath, payload.buffer, {
            cacheControl: "3600",
            upsert: false,
            contentType: payload.mimeType,
          }),
        new Promise<never>((_, reject) => {
          uploadTimeoutHandle = setTimeout(() => {
            reject(Object.assign(new Error("Storage upload timed out before global deadline."), {
              reason: "storage_upload_failed" as ProcessorReason,
              retryable: true,
            }));
          }, uploadTimeoutMs);
        }),
      ]);
    } catch (error: unknown) {
      const reason = getThrownReason(error);
      const retryable = getThrownRetryable(error, "storage_upload_failed");

      failuresByIndex.set(candidate.index, {
        attachment_index: candidate.index,
        reason,
        detail: safeErrorMessage(error),
        retryable,
      });
      continue;
    } finally {
      if (uploadTimeoutHandle) {
        clearTimeout(uploadTimeoutHandle);
      }
    }

    ensureDeadlineRemaining({
      deadlineAt: params.deadlineAt,
      reason: "storage_upload_failed",
      message: "Deadline exceeded after storage upload.",
      retryable: true,
    });

    if (uploaded.error) {
      if (isStorageConflictError(uploaded.error)) {
        const matchesExisting = await verifyExistingStorageObject({
          supabase: params.supabase,
          storagePath,
          deadlineAt: params.deadlineAt,
          expected: {
            mimeType: payload.mimeType,
            size: payload.size,
            hash: payload.hash,
          },
        });

        if (!matchesExisting) {
          failuresByIndex.set(candidate.index, {
            attachment_index: candidate.index,
            reason: "storage_conflict_mismatch",
            detail: "Storage object conflict does not match expected payload.",
            retryable: false,
          });
          continue;
        }
      } else {
        failuresByIndex.set(candidate.index, {
          attachment_index: candidate.index,
          reason: "storage_upload_failed",
          detail: safeErrorMessage(uploaded.error),
          retryable: true,
        });
        continue;
      }
    }

    const attachment: CrmAttachment = {
      storagePath,
      name: buildAttachmentName({
        index: candidate.index,
        candidate,
        mimeType: payload.mimeType,
      }),
      mimeType: payload.mimeType,
      size: payload.size,
      type: "image",
    };

    added.push(attachment);
    existingByStorage.add(storagePath);
    successfulCandidateIndexes.add(candidate.index);
    failuresByIndex.delete(candidate.index);
  }

  const failures = candidates
    .map((candidate) => failuresByIndex.get(candidate.index))
    .filter((item): item is AttachmentFailure => Boolean(item))
    .sort((a, b) => a.attachment_index - b.attachment_index);

  const mergedAttachments = [
    ...existingAttachments,
    ...added,
  ];

  const totalCandidates = candidates.length;
  const retryableFailures = failures.filter((item) => item.retryable);
  const permanentFailures = failures.filter((item) => !item.retryable);
  const successfulCount = successfulCandidateIndexes.size;
  const unresolvedCount = Math.max(
    0,
    totalCandidates - successfulCount - retryableFailures.length - permanentFailures.length,
  );

  let status: "completed" | "partial" | "failed" = "completed";

  if (successfulCount >= totalCandidates && totalCandidates > 0) {
    status = "completed";
  } else if (retryableFailures.length > 0 || unresolvedCount > 0) {
    status = successfulCount > 0 ? "partial" : "failed";
  } else if (permanentFailures.length > 0) {
    status = successfulCount > 0 ? "partial" : "failed";
  } else if (mergedAttachments.length === 0 && failures.length > 0) {
    status = "failed";
  } else if (failures.length > 0) {
    status = "partial";
  }

  const retryAfterSeconds = retryableFailures.length > 0 && attempts < MAX_MESSAGE_ATTEMPTS
    ? retryDelaySeconds(attempts)
    : null;

  if (claimLockExpiresAtMs !== null && Date.now() >= claimLockExpiresAtMs) {
    return {
      status: "skipped" as const,
      reason: "stale_claim" as ProcessorReason,
    };
  }

  const finalizeResult = await params.supabase.rpc("crm_finalize_instagram_media_message", {
    p_message_id: params.row.id,
    p_claim_token: claimToken,
    p_added_attachments: added,
    p_failures: failures,
    p_status: status,
    p_retry_after_seconds: retryAfterSeconds,
    p_source_hosts: sourceHosts,
  });

  if (finalizeResult.error) {
    throw new Error(finalizeResult.error.message);
  }

  const finalizePayload = parseJsonRecord(finalizeResult.data);
  const finalizeStatus = getFinalizeStatus(finalizePayload);

  if (finalizeStatus === "already_finalized_idempotent") {
    return {
      status: "completed" as const,
      failures: 0,
      added: 0,
    };
  }

  if (finalizeStatus === "stale_claim") {
    return {
      status: "skipped" as const,
      reason: "stale_claim" as ProcessorReason,
    };
  }

  if (finalizeStatus === "invalid") {
    throw new Error("Instagram media finalization rejected by RPC.");
  }

  if (finalizeStatus !== "finalized") {
    throw new Error(`Instagram media finalization returned unexpected status: ${finalizeStatus}`);
  }

  if (status === "completed") {
    return {
      status: "completed" as const,
      failures: 0,
      added: added.length,
    };
  }

  if (status === "partial") {
    return {
      status: "partial" as const,
      failures: failures.length,
      added: added.length,
    };
  }

  return {
    status: "failed" as const,
    failures: failures.length,
    added: added.length,
  };
}

async function selectCandidateMessages(params: {
  supabase: SupabaseClient;
  batchSize: number;
  deadlineAt: number;
  rotationSeed: number;
}) {
  const rows: MessageRow[] = [];
  const selectedIds = new Set<string>();
  const pageSize = Math.max(params.batchSize * 3, params.batchSize);
  let scanned = 0;

  for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
    if (remainingMs(params.deadlineAt) <= MIN_MESSAGE_START_WINDOW_MS) {
      break;
    }

    const oldestOffset = computeFairnessOffset({
      pageIndex: page,
      pageSize,
      rotationSeed: params.rotationSeed,
    });

    const newestOffset = computeFairnessOffset({
      pageIndex: page,
      pageSize,
      rotationSeed: MAX_SCAN_PAGES - 1 - (params.rotationSeed % MAX_SCAN_PAGES),
    });

    const oldestResult = await params.supabase
      .from("crm_messages")
      .select("id, conversation_id, provider_message_id, metadata, created_at")
      .eq("channel", "instagram")
      .eq("direction", "inbound")
      .contains("metadata", {
        message: {
          attachments: [],
        },
      })
      .not("metadata->message->attachments", "eq", "[]")
      .order("created_at", {
        ascending: true,
        nullsFirst: true,
      })
      .order("id", {
        ascending: true,
      })
      .range(oldestOffset, oldestOffset + pageSize - 1);

    if (oldestResult.error) {
      throw new Error(oldestResult.error.message);
    }

    const newestResult = await params.supabase
      .from("crm_messages")
      .select("id, conversation_id, provider_message_id, metadata, created_at")
      .eq("channel", "instagram")
      .eq("direction", "inbound")
      .contains("metadata", {
        message: {
          attachments: [],
        },
      })
      .not("metadata->message->attachments", "eq", "[]")
      .order("created_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("id", {
        ascending: false,
      })
      .range(newestOffset, newestOffset + pageSize - 1);

    if (newestResult.error) {
      throw new Error(newestResult.error.message);
    }

    const oldestRows = (oldestResult.data || []) as MessageRow[];
    const newestRows = (newestResult.data || []) as MessageRow[];

    scanned += oldestRows.length + newestRows.length;

    if (oldestRows.length === 0 && newestRows.length === 0) {
      break;
    }

    const interleaved: MessageRow[] = [];
    const maxLen = Math.max(oldestRows.length, newestRows.length);

    for (let i = 0; i < maxLen; i += 1) {
      if (i < oldestRows.length) {
        interleaved.push(oldestRows[i]);
      }

      if (i < newestRows.length) {
        interleaved.push(newestRows[i]);
      }
    }

    for (const row of interleaved) {
      if (selectedIds.has(row.id)) {
        continue;
      }

      const metadata = parseJsonRecord(row.metadata);

      if (shouldSkipSelectionTerminal(metadata)) {
        continue;
      }

      const candidates = parseAttachmentCandidates(metadata);

      if (candidates.length === 0) {
        continue;
      }

      selectedIds.add(row.id);
      rows.push(row);

      if (rows.length >= params.batchSize) {
        break;
      }
    }

    if (rows.length >= params.batchSize) {
      break;
    }

    if (oldestRows.length < pageSize && newestRows.length < pageSize) {
      break;
    }
  }

  return {
    rows,
    scanned,
  };
}

export async function processInstagramMediaBatch(params?: {
  batchSize?: number;
}) {
  const config = getInstagramMediaProcessorConfiguration();
  const supabase = createServiceClient();
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Number(params?.batchSize || DEFAULT_BATCH_SIZE)),
  );

  const startedAt = Date.now();
  const invocationDeadlineAt = startedAt + config.executionBudgetMs;
  const messageStartDeadlineAt = invocationDeadlineAt - config.cleanupReserveMs;
  const fairnessSeed = Math.floor(startedAt / FAIRNESS_ROTATION_WINDOW_MS);

  const selected = await selectCandidateMessages({
    supabase,
    batchSize,
    deadlineAt: messageStartDeadlineAt,
    rotationSeed: fairnessSeed,
  });

  const workerId = `ig-media-${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

  const summary: InstagramMediaProcessorResult = {
    scanned: selected.scanned,
    picked: selected.rows.length,
    processed: 0,
    completed: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
  };

  for (const row of selected.rows) {
    if (remainingMs(messageStartDeadlineAt) <= config.minMessageStartWindowMs) {
      break;
    }

    try {
      const result = await processSingleMessage({
        supabase,
        row,
        workerId,
        deadlineAt: messageStartDeadlineAt,
      });

      if (result.status === "skipped") {
        summary.skipped += 1;

        if (
          result.reason === "retry_budget_exhausted" ||
          result.reason === "claim_busy"
        ) {
          summary.blocked += 1;
        }

        continue;
      }

      summary.processed += 1;

      if (result.status === "completed") {
        summary.completed += 1;
      } else if (result.status === "partial") {
        summary.partial += 1;
      } else {
        summary.failed += 1;
      }
    } catch (error) {
      summary.processed += 1;
      summary.failed += 1;

      console.error("Instagram media processor message failed", {
        messageId: row.id,
        error: safeErrorMessage(error),
      });
    }
  }

  return summary;
}

export function getInstagramMediaProcessorConfiguration() {
  const secret = String(
    process.env.INSTAGRAM_MEDIA_PROCESSOR_SECRET ||
      "",
  ).trim();
  const executionBudgetMs = resolveExecutionBudgetMs();

  return {
    secret,
    enabled: Boolean(secret),
    executionBudgetMs,
    cleanupReserveMs: INVOCATION_CLEANUP_RESERVE_MS,
    minMessageStartWindowMs: MIN_MESSAGE_START_WINDOW_MS,
  };
}

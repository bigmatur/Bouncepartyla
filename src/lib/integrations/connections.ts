import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

export type IntegrationProvider = "ga4" | "meta" | "instagram" | "sms" | "telegram" | "whatsapp" | "google_maps" | "stripe" | "gmail";

export type IntegrationStatus = "connected" | "not_connected" | "error" | "disabled";

type IntegrationRow = {
  id: string;
  provider: IntegrationProvider;
  display_name: string;
  enabled: boolean;
  status: IntegrationStatus;
  public_config: Record<string, any> | null;
  encrypted_credentials?: Record<string, any> | null;
  last_tested_at: string | null;
  last_error: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationSummary = {
  provider: IntegrationProvider;
  displayName: string;
  enabled: boolean;
  status: IntegrationStatus;
  publicConfig: Record<string, any>;
  maskedCredentials: Record<string, string>;
  lastTestedAt: string | null;
  lastError: string | null;
  source: "database" | "environment" | "none";
};

const providers: Array<{ provider: IntegrationProvider; displayName: string }> = [
  { provider: "ga4", displayName: "Google Analytics 4" },
  { provider: "meta", displayName: "Meta Ads" },
  { provider: "instagram", displayName: "Instagram" },
  { provider: "sms", displayName: "SMS" },
  { provider: "telegram", displayName: "Telegram" },
  { provider: "whatsapp", displayName: "WhatsApp" },
  { provider: "google_maps", displayName: "Google Maps" },
  { provider: "stripe", displayName: "Stripe" },
  { provider: "gmail", displayName: "Gmail" },
];

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function encryptionSecret() {
  return env("INTEGRATION_ENCRYPTION_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
}

function encryptionKey() {
  const secret = encryptionSecret();

  if (!secret) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY is required to store integration secrets.");
  }

  return createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: encrypted.toString("base64"),
  };
}

function decryptSecret(payload: any) {
  if (!payload?.iv || !payload?.tag || !payload?.value) return "";

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.value, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptCredentials(values: Record<string, string | null | undefined>) {
  const fields: Record<string, ReturnType<typeof encryptSecret>> = {};

  Object.entries(values).forEach(([key, value]) => {
    const cleanValue = String(value || "").trim();

    if (cleanValue) {
      fields[key] = encryptSecret(cleanValue);
    }
  });

  return { version: 1, fields };
}

export function mergeEncryptedCredentials(
  current: Record<string, any> | null | undefined,
  updates: Record<string, string | null | undefined>,
) {
  const next = {
    version: 1,
    fields: { ...((current?.fields || {}) as Record<string, any>) },
  };

  Object.entries(updates).forEach(([key, value]) => {
    const cleanValue = String(value || "").trim();

    if (cleanValue) {
      next.fields[key] = encryptSecret(cleanValue);
    }
  });

  return next;
}

export function decryptCredentials(payload: Record<string, any> | null | undefined) {
  const fields = payload?.fields || {};
  const result: Record<string, string> = {};

  Object.keys(fields).forEach((key) => {
    result[key] = decryptSecret(fields[key]);
  });

  return result;
}

export function maskSecret(value: string | null | undefined) {
  const cleanValue = String(value || "").trim();

  if (!cleanValue) return "";

  const suffix = cleanValue.slice(-4);
  return `${"•".repeat(8)}${suffix}`;
}

function maskCredentials(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => Boolean(value))
      .map(([key, value]) => [key, maskSecret(value)]),
  );
}

function tableMissing(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return code === "42p01" || message.includes("schema cache") || message.includes("relation");
}

async function fetchIntegration(provider: IntegrationProvider, includeCredentials: boolean) {
  const supabase = createServiceClient();
  const select = includeCredentials
    ? "id, provider, display_name, enabled, status, public_config, encrypted_credentials, last_tested_at, last_error, created_by, updated_by, created_at, updated_at"
    : "id, provider, display_name, enabled, status, public_config, last_tested_at, last_error, created_by, updated_by, created_at, updated_at";
  const { data, error } = await supabase
    .from("integration_connections")
    .select(select)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    if (tableMissing(error)) return null;
    throw new Error(error.message);
  }

  return (data || null) as unknown as IntegrationRow | null;
}

function envFallback(provider: IntegrationProvider) {
  if (provider === "ga4") {
    return {
      publicConfig: { property_id: env("GA4_PROPERTY_ID") },
      credentials: { credentials_path: env("GOOGLE_APPLICATION_CREDENTIALS") },
    };
  }

  if (provider === "meta") {
    return {
      publicConfig: {
        graph_version: env("META_GRAPH_VERSION") || "v24.0",
        ad_account_id: env("META_AD_ACCOUNT_ID"),
      },
      credentials: {
        access_token: env("META_ADS_ACCESS_TOKEN") || env("META_INSTAGRAM_ACCESS_TOKEN"),
        app_secret: env("META_APP_SECRET"),
      },
    };
  }

  if (provider === "instagram") {
    return {
      publicConfig: {
        graph_version: env("META_GRAPH_VERSION") || "v24.0",
        page_id: env("META_INSTAGRAM_PAGE_ID"),
        instagram_business_account_id: env("META_INSTAGRAM_USER_ID"),
        simulator_enabled: env("CRM_INSTAGRAM_SIMULATOR_ENABLED").toLowerCase() === "true",
      },
      credentials: {
        access_token: env("META_INSTAGRAM_ACCESS_TOKEN"),
        app_secret: env("META_APP_SECRET"),
        verify_token: env("META_INSTAGRAM_VERIFY_TOKEN"),
      },
    };
  }

  if (provider === "sms") {
    return {
      publicConfig: {
        from_number: env("TWILIO_FROM_NUMBER"),
        inbound_webhook_url: env("TWILIO_INBOUND_WEBHOOK_URL"),
        status_callback_url: env("TWILIO_STATUS_CALLBACK_URL"),
      },
      credentials: {
        account_sid: env("TWILIO_ACCOUNT_SID"),
        auth_token: env("TWILIO_AUTH_TOKEN"),
      },
    };
  }

  if (provider === "telegram") {
    return {
      publicConfig: {
        bot_username: env("TELEGRAM_BOT_USERNAME"),
        chat_id: env("TELEGRAM_CHAT_ID"),
      },
      credentials: {
        bot_token: env("TELEGRAM_BOT_TOKEN"),
        webhook_secret: env("TELEGRAM_WEBHOOK_SECRET"),
      },
    };
  }

  if (provider === "whatsapp") {
    return {
      publicConfig: {
        graph_version: env("META_GRAPH_VERSION") || "v24.0",
        phone_number_id: env("META_WHATSAPP_PHONE_NUMBER_ID"),
        business_account_id: env("META_WHATSAPP_BUSINESS_ACCOUNT_ID"),
      },
      credentials: {
        access_token: env("META_WHATSAPP_ACCESS_TOKEN"),
        app_secret: env("META_APP_SECRET"),
        verify_token: env("META_WHATSAPP_VERIFY_TOKEN"),
      },
    };
  }

  if (provider === "google_maps") {
    return {
      publicConfig: {},
      credentials: {
        server_api_key: env("GOOGLE_MAPS_API_KEY"),
        browser_api_key: env("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"),
      },
    };
  }

  if (provider === "stripe") {
    return {
      publicConfig: { publishable_key: env("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY") },
      credentials: {
        secret_key: env("STRIPE_SECRET_KEY"),
        webhook_secret: env("STRIPE_WEBHOOK_SECRET"),
      },
    };
  }

  return {
    publicConfig: { mailbox: env("CRM_GMAIL_USER") || env("SMTP_USER") || env("BOOKING_FROM_EMAIL") },
    credentials: {
      client_id: env("CRM_GMAIL_CLIENT_ID"),
      client_secret: env("CRM_GMAIL_CLIENT_SECRET"),
      refresh_token: env("CRM_GMAIL_REFRESH_TOKEN"),
    },
  };
}

export async function resolveIntegrationConnection(provider: IntegrationProvider) {
  const row = await fetchIntegration(provider, true);

  if (row?.enabled) {
    return {
      source: "database" as const,
      row,
      publicConfig: row.public_config || {},
      credentials: decryptCredentials(row.encrypted_credentials),
    };
  }

  const fallback = envFallback(provider);
  const configured = Object.values({ ...fallback.publicConfig, ...fallback.credentials }).some((value) => Boolean(value));

  return {
    source: configured ? "environment" as const : "none" as const,
    row,
    publicConfig: fallback.publicConfig,
    credentials: fallback.credentials,
  };
}

export async function listIntegrationSummaries(): Promise<IntegrationSummary[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("integration_connections")
    .select("id, provider, display_name, enabled, status, public_config, encrypted_credentials, last_tested_at, last_error, created_by, updated_by, created_at, updated_at")
    .order("provider", { ascending: true });

  const rows = error && tableMissing(error) ? [] : (data || []);

  if (error && !tableMissing(error)) {
    throw new Error(error.message);
  }

  return providers.map(({ provider, displayName }) => {
    const row = rows.find((item: any) => item.provider === provider) as IntegrationRow | undefined;
    const fallback = envFallback(provider);
    const fallbackConfigured = Object.values({ ...fallback.publicConfig, ...fallback.credentials }).some((value) => Boolean(value));
    const decryptedCredentials = row ? decryptCredentials(row.encrypted_credentials) : {};
    const source = row?.enabled ? "database" : fallbackConfigured ? "environment" : "none";

    return {
      provider,
      displayName: row?.display_name || displayName,
      enabled: Boolean(row?.enabled),
      status: row?.enabled ? row.status : fallbackConfigured ? "connected" : "not_connected",
      publicConfig: row?.enabled ? row.public_config || {} : fallback.publicConfig,
      maskedCredentials: row?.enabled ? maskCredentials(decryptedCredentials) : maskCredentials(fallback.credentials),
      lastTestedAt: row?.last_tested_at || null,
      lastError: row?.last_error || null,
      source,
    };
  });
}

export async function readStoredIntegrationForUpdate(provider: IntegrationProvider) {
  return fetchIntegration(provider, true);
}

export const supportedIntegrationProviders = providers;
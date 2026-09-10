"use server";

import { existsSync } from "node:fs";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  mergeEncryptedCredentials,
  readStoredIntegrationForUpdate,
  resolveIntegrationConnection,
  type IntegrationProvider,
  type IntegrationStatus,
} from "@/lib/integrations/connections";
import { getResolvedMetaIntegration } from "@/lib/crm/instagram";

const providerLabels: Record<IntegrationProvider, string> = {
  ga4: "Google Analytics 4",
  meta: "Meta Ads",
  instagram: "Instagram",
  sms: "SMS",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  google_maps: "Google Maps",
  stripe: "Stripe",
  gmail: "Gmail",
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value ? value : null;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function parseProvider(value: string): IntegrationProvider {
  if (
    value === "ga4" ||
    value === "meta" ||
    value === "instagram" ||
    value === "sms" ||
    value === "telegram" ||
    value === "whatsapp" ||
    value === "google_maps" ||
    value === "stripe" ||
    value === "gmail"
  ) {
    return value;
  }

  throw new Error("Unsupported integration provider.");
}

function redirectToIntegrations(provider: IntegrationProvider, params: Record<string, string>) {
  const query = new URLSearchParams({ provider, ...params });
  redirect(`/admin/settings/integrations?${query.toString()}`);
}

function cleanJson(value: string | null) {
  if (!value) return null;

  try {
    JSON.parse(value);
    return value;
  } catch {
    throw new Error("Service account credentials must be valid JSON.");
  }
}

function configForProvider(provider: IntegrationProvider, formData: FormData) {
  if (provider === "ga4") {
    return {
      publicConfig: {
        property_id: getString(formData, "ga4PropertyId"),
      },
      credentials: {
        service_account_json: cleanJson(getNullableString(formData, "ga4ServiceAccountJson")),
      },
    };
  }

  if (provider === "meta") {
    return {
      publicConfig: {
        ad_account_id: getString(formData, "metaAdAccountId"),
        graph_version: getString(formData, "metaGraphVersion") || "v24.0",
      },
      credentials: {
        access_token: getNullableString(formData, "metaAccessToken"),
        app_secret: getNullableString(formData, "metaAppSecret"),
      },
    };
  }

  if (provider === "instagram") {
    return {
      publicConfig: {
        page_id: getString(formData, "instagramPageId"),
        instagram_business_account_id: getString(formData, "instagramBusinessAccountId"),
        graph_version: getString(formData, "instagramGraphVersion") || "v24.0",
        simulator_enabled: getBoolean(formData, "instagramSimulatorEnabled"),
      },
      credentials: {
        access_token: getNullableString(formData, "instagramAccessToken"),
        app_secret: getNullableString(formData, "instagramAppSecret"),
        verify_token: getNullableString(formData, "instagramVerifyToken"),
      },
    };
  }

  if (provider === "sms") {
    return {
      publicConfig: {
        from_number: getString(formData, "smsFromNumber"),
        inbound_webhook_url: getString(formData, "smsInboundWebhookUrl"),
        status_callback_url: getString(formData, "smsStatusCallbackUrl"),
      },
      credentials: {
        account_sid: getNullableString(formData, "smsAccountSid"),
        auth_token: getNullableString(formData, "smsAuthToken"),
      },
    };
  }

  if (provider === "telegram") {
    return {
      publicConfig: {
        bot_username: getString(formData, "telegramBotUsername"),
        chat_id: getString(formData, "telegramChatId"),
      },
      credentials: {
        bot_token: getNullableString(formData, "telegramBotToken"),
        webhook_secret: getNullableString(formData, "telegramWebhookSecret"),
      },
    };
  }

  if (provider === "whatsapp") {
    return {
      publicConfig: {
        phone_number_id: getString(formData, "whatsappPhoneNumberId"),
        business_account_id: getString(formData, "whatsappBusinessAccountId"),
        graph_version: getString(formData, "whatsappGraphVersion") || "v24.0",
      },
      credentials: {
        access_token: getNullableString(formData, "whatsappAccessToken"),
        app_secret: getNullableString(formData, "whatsappAppSecret"),
        verify_token: getNullableString(formData, "whatsappVerifyToken"),
      },
    };
  }

  if (provider === "google_maps") {
    return {
      publicConfig: {},
      credentials: {
        server_api_key: getNullableString(formData, "googleMapsServerApiKey"),
        browser_api_key: getNullableString(formData, "googleMapsBrowserApiKey"),
      },
    };
  }

  if (provider === "stripe") {
    return {
      publicConfig: {
        publishable_key: getString(formData, "stripePublishableKey"),
      },
      credentials: {
        secret_key: getNullableString(formData, "stripeSecretKey"),
        webhook_secret: getNullableString(formData, "stripeWebhookSecret"),
      },
    };
  }

  return {
    publicConfig: {
      mailbox: getString(formData, "gmailMailbox"),
    },
    credentials: {
      client_id: getNullableString(formData, "gmailClientId"),
      client_secret: getNullableString(formData, "gmailClientSecret"),
      refresh_token: getNullableString(formData, "gmailRefreshToken"),
    },
  };
}

function hasAnyCredential(credentials: Record<string, string | null>) {
  return Object.values(credentials).some((value) => Boolean(String(value || "").trim()));
}

function revalidateIntegrations() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/integrations");
}

export async function saveIntegrationConnectionAction(formData: FormData) {
  const { user, profile } = await requireAdminPermission("settings.edit");
  const provider = parseProvider(getString(formData, "provider"));
  const enabled = getBoolean(formData, "enabled");
  const displayName = getString(formData, "displayName") || providerLabels[provider];
  const { publicConfig, credentials } = configForProvider(provider, formData);
  const existing = await readStoredIntegrationForUpdate(provider);
  const encryptedCredentials = mergeEncryptedCredentials(existing?.encrypted_credentials, credentials);
  const actorId = profile.id || user.id || null;
  const now = new Date().toISOString();
  const status: IntegrationStatus = enabled ? "not_connected" : "disabled";
  const supabase = createServiceClient();

  if (existing?.id) {
    const { error } = await supabase
      .from("integration_connections")
      .update({
        display_name: displayName,
        enabled,
        status,
        public_config: publicConfig,
        encrypted_credentials: encryptedCredentials,
        last_error: null,
        updated_by: actorId,
        updated_at: now,
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("integration_connections").insert({
      provider,
      display_name: displayName,
      enabled,
      status,
      public_config: publicConfig,
      encrypted_credentials: encryptedCredentials,
      created_by: actorId,
      updated_by: actorId,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(error.message);
  }

  revalidateIntegrations();
  redirectToIntegrations(provider, { saved: "integration" });
}

export async function disableIntegrationConnectionAction(formData: FormData) {
  const { user, profile } = await requireAdminPermission("settings.edit");
  const provider = parseProvider(getString(formData, "provider"));
  const supabase = createServiceClient();
  const actorId = profile.id || user.id || null;

  const { error } = await supabase
    .from("integration_connections")
    .update({
      enabled: false,
      status: "disabled",
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", provider);

  if (error) throw new Error(error.message);

  revalidateIntegrations();
  redirectToIntegrations(provider, { saved: "disabled" });
}

async function testGa4Connection() {
  const integration = await resolveIntegrationConnection("ga4");
  const credentials = integration.credentials as Record<string, string>;
  const propertyId = String(integration.publicConfig.property_id || "").trim();
  const serviceAccountJson = String(credentials.service_account_json || "").trim();
  const credentialsPath = String(credentials.credentials_path || "").trim();

  if (!propertyId) throw new Error("GA4 property ID is missing.");
  if (!serviceAccountJson && !credentialsPath) throw new Error("GA4 credentials are missing.");
  if (credentialsPath && !existsSync(credentialsPath)) throw new Error("GA4 credential file was not found.");

  const client = serviceAccountJson
    ? new BetaAnalyticsDataClient({ credentials: JSON.parse(serviceAccountJson) })
    : new BetaAnalyticsDataClient();

  await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    metrics: [{ name: "sessions" }],
    limit: 1,
  });
}

async function testMetaConnection(provider: "meta" | "instagram") {
  let accessToken = "";
  let graphVersion = "v24.0";

  if (provider === "instagram") {
    const integration = await getResolvedMetaIntegration();
    accessToken = integration.accessToken;
    graphVersion = integration.graphVersion;
  } else {
    const integration = await resolveIntegrationConnection("meta");
    const publicConfig = integration.publicConfig as Record<string, any>;
    const credentials = integration.credentials as Record<string, string>;

    accessToken = String(credentials.access_token || "").trim();
    graphVersion = String(publicConfig.graph_version || "v24.0").trim() || "v24.0";
  }

  if (!accessToken) throw new Error("Meta access token is missing.");

  const url = new URL(`https://graph.facebook.com/${graphVersion}/me`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload?.error?.message || "Meta API request failed."));
  }
}


async function testGmailConnection() {
  const integration =
    await resolveIntegrationConnection(
      "gmail",
    );

  const publicConfig =
    integration.publicConfig as Record<
      string,
      any
    >;

  const credentials =
    integration.credentials as Record<
      string,
      string
    >;

  const mailbox =
    String(
      publicConfig.mailbox ||
        "",
    ).trim();

  const clientId =
    String(
      credentials.client_id ||
        "",
    ).trim();

  const clientSecret =
    String(
      credentials.client_secret ||
        "",
    ).trim();

  const refreshToken =
    String(
      credentials.refresh_token ||
        "",
    ).trim();

  if (
    !mailbox ||
    !clientId ||
    !clientSecret ||
    !refreshToken
  ) {
    throw new Error(
      "Gmail OAuth configuration is incomplete.",
    );
  }

  const tokenResponse =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body:
          new URLSearchParams({
            client_id:
              clientId,

            client_secret:
              clientSecret,

            refresh_token:
              refreshToken,

            grant_type:
              "refresh_token",
          }),

        cache:
          "no-store",
      },
    );

  const tokenPayload =
    await tokenResponse
      .json()
      .catch(
        () => ({}),
      ) as {
        access_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };

  if (
    !tokenResponse.ok ||
    !tokenPayload.access_token
  ) {
    throw new Error(
      String(
        tokenPayload.error_description ||
          tokenPayload.error ||
          "Google OAuth refresh failed.",
      ),
    );
  }

  const accessToken =
    tokenPayload.access_token;

  let scopeValue =
    String(
      tokenPayload.scope ||
        "",
    ).trim();

  /*
   * Google does not always include `scope` in a
   * refresh-token response, so use tokeninfo as
   * a read-only fallback.
   */
  if (!scopeValue) {
    const tokenInfoUrl =
      new URL(
        "https://oauth2.googleapis.com/tokeninfo",
      );

    tokenInfoUrl.searchParams.set(
      "access_token",
      accessToken,
    );

    const tokenInfoResponse =
      await fetch(
        tokenInfoUrl.toString(),
        {
          cache:
            "no-store",
        },
      );

    const tokenInfoPayload =
      await tokenInfoResponse
        .json()
        .catch(
          () => ({}),
        ) as {
          scope?: string;
          error?: string;
          error_description?: string;
        };

    if (!tokenInfoResponse.ok) {
      throw new Error(
        String(
          tokenInfoPayload.error_description ||
            tokenInfoPayload.error ||
            "Google OAuth token validation failed.",
        ),
      );
    }

    scopeValue =
      String(
        tokenInfoPayload.scope ||
          "",
      ).trim();
  }

  const scopes =
    new Set(
      scopeValue
        .split(/\s+/)
        .map(
          (value) =>
            value.trim(),
        )
        .filter(
          Boolean,
        ),
    );

  const fullAccessScope =
    "https://mail.google.com/";

  const readScopes = [
    fullAccessScope,
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
  ];

  const sendScopes = [
    fullAccessScope,
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
  ];

  const canRead =
    readScopes.some(
      (scope) =>
        scopes.has(scope),
    );

  const canSend =
    sendScopes.some(
      (scope) =>
        scopes.has(scope),
    );

  if (!canRead) {
    throw new Error(
      "Gmail OAuth is connected, but the refresh token does not have permission to read CRM email. Re-authorize Gmail with gmail.readonly (or gmail.modify).",
    );
  }

  if (!canSend) {
    throw new Error(
      "Gmail OAuth is connected, but the refresh token does not have permission to send CRM replies. Re-authorize Gmail with gmail.send (or gmail.modify).",
    );
  }

  const profileResponse =
    await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        cache:
          "no-store",
      },
    );

  const profilePayload =
    await profileResponse
      .json()
      .catch(
        () => ({}),
      ) as {
        emailAddress?: string;
        error?: {
          message?: string;
        };
      };

  if (!profileResponse.ok) {
    throw new Error(
      String(
        profilePayload.error?.message ||
          "Gmail profile request failed.",
      ),
    );
  }

  const connectedMailbox =
    String(
      profilePayload.emailAddress ||
        "",
    )
      .trim()
      .toLowerCase();

  if (!connectedMailbox) {
    throw new Error(
      "Google did not return the connected Gmail mailbox.",
    );
  }

  if (
    connectedMailbox !==
    mailbox.toLowerCase()
  ) {
    throw new Error(
      `Gmail OAuth belongs to ${connectedMailbox}, but Settings is configured for ${mailbox}.`,
    );
  }
}

export async function testIntegrationConnectionAction(formData: FormData) {
  const { user, profile } = await requireAdminPermission("settings.edit");
  const provider = parseProvider(getString(formData, "provider"));
  const supabase = createServiceClient();
  const actorId = profile.id || user.id || null;
  const now = new Date().toISOString();

  try {
    if (provider === "ga4") {
      await testGa4Connection();
    } else if (provider === "meta" || provider === "instagram") {
      await testMetaConnection(provider);
    } else if (provider === "gmail") {
      await testGmailConnection();
    } else {
      const integration = await resolveIntegrationConnection(provider);
      const credentials = integration.credentials as Record<string, string>;

      if (integration.source === "none" || !hasAnyCredential(credentials)) {
        throw new Error(`${providerLabels[provider]} credentials are not configured.`);
      }
    }

    const { error } = await supabase
      .from("integration_connections")
      .update({
        status: "connected",
        last_tested_at: now,
        last_error: null,
        updated_by: actorId,
        updated_at: now,
      })
      .eq("provider", provider);

    if (error) throw new Error(error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed.";
    const { error: updateError } = await supabase
      .from("integration_connections")
      .update({
        status: "error",
        last_tested_at: now,
        last_error: message,
        updated_by: actorId,
        updated_at: now,
      })
      .eq("provider", provider);

    if (updateError) throw new Error(updateError.message);
    revalidateIntegrations();
    redirectToIntegrations(provider, { error: "test_failed" });
  }

  revalidateIntegrations();
  redirectToIntegrations(provider, { saved: "tested" });
}
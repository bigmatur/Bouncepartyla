import "server-only";

import { resolveIntegrationConnection } from "@/lib/integrations/connections";
import type {
  BusinessAnalyticsRange,
  BusinessMarketingCampaignRow,
  BusinessMarketingDailyRow,
  BusinessMetaAdsSnapshot,
  BusinessMetaAdsSummary,
} from "./types";

type MetaApiRow = Record<string, any>;

type MetaApiResponse = {
  data?: MetaApiRow[];
  paging?: { next?: string };
  error?: { message?: string };
};

const LEAD_ACTION_PRIORITY = [
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
];

const MESSAGE_ACTION_PRIORITY = [
  "onsite_conversion.messaging_conversation_started_7d",
  "messaging_conversation_started_7d",
  "onsite_conversion.messaging_first_reply",
];

function numberValue(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function actionValue(actions: unknown, priority: string[]) {
  if (!Array.isArray(actions)) return 0;

  for (const actionType of priority) {
    const match = actions.find((row: any) => String(row?.action_type || "") === actionType);
    if (match) return numberValue(match.value);
  }

  return 0;
}

function normalizeAdAccountId(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean.startsWith("act_") ? clean : `act_${clean}`;
}

function summaryFromRows(rows: MetaApiRow[]): BusinessMetaAdsSummary {
  const totals = rows.reduce(
    (acc, row) => {
      acc.spend += numberValue(row.spend);
      acc.impressions += numberValue(row.impressions);
      acc.reach += numberValue(row.reach);
      acc.clicks += numberValue(row.clicks);
      acc.leads += actionValue(row.actions, LEAD_ACTION_PRIORITY);
      acc.messagingConversations += actionValue(row.actions, MESSAGE_ACTION_PRIORITY);
      return acc;
    },
    { spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, messagingConversations: 0 },
  );

  return {
    spend: totals.spend,
    impressions: totals.impressions,
    reach: totals.reach,
    clicks: totals.clicks,
    leads: totals.leads,
    messagingConversations: totals.messagingConversations,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
    cpl: totals.leads > 0 ? totals.spend / totals.leads : null,
    costPerMessagingConversation:
      totals.messagingConversations > 0
        ? totals.spend / totals.messagingConversations
        : null,
  };
}

async function fetchMetaRows(params: {
  graphVersion: string;
  adAccountId: string;
  accessToken: string;
  range: BusinessAnalyticsRange;
  level: "account" | "campaign";
  timeIncrement?: number;
  fields: string[];
  maxPages?: number;
}) {
  const url = new URL(
    `https://graph.facebook.com/${params.graphVersion}/${params.adAccountId}/insights`,
  );
  url.searchParams.set("access_token", params.accessToken);
  url.searchParams.set("level", params.level);
  url.searchParams.set("fields", params.fields.join(","));
  url.searchParams.set(
    "time_range",
    JSON.stringify({ since: params.range.from, until: params.range.to }),
  );
  url.searchParams.set("limit", "500");
  if (params.timeIncrement) {
    url.searchParams.set("time_increment", String(params.timeIncrement));
  }

  const rows: MetaApiRow[] = [];
  let nextUrl: string | null = url.toString();
  let page = 0;
  const maxPages = params.maxPages || 5;

  while (nextUrl && page < maxPages) {
    const next = new URL(nextUrl);
    if (next.hostname !== "graph.facebook.com") {
      throw new Error("Meta API returned an unexpected pagination host.");
    }

    const response = await fetch(next.toString(), { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as MetaApiResponse;

    if (!response.ok || payload.error) {
      throw new Error(String(payload.error?.message || "Meta Ads API request failed."));
    }

    rows.push(...(payload.data || []));
    nextUrl = payload.paging?.next || null;
    page += 1;
  }

  return rows;
}

function campaignRows(rows: MetaApiRow[]): BusinessMarketingCampaignRow[] {
  return rows
    .map((row) => {
      const spend = numberValue(row.spend);
      const impressions = numberValue(row.impressions);
      const clicks = numberValue(row.clicks);
      const leads = actionValue(row.actions, LEAD_ACTION_PRIORITY);
      const messagingConversations = actionValue(row.actions, MESSAGE_ACTION_PRIORITY);

      return {
        campaignId: String(row.campaign_id || "").trim() || "unknown",
        campaignName: String(row.campaign_name || "").trim() || "Unnamed campaign",
        spend,
        impressions,
        clicks,
        leads,
        messagingConversations,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : null,
        cpl: leads > 0 ? spend / leads : null,
        costPerMessagingConversation:
          messagingConversations > 0 ? spend / messagingConversations : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

function dailyRows(rows: MetaApiRow[]): BusinessMarketingDailyRow[] {
  return rows
    .map((row) => {
      const spend = numberValue(row.spend);
      const impressions = numberValue(row.impressions);
      const clicks = numberValue(row.clicks);
      const leads = actionValue(row.actions, LEAD_ACTION_PRIORITY);
      const messagingConversations = actionValue(row.actions, MESSAGE_ACTION_PRIORITY);

      return {
        date: String(row.date_start || "").trim(),
        spend,
        impressions,
        clicks,
        leads,
        messagingConversations,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpl: leads > 0 ? spend / leads : null,
        costPerMessagingConversation:
          messagingConversations > 0 ? spend / messagingConversations : null,
      };
    })
    .filter((row) => Boolean(row.date))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function loadMetaAdsInsights(params: {
  range: BusinessAnalyticsRange;
  previousRange: BusinessAnalyticsRange;
}): Promise<BusinessMetaAdsSnapshot> {
  try {
    const integration = await resolveIntegrationConnection("meta");
    const publicConfig = integration.publicConfig as Record<string, any>;
    const credentials = integration.credentials as Record<string, string>;
    const graphVersion = String(publicConfig.graph_version || "v24.0").trim() || "v24.0";
    const adAccountId = normalizeAdAccountId(String(publicConfig.ad_account_id || ""));
    const accessToken = String(credentials.access_token || "").trim();

    if (!adAccountId || !accessToken) {
      return {
        connection: {
          configured: false,
          source: integration.source,
          adAccountId,
          graphVersion,
          error: !adAccountId ? "Meta Ad Account ID is not configured." : "Meta Ads access token is not configured.",
        },
        current: null,
        previous: null,
        campaigns: [],
        daily: [],
      };
    }

    const summaryFields = ["spend", "impressions", "reach", "clicks", "actions", "date_start", "date_stop"];
    const campaignFields = [
      "campaign_id",
      "campaign_name",
      "spend",
      "impressions",
      "clicks",
      "actions",
      "date_start",
      "date_stop",
    ];

    const [currentRows, previousRows, currentCampaignRows, currentDailyRows] = await Promise.all([
      fetchMetaRows({
        graphVersion,
        adAccountId,
        accessToken,
        range: params.range,
        level: "account",
        fields: summaryFields,
      }),
      fetchMetaRows({
        graphVersion,
        adAccountId,
        accessToken,
        range: params.previousRange,
        level: "account",
        fields: summaryFields,
      }),
      fetchMetaRows({
        graphVersion,
        adAccountId,
        accessToken,
        range: params.range,
        level: "campaign",
        fields: campaignFields,
      }),
      fetchMetaRows({
        graphVersion,
        adAccountId,
        accessToken,
        range: params.range,
        level: "account",
        timeIncrement: 1,
        fields: summaryFields,
      }),
    ]);

    return {
      connection: {
        configured: true,
        source: integration.source,
        adAccountId,
        graphVersion,
        error: null,
      },
      current: summaryFromRows(currentRows),
      previous: summaryFromRows(previousRows),
      campaigns: campaignRows(currentCampaignRows),
      daily: dailyRows(currentDailyRows),
    };
  } catch (error) {
    return {
      connection: {
        configured: true,
        source: "none",
        adAccountId: "",
        graphVersion: "v24.0",
        error: error instanceof Error ? error.message : "Unable to load Meta Ads insights.",
      },
      current: null,
      previous: null,
      campaigns: [],
      daily: [],
    };
  }
}

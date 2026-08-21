import "server-only";

import { existsSync } from "node:fs";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { resolveIntegrationConnection } from "@/lib/integrations/connections";

type Ga4Row = {
  name: string;
  users: number;
  sessions: number;
  keyEvents: number;
  pageViews?: number;
};

type Ga4TrendRow = {
  date: string;
  users: number;
  sessions: number;
  pageViews: number;
};

export type Ga4UtmRow = {
  campaign: string;
  source: string;
  medium: string;
  content: string;
  term: string;
  users: number;
  sessions: number;
  keyEvents: number;
};

export type Ga4AnalyticsData = {
  available: boolean;
  error: string | null;
  overview: {
    activeUsers: number;
    totalUsers: number;
    sessions: number;
    pageViews: number;
    engagementRate: number;
    averageSessionDuration: number;
    newUsers: number;
    keyEvents: number;
  };
  acquisition: Ga4Row[];
  topPages: Ga4Row[];
  sources: Ga4Row[];
  trend: Ga4TrendRow[];
  utm: Ga4UtmRow[];
};

const emptyData = (error: string | null): Ga4AnalyticsData => ({
  available: false,
  error,
  overview: {
    activeUsers: 0,
    totalUsers: 0,
    sessions: 0,
    pageViews: 0,
    engagementRate: 0,
    averageSessionDuration: 0,
    newUsers: 0,
    keyEvents: 0,
  },
  acquisition: [],
  topPages: [],
  sources: [],
  trend: [],
  utm: [],
});

function metricValue(row: any, index: number) {
  return Number(row?.metricValues?.[index]?.value || 0) || 0;
}

function dimensionValue(row: any, index = 0) {
  return String(row?.dimensionValues?.[index]?.value || "(not set)");
}

function formatGaDate(value: string) {
  if (!/^\d{8}$/.test(value)) return value;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export async function loadGa4Analytics(params: {
  from: string;
  to: string;
}): Promise<Ga4AnalyticsData> {
  const integration = await resolveIntegrationConnection("ga4");
  const credentials = integration.credentials as Record<string, string>;
  const propertyId = String(integration.publicConfig.property_id || "").trim();
  const credentialsPath = String(credentials.credentials_path || "").trim();
  const serviceAccountJson = String(credentials.service_account_json || "").trim();

  if (!propertyId) {
    return emptyData("GA4_PROPERTY_ID is not configured.");
  }

  if (!credentialsPath && !serviceAccountJson) {
    return emptyData("GOOGLE_APPLICATION_CREDENTIALS is not configured.");
  }

  if (credentialsPath && !existsSync(credentialsPath)) {
    return emptyData("The Google service-account credential file was not found on this server.");
  }

  try {
    const client = serviceAccountJson
      ? new BetaAnalyticsDataClient({ credentials: JSON.parse(serviceAccountJson) })
      : new BetaAnalyticsDataClient();
    const property = `properties/${propertyId}`;
    const dateRanges = [{ startDate: params.from, endDate: params.to }];

    const [overviewResult, acquisitionResult, pagesResult, sourcesResult, trendResult, utmResult] = await Promise.all([
      client.runReport({
        property,
        dateRanges,
        metrics: [
          { name: "activeUsers" },
          { name: "totalUsers" },
          { name: "sessions" },
          { name: "screenPageViews" },
          { name: "engagementRate" },
          { name: "averageSessionDuration" },
          { name: "newUsers" },
          { name: "keyEvents" },
        ],
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "unifiedScreenClass" }],
        metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "sessions" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "sessionSourceMedium" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 10,
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      client.runReport({
        property,
        dateRanges,
        dimensions: [
          { name: "sessionManualCampaignName" },
          { name: "sessionManualSource" },
          { name: "sessionManualMedium" },
          { name: "sessionManualAdContent" },
          { name: "sessionManualTerm" },
        ],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 50,
      }),
    ]);

    const overviewRow = overviewResult[0].rows?.[0];
    const toRows = (report: any, type: "acquisition" | "pages" | "sources"): Ga4Row[] =>
      (report[0].rows || []).map((row: any) => ({
        name: dimensionValue(row),
        sessions: type === "pages" ? metricValue(row, 2) : metricValue(row, 0),
        users: type === "pages" ? metricValue(row, 1) : metricValue(row, 1),
        keyEvents: type === "pages" ? 0 : metricValue(row, 2),
        pageViews: type === "pages" ? metricValue(row, 0) : undefined,
      }));

    return {
      available: true,
      error: null,
      overview: {
        activeUsers: metricValue(overviewRow, 0),
        totalUsers: metricValue(overviewRow, 1),
        sessions: metricValue(overviewRow, 2),
        pageViews: metricValue(overviewRow, 3),
        engagementRate: metricValue(overviewRow, 4),
        averageSessionDuration: metricValue(overviewRow, 5),
        newUsers: metricValue(overviewRow, 6),
        keyEvents: metricValue(overviewRow, 7),
      },
      acquisition: toRows(acquisitionResult, "acquisition"),
      topPages: toRows(pagesResult, "pages"),
      sources: toRows(sourcesResult, "sources"),
      trend: (trendResult[0].rows || []).map((row: any) => ({
        date: formatGaDate(dimensionValue(row)),
        users: metricValue(row, 0),
        sessions: metricValue(row, 1),
        pageViews: metricValue(row, 2),
      })),
      utm: (utmResult[0].rows || [])
        .map((row: any): Ga4UtmRow => ({
          campaign: dimensionValue(row, 0),
          source: dimensionValue(row, 1),
          medium: dimensionValue(row, 2),
          content: dimensionValue(row, 3),
          term: dimensionValue(row, 4),
          sessions: metricValue(row, 0),
          users: metricValue(row, 1),
          keyEvents: metricValue(row, 2),
        }))
        .filter((row: Ga4UtmRow) => [row.campaign, row.source, row.medium, row.content, row.term].some((value) => value !== "(not set)")),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Analytics Data API request failed.";
    return emptyData(message);
  }
}

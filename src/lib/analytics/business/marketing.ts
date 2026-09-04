import "server-only";

import { isBusinessRevenueBooking } from "./definitions";
import type {
  BusinessComparisonMetric,
  BusinessMarketingInsights,
  BusinessMarketingLeadSourceRow,
  BusinessMetaAdsSnapshot,
  BusinessMetaAdsSummary,
  BusinessSignal,
} from "./types";

function numberValue(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function pctDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function metric(current: number, previous: number): BusinessComparisonMetric {
  return { current, previous, deltaPct: pctDelta(current, previous) };
}

function nullableMetric(current: number | null, previous: number | null): BusinessComparisonMetric | null {
  if (current === null && previous === null) return null;
  return metric(current || 0, previous || 0);
}

function normalizeSource(value: unknown) {
  return String(value || "other").trim().toLowerCase() || "other";
}

function marketingLeadDisplayName(lead: any) {
  const customerName = String(lead?.customer_name || "").trim();
  if (customerName) return customerName;

  const instagramUsername = String(lead?.instagram_username || "")
    .trim()
    .replace(/^@+/, "");
  if (instagramUsername) return `@${instagramUsername}`;

  return "Unknown lead";
}

function marketingLeadContactLabel(lead: any) {
  const instagramUsername = String(lead?.instagram_username || "")
    .trim()
    .replace(/^@+/, "");
  if (instagramUsername) return `@${instagramUsername}`;

  const email = String(lead?.customer_email || "").trim();
  if (email) return email;

  const phone = String(lead?.customer_phone || "").trim();
  if (phone) return phone;

  return "No contact identity";
}

function leadSourceRows(leads: any[], bookings: any[]): BusinessMarketingLeadSourceRow[] {
  const bookingById = new Map<string, any>();
  for (const booking of bookings) {
    const id = String(booking?.id || "").trim();
    if (id) bookingById.set(id, booking);
  }

  const groups = new Map<string, BusinessMarketingLeadSourceRow>();

  for (const lead of leads) {
    const source = normalizeSource(lead?.source);
    const current = groups.get(source) || {
      source,
      leads: 0,
      linkedRevenueBookings: 0,
      linkedBookedRevenue: 0,
      conversionPct: 0,
    };

    current.leads += 1;

    const bookingId = String(lead?.booking_id || "").trim();
    const booking = bookingId ? bookingById.get(bookingId) : null;
    if (booking && isBusinessRevenueBooking(booking)) {
      current.linkedRevenueBookings += 1;
      current.linkedBookedRevenue += numberValue(booking.total_amount);
    }

    groups.set(source, current);
  }

  return [...groups.values()]
    .map((row) => ({
      ...row,
      conversionPct: row.leads > 0 ? (row.linkedRevenueBookings / row.leads) * 100 : 0,
    }))
    .sort((a, b) => b.leads - a.leads || b.linkedBookedRevenue - a.linkedBookedRevenue);
}

function summarySignals(meta: BusinessMetaAdsSnapshot): BusinessSignal[] {
  const current = meta.current;
  const previous = meta.previous;
  if (!current || !previous) return [];

  const signals: BusinessSignal[] = [];
  const spendDelta = pctDelta(current.spend, previous.spend);
  const messageDelta = pctDelta(
    current.messagingConversations,
    previous.messagingConversations,
  );
  const costPerMessageDelta =
    current.costPerMessagingConversation !== null &&
    previous.costPerMessagingConversation !== null
      ? pctDelta(
          current.costPerMessagingConversation,
          previous.costPerMessagingConversation,
        )
      : null;
  const leadDelta = pctDelta(current.leads, previous.leads);
  const cplDelta = current.cpl !== null && previous.cpl !== null ? pctDelta(current.cpl, previous.cpl) : null;
  const ctrDelta = previous.ctr > 0 ? pctDelta(current.ctr, previous.ctr) : null;

  if (spendDelta !== null && Math.abs(spendDelta) >= 15) {
    signals.push({
      id: "marketing-spend-change",
      type: "marketing_spend_change",
      severity: "info",
      title: `Meta spend ${spendDelta > 0 ? "+" : ""}${spendDelta.toFixed(1)}%`,
      explanation: `Meta Ads spend changed from $${previous.spend.toFixed(0)} to $${current.spend.toFixed(0)} versus the previous equivalent period.`,
      currentValue: current.spend,
      previousValue: previous.spend,
      deltaPct: spendDelta,
    });
  }

  if (messageDelta !== null && Math.abs(messageDelta) >= 15) {
    signals.push({
      id: "marketing-messages-change",
      type: "marketing_messages_change",
      severity: messageDelta > 0 ? "positive" : "warning",
      title: `Messaging conversations ${messageDelta > 0 ? "+" : ""}${messageDelta.toFixed(1)}%`,
      explanation: `Meta-reported messaging conversations changed from ${previous.messagingConversations.toFixed(0)} to ${current.messagingConversations.toFixed(0)}.`,
      currentValue: current.messagingConversations,
      previousValue: previous.messagingConversations,
      deltaPct: messageDelta,
    });
  }

  if (costPerMessageDelta !== null && Math.abs(costPerMessageDelta) >= 15) {
    signals.push({
      id: "marketing-cost-per-message-change",
      type: "marketing_cost_per_message_change",
      severity: costPerMessageDelta < 0 ? "positive" : "warning",
      title: `Cost / message ${costPerMessageDelta > 0 ? "+" : ""}${costPerMessageDelta.toFixed(1)}%`,
      explanation: `Meta-reported cost per messaging conversation changed from $${previous.costPerMessagingConversation!.toFixed(2)} to $${current.costPerMessagingConversation!.toFixed(2)}.`,
      currentValue: current.costPerMessagingConversation || 0,
      previousValue: previous.costPerMessagingConversation || 0,
      deltaPct: costPerMessageDelta,
    });
  }

  if (leadDelta !== null && Math.abs(leadDelta) >= 15) {
    signals.push({
      id: "marketing-meta-leads-change",
      type: "marketing_meta_leads_change",
      severity: leadDelta > 0 ? "positive" : "warning",
      title: `Meta-reported leads ${leadDelta > 0 ? "+" : ""}${leadDelta.toFixed(1)}%`,
      explanation: `Meta-reported lead actions changed from ${previous.leads.toFixed(0)} to ${current.leads.toFixed(0)}.`,
      currentValue: current.leads,
      previousValue: previous.leads,
      deltaPct: leadDelta,
    });
  }

  if (cplDelta !== null && Math.abs(cplDelta) >= 15) {
    signals.push({
      id: "marketing-cpl-change",
      type: "marketing_cpl_change",
      severity: cplDelta < 0 ? "positive" : "warning",
      title: `Meta CPL ${cplDelta > 0 ? "+" : ""}${cplDelta.toFixed(1)}%`,
      explanation: `Meta-reported cost per lead changed from $${previous.cpl!.toFixed(2)} to $${current.cpl!.toFixed(2)}.`,
      currentValue: current.cpl || 0,
      previousValue: previous.cpl || 0,
      deltaPct: cplDelta,
    });
  }

  if (ctrDelta !== null && Math.abs(ctrDelta) >= 15) {
    signals.push({
      id: "marketing-ctr-change",
      type: "marketing_ctr_change",
      severity: ctrDelta > 0 ? "positive" : "warning",
      title: `Meta CTR ${ctrDelta > 0 ? "+" : ""}${ctrDelta.toFixed(1)}%`,
      explanation: `Click-through rate changed from ${previous.ctr.toFixed(2)}% to ${current.ctr.toFixed(2)}%.`,
      currentValue: current.ctr,
      previousValue: previous.ctr,
      deltaPct: ctrDelta,
    });
  }

  return signals.slice(0, 6);
}

function metaComparisons(current: BusinessMetaAdsSummary | null, previous: BusinessMetaAdsSummary | null) {
  if (!current || !previous) return null;

  return {
    spend: metric(current.spend, previous.spend),
    impressions: metric(current.impressions, previous.impressions),
    clicks: metric(current.clicks, previous.clicks),
    leads: metric(current.leads, previous.leads),
    messagingConversations: metric(
      current.messagingConversations,
      previous.messagingConversations,
    ),
    ctr: metric(current.ctr, previous.ctr),
    cpc: nullableMetric(current.cpc, previous.cpc),
    cpl: nullableMetric(current.cpl, previous.cpl),
    costPerMessagingConversation: nullableMetric(
      current.costPerMessagingConversation,
      previous.costPerMessagingConversation,
    ),
  };
}

export function calculateBusinessMarketing(params: {
  metaAds: BusinessMetaAdsSnapshot;
  currentLeads: any[];
  previousLeads: any[];
  linkedBookings: any[];
  leadAttributions: Array<{
    leadId: string;
    adId: string;
    occurredAt: string;
  }>;
}): BusinessMarketingInsights {
  const currentSourceRows = leadSourceRows(params.currentLeads, params.linkedBookings);
  const previousSourceRows = leadSourceRows(params.previousLeads, params.linkedBookings);

  const currentLeadCount = params.currentLeads.length;
  const currentLinkedLeadCount = params.currentLeads.filter((lead) => {
    const bookingId = String(lead?.booking_id || "").trim();
    return Boolean(bookingId);
  }).length;

  const sourceMapPrevious = new Map(previousSourceRows.map((row) => [row.source, row]));
  const leadSources = currentSourceRows.map((row) => {
    const previous = sourceMapPrevious.get(row.source);
    return {
      ...row,
      previousLeads: previous?.leads || 0,
      leadDeltaPct: pctDelta(row.leads, previous?.leads || 0),
    };
  });

  const signals = summarySignals(params.metaAds);
  const leadLinkageCoveragePct =
    currentLeadCount > 0
      ? (currentLinkedLeadCount / currentLeadCount) * 100
      : 0;

  const currentInstagramLeadIds = new Set(
    params.currentLeads
      .filter((lead) => normalizeSource(lead?.source) === "instagram")
      .map((lead) => String(lead?.id || "").trim())
      .filter(Boolean),
  );

  const attributionByLead = new Map(
    params.leadAttributions
      .filter((row) =>
        currentInstagramLeadIds.has(String(row?.leadId || "").trim()),
      )
      .map((row) => [String(row.leadId).trim(), row]),
  );

  const adById = new Map(
    (params.metaAds.ads || [])
      .map((row) => [String(row?.adId || "").trim(), row] as const)
      .filter(([adId]) => Boolean(adId)),
  );

  const bookingById = new Map(
    params.linkedBookings
      .map(
        (booking) =>
          [String(booking?.id || "").trim(), booking] as const,
      )
      .filter(([bookingId]) => Boolean(bookingId)),
  );

  const matchedAdIds = new Set<string>();
  const matchedRevenueBookingIds = new Set<string>();
  let matchedBookedRevenue = 0;

  for (const lead of params.currentLeads) {
    const leadId = String(lead?.id || "").trim();
    const attribution = attributionByLead.get(leadId);

    if (!attribution) {
      continue;
    }

    const adId = String(attribution.adId || "").trim();
    const ad = adById.get(adId);

    if (!ad) {
      continue;
    }

    matchedAdIds.add(adId);

    const bookingId = String(lead?.booking_id || "").trim();
    const booking = bookingId
      ? bookingById.get(bookingId)
      : null;

    if (
      booking &&
      isBusinessRevenueBooking(booking) &&
      !matchedRevenueBookingIds.has(bookingId)
    ) {
      matchedRevenueBookingIds.add(bookingId);
      matchedBookedRevenue += numberValue(booking.total_amount);
    }
  }

  const adAttributionGroups = new Map<
    string,
    {
      adId: string;
      adName: string;
      campaignId: string;
      campaignName: string;
      spend: number;
      attributedLeadIds: Set<string>;
      bookingIds: Set<string>;
      attributedBookedRevenue: number;
    }
  >();

  const campaignAttributionGroups = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      attributedLeadIds: Set<string>;
      bookingIds: Set<string>;
      attributedBookedRevenue: number;
    }
  >();

  for (const lead of params.currentLeads) {
    const leadId = String(lead?.id || "").trim();
    const attribution = attributionByLead.get(leadId);

    if (!attribution) {
      continue;
    }

    const adId = String(attribution.adId || "").trim();
    const ad = adById.get(adId);

    if (!ad) {
      continue;
    }

    const campaignId = String(ad.campaignId || "").trim();
    const campaignName =
      String(ad.campaignName || "").trim() || "Unnamed campaign";

    const adGroup = adAttributionGroups.get(adId) || {
      adId,
      adName: String(ad.adName || "").trim() || "Unnamed ad",
      campaignId,
      campaignName,
      spend: numberValue(ad.spend),
      attributedLeadIds: new Set<string>(),
      bookingIds: new Set<string>(),
      attributedBookedRevenue: 0,
    };

    adGroup.attributedLeadIds.add(leadId);

    const campaignGroup = campaignAttributionGroups.get(campaignId) || {
      campaignId,
      campaignName,
      attributedLeadIds: new Set<string>(),
      bookingIds: new Set<string>(),
      attributedBookedRevenue: 0,
    };

    campaignGroup.attributedLeadIds.add(leadId);

    const bookingId = String(lead?.booking_id || "").trim();
    const booking = bookingId
      ? bookingById.get(bookingId)
      : null;

    if (booking && isBusinessRevenueBooking(booking)) {
      if (!adGroup.bookingIds.has(bookingId)) {
        adGroup.bookingIds.add(bookingId);
        adGroup.attributedBookedRevenue += numberValue(
          booking.total_amount,
        );
      }

      if (!campaignGroup.bookingIds.has(bookingId)) {
        campaignGroup.bookingIds.add(bookingId);
        campaignGroup.attributedBookedRevenue += numberValue(
          booking.total_amount,
        );
      }
    }

    adAttributionGroups.set(adId, adGroup);

    if (campaignId) {
      campaignAttributionGroups.set(campaignId, campaignGroup);
    }
  }

  const campaignSpendById = new Map(
    (params.metaAds.campaigns || [])
      .map(
        (row) =>
          [String(row?.campaignId || "").trim(), numberValue(row?.spend)] as const,
      )
      .filter(([campaignId]) => Boolean(campaignId)),
  );

  const attributionAds = [...adAttributionGroups.values()]
    .map((group) => ({
      adId: group.adId,
      adName: group.adName,
      campaignId: group.campaignId,
      campaignName: group.campaignName,
      spend: group.spend,
      attributedLeads: group.attributedLeadIds.size,
      linkedRevenueBookings: group.bookingIds.size,
      attributedBookedRevenue: group.attributedBookedRevenue,
      attributedRoas:
        group.spend > 0 && group.attributedBookedRevenue > 0
          ? group.attributedBookedRevenue / group.spend
          : null,
    }))
    .sort(
      (a, b) =>
        b.attributedBookedRevenue - a.attributedBookedRevenue ||
        b.attributedLeads - a.attributedLeads ||
        b.spend - a.spend ||
        a.adName.localeCompare(b.adName),
    );

  const attributionCampaigns = [...campaignAttributionGroups.values()]
    .map((group) => {
      const spend = numberValue(
        campaignSpendById.get(group.campaignId),
      );

      return {
        campaignId: group.campaignId,
        campaignName: group.campaignName,
        spend,
        attributedLeads: group.attributedLeadIds.size,
        linkedRevenueBookings: group.bookingIds.size,
        attributedBookedRevenue: group.attributedBookedRevenue,
        attributedRoas:
          spend > 0 && group.attributedBookedRevenue > 0
            ? group.attributedBookedRevenue / spend
            : null,
      };
    })
    .sort(
      (a, b) =>
        b.attributedBookedRevenue - a.attributedBookedRevenue ||
        b.attributedLeads - a.attributedLeads ||
        b.spend - a.spend ||
        a.campaignName.localeCompare(b.campaignName),
    );

  const missingAdIdDrillDown: BusinessMarketingInsights["attribution"]["drillDown"]["missingAdId"] = [];
  const unmatchedMetaAdDrillDown: BusinessMarketingInsights["attribution"]["drillDown"]["unmatchedMetaAd"] = [];
  const noRevenueBookingDrillDown: BusinessMarketingInsights["attribution"]["drillDown"]["noRevenueBooking"] = [];

  for (const lead of params.currentLeads) {
    if (normalizeSource(lead?.source) !== "instagram") {
      continue;
    }

    const leadId = String(lead?.id || "").trim();
    if (!leadId) {
      continue;
    }

    const attribution = attributionByLead.get(leadId);
    const adId = String(attribution?.adId || "").trim();
    const ad = adId ? adById.get(adId) : null;
    const bookingId = String(lead?.booking_id || "").trim();
    const booking = bookingId ? bookingById.get(bookingId) : null;

    const baseRow = {
      leadId,
      customerName: marketingLeadDisplayName(lead),
      contactLabel: marketingLeadContactLabel(lead),
      createdAt: String(lead?.created_at || "").trim(),
      status: String(lead?.status || "").trim() || "unknown",
      bookingId,
      bookingStatus: String(booking?.status || "").trim(),
      adId,
      adName: ad ? String(ad.adName || "").trim() || "Unnamed ad" : "",
      campaignName: ad
        ? String(ad.campaignName || "").trim() || "Unnamed campaign"
        : "",
    };

    if (!attribution) {
      missingAdIdDrillDown.push(baseRow);
      continue;
    }

    if (!ad) {
      unmatchedMetaAdDrillDown.push(baseRow);
      continue;
    }

    if (!booking || !isBusinessRevenueBooking(booking)) {
      noRevenueBookingDrillDown.push(baseRow);
    }
  }

  const newestFirst = (
    a: BusinessMarketingInsights["attribution"]["drillDown"]["missingAdId"][number],
    b: BusinessMarketingInsights["attribution"]["drillDown"]["missingAdId"][number],
  ) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || "")) ||
    a.customerName.localeCompare(b.customerName);

  missingAdIdDrillDown.sort(newestFirst);
  unmatchedMetaAdDrillDown.sort(newestFirst);
  noRevenueBookingDrillDown.sort(newestFirst);

  const attributedLeads = attributionByLead.size;
  const instagramLeadCount = currentInstagramLeadIds.size;
  const attributionCoveragePct =
    instagramLeadCount > 0
      ? (attributedLeads / instagramLeadCount) * 100
      : 0;

  const matchedAdSpend = [...matchedAdIds].reduce(
    (sum, adId) =>
      sum + numberValue(adById.get(adId)?.spend),
    0,
  );

  const roas =
    matchedBookedRevenue > 0 && matchedAdSpend > 0
      ? matchedBookedRevenue / matchedAdSpend
      : null;

  const campaignRevenueAttributionAvailable =
    matchedRevenueBookingIds.size > 0 &&
    matchedAdIds.size > 0;

  const roasAvailable = roas !== null;

  let attributionReason =
    "No CRM leads were created in the selected period, so there is no lead cohort to attribute.";

  if (currentLeadCount > 0 && instagramLeadCount === 0) {
    attributionReason =
      "No Instagram CRM leads were created in the selected period, so there is no Meta Instagram lead cohort to attribute.";
  } else if (instagramLeadCount > 0 && attributedLeads === 0) {
    attributionReason =
      "No Instagram leads in the selected period have captured Meta ad referral IDs yet. New eligible Instagram inbound messages will populate attribution going forward.";
  } else if (
    attributedLeads > 0 &&
    matchedAdIds.size === 0
  ) {
    attributionReason =
      `${attributedLeads} lead${attributedLeads === 1 ? "" : "s"} have captured Meta ad IDs, but those ads were not returned by Meta Insights for the selected period.`;
  } else if (
    matchedAdIds.size > 0 &&
    matchedRevenueBookingIds.size === 0
  ) {
    attributionReason =
      `${attributedLeads} lead${attributedLeads === 1 ? "" : "s"} have Meta ad attribution and ${matchedAdIds.size} ad${matchedAdIds.size === 1 ? "" : "s"} matched Meta Insights, but no attributed lead is linked to a revenue booking yet.`;
  } else if (roasAvailable) {
    attributionReason =
      `${attributedLeads} of ${instagramLeadCount} Instagram leads (${attributionCoveragePct.toFixed(1)}%) have first-touch Meta ad attribution. ${matchedRevenueBookingIds.size} linked revenue booking${matchedRevenueBookingIds.size === 1 ? "" : "s"} matched ${matchedAdIds.size} Meta ad${matchedAdIds.size === 1 ? "" : "s"}.`;
  }

  if (instagramLeadCount > 0 && attributionCoveragePct < 80) {
    signals.push({
      id: "marketing-attribution-capture-coverage",
      type: "marketing_attribution_quality",
      severity: "warning",
      title: `Ad attribution coverage ${attributionCoveragePct.toFixed(1)}%`,
      explanation: `${attributedLeads} of ${instagramLeadCount} Instagram CRM leads created in the selected period have a captured first-touch Meta ad ID. Campaign and ad revenue reporting is incomplete until this coverage improves.`,
      currentValue: attributionCoveragePct,
    });
  }

  const unmatchedMetaInsightLeadCount = [...attributionByLead.values()].filter((row) => {
    const adId = String(row?.adId || "").trim();
    return Boolean(adId) && !adById.has(adId);
  }).length;

  if (unmatchedMetaInsightLeadCount > 0) {
    signals.push({
      id: "marketing-attribution-meta-match-gap",
      type: "marketing_attribution_quality",
      severity: "warning",
      title: `${unmatchedMetaInsightLeadCount} attributed lead${unmatchedMetaInsightLeadCount === 1 ? "" : "s"} missing from Meta Insights`,
      explanation: `${unmatchedMetaInsightLeadCount} Instagram CRM lead${unmatchedMetaInsightLeadCount === 1 ? "" : "s"} have captured Meta ad IDs that were not returned by Meta Insights for the selected period. Their revenue cannot be assigned to an ad or campaign in this report.`,
      currentValue: unmatchedMetaInsightLeadCount,
    });
  }

  if (matchedAdIds.size > 0 && matchedRevenueBookingIds.size === 0) {
    signals.push({
      id: "marketing-attribution-booking-gap",
      type: "marketing_attribution_quality",
      severity: "warning",
      title: "Attributed leads have no revenue booking yet",
      explanation: `${attributedLeads} attributed lead${attributedLeads === 1 ? "" : "s"} include ${matchedAdIds.size} Meta-matched ad${matchedAdIds.size === 1 ? "" : "s"}, but none currently resolve to a linked booking in a revenue status.`,
      currentValue: 0,
    });
  }

  if (currentLeadCount > 0 && leadLinkageCoveragePct < 80) {
    signals.push({
      id: "marketing-lead-linkage-coverage",
      type: "marketing_data_quality",
      severity: "warning",
      title: `Lead linkage coverage ${leadLinkageCoveragePct.toFixed(1)}%`,
      explanation: `${currentLinkedLeadCount} of ${currentLeadCount} leads created in the selected period are linked to a booking. Source-to-revenue reporting is therefore incomplete.`,
      currentValue: leadLinkageCoveragePct,
    });
  }

  return {
    metaAds: params.metaAds,
    comparisons: metaComparisons(params.metaAds.current, params.metaAds.previous),
    leadSources,
    leadSummary: {
      leads: currentLeadCount,
      linkedLeads: currentLinkedLeadCount,
      linkageCoveragePct: leadLinkageCoveragePct,
      previousLeads: params.previousLeads.length,
      leadDeltaPct: pctDelta(currentLeadCount, params.previousLeads.length),
    },
    attribution: {
      campaignRevenueAttributionAvailable,
      roasAvailable,
      reason: attributionReason,
      instagramLeads: instagramLeadCount,
      attributedLeads,
      attributionCoveragePct,
      matchedAdIds: matchedAdIds.size,
      matchedLinkedRevenueBookings:
        matchedRevenueBookingIds.size,
      matchedBookedRevenue,
      matchedAdSpend,
      roas,
      campaigns: attributionCampaigns,
      ads: attributionAds,
      drillDown: {
        missingAdId: missingAdIdDrillDown,
        unmatchedMetaAd: unmatchedMetaAdDrillDown,
        noRevenueBooking: noRevenueBookingDrillDown,
      },
    },
    signals,
  };
}

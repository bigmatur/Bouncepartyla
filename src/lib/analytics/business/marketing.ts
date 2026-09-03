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
  const leadLinkageCoveragePct = currentLeadCount > 0 ? (currentLinkedLeadCount / currentLeadCount) * 100 : 0;

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
      campaignRevenueAttributionAvailable: false,
      roasAvailable: false,
      reason:
        "Current lead data does not store an immutable campaign/ad set/ad identifier for each booking. Meta spend and internal booked revenue are intentionally shown separately until reliable attribution capture exists.",
    },
    signals,
  };
}

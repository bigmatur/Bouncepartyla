import "server-only";

import { createClient } from "@/lib/supabase/server";

import {
  createCashFlowComparison,
  createOverviewComparisonSnapshot,
  resolvePreviousRange,
} from "./comparisons";
import { calculateBusinessOverview } from "./overview";
import {
  calculateBusinessSales,
  calculateBusinessSalesInsights,
  calculateBusinessTrendComparison,
  compareBusinessRevenueDrivers,
} from "./sales";
import { calculateBusinessProducts } from "./products";
import { calculateBusinessCustomers } from "./customers";
import { calculateBusinessMarketing } from "./marketing";
import { loadMetaAdsInsights } from "./meta-ads";
import { generateBusinessSignals } from "./signals";
import type { BusinessAnalyticsRange } from "./types";

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type PeriodDataset = {
  bookings: any[];
  payments: any[];
  items: any[];
};

type ProductInventoryDataset = {
  products: any[];
  productComponents: any[];
  inventoryItems: any[];
  inventoryUnits: any[];
  reservations: any[];
};

type CustomerDataset = {
  currentEventBookings: any[];
  previousEventBookings: any[];
  currentCreatedBookings: any[];
  previousCreatedBookings: any[];
  customerHistoryBookings: any[];
  customers: any[];
  currentBookingLeads: any[];
  crmIdentities: any[] | null;
};

function emptyCustomerDataset(): CustomerDataset {
  return {
    currentEventBookings: [],
    previousEventBookings: [],
    currentCreatedBookings: [],
    previousCreatedBookings: [],
    customerHistoryBookings: [],
    customers: [],
    currentBookingLeads: [],
    crmIdentities: null,
  };
}

async function loadCustomersByIds(
  supabase: ServerSupabaseClient,
  customerIds: string[],
): Promise<any[]> {
  if (customerIds.length === 0) {
    return [];
  }

  const selectVariants = [
    "id, full_name, name, first_name, last_name",
    "id, full_name, name",
    "id, full_name",
    "id",
  ];

  for (const selectColumns of selectVariants) {
    const result = await supabase
      .from("customers")
      .select(selectColumns)
      .in("id", customerIds);

    if (!result.error) {
      return result.data || [];
    }

    if (isMissingColumnError(result.error)) {
      continue;
    }

    if (isMissingTableError(result.error) || isAccessDeniedError(result.error)) {
      return [];
    }

    throw new Error(`Unable to load customers for BI: ${result.error.message}`);
  }

  return [];
}

function isMissingColumnError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42703" ||
    code === "pgrst204" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("could not find") && message.includes("column") && message.includes("schema cache"))
  );
}

function isMissingTableError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function isAccessDeniedError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("permission denied");
}

async function loadPeriodDataset(
  supabase: ServerSupabaseClient,
  range: BusinessAnalyticsRange,
): Promise<PeriodDataset> {
  const fromTs = `${range.from}T00:00:00`;
  const toTs = `${range.to}T23:59:59.999`;

  const [bookingsResult, paymentsResult, itemsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(`
        id,
        status,
        archived_at,
        created_at,
        event_date,
        setup_city,
        setup_state,
        setup_zip,
        booking_source,
        total_amount,
        amount_paid,
        balance_due,
        discount_amount,
        delivery_fee,
        tax_amount
      `)
      .gte("event_date", range.from)
      .lte("event_date", range.to),

    supabase
      .from("payments")
      .select(`
        id,
        status,
        amount,
        tip_amount,
        paid_at
      `)
      .gte("paid_at", fromTs)
      .lte("paid_at", toTs),

    supabase
      .from("booking_items")
      .select(`
        id,
        booking_id,
        quantity,
        unit_price,
        subtotal,
        products (
          id,
          name,
          category_id
        ),
        bookings!inner (
          id,
          status,
          archived_at,
          event_date
        )
      `)
      .gte("bookings.event_date", range.from)
      .lte("bookings.event_date", range.to),
  ]);

  if (bookingsResult.error) {
    throw new Error(
      `Unable to load business bookings: ${bookingsResult.error.message}`,
    );
  }

  if (paymentsResult.error) {
    throw new Error(
      `Unable to load business payments: ${paymentsResult.error.message}`,
    );
  }

  if (itemsResult.error) {
    throw new Error(
      `Unable to load business booking items: ${itemsResult.error.message}`,
    );
  }

  return {
    bookings: bookingsResult.data || [],
    payments: paymentsResult.data || [],
    items: itemsResult.data || [],
  };
}

async function loadFutureBookingsDataset(
  supabase: ServerSupabaseClient,
  asOfDate: string,
): Promise<any[]> {
  const asOf = new Date(`${asOfDate}T12:00:00`);
  const end = new Date(asOf);
  end.setDate(end.getDate() + 90);

  const endYear = end.getFullYear();
  const endMonth = String(end.getMonth() + 1).padStart(2, "0");
  const endDay = String(end.getDate()).padStart(2, "0");
  const endDate = `${endYear}-${endMonth}-${endDay}`;

  const result = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      archived_at,
      created_at,
      event_date,
      setup_city,
      setup_state,
      setup_zip,
      booking_source,
      total_amount,
      discount_amount,
      delivery_fee,
      tax_amount
    `)
    .gt("event_date", asOfDate)
    .lte("event_date", endDate);

  if (result.error) {
    throw new Error(`Unable to load future bookings for BI: ${result.error.message}`);
  }

  return result.data || [];
}

async function loadFutureBookingsCreatedInPeriodDataset(
  supabase: ServerSupabaseClient,
  range: BusinessAnalyticsRange,
  asOfDate: string,
): Promise<any[]> {
  const startTs = `${range.from}T00:00:00`;
  const endTs = `${range.to}T23:59:59.999`;

  const asOf = new Date(`${asOfDate}T12:00:00`);
  const horizon = new Date(asOf);
  horizon.setDate(horizon.getDate() + 90);
  const horizonYear = horizon.getFullYear();
  const horizonMonth = String(horizon.getMonth() + 1).padStart(2, "0");
  const horizonDay = String(horizon.getDate()).padStart(2, "0");
  const horizonDate = `${horizonYear}-${horizonMonth}-${horizonDay}`;

  const result = await supabase
    .from("bookings")
    .select(`
      id,
      status,
      archived_at,
      created_at,
      event_date,
      setup_city,
      setup_state,
      setup_zip,
      booking_source,
      total_amount,
      discount_amount,
      delivery_fee,
      tax_amount
    `)
    .gte("created_at", startTs)
    .lte("created_at", endTs)
    .gt("event_date", asOfDate)
    .lte("event_date", horizonDate);

  if (result.error) {
    throw new Error(`Unable to load forward booking pace dataset for BI: ${result.error.message}`);
  }

  return result.data || [];
}

async function loadProductInventoryDataset(
  supabase: ServerSupabaseClient,
  range: BusinessAnalyticsRange,
): Promise<ProductInventoryDataset> {
  const fromTs = `${range.from}T00:00:00`;
  const toTs = `${range.to}T23:59:59.999`;

  const productsResult = await supabase
    .from("products")
    .select(`
      id,
      name,
      category_id,
      inventory_item_id,
      active
    `);

  if (productsResult.error) {
    throw new Error(`Unable to load products for BI: ${productsResult.error.message}`);
  }

  const [inventoryItemsResult, inventoryUnitsResult, reservationsResult] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(`
        id,
        name,
        tracking_type,
        total_quantity,
        quantity_on_hand,
        quantity_available,
        active
      `),

    supabase
      .from("inventory_units")
      .select(`
        id,
        inventory_item_id,
        status,
        retired_at
      `),

    supabase
      .from("inventory_reservations")
      .select(`
        id,
        inventory_item_id,
        inventory_unit_id,
        quantity,
        status,
        reserved_from,
        reserved_until
      `)
      .lt("reserved_from", toTs)
      .gt("reserved_until", fromTs),

  ]);

  let productComponentsResult = await supabase
    .from("product_inventory_components")
    .select(`
      id,
      product_id,
      inventory_item_id,
      quantity,
      quantity_required,
      required,
      is_required,
      active,
      inventory_behavior
    `);

  if (productComponentsResult.error && isMissingColumnError(productComponentsResult.error)) {
    productComponentsResult = await supabase
      .from("product_inventory_components")
      .select(`
        id,
        product_id,
        inventory_item_id,
        quantity,
        required,
        active
      `);
  }

  if (inventoryItemsResult.error && isMissingColumnError(inventoryItemsResult.error)) {
    const fallbackInventoryItemsResult = await supabase
      .from("inventory_items")
      .select(`
        id,
        name,
        tracking_type,
        total_quantity,
        active
      `);

    if (fallbackInventoryItemsResult.error) {
      throw new Error(`Unable to load inventory items for BI: ${fallbackInventoryItemsResult.error.message}`);
    }

    if (productComponentsResult.error) {
      throw new Error(
        `Unable to load product inventory mappings for BI: ${productComponentsResult.error.message}`,
      );
    }

    if (inventoryUnitsResult.error) {
      throw new Error(`Unable to load inventory units for BI: ${inventoryUnitsResult.error.message}`);
    }

    if (reservationsResult.error) {
      throw new Error(`Unable to load reservations for BI: ${reservationsResult.error.message}`);
    }

    return {
      products: productsResult.data || [],
      productComponents: productComponentsResult.data || [],
      inventoryItems: fallbackInventoryItemsResult.data || [],
      inventoryUnits: inventoryUnitsResult.data || [],
      reservations: reservationsResult.data || [],
    };
  }

  if (productComponentsResult.error) {
    throw new Error(
      `Unable to load product inventory mappings for BI: ${productComponentsResult.error.message}`,
    );
  }

  if (inventoryItemsResult.error) {
    throw new Error(`Unable to load inventory items for BI: ${inventoryItemsResult.error.message}`);
  }

  if (inventoryUnitsResult.error) {
    throw new Error(`Unable to load inventory units for BI: ${inventoryUnitsResult.error.message}`);
  }

  if (reservationsResult.error) {
    throw new Error(`Unable to load reservations for BI: ${reservationsResult.error.message}`);
  }

  let categoryRows: any[] = [];

  const productCategoriesResult = await supabase
    .from("product_categories")
    .select("id, name");

  if (productCategoriesResult.error) {
    if (
      !isMissingTableError(productCategoriesResult.error) &&
      !isAccessDeniedError(productCategoriesResult.error)
    ) {
      throw new Error(`Unable to load product categories for BI: ${productCategoriesResult.error.message}`);
    }

    if (!isAccessDeniedError(productCategoriesResult.error)) {
      const categoriesFallbackResult = await supabase
        .from("categories")
        .select("id, name");

      if (
        categoriesFallbackResult.error &&
        !isMissingTableError(categoriesFallbackResult.error) &&
        !isAccessDeniedError(categoriesFallbackResult.error)
      ) {
        throw new Error(`Unable to load categories for BI: ${categoriesFallbackResult.error.message}`);
      }

      categoryRows = categoriesFallbackResult.data || [];
    }
  } else {
    categoryRows = productCategoriesResult.data || [];
  }

  const categoryNameById = new Map<string, string>();
  for (const row of categoryRows) {
    const id = String((row as any)?.id || "").trim();
    if (!id) {
      continue;
    }

    categoryNameById.set(id, String((row as any)?.name || "").trim());
  }

  const products = (productsResult.data || []).map((row: any) => ({
    ...row,
    category_name: categoryNameById.get(String(row.category_id || "").trim()) || "",
  }));

  return {
    products,
    productComponents: productComponentsResult.data || [],
    inventoryItems: inventoryItemsResult.data || [],
    inventoryUnits: inventoryUnitsResult.data || [],
    reservations: reservationsResult.data || [],
  };
}

async function loadCustomerDataset(
  supabase: ServerSupabaseClient,
  range: BusinessAnalyticsRange,
  previousRange: BusinessAnalyticsRange,
): Promise<CustomerDataset> {
  const rangeFromTs = `${range.from}T00:00:00`;
  const rangeToTs = `${range.to}T23:59:59.999`;
  const previousFromTs = `${previousRange.from}T00:00:00`;
  const previousToTs = `${previousRange.to}T23:59:59.999`;

  const bookingSelect = `
    id,
    customer_id,
    status,
    archived_at,
    created_at,
    event_date,
    setup_city,
    setup_state,
    total_amount
  `;

  const [
    currentEventResult,
    previousEventResult,
    currentCreatedResult,
    previousCreatedResult,
    historyResult,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(bookingSelect)
      .gte("event_date", range.from)
      .lte("event_date", range.to),

    supabase
      .from("bookings")
      .select(bookingSelect)
      .gte("event_date", previousRange.from)
      .lte("event_date", previousRange.to),

    supabase
      .from("bookings")
      .select(bookingSelect)
      .gte("created_at", rangeFromTs)
      .lte("created_at", rangeToTs),

    supabase
      .from("bookings")
      .select(bookingSelect)
      .gte("created_at", previousFromTs)
      .lte("created_at", previousToTs),

    supabase
      .from("bookings")
      .select(bookingSelect)
      .lte("created_at", rangeToTs),
  ]);

  if (currentEventResult.error) {
    throw new Error(`Unable to load customer event bookings for BI: ${currentEventResult.error.message}`);
  }

  if (previousEventResult.error) {
    throw new Error(`Unable to load previous customer event bookings for BI: ${previousEventResult.error.message}`);
  }

  if (currentCreatedResult.error) {
    throw new Error(`Unable to load customer created-at bookings for BI: ${currentCreatedResult.error.message}`);
  }

  if (previousCreatedResult.error) {
    throw new Error(`Unable to load previous customer created-at bookings for BI: ${previousCreatedResult.error.message}`);
  }

  if (historyResult.error) {
    throw new Error(`Unable to load customer booking history for BI: ${historyResult.error.message}`);
  }

  const currentEventBookings = currentEventResult.data || [];
  const currentBookingIds = currentEventBookings
    .map((row: any) => String(row?.id || "").trim())
    .filter(Boolean);

  const customerIds = new Set<string>();
  for (const row of historyResult.data || []) {
    const customerId = String((row as any)?.customer_id || "").trim();
    if (customerId) {
      customerIds.add(customerId);
    }
  }

  const customers = await loadCustomersByIds(supabase, [...customerIds]);

  let currentBookingLeads: any[] = [];
  if (currentBookingIds.length > 0) {
    const leadsResult = await supabase
      .from("booking_leads")
      .select("booking_id, source")
      .in("booking_id", currentBookingIds);

    if (leadsResult.error) {
      if (
        !isMissingTableError(leadsResult.error) &&
        !isMissingColumnError(leadsResult.error) &&
        !isAccessDeniedError(leadsResult.error)
      ) {
        throw new Error(`Unable to load booking leads for BI: ${leadsResult.error.message}`);
      }
    } else {
      currentBookingLeads = leadsResult.data || [];
    }
  }

  let crmIdentities: any[] | null = null;
  if (customerIds.size > 0) {
    const crmResult = await supabase
      .from("crm_contact_identities")
      .select("customer_id")
      .not("customer_id", "is", null)
      .in("customer_id", [...customerIds]);

    if (crmResult.error) {
      if (
        !isMissingTableError(crmResult.error) &&
        !isAccessDeniedError(crmResult.error)
      ) {
        throw new Error(`Unable to load CRM identity coverage for BI: ${crmResult.error.message}`);
      }
    } else {
      crmIdentities = crmResult.data || [];
    }
  }

  return {
    currentEventBookings,
    previousEventBookings: previousEventResult.data || [],
    currentCreatedBookings: currentCreatedResult.data || [],
    previousCreatedBookings: previousCreatedResult.data || [],
    customerHistoryBookings: historyResult.data || [],
    customers,
    currentBookingLeads,
    crmIdentities,
  };
}


async function loadMarketingLeadDataset(
  supabase: ServerSupabaseClient,
  range: BusinessAnalyticsRange,
  previousRange: BusinessAnalyticsRange,
) {
  const currentFromTs = `${range.from}T00:00:00`;
  const currentToTs = `${range.to}T23:59:59.999`;
  const previousFromTs = `${previousRange.from}T00:00:00`;
  const previousToTs = `${previousRange.to}T23:59:59.999`;

  const [currentResult, previousResult] = await Promise.all([
    supabase
      .from("booking_leads")
      .select("id, source, status, booking_id, created_at")
      .gte("created_at", currentFromTs)
      .lte("created_at", currentToTs),
    supabase
      .from("booking_leads")
      .select("id, source, status, booking_id, created_at")
      .gte("created_at", previousFromTs)
      .lte("created_at", previousToTs),
  ]);

  const softFailure = (error: any) =>
    isMissingTableError(error) || isMissingColumnError(error) || isAccessDeniedError(error);

  if (currentResult.error && !softFailure(currentResult.error)) {
    throw new Error(`Unable to load marketing leads for BI: ${currentResult.error.message}`);
  }

  if (previousResult.error && !softFailure(previousResult.error)) {
    throw new Error(`Unable to load previous marketing leads for BI: ${previousResult.error.message}`);
  }

  const currentLeads = currentResult.error ? [] : currentResult.data || [];
  const previousLeads = previousResult.error ? [] : previousResult.data || [];
  const allLeadIds = [
    ...new Set(
      [...currentLeads, ...previousLeads]
        .map((lead: any) => String(lead?.id || "").trim())
        .filter(Boolean),
    ),
  ];
  const bookingIds = [
    ...new Set(
      [...currentLeads, ...previousLeads]
        .map((lead: any) => String(lead?.booking_id || "").trim())
        .filter(Boolean),
    ),
  ];

  const linkedBookings: any[] = [];
  const chunkSize = 400;
  for (let index = 0; index < bookingIds.length; index += chunkSize) {
    const ids = bookingIds.slice(index, index + chunkSize);
    const result = await supabase
      .from("bookings")
      .select("id, status, archived_at, total_amount, event_date, created_at")
      .in("id", ids);

    if (result.error) {
      throw new Error(`Unable to load marketing-linked bookings for BI: ${result.error.message}`);
    }

    linkedBookings.push(...(result.data || []));
  }

  const leadAttributions: Array<{
    leadId: string;
    adId: string;
    occurredAt: string;
  }> = [];

  if (allLeadIds.length > 0) {
    const conversations: any[] = [];

    for (let index = 0; index < allLeadIds.length; index += chunkSize) {
      const ids = allLeadIds.slice(index, index + chunkSize);
      const result = await supabase
        .from("crm_conversations")
        .select("id, lead_id")
        .in("lead_id", ids);

      if (result.error) {
        if (!softFailure(result.error)) {
          throw new Error(
            `Unable to load CRM conversations for marketing attribution: ${result.error.message}`,
          );
        }

        conversations.length = 0;
        break;
      }

      conversations.push(...(result.data || []));
    }

    const conversationToLead = new Map<string, string>();

    for (const conversation of conversations) {
      const conversationId = String(conversation?.id || "").trim();
      const leadId = String(conversation?.lead_id || "").trim();

      if (conversationId && leadId) {
        conversationToLead.set(conversationId, leadId);
      }
    }

    const conversationIds = [...conversationToLead.keys()];
    const firstTouchByLead = new Map<
      string,
      {
        leadId: string;
        adId: string;
        occurredAt: string;
        messageId: string;
      }
    >();

    for (let index = 0; index < conversationIds.length; index += chunkSize) {
      const ids = conversationIds.slice(index, index + chunkSize);
      const result = await supabase
        .from("crm_messages")
        .select(
          "id, conversation_id, direction, channel, metadata, sent_at, created_at",
        )
        .in("conversation_id", ids)
        .eq("direction", "inbound")
        .eq("channel", "instagram");

      if (result.error) {
        if (!softFailure(result.error)) {
          throw new Error(
            `Unable to load CRM messages for marketing attribution: ${result.error.message}`,
          );
        }

        firstTouchByLead.clear();
        break;
      }

      for (const message of result.data || []) {
        const conversationId = String(
          (message as any)?.conversation_id || "",
        ).trim();
        const leadId = conversationToLead.get(conversationId) || "";

        const attribution = (message as any)?.metadata?.attribution;
        const provider = String(
          attribution?.provider || "",
        ).trim().toLowerCase();
        const channel = String(
          attribution?.channel || "",
        ).trim().toLowerCase();
        const adId = String(
          attribution?.ad_id || "",
        ).trim();

        if (
          !leadId ||
          provider !== "meta" ||
          channel !== "instagram" ||
          !adId
        ) {
          continue;
        }

        const occurredAt = String(
          (message as any)?.sent_at ||
            (message as any)?.created_at ||
            "",
        ).trim();

        const messageId = String(
          (message as any)?.id || "",
        ).trim();

        const candidate = {
          leadId,
          adId,
          occurredAt,
          messageId,
        };

        const existing = firstTouchByLead.get(leadId);

        if (
          !existing ||
          candidate.occurredAt < existing.occurredAt ||
          (
            candidate.occurredAt === existing.occurredAt &&
            candidate.messageId < existing.messageId
          )
        ) {
          firstTouchByLead.set(leadId, candidate);
        }
      }
    }

    leadAttributions.push(
      ...[...firstTouchByLead.values()].map(
        ({ leadId, adId, occurredAt }) => ({
          leadId,
          adId,
          occurredAt,
        }),
      ),
    );
  }

  return {
    currentLeads,
    previousLeads,
    linkedBookings,
    leadAttributions,
  };
}

export async function loadBusinessMarketing(
  supabase: ServerSupabaseClient,
  range: BusinessAnalyticsRange,
) {
  const previousRange = resolvePreviousRange(range);

  const [metaAds, leadData] = await Promise.all([
    loadMetaAdsInsights({ range, previousRange }),
    loadMarketingLeadDataset(supabase, range, previousRange),
  ]);

  return calculateBusinessMarketing({
    metaAds,
    currentLeads: leadData.currentLeads,
    previousLeads: leadData.previousLeads,
    linkedBookings: leadData.linkedBookings,
    leadAttributions: leadData.leadAttributions,
  });
}

export async function loadBusinessOverview(
  supabase: ServerSupabaseClient,
  range: BusinessAnalyticsRange,
) {
  const previousRange = resolvePreviousRange(range);
  const asOfDate = new Date().toISOString().slice(0, 10);

  const [currentData, previousData, futureBookings, forwardCreatedFutureBookings] = await Promise.all([
    loadPeriodDataset(supabase, range),
    loadPeriodDataset(supabase, previousRange),
    loadFutureBookingsDataset(supabase, asOfDate),
    loadFutureBookingsCreatedInPeriodDataset(supabase, range, asOfDate),
  ]);

  const [productInventoryData, customerData] = await Promise.all([
    loadProductInventoryDataset(supabase, range),
    loadCustomerDataset(supabase, range, previousRange).catch((error) => {
      console.warn("BI customer analytics fallback:", String((error as any)?.message || error));
      return emptyCustomerDataset();
    }),
  ]);

  const currentMetrics = calculateBusinessOverview(
    currentData.bookings,
    currentData.payments,
  );

  const previousMetrics = calculateBusinessOverview(
    previousData.bookings,
    previousData.payments,
  );

  const currentSales = calculateBusinessSales(
    currentData.bookings,
    currentData.items,
    range,
  );

  const previousSales = calculateBusinessSales(
    previousData.bookings,
    previousData.items,
    previousRange,
  );

  const comparison = createOverviewComparisonSnapshot({
    currentMetrics,
    previousMetrics,
  });

  const cashFlow = createCashFlowComparison({
    currentMetrics,
    previousMetrics,
  });

  const trendComparison = calculateBusinessTrendComparison({
    currentTrend: currentSales.trend,
    previousTrend: previousSales.trend,
    range,
  });

  const drivers = compareBusinessRevenueDrivers({
    current: currentSales,
    previous: previousSales,
  });

  const signals = generateBusinessSignals({
    comparison,
    cashFlow,
    productDrivers: drivers.productDrivers,
    geographyDrivers: drivers.geographyDrivers,
  });

  const products = calculateBusinessProducts({
    currentBookings: currentData.bookings,
    previousBookings: previousData.bookings,
    currentItems: currentData.items,
    previousItems: previousData.items,
    range,
    products: productInventoryData.products,
    productComponents: productInventoryData.productComponents,
    inventoryItems: productInventoryData.inventoryItems,
    inventoryUnits: productInventoryData.inventoryUnits,
    reservations: productInventoryData.reservations,
  });

  const salesInsights = calculateBusinessSalesInsights({
    currentBookings: currentData.bookings,
    previousBookings: previousData.bookings,
    futureBookings,
    forwardCreatedFutureBookings,
    range,
    asOfDate,
  });

  const customerInsights = calculateBusinessCustomers({
    range,
    previousRange,
    asOfDate,
    currentEventBookings: customerData.currentEventBookings,
    previousEventBookings: customerData.previousEventBookings,
    currentCreatedBookings: customerData.currentCreatedBookings,
    previousCreatedBookings: customerData.previousCreatedBookings,
    customerHistoryBookings: customerData.customerHistoryBookings,
    customers: customerData.customers,
    currentBookingLeads: customerData.currentBookingLeads,
    crmIdentities: customerData.crmIdentities,
  });

  return {
    range,
    previousRange,
    metrics: currentMetrics,
    previousMetrics,
    comparison,
    cashFlow,
    sales: currentSales,
    previousSales,
    trendComparison,
    drivers,
    signals,
    products,
    salesInsights,
    customerInsights,
  };
}
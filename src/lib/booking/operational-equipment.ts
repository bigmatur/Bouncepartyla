import type { createClient } from "@/lib/supabase/server";

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>;

const AUTO_CHECKLIST_SOURCES = new Set([
  "booking_item",
  "inventory_reservation",
]);

type SummaryFallbackItem = {
  productId: string;
  quantity: number;
};

type ExpectedChecklistRow = {
  key: string;
  source: "booking_item" | "inventory_reservation";
  booking_item_id: string | null;
  inventory_item_id: string | null;
  inventory_unit_id: string | null;
  title: string;
  item_type: "equipment" | "component";
  quantity: number;
  sort_order: number;
};

function safeText(value: unknown) {
  return String(value || "").trim();
}

function safeInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.round(parsed);
}

function isMissingTableError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42p01" ||
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation")
  );
}

export async function buildBookingItemsSummaryFromCurrentBooking(params: {
  supabase: SupabaseClientLike;
  bookingId: string;
  fallbackItems?: SummaryFallbackItem[];
}) {
  const { supabase, bookingId, fallbackItems = [] } = params;

  const { data, error } = await supabase
    .from("booking_items")
    .select(
      `
      id,
      quantity,
      products (
        id,
        name
      )
    `,
    )
    .eq("booking_id", bookingId);

  if (error) {
    return fallbackItems
      .map((item) => `Product ${String(item.productId || "").slice(0, 8)} x ${item.quantity}`)
      .join("\n");
  }

  return (data || [])
    .map((item: any) => {
      const product = Array.isArray(item.products)
        ? item.products[0]
        : item.products;

      return `${product?.name || "Product"} x ${Number(item.quantity || 1)}`;
    })
    .join("\n");
}

function checklistKeyForExpected(row: {
  source: "booking_item" | "inventory_reservation";
  booking_item_id?: string | null;
  inventory_item_id?: string | null;
  inventory_unit_id?: string | null;
}) {
  if (row.source === "booking_item") {
    return `booking_item:${safeText(row.booking_item_id)}`;
  }

  if (safeText(row.inventory_unit_id)) {
    return `inventory_reservation:unit:${safeText(row.inventory_unit_id)}`;
  }

  return `inventory_reservation:item:${safeText(row.booking_item_id) || "none"}:${safeText(
    row.inventory_item_id,
  ) || "none"}`;
}

function checklistKeysForExistingAuto(row: any) {
  const source = safeText(row?.source);
  const bookingItemId = safeText(row?.booking_item_id);
  const inventoryItemId = safeText(row?.inventory_item_id);
  const inventoryUnitId = safeText(row?.inventory_unit_id);
  const keys: string[] = [];

  if (source === "booking_item") {
    keys.push(`booking_item:${bookingItemId}`);
    return keys;
  }

  if (source !== "inventory_reservation") {
    return keys;
  }

  if (inventoryUnitId) {
    keys.push(`inventory_reservation:unit:${inventoryUnitId}`);
    return keys;
  }

  keys.push(`inventory_reservation:item:${bookingItemId || "none"}:${inventoryItemId || "none"}`);

  if (!bookingItemId && inventoryItemId) {
    keys.push(`inventory_reservation:item:any:${inventoryItemId}`);
  }

  return keys;
}

export async function reconcileBookingChecklistFromCurrentState(params: {
  supabase: SupabaseClientLike;
  bookingId: string;
}) {
  const { supabase, bookingId } = params;

  const now = new Date().toISOString();

  const [itemsResult, reservationsResult, existingResult] = await Promise.all([
    supabase
      .from("booking_items")
      .select(
        `
        id,
        quantity,
        products (
          id,
          name
        )
      `,
      )
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true }),

    supabase
      .from("inventory_reservations")
      .select(
        `
        id,
        booking_item_id,
        quantity,
        inventory_item_id,
        inventory_unit_id,
        inventory_items (
          id,
          name,
          sku
        ),
        inventory_units (
          id,
          unit_code,
          serial_number
        )
      `,
      )
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true }),

    supabase
      .from("booking_checklist_items")
      .select(
        `
        id,
        booking_id,
        booking_item_id,
        inventory_item_id,
        inventory_unit_id,
        title,
        item_type,
        source,
        quantity,
        loaded,
        installed,
        picked_up,
        returned,
        needs_cleaning,
        damaged,
        missing,
        loaded_at,
        installed_at,
        picked_up_at,
        returned_at,
        checked_by,
        notes,
        sort_order,
        created_at,
        updated_at
      `,
      )
      .eq("booking_id", bookingId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }

  if (reservationsResult.error) {
    throw new Error(reservationsResult.error.message);
  }

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  const expected: ExpectedChecklistRow[] = [];
  let sortOrder = 100;

  for (const item of itemsResult.data || []) {
    const product = Array.isArray((item as any).products)
      ? (item as any).products[0]
      : (item as any).products;

    const row: ExpectedChecklistRow = {
      source: "booking_item",
      booking_item_id: safeText((item as any).id) || null,
      inventory_item_id: null,
      inventory_unit_id: null,
      title: safeText(product?.name) || "Booking item",
      item_type: "equipment",
      quantity: Math.max(1, safeInt((item as any).quantity, 1)),
      sort_order: sortOrder,
      key: "",
    };

    row.key = checklistKeyForExpected(row);
    expected.push(row);
    sortOrder += 10;
  }

  for (const reservation of reservationsResult.data || []) {
    const inventoryItem = Array.isArray((reservation as any).inventory_items)
      ? (reservation as any).inventory_items[0]
      : (reservation as any).inventory_items;

    const inventoryUnit = Array.isArray((reservation as any).inventory_units)
      ? (reservation as any).inventory_units[0]
      : (reservation as any).inventory_units;

    const itemName = safeText(inventoryItem?.name) || "Inventory item";
    const unitCode = safeText(inventoryUnit?.unit_code || inventoryUnit?.serial_number);

    const row: ExpectedChecklistRow = {
      source: "inventory_reservation",
      booking_item_id: safeText((reservation as any).booking_item_id) || null,
      inventory_item_id:
        safeText((reservation as any).inventory_item_id || inventoryItem?.id) || null,
      inventory_unit_id:
        safeText((reservation as any).inventory_unit_id || inventoryUnit?.id) || null,
      title: unitCode ? `${itemName} — ${unitCode}` : itemName,
      item_type: "component",
      quantity: Math.max(1, safeInt((reservation as any).quantity, 1)),
      sort_order: sortOrder,
      key: "",
    };

    row.key = checklistKeyForExpected(row);
    expected.push(row);
    sortOrder += 10;
  }

  const expectedNoUnitCountByInventoryItemId = new Map<string, number>();

  for (const row of expected) {
    if (row.source !== "inventory_reservation" || row.inventory_unit_id) {
      continue;
    }

    const inventoryItemId = safeText(row.inventory_item_id);
    if (!inventoryItemId) {
      continue;
    }

    expectedNoUnitCountByInventoryItemId.set(
      inventoryItemId,
      (expectedNoUnitCountByInventoryItemId.get(inventoryItemId) || 0) + 1,
    );
  }

  const existingRows = (existingResult.data || []) as any[];
  const existingAutoRows = existingRows.filter((row) =>
    AUTO_CHECKLIST_SOURCES.has(safeText(row?.source)),
  );

  const existingManualCount = existingRows.length - existingAutoRows.length;

  const existingByKey = new Map<string, any[]>();

  for (const row of existingAutoRows) {
    const keys = checklistKeysForExistingAuto(row);

    for (const key of keys) {
      if (!key) {
        continue;
      }

      const rows = existingByKey.get(key) || [];
      rows.push(row);
      existingByKey.set(key, rows);
    }
  }

  const usedExistingIds = new Set<string>();

  function takeMatch(key: string) {
    const rows = existingByKey.get(key) || [];

    for (const row of rows) {
      const id = safeText(row?.id);

      if (!id || usedExistingIds.has(id)) {
        continue;
      }

      usedExistingIds.add(id);
      return row;
    }

    return null;
  }

  const updates: Array<{
    id: string;
    data: Record<string, any>;
  }> = [];

  const inserts: Record<string, any>[] = [];
  let preserved = 0;

  for (const row of expected) {
    let existing = takeMatch(row.key);

    if (
      !existing &&
      row.source === "inventory_reservation" &&
      !row.inventory_unit_id &&
      row.inventory_item_id &&
      (expectedNoUnitCountByInventoryItemId.get(row.inventory_item_id) || 0) === 1
    ) {
      existing = takeMatch(`inventory_reservation:item:any:${row.inventory_item_id}`);
    }

    if (!existing) {
      inserts.push({
        booking_id: bookingId,
        booking_item_id: row.booking_item_id,
        inventory_item_id: row.inventory_item_id,
        inventory_unit_id: row.inventory_unit_id,
        title: row.title,
        item_type: row.item_type,
        source: row.source,
        quantity: row.quantity,
        sort_order: row.sort_order,
        updated_at: now,
      });

      continue;
    }

    const nextData: Record<string, any> = {};

    if (safeText(existing.title) !== row.title) {
      nextData.title = row.title;
    }

    if (safeText(existing.item_type) !== row.item_type) {
      nextData.item_type = row.item_type;
    }

    if (safeText(existing.source) !== row.source) {
      nextData.source = row.source;
    }

    if (safeText(existing.booking_item_id) !== safeText(row.booking_item_id)) {
      nextData.booking_item_id = row.booking_item_id;
    }

    if (safeText(existing.inventory_item_id) !== safeText(row.inventory_item_id)) {
      nextData.inventory_item_id = row.inventory_item_id;
    }

    if (safeText(existing.inventory_unit_id) !== safeText(row.inventory_unit_id)) {
      nextData.inventory_unit_id = row.inventory_unit_id;
    }

    if (safeInt(existing.quantity, 1) !== row.quantity) {
      nextData.quantity = row.quantity;
    }

    if (safeInt(existing.sort_order, 0) !== row.sort_order) {
      nextData.sort_order = row.sort_order;
    }

    if (Object.keys(nextData).length > 0) {
      nextData.updated_at = now;
      updates.push({
        id: safeText(existing.id),
        data: nextData,
      });
    } else {
      preserved += 1;
    }
  }

  const staleIds = existingAutoRows
    .map((row) => safeText(row.id))
    .filter((id) => id && !usedExistingIds.has(id));

  for (const update of updates) {
    const updateResult = await supabase
      .from("booking_checklist_items")
      .update(update.data)
      .eq("booking_id", bookingId)
      .eq("id", update.id);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }
  }

  if (inserts.length > 0) {
    const insertResult = await supabase
      .from("booking_checklist_items")
      .insert(inserts);

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }
  }

  if (staleIds.length > 0) {
    const deleteResult = await supabase
      .from("booking_checklist_items")
      .delete()
      .eq("booking_id", bookingId)
      .in("id", staleIds);

    if (deleteResult.error) {
      throw new Error(deleteResult.error.message);
    }
  }

  return {
    expectedCount: expected.length,
    manualCount: existingManualCount,
    inserted: inserts.length,
    updated: updates.length,
    preserved,
    deleted: staleIds.length,
  };
}

export async function syncRouteStopItemsSummaryFromCurrentBooking(params: {
  supabase: SupabaseClientLike;
  bookingId: string;
}) {
  const { supabase, bookingId } = params;

  const itemsSummary = await buildBookingItemsSummaryFromCurrentBooking({
    supabase,
    bookingId,
  });

  const now = new Date().toISOString();

  const updateResult = await supabase
    .from("route_stops")
    .update({
      items_summary: itemsSummary || null,
      updated_at: now,
    })
    .eq("booking_id", bookingId)
    .in("stop_type", ["delivery", "pickup"]);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  return {
    itemsSummary,
  };
}

export async function refreshUnsignedHandoverSnapshotForBooking(params: {
  supabase: SupabaseClientLike;
  bookingId: string;
}) {
  const { supabase, bookingId } = params;

  const handoverResult = await supabase
    .from("handover_documents")
    .select("id, status")
    .eq("booking_id", bookingId)
    .neq("status", "void")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (handoverResult.error) {
    if (isMissingTableError(handoverResult.error)) {
      return {
        status: "unavailable" as const,
      };
    }

    throw new Error(handoverResult.error.message);
  }

  const handover = handoverResult.data as any;

  if (!handover?.id) {
    return {
      status: "not_found" as const,
    };
  }

  if (safeText(handover.status).toLowerCase() === "signed") {
    return {
      status: "signed" as const,
      handoverId: safeText(handover.id),
    };
  }

  const refreshResult = await supabase.rpc("prepare_handover_document", {
    p_booking_id: bookingId,
  });

  if (refreshResult.error) {
    throw new Error(refreshResult.error.message);
  }

  return {
    status: "refreshed" as const,
    handoverId: safeText(handover.id),
    documentId: safeText(refreshResult.data),
  };
}

export async function reconcileBookingOperationalEquipment(params: {
  supabase: SupabaseClientLike;
  bookingId: string;
  refreshUnsignedHandover?: boolean;
}) {
  const { supabase, bookingId, refreshUnsignedHandover = true } = params;

  const checklist = await reconcileBookingChecklistFromCurrentState({
    supabase,
    bookingId,
  });

  const routeSummary = await syncRouteStopItemsSummaryFromCurrentBooking({
    supabase,
    bookingId,
  });

  const handover = refreshUnsignedHandover
    ? await refreshUnsignedHandoverSnapshotForBooking({
        supabase,
        bookingId,
      })
    : { status: "skipped" as const };

  return {
    checklist,
    routeSummary,
    handover,
  };
}
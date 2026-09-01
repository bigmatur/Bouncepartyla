"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { processNotificationQueueBestEffort } from "@/lib/notifications/engine";
import { verifyBookingDiscountPassword } from "@/lib/booking/discount-password";
import { addBookingPaymentCore } from "@/lib/booking/admin-booking-payment";
import { updateBookingDiscountCore } from "@/lib/booking/admin-booking-discount";
import { checkBookingItemAvailabilityAction } from "../new/availability-actions";
import { scryptSync, timingSafeEqual } from "node:crypto";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const raw = getString(formData, key);
  if (!raw) return fallback;

  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTimeValue(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw.slice(0, 5);
  }

  if (/^\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }

  return raw.slice(0, 5);
}

function timeToMinutes(value: string) {
  const [hoursRaw, minutesRaw] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);
  return hours * 60 + minutes;
}

function buildReservationWindow(params: {
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
}) {
  const start = new Date(`${params.eventDate}T${params.eventStartTime}:00`);
  const end = new Date(`${params.eventDate}T${params.eventEndTime}:00`);

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return {
    reservedFrom: start.toISOString(),
    reservedUntil: end.toISOString(),
  };
}

function isMissingColumnError(error: any, tableName: string, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (code === "42703") {
    return true;
  }

  return (
    message.includes("column") &&
    message.includes(String(columnName).toLowerCase()) &&
    message.includes(String(tableName).toLowerCase())
  );
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

function isContractsAuditColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();

  return (
    isMissingColumnError(error, "contracts", "rendered_html") ||
    isMissingColumnError(error, "contracts", "template_version") ||
    isMissingColumnError(error, "contracts", "signature_text") ||
    isMissingColumnError(error, "contracts", "signature_date") ||
    isMissingColumnError(error, "contracts", "signer_ip") ||
    isMissingColumnError(error, "contracts", "signer_user_agent") ||
    isMissingColumnError(error, "contracts", "signature_metadata") ||
    (message.includes("contracts") && message.includes("schema cache") && message.includes("column"))
  );
}

function isValidPasswordHash(stored: string | null | undefined, candidate: string) {
  if (!stored || !candidate) {
    return false;
  }

  const [salt, savedHash] = String(stored).split(":");

  if (!salt || !savedHash) {
    return false;
  }

  const computedHash = scryptSync(candidate, salt, 64).toString("hex");

  try {
    return timingSafeEqual(Buffer.from(savedHash, "hex"), Buffer.from(computedHash, "hex"));
  } catch {
    return false;
  }
}

async function getDiscountSecuritySettings() {
  const supabase = await createClient();

  // Reads via a security-definer RPC: the table's own RLS only allows
  // super_admin to SELECT it directly, which would silently hide the row
  // (and the password requirement) from other staff roles.
  const { data, error } = await supabase
    .rpc("get_discount_security_settings")
    .maybeSingle();

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }

  return (
    (data as { discount_password_enabled: boolean; discount_password_hash: string | null } | null) || {
      discount_password_enabled: false,
      discount_password_hash: null,
    }
  );
}

async function queueContractResignIfNeeded(params: {
  bookingId: string;
  hasMaterialChanges: boolean;
  editedBy: string;
}) {
  if (!params.hasMaterialChanges) {
    return false;
  }

  const supabase = await createClient();

  const latestContractResult = await supabase
    .from("contracts")
    .select(
      "id, status, signer_name, signer_email, provider, template_version, rendered_html"
    )
    .eq("booking_id", params.bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestContractResult.error) {
    if (isMissingTableError(latestContractResult.error)) {
      return false;
    }

    console.warn("Failed reading contracts while queuing re-sign", {
      bookingId: params.bookingId,
      error: latestContractResult.error.message,
    });
    return false;
  }

  const latestContract = latestContractResult.data as any;

  if (!latestContract) {
    return false;
  }

  const latestStatus = String(latestContract.status || "").toLowerCase();
  const shouldQueue = latestStatus === "signed";

  if (!shouldQueue) {
    return false;
  }

  const now = new Date().toISOString();
  const reasonText =
    params.editedBy === "customer"
      ? "Booking was changed by customer. Contract requires re-signature."
      : "Booking was changed by admin/cashier. Contract requires re-signature.";

  let { error: contractInsertError } = await supabase.from("contracts").insert({
    booking_id: params.bookingId,
    status: "sent",
    signer_name: latestContract.signer_name || null,
    signer_email: latestContract.signer_email || null,
    provider: latestContract.provider || "internal_esign",
    sent_at: now,
    viewed_at: null,
    signed_at: null,
    template_version: latestContract.template_version || "v1",
    rendered_html:
      latestContract.rendered_html ||
      `<p>${reasonText}</p><p>Please open booking and sign updated contract.</p>`,
  });

  if (contractInsertError && isContractsAuditColumnError(contractInsertError)) {
    const fallbackResult = await supabase.from("contracts").insert({
      booking_id: params.bookingId,
      status: "sent",
      signer_name: latestContract.signer_name || null,
      signer_email: latestContract.signer_email || null,
      provider: latestContract.provider || "internal_esign",
      sent_at: now,
    });

    contractInsertError = fallbackResult.error;
  }

  if (contractInsertError) {
    console.warn("Failed to queue contract re-sign", {
      bookingId: params.bookingId,
      error: contractInsertError.message,
    });
    return false;
  }

  const bookingContractStatusResult = await supabase
    .from("bookings")
    .update({
      contract_status: "sent",
    })
    .eq("id", params.bookingId);

  if (bookingContractStatusResult.error) {
    console.warn("Failed updating booking contract status", {
      bookingId: params.bookingId,
      error: bookingContractStatusResult.error.message,
    });
  }

  return true;
}

async function rebuildInventoryReservationsForBookingEdit(params: {
  bookingId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  modifiers: Array<{
    itemIndex: number;
    optionId: string;
    optionName: string;
    inventoryItemId: string | null;
    inventoryQuantity: number;
    trackInventory: boolean;
    inventoryBehavior: "reusable" | "consumable";
  }>;
  bookingItemIdsByIndex: Map<number, string>;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
}) {
  const supabase = await createClient();

  if (!params.eventDate || !params.eventStartTime || !params.eventEndTime) {
    return;
  }

  const deleteReservationsResult = await supabase
    .from("inventory_reservations")
    .delete()
    .eq("booking_id", params.bookingId)
    .eq("status", "reserved");

  if (deleteReservationsResult.error) {
    if (!isMissingTableError(deleteReservationsResult.error)) {
      throw new Error(deleteReservationsResult.error.message);
    }
    return;
  }

  const availabilityByItemIndex = new Map<
    number,
    { reservedFrom: string; reservedUntil: string; components: any[] }
  >();

  for (let index = 0; index < params.items.length; index += 1) {
    try {
      const item = params.items[index];
      const checkFormData = new FormData();
      checkFormData.set("productId", item.productId);
      checkFormData.set("quantity", String(item.quantity));
      checkFormData.set("eventDate", params.eventDate);
      checkFormData.set("eventStartTime", params.eventStartTime);
      checkFormData.set("eventEndTime", params.eventEndTime);
      checkFormData.set("bookingActor", "cashier");

      const availability = await checkBookingItemAvailabilityAction(checkFormData);

      if (availability.available) {
        const reservedFrom = String(availability.reservedFrom || "");
        const reservedUntil = String(availability.reservedUntil || "");

        if (!reservedFrom || !reservedUntil) {
          throw new Error("Missing reservation window for product components.");
        }

        availabilityByItemIndex.set(index, {
          reservedFrom,
          reservedUntil,
          components: Array.isArray(availability.components) ? availability.components : [],
        });
        continue;
      }

      const message = String(availability.message || "").toLowerCase();
      const isOvernightWindow =
        message.includes("end time must be later than start time") ||
        timeToMinutes(params.eventEndTime) <= timeToMinutes(params.eventStartTime);

      if (!isOvernightWindow) {
        throw new Error(
          availability.message ||
            "Product inventory is not available for updated date/time."
        );
      }

      const fallbackWindow = buildReservationWindow({
        eventDate: params.eventDate,
        eventStartTime: params.eventStartTime,
        eventEndTime: params.eventEndTime,
      });

      const componentsResult = await supabase
        .from("product_inventory_components")
        .select(
          `
          component_name,
          quantity,
          quantity_required,
          required,
          inventory_behavior,
          inventory_item_id,
          inventory_items (
            id,
            tracking_type
          )
        `
        )
        .eq("product_id", item.productId)
        .order("sort_order", { ascending: true });

      if (componentsResult.error) {
        throw new Error(componentsResult.error.message);
      }

      const fallbackComponents: any[] = [];

      for (const component of componentsResult.data || []) {
        if ((component as any).required === false) {
          continue;
        }

        const inventoryItemId = String((component as any).inventory_item_id || "");
        if (!inventoryItemId) {
          continue;
        }

        const quantityPerProduct = Number(
          (component as any).quantity || (component as any).quantity_required || 1
        );
        const quantityNeeded = Math.max(0, quantityPerProduct * item.quantity);
        if (quantityNeeded <= 0) {
          continue;
        }

        const inventoryItem = Array.isArray((component as any).inventory_items)
          ? (component as any).inventory_items[0]
          : (component as any).inventory_items;

        const trackingType = String(inventoryItem?.tracking_type || "serialized");

        let availableUnitIds: string[] = [];

        if (trackingType !== "quantity" && trackingType !== "consumable") {
          const overlappingResult = await supabase
            .from("inventory_reservations")
            .select("inventory_unit_id")
            .eq("inventory_item_id", inventoryItemId)
            .in("status", ["reserved", "picked", "loaded", "installed"])
            .lt("reserved_from", fallbackWindow.reservedUntil)
            .gt("reserved_until", fallbackWindow.reservedFrom);

          if (overlappingResult.error) {
            throw new Error(overlappingResult.error.message);
          }

          const reservedUnitIds = new Set(
            (overlappingResult.data || [])
              .map((row: any) => row.inventory_unit_id)
              .filter(Boolean)
              .map(String)
          );

          const unitsResult = await supabase
            .from("inventory_units")
            .select("id, status, retired_at")
            .eq("inventory_item_id", inventoryItemId)
            .is("retired_at", null)
            .not("status", "in", "(retired,lost,damaged,maintenance)");

          if (unitsResult.error) {
            throw new Error(unitsResult.error.message);
          }

          availableUnitIds = (unitsResult.data || [])
            .filter((unit: any) => !reservedUnitIds.has(String(unit.id)))
            .slice(0, quantityNeeded)
            .map((unit: any) => String(unit.id));
        }

        fallbackComponents.push({
          componentName: (component as any).component_name || "Component",
          inventoryItemId,
          quantityNeeded,
          trackingType,
          inventoryBehavior: (component as any).inventory_behavior === "consumable" ? "consumable" : "reusable",
          availableUnitIds,
        });
      }

      availabilityByItemIndex.set(index, {
        reservedFrom: fallbackWindow.reservedFrom,
        reservedUntil: fallbackWindow.reservedUntil,
        components: fallbackComponents,
      });
    } catch (error: any) {
      console.warn("Skipping inventory rebuild for item", {
        bookingId: params.bookingId,
        itemIndex: index,
        error: error?.message || "Unknown error",
      });
      continue;
    }
  }

  for (let index = 0; index < params.items.length; index += 1) {
    const availability = availabilityByItemIndex.get(index);
    const bookingItemId = params.bookingItemIdsByIndex.get(index);

    if (!availability || !bookingItemId) {
      continue;
    }

    for (const component of availability.components || []) {
      try {
        if (component?.isRequired === false) {
          continue;
        }

      const inventoryItemId = String(component?.inventoryItemId || "");
      if (!inventoryItemId) {
        continue;
      }

      const quantityNeeded = Math.max(0, Number(component?.quantityNeeded || 0));
      if (quantityNeeded <= 0) {
        continue;
      }

      const trackingType = String(component?.trackingType || "serialized");

      if (trackingType === "quantity" || trackingType === "consumable") {
        const result = await supabase.from("inventory_reservations").insert({
          booking_id: params.bookingId,
          booking_item_id: bookingItemId,
          inventory_item_id: inventoryItemId,
          inventory_unit_id: null,
          quantity: quantityNeeded,
          status: "reserved",
          inventory_behavior: component?.inventoryBehavior === "consumable" ? "consumable" : "reusable",
          reserved_from: availability.reservedFrom,
          reserved_until: availability.reservedUntil,
          notes: `Product component: ${component?.componentName || "item"}`,
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        continue;
      }

      const availableUnitIds = Array.isArray(component?.availableUnitIds)
        ? component.availableUnitIds.slice(0, quantityNeeded)
        : [];

      if (availableUnitIds.length < quantityNeeded) {
        throw new Error(
          `Not enough serialized units for component "${
            component?.componentName || "item"
          }".`
        );
      }

      const insertRows = availableUnitIds.map((unitId: string) => ({
        booking_id: params.bookingId,
        booking_item_id: bookingItemId,
        inventory_item_id: inventoryItemId,
        inventory_unit_id: unitId,
        quantity: 1,
        status: "reserved",
        inventory_behavior: "reusable",
        reserved_from: availability.reservedFrom,
        reserved_until: availability.reservedUntil,
        notes: `Product component: ${component?.componentName || "item"}`,
      }));

      const result = await supabase.from("inventory_reservations").insert(insertRows);

      if (result.error) {
        throw new Error(result.error.message);
      }
      } catch (error: any) {
        console.warn("Skipping component reservation insert", {
          bookingId: params.bookingId,
          itemIndex: index,
          componentName: component?.componentName || "Component",
          error: error?.message || "Unknown error",
        });
        continue;
      }
    }
  }

  for (const modifier of params.modifiers) {
    try {
      if (!modifier.trackInventory || !modifier.inventoryItemId) {
        continue;
      }

    const item = params.items[modifier.itemIndex];
    const availability = availabilityByItemIndex.get(modifier.itemIndex);

    if (!item || !availability) {
      continue;
    }

    const quantityNeeded = Math.max(0, modifier.inventoryQuantity * item.quantity);
    if (quantityNeeded <= 0) {
      continue;
    }

    const inventoryItemResult = await supabase
      .from("inventory_items")
      .select("id, tracking_type")
      .eq("id", modifier.inventoryItemId)
      .maybeSingle();

    if (inventoryItemResult.error) {
      throw new Error(inventoryItemResult.error.message);
    }

    const trackingType = String(
      (inventoryItemResult.data as any)?.tracking_type || "serialized"
    );
    const { data: optionRow, error: optionRowError } = await supabase
      .from("modifier_group_options")
      .select("id, inventory_behavior")
      .eq("id", modifier.optionId)
      .maybeSingle();

    if (optionRowError && !isMissingColumnError(optionRowError, "modifier_group_options", "inventory_behavior")) {
      throw new Error(optionRowError.message);
    }

    const inventoryBehavior =
      (optionRow as any)?.inventory_behavior === "consumable" || modifier.inventoryBehavior === "consumable"
        ? "consumable"
        : "reusable";

    if (trackingType === "quantity" || trackingType === "consumable") {
      const insertResult = await supabase.from("inventory_reservations").insert({
        booking_id: params.bookingId,
        inventory_item_id: modifier.inventoryItemId,
        quantity: quantityNeeded,
        status: "reserved",
        inventory_behavior: inventoryBehavior,
        reserved_from: availability.reservedFrom,
        reserved_until: availability.reservedUntil,
        notes: `Modifier option: ${modifier.optionName}`,
      });

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }

      continue;
    }

    const overlappingResult = await supabase
      .from("inventory_reservations")
      .select("inventory_unit_id")
      .eq("inventory_item_id", modifier.inventoryItemId)
      .in("status", ["reserved", "picked", "loaded", "installed"])
      .lt("reserved_from", availability.reservedUntil)
      .gt("reserved_until", availability.reservedFrom);

    if (overlappingResult.error) {
      throw new Error(overlappingResult.error.message);
    }

    const reservedUnitIds = new Set(
      (overlappingResult.data || [])
        .map((row: any) => row.inventory_unit_id)
        .filter(Boolean)
        .map(String)
    );

    const unitsResult = await supabase
      .from("inventory_units")
      .select("id, status, retired_at")
      .eq("inventory_item_id", modifier.inventoryItemId)
      .is("retired_at", null)
      .not("status", "in", "(retired,lost,damaged,maintenance)");

    if (unitsResult.error) {
      throw new Error(unitsResult.error.message);
    }

    const availableUnitIds = (unitsResult.data || [])
      .filter((unit: any) => !reservedUnitIds.has(String(unit.id)))
      .slice(0, quantityNeeded)
      .map((unit: any) => String(unit.id));

    if (availableUnitIds.length < quantityNeeded) {
      throw new Error(
        `Not enough inventory units for option "${modifier.optionName}".`
      );
    }

    const insertRows = availableUnitIds.map((unitId) => ({
      booking_id: params.bookingId,
      inventory_item_id: modifier.inventoryItemId,
      inventory_unit_id: unitId,
      quantity: 1,
      status: "reserved",
      inventory_behavior: "reusable",
      reserved_from: availability.reservedFrom,
      reserved_until: availability.reservedUntil,
      notes: `Modifier option: ${modifier.optionName}`,
    }));

    const insertResult = await supabase.from("inventory_reservations").insert(insertRows);

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }
    } catch (error: any) {
      console.warn("Skipping modifier reservation insert", {
        bookingId: params.bookingId,
        optionName: modifier.optionName,
        error: error?.message || "Unknown error",
      });
      continue;
    }
  }
}

function parseBookingItemsForEdit(formData: FormData) {
  const items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    notes: string | null;
  }> = [];

  for (let index = 0; index < 300; index += 1) {
    const productId = getString(formData, `itemProductId_${index}`);

    if (!productId) {
      break;
    }

    const quantity = Math.max(1, getNumber(formData, `itemQuantity_${index}`, 1));
    const unitPrice = Math.max(0, getNumber(formData, `itemUnitPrice_${index}`, 0));
    const notesRaw = getString(formData, `itemNotes_${index}`);

    items.push({
      productId,
      quantity,
      unitPrice,
      notes: notesRaw ? notesRaw : null,
    });
  }

  return items;
}

function parseBookingModifiersForEdit(formData: FormData) {
  const rows: Array<{
    itemIndex: number;
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    priceDelta: number;
    inventoryItemId: string | null;
    inventoryQuantity: number;
    trackInventory: boolean;
    inventoryBehavior: "reusable" | "consumable";
  }> = [];

  for (let index = 0; index < 600; index += 1) {
    const optionId = getString(formData, `modifierOptionId_${index}`);
    const groupId = getString(formData, `modifierGroupId_${index}`);
    const itemIndexRaw = getString(formData, `modifierItemIndex_${index}`);

    if (!optionId || !groupId || !itemIndexRaw) {
      break;
    }

    const itemIndex = Number(itemIndexRaw);
    if (!Number.isInteger(itemIndex) || itemIndex < 0) {
      continue;
    }

    rows.push({
      itemIndex,
      groupId,
      groupName: getString(formData, `modifierGroupName_${index}`),
      optionId,
      optionName: getString(formData, `modifierOptionName_${index}`),
      priceDelta: Math.max(0, getNumber(formData, `modifierPriceDelta_${index}`, 0)),
      inventoryItemId: getString(formData, `modifierInventoryItemId_${index}`) || null,
      inventoryQuantity: Math.max(
        0,
        getNumber(formData, `modifierInventoryQuantity_${index}`, 1)
      ),
      trackInventory:
        ["1", "true", "on"].includes(
          getString(formData, `modifierTrackInventory_${index}`).toLowerCase()
        ),
      inventoryBehavior:
        getString(formData, `modifierInventoryBehavior_${index}`) === "consumable"
          ? "consumable"
          : "reusable",
    });
  }

  return rows;
}

async function insertBookingItemWithFallback(params: {
  bookingId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes: string | null;
}) {
  const supabase = await createClient();

  let { data, error } = await supabase
    .from("booking_items")
    .insert({
      booking_id: params.bookingId,
      product_id: params.productId,
      quantity: params.quantity,
      unit_price: params.unitPrice,
      subtotal: params.subtotal,
      notes: params.notes,
    })
    .select("id")
    .single();

  if (error && isMissingColumnError(error, "booking_items", "subtotal")) {
    const fallbackResult = await supabase
      .from("booking_items")
      .insert({
        booking_id: params.bookingId,
        product_id: params.productId,
        quantity: params.quantity,
        unit_price: params.unitPrice,
        line_total: params.subtotal,
        notes: params.notes,
      })
      .select("id")
      .single();

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error && isMissingColumnError(error, "booking_items", "notes")) {
    const fallbackResult = await supabase
      .from("booking_items")
      .insert({
        booking_id: params.bookingId,
        product_id: params.productId,
        quantity: params.quantity,
        unit_price: params.unitPrice,
        line_total: params.subtotal,
      })
      .select("id")
      .single();

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  return String((data as any).id);
}

async function insertBookingModifiersWithFallback(params: {
  bookingId: string;
  modifiers: Array<{
    itemIndex: number;
    bookingItemId: string;
    productId: string;
    quantity: number;
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    priceDelta: number;
    inventoryItemId: string | null;
    inventoryQuantity: number;
    trackInventory: boolean;
  }>;
}) {
  const supabase = await createClient();

  if (params.modifiers.length === 0) return;

  const optionIds = Array.from(new Set(params.modifiers.map((item) => item.optionId))).filter(
    Boolean
  );

  const optionToLegacyModifierId = new Map<string, string>();

  if (optionIds.length > 0) {
    let optionRowsResult: any = await supabase
      .from("modifier_group_options")
      .select("id, modifier_id, name, option_name, label")
      .in("id", optionIds);

    if (
      optionRowsResult.error &&
      isMissingColumnError(
        optionRowsResult.error,
        "modifier_group_options",
        "modifier_id"
      )
    ) {
      optionRowsResult = await supabase
        .from("modifier_group_options")
        .select("id, name, option_name, label")
        .in("id", optionIds);
    }

    const optionRows = optionRowsResult.data || [];

    for (const row of optionRows) {
      if ((row as any).id && (row as any).modifier_id) {
        optionToLegacyModifierId.set((row as any).id, (row as any).modifier_id);
      }
    }

    for (const row of optionRows) {
      const optionId = String((row as any).id || "");

      if (!optionId || optionToLegacyModifierId.has(optionId)) {
        continue;
      }

      const optionName = String(
        (row as any).option_name || (row as any).name || (row as any).label || "Option"
      ).trim();

      const slugBase = `auto-opt-${optionId.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 16)}`;

      let legacyModifierId = "";

      const existingModifierResult = await supabase
        .from("modifiers")
        .select("id")
        .eq("slug", slugBase)
        .maybeSingle();

      if (!existingModifierResult.error && existingModifierResult.data?.id) {
        legacyModifierId = String((existingModifierResult.data as any).id);
      }

      if (!legacyModifierId) {
        const createModifierResult = await supabase
          .from("modifiers")
          .insert({
            name: optionName || "Option",
            slug: slugBase,
            base_price: 0,
            taxable: true,
            active: true,
            sort_order: 0,
          })
          .select("id")
          .single();

        if (!createModifierResult.error && createModifierResult.data?.id) {
          legacyModifierId = String((createModifierResult.data as any).id);
        }
      }

      if (legacyModifierId) {
        optionToLegacyModifierId.set(optionId, legacyModifierId);

        const linkResult = await supabase
          .from("modifier_group_options")
          .update({ modifier_id: legacyModifierId })
          .eq("id", optionId);

        if (linkResult.error && !isMissingColumnError(linkResult.error, "modifier_group_options", "modifier_id")) {
          console.warn("Failed to link option to generated legacy modifier", {
            optionId,
            legacyModifierId,
            error: linkResult.error.message,
          });
        }
      }
    }
  }

  const fkModifierIdConstraint = "booking_modifiers_modifier_id_fkey";

  const modifierNote = (item: {
    itemIndex: number;
    groupId: string;
    optionId: string;
    groupName: string;
    optionName: string;
  }) =>
    `[idx:${item.itemIndex}][gid:${item.groupId}][oid:${item.optionId}] ${item.groupName}: ${item.optionName}`;

  async function ensureLegacyModifierId(optionId: string, optionName: string) {
    const existing = optionToLegacyModifierId.get(optionId);
    if (existing) {
      return existing;
    }

    const slugBase = `auto-opt-${optionId.replace(/[^a-zA-Z0-9]+/g, "").slice(0, 16)}`;

    const existingBySlugResult = await supabase
      .from("modifiers")
      .select("id")
      .eq("slug", slugBase)
      .maybeSingle();

    if (!existingBySlugResult.error && (existingBySlugResult.data as any)?.id) {
      const id = String((existingBySlugResult.data as any).id);
      optionToLegacyModifierId.set(optionId, id);
      return id;
    }

    let createResult: any = await supabase
      .from("modifiers")
      .insert({
        name: optionName || "Option",
        slug: slugBase,
        base_price: 0,
        taxable: true,
        active: true,
        sort_order: 0,
      })
      .select("id")
      .single();

    if (createResult.error && isMissingColumnError(createResult.error, "modifiers", "slug")) {
      createResult = await supabase
        .from("modifiers")
        .insert({
          name: optionName || "Option",
          base_price: 0,
          taxable: true,
          active: true,
          sort_order: 0,
        })
        .select("id")
        .single();
    }

    if (createResult.error) {
      return "";
    }

    const createdId = String((createResult.data as any)?.id || "");
    if (!createdId) {
      return "";
    }

    optionToLegacyModifierId.set(optionId, createdId);

    const linkResult = await supabase
      .from("modifier_group_options")
      .update({ modifier_id: createdId })
      .eq("id", optionId);

    if (linkResult.error && !isMissingColumnError(linkResult.error, "modifier_group_options", "modifier_id")) {
      console.warn("Failed to link option to generated legacy modifier", {
        optionId,
        createdId,
        error: linkResult.error.message,
      });
    }

    return createdId;
  }

  const resolvedLegacyModifierIdByOptionId = new Map<string, string>();

  for (const item of params.modifiers) {
    const optionId = String(item.optionId || "");
    if (!optionId) {
      continue;
    }

    const ensuredId = await ensureLegacyModifierId(optionId, item.optionName);
    if (ensuredId) {
      resolvedLegacyModifierIdByOptionId.set(optionId, ensuredId);
    }
  }

  async function insertWithNewSchemaVariants() {
    const variants: Array<Array<Record<string, any>>> = [
      params.modifiers.map((item) => ({
        booking_id: params.bookingId,
        booking_item_id: item.bookingItemId,
        modifier_group_id: item.groupId,
        modifier_group_option_id: item.optionId,
        inventory_item_id: item.inventoryItemId,
        inventory_quantity: item.inventoryQuantity * item.quantity,
        track_inventory: item.trackInventory,
        price_delta: item.priceDelta,
        label: item.optionName,
        quantity: item.quantity,
        unit_price: item.priceDelta,
        line_total: Number((item.priceDelta * item.quantity).toFixed(2)),
        notes: modifierNote(item),
      })),

      params.modifiers.map((item) => ({
        booking_id: params.bookingId,
        booking_item_id: item.bookingItemId,
        modifier_group_id: item.groupId,
        modifier_group_option_id: item.optionId,
        price_delta: item.priceDelta,
        label: item.optionName,
        quantity: item.quantity,
        unit_price: item.priceDelta,
        line_total: Number((item.priceDelta * item.quantity).toFixed(2)),
        notes: modifierNote(item),
      })),

      params.modifiers.map((item) => ({
        booking_id: params.bookingId,
        booking_item_id: item.bookingItemId,
        modifier_group_id: item.groupId,
        modifier_group_option_id: item.optionId,
        price_delta: item.priceDelta,
        label: item.optionName,
        quantity: item.quantity,
        unit_price: item.priceDelta,
        line_total: Number((item.priceDelta * item.quantity).toFixed(2)),
        notes: modifierNote(item),
      })),

      params.modifiers.map((item) => ({
        booking_id: params.bookingId,
        booking_item_id: item.bookingItemId,
        modifier_group_id: item.groupId,
        modifier_group_option_id: item.optionId,
        quantity: item.quantity,
        unit_price: item.priceDelta,
        line_total: Number((item.priceDelta * item.quantity).toFixed(2)),
        notes: modifierNote(item),
      })),

      params.modifiers.map((item) => ({
        booking_id: params.bookingId,
        booking_item_id: item.bookingItemId,
        modifier_group_id: item.groupId,
        modifier_group_option_id: item.optionId,
        quantity: item.quantity,
        unit_price: item.priceDelta,
        line_total: Number((item.priceDelta * item.quantity).toFixed(2)),
        notes: modifierNote(item),
      })),

      params.modifiers.map((item) => ({
        booking_id: params.bookingId,
        booking_item_id: item.bookingItemId,
        modifier_group_option_id: item.optionId,
        quantity: item.quantity,
        notes: modifierNote(item),
      })),

      params.modifiers.map((item) => ({
        booking_id: params.bookingId,
        booking_item_id: item.bookingItemId,
        modifier_group_option_id: item.optionId,
        quantity: item.quantity,
        notes: modifierNote(item),
      })),
    ];

    let lastError: any = null;

    for (const rows of variants) {
      const result = await supabase.from("booking_modifiers").insert(rows);

      if (!result.error) {
        return null;
      }

      lastError = result.error;
    }

    return lastError;
  }

  let { error } = await supabase.from("booking_modifiers").insert(
    params.modifiers.map((item) => ({
      booking_id: params.bookingId,
      booking_item_id: item.bookingItemId,
      modifier_id: resolvedLegacyModifierIdByOptionId.get(item.optionId) || item.optionId,
      quantity: item.quantity,
      unit_price: item.priceDelta,
      subtotal: Number((item.priceDelta * item.quantity).toFixed(2)),
      taxable: true,
      notes: modifierNote(item),
    }))
  );

  if (
    error &&
    String(error?.message || "").toLowerCase().includes(fkModifierIdConstraint)
  ) {
    const retryResult = await supabase.from("booking_modifiers").insert(
      params.modifiers.map((item) => ({
        booking_id: params.bookingId,
        booking_item_id: item.bookingItemId,
        modifier_id: item.optionId,
        quantity: item.quantity,
        unit_price: item.priceDelta,
        subtotal: Number((item.priceDelta * item.quantity).toFixed(2)),
        taxable: true,
        notes: modifierNote(item),
      }))
    );

    error = retryResult.error;
  }

  if (
    error &&
    String(error?.message || "").toLowerCase().includes(fkModifierIdConstraint)
  ) {
    error = await insertWithNewSchemaVariants();
  }

  if (error && isMissingColumnError(error, "booking_modifiers", "modifier_id")) {
    error = await insertWithNewSchemaVariants();
  }

  if (error) {
    throw new Error(`Failed to save booking options: ${error.message}`);
  }
}


export async function updateBookingDiscountAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const discountAmount = getNumber(formData, "discountAmount", 0);
  const discountPassword = getString(formData, "discountPassword");

  await updateBookingDiscountCore({
    supabase,
    bookingId,
    discountAmount,
    discountPassword,
  });

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  redirect(`/admin/bookings/${bookingId}?saved=discount-updated`);
}

export async function addPaymentAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const amountRaw = getString(formData, "amount");
  const method = getString(formData, "method").toLowerCase();
  const baseAmount = Math.max(0, getNumber(formData, "baseAmount", 0));
  const tipAmount = Math.max(0, getNumber(formData, "tipAmount", 0));
  const note = getString(formData, "note");
  const discountAmountInput = getNumber(formData, "discountAmount", 0);
  const discountPassword = getString(formData, "discountPassword");
  const amount = Number(String(amountRaw || "").replace(",", "."));

  const result = await addBookingPaymentCore({
    supabase,
    bookingId,
    amount,
    method,
    baseAmount,
    tipAmount,
    note,
    discountAmount: discountAmountInput,
    discountPassword,
    stripeSuccessPath: `/admin/bookings/${bookingId}`,
    stripeCancelPath: `/admin/bookings/${bookingId}`,
  });

  revalidatePath(`/admin/bookings/${bookingId}`);

  if (result.stripeCheckoutUrl) {
    redirect(result.stripeCheckoutUrl);
  }

  revalidatePath("/admin/bookings");
  revalidatePath("/admin/routes");

  redirect(`/admin/bookings/${bookingId}?saved=payment-added`);
}

export async function resendUpdatedContractManualAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const latestContractResult = await supabase
    .from("contracts")
    .select(
      "id, status, signer_name, signer_email, provider, template_version, rendered_html"
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestContractResult.error) {
    if (isMissingTableError(latestContractResult.error)) {
      throw new Error("Contracts table is not available.");
    }

    throw new Error(latestContractResult.error.message);
  }

  const latestContract = latestContractResult.data as any;

  if (!latestContract) {
    throw new Error("No contract found for this booking.");
  }

  const now = new Date().toISOString();

  if (String(latestContract.status || "").toLowerCase() === "sent") {
    const resendResult = await supabase
      .from("contracts")
      .update({
        sent_at: now,
      })
      .eq("id", latestContract.id);

    if (resendResult.error) {
      throw new Error(resendResult.error.message);
    }
  } else {
    let { error: contractInsertError } = await supabase.from("contracts").insert({
      booking_id: bookingId,
      status: "sent",
      signer_name: latestContract.signer_name || null,
      signer_email: latestContract.signer_email || null,
      provider: latestContract.provider || "internal_esign",
      sent_at: now,
      viewed_at: null,
      signed_at: null,
      template_version: latestContract.template_version || "v1",
      rendered_html: latestContract.rendered_html || null,
    });

    if (contractInsertError && isContractsAuditColumnError(contractInsertError)) {
      const fallbackResult = await supabase.from("contracts").insert({
        booking_id: bookingId,
        status: "sent",
        signer_name: latestContract.signer_name || null,
        signer_email: latestContract.signer_email || null,
        provider: latestContract.provider || "internal_esign",
        sent_at: now,
      });

      contractInsertError = fallbackResult.error;
    }

    if (contractInsertError) {
      throw new Error(contractInsertError.message);
    }
  }

  const bookingUpdateResult = await supabase
    .from("bookings")
    .update({
      contract_status: "sent",
    })
    .eq("id", bookingId);

  if (bookingUpdateResult.error) {
    console.warn("Failed updating booking contract status during manual resend", {
      bookingId,
      error: bookingUpdateResult.error.message,
    });
  }

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/settings");

  redirect(`/admin/bookings/${bookingId}?saved=contract-resend`);
}

export async function updateBookingItemsAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const editedBy = getString(formData, "editedBy") || "admin_cashier";
  const hasMaterialChanges = ["1", "true", "on"].includes(
    getString(formData, "hasMaterialChanges").toLowerCase()
  );

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const items = parseBookingItemsForEdit(formData);

  if (items.length === 0) {
    throw new Error("Add at least one item.");
  }

  const modifiers = parseBookingModifiersForEdit(formData);

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, discount_amount, delivery_fee, tax_rate, deposit_amount")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    throw new Error(bookingError.message);
  }

  if (!booking) {
    throw new Error("Booking not found.");
  }

  const deleteModifiersResult = await supabase
    .from("booking_modifiers")
    .delete()
    .eq("booking_id", bookingId);

  if (deleteModifiersResult.error) {
    throw new Error(deleteModifiersResult.error.message);
  }

  const deleteItemsResult = await supabase
    .from("booking_items")
    .delete()
    .eq("booking_id", bookingId);

  if (deleteItemsResult.error) {
    throw new Error(deleteItemsResult.error.message);
  }

  const bookingItemIdsByIndex = new Map<number, string>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const subtotal = Number((item.quantity * item.unitPrice).toFixed(2));

    const bookingItemId = await insertBookingItemWithFallback({
      bookingId,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal,
      notes: item.notes,
    });

    bookingItemIdsByIndex.set(index, bookingItemId);
  }

  await insertBookingModifiersWithFallback({
    bookingId,
    modifiers: modifiers
      .map((modifier) => {
        const item = items[modifier.itemIndex];
        const bookingItemId = bookingItemIdsByIndex.get(modifier.itemIndex);

        if (!item || !bookingItemId) {
          return null;
        }

        return {
          itemIndex: modifier.itemIndex,
          bookingItemId,
          productId: item.productId,
          quantity: item.quantity,
          groupId: modifier.groupId,
          groupName: modifier.groupName,
          optionId: modifier.optionId,
          optionName: modifier.optionName,
          priceDelta: modifier.priceDelta,
          inventoryItemId: modifier.inventoryItemId,
          inventoryQuantity: modifier.inventoryQuantity,
          trackInventory: modifier.trackInventory,
        };
      })
      .filter(Boolean) as Array<{
      itemIndex: number;
      bookingItemId: string;
      productId: string;
      quantity: number;
      groupId: string;
      groupName: string;
      optionId: string;
      optionName: string;
      priceDelta: number;
      inventoryItemId: string | null;
      inventoryQuantity: number;
      trackInventory: boolean;
    }>,
  });

  const eventDate = getString(formData, "eventDate");
  const eventStartTime = normalizeTimeValue(getString(formData, "eventStartTime"));
  const eventEndTime = normalizeTimeValue(getString(formData, "eventEndTime"));
  const setupAddress = getString(formData, "setupAddress");
  const setupCity = getString(formData, "setupCity");
  const setupState = getString(formData, "setupState") || "CA";
  const setupZip = getString(formData, "setupZip");

  let inventoryRebuildWarning = false;

  try {
    await rebuildInventoryReservationsForBookingEdit({
      bookingId,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      modifiers: modifiers.map((modifier) => ({
        itemIndex: modifier.itemIndex,
        optionId: modifier.optionId,
        optionName: modifier.optionName,
        inventoryItemId: modifier.inventoryItemId,
        inventoryQuantity: modifier.inventoryQuantity,
        trackInventory: modifier.trackInventory,
        inventoryBehavior: modifier.inventoryBehavior,
      })),
      bookingItemIdsByIndex,
      eventDate,
      eventStartTime,
      eventEndTime,
    });
  } catch (error: any) {
    inventoryRebuildWarning = true;
    console.warn("Inventory reservation rebuild skipped after booking edit", {
      bookingId,
      error: error?.message || "Unknown error",
    });
  }

  const productSubtotal = Number(
    items
      .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
      .toFixed(2)
  );

  const modifiersSubtotal = Number(
    modifiers
      .reduce((sum, modifier) => {
        const item = items[modifier.itemIndex];
        const qty = item?.quantity || 1;
        return sum + modifier.priceDelta * qty;
      }, 0)
      .toFixed(2)
  );

  const subtotal = Number((productSubtotal + modifiersSubtotal).toFixed(2));
  const discountAmountInput = getNumber(
    formData,
    "discountAmount",
    Number((booking as any).discount_amount || 0)
  );
  const discountPassword = getString(formData, "discountPassword");
  const deliveryFeeInput = getNumber(
    formData,
    "deliveryFee",
    Number((booking as any).delivery_fee || 0)
  );
  const taxRateInput = getNumber(
    formData,
    "taxRate",
    Number((booking as any).tax_rate || 0)
  );

  const discountAmount = Number(
    Math.max(0, Math.min(discountAmountInput, subtotal)).toFixed(2)
  );
  const existingDiscountAmount = Number((booking as any).discount_amount || 0);
  const discountChanged =
    existingDiscountAmount.toFixed(2) !== discountAmount.toFixed(2);

  if (discountChanged && discountAmount > 0) {
    const discountAuthorization =
      await verifyBookingDiscountPassword({
        supabase,
        password: discountPassword,
      });

    if (!discountAuthorization.ok) {
      throw new Error(discountAuthorization.message);
    }
  }

  const deliveryFee = Number(Math.max(0, deliveryFeeInput).toFixed(2));
  const taxRate = Number(Math.max(0, taxRateInput).toFixed(4));
  const depositAmount = Number((booking as any).deposit_amount || 0);

  const taxableSubtotal = Number((subtotal - discountAmount).toFixed(2));
  const taxAmount = Number(
    ((taxableSubtotal + deliveryFee) * (taxRate / 100)).toFixed(2)
  );
  const totalAmount = Number((taxableSubtotal + deliveryFee + taxAmount).toFixed(2));
  const balanceDue = Number((totalAmount - depositAmount).toFixed(2));

  const { error: updateError } = await supabase
    .from("bookings")
    .update({
      event_date: eventDate || null,
      event_start_time: eventStartTime || null,
      event_end_time: eventEndTime || null,
      setup_address: setupAddress || null,
      setup_city: setupCity || null,
      setup_state: setupState || null,
      setup_zip: setupZip || null,
      subtotal,
      discount_amount: discountAmount,
      delivery_fee: deliveryFee,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      balance_due: balanceDue,
    })
    .eq("id", bookingId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: routeStopSyncError } = await supabase
    .from("route_stops")
    .update({
      address: setupAddress || null,
      city: setupCity || null,
      state: setupState || null,
      zip: setupZip || null,
      stop_date: eventDate || null,
      scheduled_start_time: eventStartTime || null,
      scheduled_end_time: eventEndTime || null,
      updated_at: new Date().toISOString(),
    })
    .eq("booking_id", bookingId)
    .in("stop_type", ["delivery", "pickup"]);

  if (routeStopSyncError && !isMissingTableError(routeStopSyncError)) {
    throw new Error(routeStopSyncError.message);
  }

  const resignQueued = await queueContractResignIfNeeded({
    bookingId,
    hasMaterialChanges,
    editedBy,
  });

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/edit-items`);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/routes");

  redirect(
    `/admin/bookings/${bookingId}?saved=booking-updated${
      resignQueued ? "&resign=1" : ""
    }${inventoryRebuildWarning ? "&inventory=warning" : ""}`
  );
}

export async function updateBookingScheduleQuickAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const eventDate = getString(formData, "eventDate");
  const eventStartTime = normalizeTimeValue(getString(formData, "eventStartTime"));
  const eventEndTime = normalizeTimeValue(getString(formData, "eventEndTime"));
  const editedBy = "admin_cashier";

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  if (!eventDate || !eventStartTime || !eventEndTime) {
    throw new Error("Date, start time and end time are required.");
  }

  const updateResult = await supabase
    .from("bookings")
    .update({
      event_date: eventDate,
      event_start_time: eventStartTime,
      event_end_time: eventEndTime,
    })
    .eq("id", bookingId);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }

  const { error: routeStopQuickSyncError } = await supabase
    .from("route_stops")
    .update({
      stop_date: eventDate,
      scheduled_start_time: eventStartTime,
      scheduled_end_time: eventEndTime,
      updated_at: new Date().toISOString(),
    })
    .eq("booking_id", bookingId)
    .in("stop_type", ["delivery", "pickup"]);

  if (routeStopQuickSyncError && !isMissingTableError(routeStopQuickSyncError)) {
    throw new Error(routeStopQuickSyncError.message);
  }

  const resignQueued = await queueContractResignIfNeeded({
    bookingId,
    hasMaterialChanges: true,
    editedBy,
  });

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/routes");

  redirect(
    `/admin/bookings/${bookingId}?saved=schedule-updated${
      resignQueued ? "&resign=1" : ""
    }`
  );
}

export async function updateBookingCustomerAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const selectedCustomerId = getString(formData, "selectedCustomerId");
  const customerName = getString(formData, "customerName");
  const customerPhone = getString(formData, "customerPhone");
  const customerEmail = getString(formData, "customerEmail");

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const bookingResult = await supabase
    .from("bookings")
    .select("id, customer_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  if (!bookingResult.data) {
    throw new Error("Booking not found.");
  }

  const booking = bookingResult.data as any;

  if (selectedCustomerId) {
    const selectedCustomerResult = await supabase
      .from("customers")
      .select("id")
      .eq("id", selectedCustomerId)
      .maybeSingle();

    if (selectedCustomerResult.error) {
      throw new Error(selectedCustomerResult.error.message);
    }

    if (!selectedCustomerResult.data) {
      throw new Error("Selected customer was not found.");
    }

    const relinkResult = await supabase
      .from("bookings")
      .update({ customer_id: selectedCustomerId })
      .eq("id", bookingId);

    if (relinkResult.error) {
      throw new Error(relinkResult.error.message);
    }

    revalidatePath(`/admin/bookings/${bookingId}`);
    revalidatePath("/admin/bookings");

    redirect(`/admin/bookings/${bookingId}?saved=customer-linked`);
  }

  if (!customerName) {
    throw new Error("Customer name is required.");
  }

  let customerId = String(booking.customer_id || "");

  if (!customerId) {
    const createCustomerResult = await supabase
      .from("customers")
      .insert({
        full_name: customerName,
        phone: customerPhone || null,
        email: customerEmail || null,
      })
      .select("id")
      .single();

    if (createCustomerResult.error) {
      throw new Error(createCustomerResult.error.message);
    }

    customerId = String((createCustomerResult.data as any).id);

    const updateBookingResult = await supabase
      .from("bookings")
      .update({ customer_id: customerId })
      .eq("id", bookingId);

    if (updateBookingResult.error) {
      throw new Error(updateBookingResult.error.message);
    }
  } else {
    const updateCustomerResult = await supabase
      .from("customers")
      .update({
        full_name: customerName,
        phone: customerPhone || null,
        email: customerEmail || null,
      })
      .eq("id", customerId);

    if (updateCustomerResult.error) {
      throw new Error(updateCustomerResult.error.message);
    }
  }

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath("/admin/bookings");

  redirect(`/admin/bookings/${bookingId}?saved=customer-updated`);
}

export async function updateBookingPrivateNotesAction(formData: FormData) {
  const supabase = await createClient();

  const bookingId = getString(formData, "bookingId");
  const driverNotesRaw = getString(formData, "driverNotes");
  const officeNotesRaw = getString(formData, "officeNotes");

  if (!bookingId) {
    throw new Error("Booking ID is required.");
  }

  const driverNotes = driverNotesRaw || null;
  const officeNotes = officeNotesRaw || null;

  const bookingUpdateResult = await supabase
    .from("bookings")
    .update({
      internal_notes: officeNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bookingId);

  if (bookingUpdateResult.error) {
    throw new Error(bookingUpdateResult.error.message);
  }

  // Keep driver-private notes separate from stop-specific setup/pickup notes.
  const routeStopUpdateResult = await supabase
    .from("route_stops")
    .update({
      driver_notes: driverNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("booking_id", bookingId)
    .in("stop_type", ["delivery", "pickup"]);

  if (
    routeStopUpdateResult.error &&
    !isMissingTableError(routeStopUpdateResult.error)
  ) {
    throw new Error(routeStopUpdateResult.error.message);
  }

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath(`/admin/bookings/${bookingId}/routes`);
  revalidatePath("/admin/bookings");
  revalidatePath("/admin/routes");

  redirect(`/admin/bookings/${bookingId}?saved=private-notes-updated`);
}

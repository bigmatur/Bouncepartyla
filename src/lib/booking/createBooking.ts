import type { SupabaseClient } from "@supabase/supabase-js";
import { checkProductAvailability } from "./availability";
import { getAvailabilityData } from "./getAvailabilityData";
import { reserveInventoryForBooking } from "./reserveInventory";
import { getBookingMarkerColor } from "./marker-color";
import { calculateCanonicalBookingPricing } from "@/lib/booking/canonical-pricing";

export type CreateBookingItemInput = {
  productId: string;
  quantity?: number;
  selectedModifierGroupOptionIds?: string[];
  selectedModifierOptionQuantities?: Record<string, number>;
  reservedFrom?: string;
  reservedUntil?: string;
};

export type CreateBookingInput = {
  customerId?: string;
  customerAuthUserId?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  bookingAttemptId?: string;

  /**
   * Customer self-service checkout hold.
   * Insert as pending_deposit/customer_self_service/unpaid from the first write.
   */
  provisionalCustomerCheckout?: boolean;

  items?: CreateBookingItemInput[];
  productId?: string;
  quantity?: number;
  selectedModifierGroupOptionIds?: string[];
  selectedModifierOptionQuantities?: Record<string, number>;
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  setupAddress?: string;
  setupCity?: string;
  setupZip?: string;
  reservedFrom: string;
  reservedUntil: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanPhone(phone?: string) {
  return (phone || "").replace(/\D/g, "");
}

function cleanEmail(email?: string) {
  return (email || "").trim().toLowerCase();
}

async function findOrCreateCustomer(params: {
  supabase: SupabaseClient;
  authUserId?: string;
  name: string;
  phone?: string;
  email?: string;
}) {
  const { supabase } = params;
  const authUserId = String(params.authUserId || "").trim();

  if (authUserId) {
    const ownCustomerResult = await supabase
      .from("customers")
      .select("id, full_name, phone, email, auth_user_id")
      .eq("auth_user_id", authUserId)
      .limit(1)
      .maybeSingle();

    if (ownCustomerResult.error) throw new Error(ownCustomerResult.error.message);

    if (ownCustomerResult.data) {
      const own = ownCustomerResult.data as any;
      const ownUpdateResult = await supabase
        .from("customers")
        .update({
          full_name: own.full_name || params.name,
          phone: own.phone || params.phone || null,
          email: own.email || cleanEmail(params.email) || null,
        })
        .eq("id", own.id)
        .select()
        .single();

      if (ownUpdateResult.error) throw new Error(ownUpdateResult.error.message);
      return ownUpdateResult.data;
    }
  }

  const phone = cleanPhone(params.phone);
  const email = cleanEmail(params.email);

  if (phone || email) {
    let queryText = "";
    if (phone && email) queryText = `phone.ilike.%${phone}%,email.eq.${email}`;
    else if (phone) queryText = `phone.ilike.%${phone}%`;
    else if (email) queryText = `email.eq.${email}`;

    const existingCustomerResult = await supabase
      .from("customers")
      .select("id, full_name, phone, email, auth_user_id")
      .or(queryText)
      .limit(1)
      .maybeSingle();

    if (existingCustomerResult.error) throw new Error(existingCustomerResult.error.message);

    if (existingCustomerResult.data) {
      const customer = existingCustomerResult.data as any;
      const existingAuthUserId = String(customer.auth_user_id || "").trim();

      if (authUserId && existingAuthUserId && existingAuthUserId !== authUserId) {
        throw new Error("Customer profile conflict: this email/phone belongs to another account.");
      }

      const updateResult = await supabase
        .from("customers")
        .update({
          full_name: customer.full_name || params.name,
          phone: customer.phone || params.phone || null,
          email: customer.email || email || null,
          auth_user_id: existingAuthUserId || authUserId || null,
        })
        .eq("id", customer.id)
        .select()
        .single();

      if (updateResult.error) throw new Error(updateResult.error.message);
      return updateResult.data;
    }
  }

  const customerInsertPayload: Record<string, any> = {
    full_name: params.name,
    phone: params.phone || null,
    email: email || null,
    auth_user_id: params.authUserId || null,
  };

  let customerResult = await supabase.from("customers").insert(customerInsertPayload).select().single();

  if (customerResult.error && String(customerResult.error.code || "") === "42703") {
    const { auth_user_id, ...legacyPayload } = customerInsertPayload;
    customerResult = await supabase.from("customers").insert(legacyPayload).select().single();
  }

  if (customerResult.error) throw new Error(customerResult.error.message);
  return customerResult.data;
}

function getOptionPrice(option: any) {
  return roundMoney(Number(option.price_override ?? option.modifiers?.price ?? 0));
}

function getOptionName(option: any) {
  return option.label_override || option.modifiers?.name || "Option";
}

async function rollbackFailedBookingCreation(params: {
  supabase: SupabaseClient;
  bookingId: string;
  customerSelfService?: boolean;
}) {
  const {
    supabase,
    bookingId,
    customerSelfService = false,
  } = params;

  if (customerSelfService) {
    try {
      const rpcResult = await supabase.rpc(
        "cancel_my_unpaid_customer_stripe_booking",
        { p_booking_id: bookingId },
      );

      if (!rpcResult.error) {
        const payload =
          rpcResult.data && typeof rpcResult.data === "object"
            ? (rpcResult.data as any)
            : null;
        const status = String(payload?.status || "");

        if (payload?.success === true || status === "booking_not_found") {
          return;
        }

        if (status === "payment_already_recorded") {
          console.error(
            "[booking-create] rollback refused because payment already exists",
            { bookingId, payload },
          );
          return;
        }

        console.error(
          "[booking-create] provisional cleanup RPC did not complete",
          { bookingId, payload },
        );
      } else {
        console.error(
          "[booking-create] provisional cleanup RPC error",
          { bookingId, error: rpcResult.error.message },
        );
      }
    } catch (error) {
      console.error(
        "[booking-create] provisional cleanup RPC threw",
        {
          bookingId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  const cleanupErrors: string[] = [];

  const childTables = [
    "inventory_reservations",
    "booking_modifiers",
    "booking_items",
    "booking_price_calculations",
    "delivery_calculations",
  ];

  for (const tableName of childTables) {
    const result = await supabase
      .from(tableName as any)
      .delete()
      .eq("booking_id", bookingId);

    if (result.error) {
      cleanupErrors.push(`${tableName}: ${result.error.message}`);
    }
  }

  const bookingDeleteResult = await supabase
    .from("bookings")
    .delete()
    .eq("id", bookingId)
    .select("id");

  if (bookingDeleteResult.error) {
    cleanupErrors.push(`bookings: ${bookingDeleteResult.error.message}`);
  } else if (!bookingDeleteResult.data?.length) {
    cleanupErrors.push(
      "bookings: delete returned no row; RLS/policy may have blocked customer DELETE",
    );
  }

  if (cleanupErrors.length > 0) {
    console.error("[booking-create] rollback incomplete", {
      bookingId,
      cleanupErrors,
    });
  }
}

async function getFinalModifierGroupOptions(params: {
  supabase: SupabaseClient;
  productId: string;
  selectedModifierGroupOptionIds: string[];
  selectedModifierOptionQuantities?: Record<string, number>;
}) {
  const { supabase, productId, selectedModifierGroupOptionIds, selectedModifierOptionQuantities = {} } = params;

  const productGroupsResult = await supabase
    .from("product_modifier_groups")
    .select(`
      id,
      product_id,
      modifier_group_id,
      required,
      min_selections,
      max_selections,
      active,
      sort_order,
      modifier_groups (
        id,
        name,
        selection_type,
        required,
        active,
        modifier_group_options (
          id,
          modifier_group_id,
          modifier_id,
          label_override,
          price_override,
          selected_by_default,
          active,
          sort_order,
          modifiers (
            id,
            name,
            price,
            taxable,
            affects_inventory,
            allow_quantity,
            setup_minutes,
            teardown_minutes,
            active
          )
        )
      )
    `)
    .eq("product_id", productId)
    .eq("active", true);

  if (productGroupsResult.error) throw new Error(productGroupsResult.error.message);

  const productGroups = productGroupsResult.data || [];
  const selectedIds = new Set(selectedModifierGroupOptionIds);
  const selectedQuantityByOptionId = new Map<string, number>(
    Object.entries(selectedModifierOptionQuantities).map(([optionId, quantity]) => [
      optionId,
      Math.max(0, Math.floor(Number(quantity || 0))),
    ]),
  );
  const finalOptionsMap = new Map<string, any>();

  for (const productGroup of productGroups as any[]) {
    const group = productGroup.modifier_groups;
    if (!group || !group.active) continue;

    const options = (group.modifier_group_options || [])
      .filter((option: any) => option.active && option.modifiers?.active)
      .sort((a: any, b: any) => Number(a.sort_order || 100) - Number(b.sort_order || 100));

    if (options.length === 0) continue;

    const selectedInGroup = options.filter((option: any) => selectedIds.has(option.id));
    const defaultInGroup = options.filter((option: any) => Boolean(option.selected_by_default));
    const groupIsRequired = Boolean(productGroup.required || group.required);
    const selectionType = group.selection_type || "single";

    if (selectionType === "single") {
      if (selectedInGroup[0]) {
        finalOptionsMap.set(selectedInGroup[0].id, {
          ...selectedInGroup[0],
          selected_quantity: 1,
          product_modifier_group_id: productGroup.id,
          product_group_required: productGroup.required,
          group,
        });
        continue;
      }

      if (groupIsRequired) {
        const fallbackOption = defaultInGroup[0] || options[0];
        finalOptionsMap.set(fallbackOption.id, {
          ...fallbackOption,
          selected_quantity: 1,
          product_modifier_group_id: productGroup.id,
          product_group_required: productGroup.required,
          group,
        });
      }
      continue;
    }

    if (selectionType === "quantity") {
      const defaultOptions = selectedInGroup.length > 0
        ? selectedInGroup
        : groupIsRequired
          ? defaultInGroup.length > 0
            ? defaultInGroup
            : [options[0]]
          : [];

      for (const option of options) {
        const selectedQty = selectedQuantityByOptionId.get(String(option.id));
        if (selectedQty != null) {
          if (selectedQty <= 0) continue;
          finalOptionsMap.set(option.id, {
            ...option,
            selected_quantity: selectedQty,
            product_modifier_group_id: productGroup.id,
            product_group_required: productGroup.required,
            group,
          });
          continue;
        }

        if (defaultOptions.some((row: any) => row.id === option.id)) {
          finalOptionsMap.set(option.id, {
            ...option,
            selected_quantity: 1,
            product_modifier_group_id: productGroup.id,
            product_group_required: productGroup.required,
            group,
          });
        }
      }
      continue;
    }

    const multipleOptions = selectedInGroup.length > 0
      ? selectedInGroup
      : groupIsRequired
        ? defaultInGroup
        : [];

    for (const option of multipleOptions) {
      finalOptionsMap.set(option.id, {
        ...option,
        selected_quantity: 1,
        product_modifier_group_id: productGroup.id,
        product_group_required: productGroup.required,
        group,
      });
    }
  }

  return Array.from(finalOptionsMap.values());
}

export async function createBooking(params: {
  supabase: SupabaseClient;
  input: CreateBookingInput;
}) {
  const { supabase, input } = params;
  const bookingAttemptId = String(input.bookingAttemptId || "").trim() || null;

  const normalizedItems: CreateBookingItemInput[] = (
    input.items?.length
      ? input.items
      : input.productId
        ? [{
            productId: input.productId,
            quantity: input.quantity,
            selectedModifierGroupOptionIds: input.selectedModifierGroupOptionIds,
            selectedModifierOptionQuantities: input.selectedModifierOptionQuantities,
            reservedFrom: input.reservedFrom,
            reservedUntil: input.reservedUntil,
          }]
        : []
  )
    .map((item) => ({
      ...item,
      productId: String(item.productId || "").trim(),
      quantity: Math.max(1, Math.floor(Number(item.quantity || 1))),
      reservedFrom: item.reservedFrom || input.reservedFrom,
      reservedUntil: item.reservedUntil || input.reservedUntil,
    }))
    .filter((item) => item.productId);

  if (normalizedItems.length === 0) throw new Error("Choose at least one product.");

  if (bookingAttemptId) {
    const existingAttempt = await supabase
      .from("bookings")
      .select("*")
      .eq("booking_attempt_id", bookingAttemptId)
      .maybeSingle();

    if (existingAttempt.error && String(existingAttempt.error.code || "") !== "42703") {
      throw new Error(existingAttempt.error.message);
    }

    if (existingAttempt.data) {
      return {
        booking: existingAttempt.data,
        bookingItem: null,
        bookingItems: [],
        customer: null,
        reusedExistingBooking: true,
      };
    }
  }

  const productIds = Array.from(new Set(normalizedItems.map((item) => item.productId)));
  const productsResult = await supabase
    .from("products")
    .select("id, name, base_price, deposit_amount")
    .in("id", productIds);

  if (productsResult.error) throw new Error(productsResult.error.message);

  const productById = new Map((productsResult.data || []).map((product: any) => [String(product.id), product]));
  const missingProductId = productIds.find((productId) => !productById.has(productId));
  if (missingProductId) throw new Error(`Product not found: ${missingProductId}`);

  let customer;

  if (input.customerId) {
    const existingCustomerResult = await supabase
      .from("customers")
      .select("id, full_name, phone, email, auth_user_id")
      .eq("id", input.customerId)
      .maybeSingle();

    if (existingCustomerResult.error) throw new Error(existingCustomerResult.error.message);

    const existingCustomer = existingCustomerResult.data as any | null;
    const requestedAuthUserId = String(input.customerAuthUserId || "").trim();
    const existingAuthUserId = String(existingCustomer?.auth_user_id || "").trim();

    if (existingCustomer && (!requestedAuthUserId || !existingAuthUserId || existingAuthUserId === requestedAuthUserId)) {
      customer = existingCustomer;
    } else if (requestedAuthUserId) {
      customer = await findOrCreateCustomer({
        supabase,
        authUserId: requestedAuthUserId,
        name: input.customerName,
        phone: input.customerPhone,
        email: input.customerEmail,
      });
    } else {
      throw new Error("Customer record is not accessible for booking creation.");
    }
  } else {
    customer = await findOrCreateCustomer({
      supabase,
      authUserId: input.customerAuthUserId,
      name: input.customerName,
      phone: input.customerPhone,
      email: input.customerEmail,
    });
  }

  const availabilityFrom = normalizedItems.map((item) => item.reservedFrom).filter(Boolean).sort()[0] || input.reservedFrom;
  const availabilityUntil = normalizedItems.map((item) => item.reservedUntil).filter(Boolean).sort().at(-1) || input.reservedUntil;

  const availabilityData = await getAvailabilityData({
    supabase,
    reservedFrom: availabilityFrom,
    reservedUntil: availabilityUntil,
  });

  const preparedItems: Array<{
    input: CreateBookingItemInput;
    product: any;
    quantity: number;
    selectedOptions: any[];
    unitPrice: number;
    productSubtotal: number;
    modifiersTotal: number;
  }> = [];

  for (const itemInput of normalizedItems) {
    const product = productById.get(itemInput.productId)!;
    const quantity = Math.max(1, Math.floor(Number(itemInput.quantity || 1)));
    const selectedOptions = await getFinalModifierGroupOptions({
      supabase,
      productId: itemInput.productId,
      selectedModifierGroupOptionIds: itemInput.selectedModifierGroupOptionIds || [],
      selectedModifierOptionQuantities: itemInput.selectedModifierOptionQuantities || {},
    });

    const selectedModifierQuantitiesByModifierId = selectedOptions.reduce(
      (acc: Record<string, number>, option: any) => {
        const modifierId = String(option.modifiers?.id || "");
        if (!modifierId) return acc;
        const selectedQuantity = Math.max(1, Math.floor(Number(option.selected_quantity || 1)));
        acc[modifierId] = (acc[modifierId] || 0) + selectedQuantity;
        return acc;
      },
      {},
    );

    const itemReservedFrom = itemInput.reservedFrom || input.reservedFrom;
    const itemReservedUntil = itemInput.reservedUntil || input.reservedUntil;
    const availabilityProduct = availabilityData.products.find((row) => row.id === product.id) || {
      id: product.id,
      name: product.name,
      active: true,
    };

    const availability = checkProductAvailability({
      product: availabilityProduct,
      input: {
        productId: product.id,
        quantity,
        reservedFrom: itemReservedFrom,
        reservedUntil: itemReservedUntil,
      },
      recipes: availabilityData.recipes,
      units: availabilityData.units,
      reservations: availabilityData.reservations,
      selectedModifierQuantitiesByModifierId,
    });

    if (availability.status === "unavailable") {
      const firstMissing = availability.missingComponents[0];
      const details = firstMissing
        ? ` Missing: ${firstMissing.inventoryItemName} (required ${firstMissing.requiredQuantity}, available ${firstMissing.availableQuantity}).`
        : "";
      throw new Error(`“${product.name}” is not available for this time window.${details}`);
    }

    const unitPrice = roundMoney(Number(product.base_price || 0));
    const productSubtotal = roundMoney(unitPrice * quantity);
    const modifiersTotal = roundMoney(selectedOptions.reduce((sum: number, option: any) => {
      const optionQty = Math.max(1, Math.floor(Number(option.selected_quantity || 1)));
      return sum + getOptionPrice(option) * optionQty * quantity;
    }, 0));

    preparedItems.push({ input: itemInput, product, quantity, selectedOptions, unitPrice, productSubtotal, modifiersTotal });
  }

  const productsSubtotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.productSubtotal, 0));
  const modifiersTotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.modifiersTotal, 0));
  const rentalSubtotal = roundMoney(productsSubtotal + modifiersTotal);

  const canonicalPricing = await calculateCanonicalBookingPricing({
    supabase,
    setupAddress: input.setupAddress,
    setupCity: input.setupCity,
    setupState: "CA",
    setupZip: input.setupZip,
    subtotal: rentalSubtotal,
    depositAmount: 0,
  });

  if (!canonicalPricing.ok) {
    const reasons = [canonicalPricing.deliveryError, canonicalPricing.taxError].filter(Boolean);
    throw new Error(reasons.join(" ") || "Booking pricing could not be confirmed.");
  }

  const deliveryFee = roundMoney(canonicalPricing.deliveryFee);
  const taxableAmount = roundMoney(canonicalPricing.taxableAmount);
  const taxRate = Number(canonicalPricing.taxRate || 0);
  const taxAmount = roundMoney(canonicalPricing.taxAmount);
  const allSelectedOptions = preparedItems.flatMap((item) => item.selectedOptions);
  const bookingMarkerColor = getBookingMarkerColor(
    { booking_modifiers: allSelectedOptions.map((option: any) => ({ modifiers: option.modifiers, modifier_group_options: option })) },
    allSelectedOptions.map((option: any) => ({ modifiers: option.modifiers, modifier_group_options: option })),
  );
  const totalAmount = roundMoney(canonicalPricing.totalAmount);
  const depositAmount = roundMoney(preparedItems.reduce(
    (sum, item) => sum + Number(item.product.deposit_amount || 0) * item.quantity,
    0,
  ));
  const balanceDue = roundMoney(Math.max(totalAmount - depositAmount, 0));

  const isCustomerCheckoutProvisional =
    input.provisionalCustomerCheckout === true;

  const persistedBalanceDue =
    isCustomerCheckoutProvisional ? totalAmount : balanceDue;

  const bookingInsert: Record<string, any> = {
    customer_id: customer.id,
    status: isCustomerCheckoutProvisional
      ? "pending_deposit"
      : "booked",
    ...(isCustomerCheckoutProvisional
      ? {
          booking_source: "customer_self_service",
          amount_paid: 0,
          payment_status: "unpaid",
        }
      : {}),
    booking_attempt_id: bookingAttemptId,
    event_date: input.eventDate,
    event_start_time: input.eventStartTime || null,
    event_end_time: input.eventEndTime || null,
    delivery_date: input.eventDate,
    pickup_date: input.eventDate,
    delivery_window_start: availabilityFrom,
    delivery_window_end: availabilityFrom,
    pickup_window_start: availabilityUntil,
    pickup_window_end: availabilityUntil,
    setup_address: input.setupAddress || null,
    setup_city: input.setupCity || null,
    setup_state: "CA",
    setup_zip: input.setupZip || null,
    subtotal: productsSubtotal,
    modifiers_total: modifiersTotal,
    delivery_fee: deliveryFee,
    discount_amount: 0,
    taxable_amount: taxableAmount,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    marker_color: bookingMarkerColor,
    total_amount: totalAmount,
    deposit_amount: depositAmount,
    balance_due: persistedBalanceDue,
  };

  let bookingResult = await supabase.from("bookings").insert(bookingInsert).select().single();
  if (bookingResult.error && String(bookingResult.error.message || "").includes("booking_attempt_id")) {
    const fallbackInsert = { ...bookingInsert };
    delete fallbackInsert.booking_attempt_id;
    bookingResult = await supabase.from("bookings").insert(fallbackInsert).select().single();
  }
  if (bookingResult.error && String(bookingResult.error.message || "").includes("marker_color")) {
    const fallbackInsert = { ...bookingInsert };
    delete fallbackInsert.marker_color;
    bookingResult = await supabase.from("bookings").insert(fallbackInsert).select().single();
  }
  if (bookingResult.error && String(bookingResult.error.code || "") === "23505" && bookingAttemptId) {
    const existingAttempt = await supabase.from("bookings").select("*").eq("booking_attempt_id", bookingAttemptId).single();
    if (!existingAttempt.error && existingAttempt.data) {
      return { booking: existingAttempt.data, bookingItem: null, bookingItems: [], customer, reusedExistingBooking: true };
    }
  }
  if (bookingResult.error) throw new Error(bookingResult.error.message);

  const booking = bookingResult.data;

  try {
    const bookingItems: any[] = [];

    for (const prepared of preparedItems) {
      const bookingItemResult = await supabase.from("booking_items").insert({
        booking_id: booking.id,
        product_id: prepared.product.id,
        quantity: prepared.quantity,
        unit_price: prepared.unitPrice,
        subtotal: prepared.productSubtotal,
        taxable: true,
      }).select().single();

      if (bookingItemResult.error) throw new Error(bookingItemResult.error.message);
      const bookingItem = bookingItemResult.data;
      bookingItems.push(bookingItem);

      if (prepared.selectedOptions.length > 0) {
        const rows = prepared.selectedOptions.map((option: any) => {
          const modifier = option.modifiers;
          const unitPrice = getOptionPrice(option);
          const optionQty = Math.max(1, Math.floor(Number(option.selected_quantity || 1)));
          const modifierQuantity = optionQty * prepared.quantity;
          return {
            booking_id: booking.id,
            booking_item_id: bookingItem.id,
            modifier_id: modifier.id,
            modifier_group_id: option.modifier_group_id,
            modifier_group_option_id: option.id,
            quantity: modifierQuantity,
            unit_price: unitPrice,
            subtotal: roundMoney(unitPrice * modifierQuantity),
            taxable: modifier?.taxable ?? true,
          };
        });
        const modifiersResult = await supabase.from("booking_modifiers").insert(rows);
        if (modifiersResult.error) throw new Error(modifiersResult.error.message);
      }

      const modifierIdsForInventory = prepared.selectedOptions
        .filter((option: any) => option.modifiers?.affects_inventory)
        .map((option: any) => option.modifiers.id);
      const modifierQuantityMultipliers = prepared.selectedOptions.reduce((map: Record<string, number>, option: any) => {
        const modifierId = String(option.modifiers?.id || "");
        if (!modifierId) return map;
        const quantity = Math.max(1, Math.floor(Number(option.selected_quantity || 1)));
        map[modifierId] = (map[modifierId] || 0) + quantity;
        return map;
      }, {});

      await reserveInventoryForBooking({
        supabase,
        bookingId: booking.id,
        bookingItemId: bookingItem.id,
        productId: prepared.product.id,
        modifierIds: modifierIdsForInventory,
        modifierQuantityMultipliers,
        quantity: prepared.quantity,
        reservedFrom: prepared.input.reservedFrom || input.reservedFrom,
        reservedUntil: prepared.input.reservedUntil || input.reservedUntil,
      });
    }

    const deliveryCalculationResult = await supabase.from("delivery_calculations").insert({
      booking_id: booking.id,
      destination_address: input.setupAddress || null,
      destination_city: input.setupCity || null,
      destination_state: "CA",
      destination_zip: input.setupZip || null,
      zone_id: null,
      base_delivery_fee: deliveryFee,
      final_delivery_fee: deliveryFee,
      source: canonicalPricing.deliveryMode || "canonical_pricing",
    });

    if (deliveryCalculationResult.error) throw new Error(deliveryCalculationResult.error.message);

    const priceCalculationResult = await supabase.from("booking_price_calculations").insert({
      booking_id: booking.id,
      rental_subtotal: productsSubtotal,
      modifiers_subtotal: modifiersTotal,
      delivery_fee: deliveryFee,
      service_fee: 0,
      discount_amount: 0,
      taxable_amount: taxableAmount,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      non_taxable_amount: 0,
      total_amount: totalAmount,
      deposit_amount: depositAmount,
      balance_due: balanceDue,
      calculation_snapshot: {
        customer: { id: customer.id, name: customer.full_name, phone: customer.phone, email: customer.email },
        products: preparedItems.map((item) => ({
          id: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          subtotal: item.productSubtotal,
          options: item.selectedOptions.map((option: any) => ({
            modifier_group_id: option.modifier_group_id,
            modifier_group_name: option.group?.name,
            modifier_group_option_id: option.id,
            modifier_id: option.modifiers?.id,
            selected_quantity: Math.max(1, Math.floor(Number(option.selected_quantity || 1))),
            name: getOptionName(option),
            price: getOptionPrice(option),
            affects_inventory: option.modifiers?.affects_inventory ?? false,
          })),
        })),
        delivery: {
          fee: deliveryFee,
          source: canonicalPricing.deliveryMode || "canonical_pricing",
          distance_miles: canonicalPricing.distanceMiles,
          matched_zone_name: canonicalPricing.matchedZoneName,
          reason: canonicalPricing.deliveryReason,
        },
        marker_color: bookingMarkerColor,
        tax: { rate: taxRate, source: "canonical_pricing" },
        total: totalAmount,
      },
    });

    if (priceCalculationResult.error) throw new Error(priceCalculationResult.error.message);

    return {
      booking,
      bookingItem: bookingItems[0] || null,
      bookingItems,
      customer,
      reusedExistingBooking: false,
    };
  } catch (error) {
    await rollbackFailedBookingCreation({
      supabase,
      bookingId: String(booking.id),
      customerSelfService:
        input.provisionalCustomerCheckout === true,
    });
    throw error;
  }
}

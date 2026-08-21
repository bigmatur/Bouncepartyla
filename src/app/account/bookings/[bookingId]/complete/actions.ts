"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkBookingItemAvailabilityAction } from "@/lib/booking/check-booking-item-availability";
import { reserveInventoryForBooking } from "@/lib/booking/reserveInventory";
import { createClient } from "@/lib/supabase/server";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import { processNotificationQueueBestEffort } from "@/lib/notifications/engine";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildOrderSummaryHtml(values: {
  customerName: string;
  customerEmail: string;
  bookingNumber: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  setupAddress: string;
  setupCity: string;
  setupState: string;
  setupZip: string;
  itemSummary: string;
  subtotal: string;
  discountAmount: string;
  deliveryFee: string;
  taxAmount: string;
  totalAmount: string;
  depositAmount: string;
  balanceDue: string;
}) {
  return `
    <section style="border:1px solid #e7ddd0; border-radius:14px; padding:16px; margin-bottom:16px; background:#fcfaf7;">
      <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#9a7a49; font-weight:700;">Order Summary</div>
      <div style="margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px; color:#4b4339;">
        <div><strong>Customer:</strong> ${values.customerName}</div>
        <div><strong>Email:</strong> ${values.customerEmail || "-"}</div>
        <div><strong>Booking:</strong> ${values.bookingNumber}</div>
        <div><strong>Event date:</strong> ${values.eventDate}</div>
        <div><strong>Time:</strong> ${values.eventStartTime || "-"} - ${values.eventEndTime || "-"}</div>
        <div style="grid-column:1 / -1;"><strong>Address:</strong> ${values.setupAddress}, ${values.setupCity} ${values.setupState} ${values.setupZip}</div>
      </div>
      <div style="margin-top:10px; font-size:13px; color:#3f382f;"><strong>Equipment:</strong> ${values.itemSummary || "-"}</div>
      <div style="margin-top:10px; border-top:1px solid #e7ddd0; padding-top:10px; display:grid; gap:4px; font-size:13px; color:#3f382f;">
        <div><strong>Subtotal:</strong> $${values.subtotal}</div>
        <div><strong>Discount:</strong> $${values.discountAmount}</div>
        <div><strong>Delivery:</strong> $${values.deliveryFee}</div>
        <div><strong>Tax:</strong> $${values.taxAmount}</div>
        <div><strong>Total:</strong> $${values.totalAmount}</div>
        <div><strong>Deposit:</strong> $${values.depositAmount}</div>
        <div><strong>Balance due:</strong> $${values.balanceDue}</div>
      </div>
    </section>
  `;
}

async function ensureReservationsForFinalizedBooking(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  bookingId: string;
}) {
  const activeStatuses = ["reserved", "picked", "loaded", "delivered", "installed"];

  const existingReservationsResult = await params.supabase
    .from("inventory_reservations")
    .select("id")
    .eq("booking_id", params.bookingId)
    .in("status", activeStatuses)
    .limit(1);

  if (existingReservationsResult.error) {
    throw new Error(existingReservationsResult.error.message);
  }

  if ((existingReservationsResult.data || []).length > 0) {
    return;
  }

  const bookingResult = await params.supabase
    .from("bookings")
    .select("id, event_date, event_start_time, event_end_time")
    .eq("id", params.bookingId)
    .maybeSingle();

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  const booking = bookingResult.data as any;
  if (!booking?.id || !booking?.event_date) {
    return;
  }

  const eventDate = String(booking.event_date || "").trim();
  const eventStartTime = String(booking.event_start_time || "").slice(0, 5) || "09:00";
  const eventEndTime = String(booking.event_end_time || "").slice(0, 5) || "19:00";

  const bookingItemsResult = await params.supabase
    .from("booking_items")
    .select("id, product_id, quantity")
    .eq("booking_id", params.bookingId);

  if (bookingItemsResult.error) {
    throw new Error(bookingItemsResult.error.message);
  }

  const bookingItems = (bookingItemsResult.data || []) as Array<{
    id: string;
    product_id: string;
    quantity: number;
  }>;

  if (bookingItems.length === 0) {
    return;
  }

  const bookingItemIds = bookingItems.map((item) => item.id);

  const bookingModifiersResult = await params.supabase
    .from("booking_modifiers")
    .select("booking_item_id, modifier_id, quantity")
    .in("booking_item_id", bookingItemIds);

  if (bookingModifiersResult.error) {
    throw new Error(bookingModifiersResult.error.message);
  }

  const bookingModifiers = (bookingModifiersResult.data || []) as Array<{
    booking_item_id: string;
    modifier_id: string;
    quantity: number;
  }>;

  const modifierIds = Array.from(
    new Set(
      bookingModifiers
        .map((row) => String(row.modifier_id || "").trim())
        .filter(Boolean),
    ),
  );

  const modifiersById = new Map<string, any>();

  if (modifierIds.length > 0) {
    const modifiersResult = await params.supabase
      .from("modifiers")
      .select("id, name, inventory_item_id, inventory_quantity, track_inventory")
      .in("id", modifierIds);

    if (modifiersResult.error) {
      throw new Error(modifiersResult.error.message);
    }

    for (const modifier of modifiersResult.data || []) {
      modifiersById.set(String((modifier as any).id), modifier);
    }
  }

  for (const bookingItem of bookingItems) {
    const itemModifierRows = bookingModifiers.filter(
      (row) => row.booking_item_id === bookingItem.id,
    );

    const formData = new FormData();
    formData.set("productId", String(bookingItem.product_id));
    formData.set("quantity", String(Math.max(1, Number(bookingItem.quantity || 1))));
    formData.set("eventDate", eventDate);
    formData.set("eventStartTime", eventStartTime);
    formData.set("eventEndTime", eventEndTime);
    formData.set("bookingActor", "customer");

    const modifierPayload = itemModifierRows
      .map((row) => {
        const modifier = modifiersById.get(String(row.modifier_id || ""));
        if (!modifier) {
          return null;
        }

        return {
          id: String(modifier.id || ""),
          name: String(modifier.name || "Option"),
          inventoryItemId: String(modifier.inventory_item_id || ""),
          inventoryQuantity: Number(modifier.inventory_quantity || 1),
          trackInventory: modifier.track_inventory !== false,
          selectedQuantity: Math.max(1, Number(row.quantity || 1)),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      inventoryItemId: string;
      inventoryQuantity: number;
      trackInventory: boolean;
      selectedQuantity: number;
    }>;

    formData.set("modifierCount", String(modifierPayload.length));

    modifierPayload.forEach((modifier, index) => {
      formData.set(`modifierOptionId_${index}`, modifier.id);
      formData.set(`modifierOptionName_${index}`, modifier.name);
      formData.set(`modifierInventoryItemId_${index}`, modifier.inventoryItemId);
      formData.set(`modifierInventoryQuantity_${index}`, String(modifier.inventoryQuantity));
      formData.set(
        `modifierTrackInventory_${index}`,
        modifier.trackInventory ? "true" : "false",
      );
    });

    const availability = await checkBookingItemAvailabilityAction(formData);

    if (!availability?.available) {
      throw new Error(
        String(
          availability?.message ||
            "Inventory is not available while finalizing booking.",
        ),
      );
    }

    const reservedFrom = String(availability.reservedFrom || "").trim();
    const reservedUntil = String(availability.reservedUntil || "").trim();

    if (!reservedFrom || !reservedUntil) {
      throw new Error("Failed to build inventory reservation window.");
    }

    const selectedModifierIds = modifierPayload.map((item) => item.id).filter(Boolean);
    const modifierQuantityMultipliers = Object.fromEntries(
      modifierPayload.map((item) => [item.id, item.selectedQuantity]),
    );

    await reserveInventoryForBooking({
      supabase: params.supabase,
      bookingId: params.bookingId,
      bookingItemId: String(bookingItem.id),
      productId: String(bookingItem.product_id),
      modifierIds: selectedModifierIds,
      modifierQuantityMultipliers,
      quantity: Math.max(1, Number(bookingItem.quantity || 1)),
      reservedFrom,
      reservedUntil,
    });
  }
}

export async function signTemporaryBookingContractAction(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  const signerName = text(formData, "signerName");
  const accepted = formData.get("accepted") === "on";
  const signatureDataUrl = text(formData, "signatureDataUrl");

  if (!bookingId || !signerName || !accepted || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureDataUrl)) {
    redirect(`/account/bookings/${bookingId}?complete=1&error=signature_required`);
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user?.email) {
    redirect(`/account/login?next=${encodeURIComponent(`/account/bookings/${bookingId}?complete=1`)}`);
  }

  const { data: bookingDetailsResult } = await supabase.rpc(
    "get_my_booking_details",
    {
      p_booking_id: bookingId,
    },
  );

  const bookingDetails =
    bookingDetailsResult && typeof bookingDetailsResult === "object"
      ? (bookingDetailsResult as any)
      : null;

  const bookingFromRpc = bookingDetails?.booking || null;
  const itemsFromRpc = Array.isArray(bookingDetails?.items)
    ? bookingDetails.items
    : [];

  let booking = bookingFromRpc;
  let items = itemsFromRpc;

  // Fallback for environments where the RPC is unavailable.
  if (!booking) {
    const [bookingResult, itemsResult] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, customer_id, booking_number, event_date, event_start_time, event_end_time, setup_address, setup_city, setup_state, setup_zip, subtotal, discount_amount, delivery_fee, tax_amount, total_amount, deposit_amount, balance_due",
        )
        .eq("id", bookingId)
        .maybeSingle(),
      supabase
        .from("booking_items")
        .select("quantity, products(name)")
        .eq("booking_id", bookingId),
    ]);

    booking = bookingResult.data;
    items = itemsResult.data || [];
  }

  if (!booking) {
    redirect(`/account/bookings/${bookingId}?complete=1&error=booking_not_found`);
  }

  const [{ data: customer }, { data: contractSettings }] = await Promise.all([
    booking.customer_id
      ? supabase.from("customers").select("full_name, email").eq("id", booking.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("booking_contract_settings")
      .select("template_html, signature_label")
      .limit(1)
      .maybeSingle(),
  ]);

  const profileResult = await supabase.rpc("get_my_customer_profile");
  const profile = Array.isArray(profileResult.data)
    ? profileResult.data[0]
    : profileResult.data;
  const profileFullName = String(profile?.full_name || "").trim();
  const profileFirst = String(profile?.first_name || "").trim();
  const profileLast = String(profile?.last_name || "").trim();
  const profileName = [profileFirst, profileLast].filter(Boolean).join(" ").trim();

  const signedAt = new Date().toISOString();
  const signerDate = signedAt.slice(0, 10);
  const itemSummary = (items || [])
    .map((item: any) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      const itemName =
        product?.name ||
        item?.product_name ||
        "Product";

      return `${escapeHtml(itemName)} × ${Number(item.quantity || 1)}`;
    })
    .join(", ");

  const template = String(
    contractSettings?.template_html ||
      "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>{{signature_label}}: {{signature_manual}}</p><p>Date: {{signature_date}}</p>"
  );

  const resolvedCustomerName = escapeHtml(
    String(
      customer?.full_name ||
        profileFullName ||
        profileName ||
        booking?.customer_name ||
        signerName ||
        "Customer",
    ),
  );
  const resolvedCustomerEmail = escapeHtml(
    String(user.email || customer?.email || ""),
  );
  const resolvedBookingNumber = escapeHtml(
    String(booking.booking_number || booking.id),
  );
  const resolvedEventDate = escapeHtml(String(booking.event_date || ""));
  const resolvedEventStart = escapeHtml(
    String(booking.event_start_time || ""),
  );
  const resolvedEventEnd = escapeHtml(String(booking.event_end_time || ""));
  const resolvedSetupAddress = escapeHtml(
    String(booking.setup_address || ""),
  );
  const resolvedSetupCity = escapeHtml(String(booking.setup_city || ""));
  const resolvedSetupState = escapeHtml(String(booking.setup_state || ""));
  const resolvedSetupZip = escapeHtml(String(booking.setup_zip || ""));
  const resolvedSubtotal = Number(booking.subtotal || 0).toFixed(2);
  const resolvedDiscount = Number(booking.discount_amount || 0).toFixed(2);
  const resolvedDelivery = Number(booking.delivery_fee || 0).toFixed(2);
  const resolvedTax = Number(booking.tax_amount || 0).toFixed(2);
  const resolvedTotal = Number(booking.total_amount || 0).toFixed(2);
  const resolvedDeposit = Number(booking.deposit_amount || 0).toFixed(2);
  const resolvedBalance = Number(booking.balance_due || 0).toFixed(2);

  const orderInfoBlock = buildOrderSummaryHtml({
    customerName: resolvedCustomerName,
    customerEmail: resolvedCustomerEmail,
    bookingNumber: resolvedBookingNumber,
    eventDate: resolvedEventDate,
    eventStartTime: resolvedEventStart,
    eventEndTime: resolvedEventEnd,
    setupAddress: resolvedSetupAddress,
    setupCity: resolvedSetupCity,
    setupState: resolvedSetupState,
    setupZip: resolvedSetupZip,
    itemSummary,
    subtotal: resolvedSubtotal,
    discountAmount: resolvedDiscount,
    deliveryFee: resolvedDelivery,
    taxAmount: resolvedTax,
    totalAmount: resolvedTotal,
    depositAmount: resolvedDeposit,
    balanceDue: resolvedBalance,
  });

  const values: Record<string, string> = {
    customer_name: resolvedCustomerName,
    customer_email: resolvedCustomerEmail,
    booking_number: resolvedBookingNumber,
    event_date: resolvedEventDate,
    event_start_time: resolvedEventStart,
    event_end_time: resolvedEventEnd,
    setup_address: resolvedSetupAddress,
    setup_city: resolvedSetupCity,
    setup_state: resolvedSetupState,
    setup_zip: resolvedSetupZip,
    items_summary: itemSummary,
    subtotal: resolvedSubtotal,
    discount_amount: resolvedDiscount,
    delivery_fee: resolvedDelivery,
    tax_amount: resolvedTax,
    total_amount: resolvedTotal,
    deposit_amount: resolvedDeposit,
    balance_due: resolvedBalance,
    signature_label: escapeHtml(String(contractSettings?.signature_label || "Client signature")),
    signature_name: escapeHtml(signerName),
    signature_manual: `<img src="${signatureDataUrl}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`,
    signature_date: signerDate,
  };

  const renderedTemplate = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
  const renderedHtml = `${orderInfoBlock}${renderedTemplate}`;
  const documentHash = createHash("sha256").update(renderedHtml).digest("hex");

  const { data: signResult, error: signError } = await supabase.rpc(
    "sign_temporary_booking_contract",
    {
      p_booking_id: bookingId,
      p_signer_name: signerName,
      p_rendered_html: renderedHtml,
      p_document_hash: documentHash,
      p_signature_image_data_url: signatureDataUrl,
    },
  );

  if (signError) {
    redirect(`/account/bookings/${bookingId}?complete=1&error=${encodeURIComponent(signError.message)}`);
  }

  const signed = signResult as { success?: boolean; status?: string } | null;
  if (!signed?.success) {
    redirect(`/account/bookings/${bookingId}?complete=1&status=${encodeURIComponent(signed?.status || "sign_failed")}`);
  }

  await processNotificationQueueBestEffort({ bookingId, limit: 20 });
  revalidatePath(`/account/bookings/${bookingId}`);
  redirect(`/account/bookings/${bookingId}?complete=1&signed=1`);
}

export async function recordTemporaryBookingDepositAction(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  const amount = Number(text(formData, "amount"));
  const supabase = await createClient();

  if (!bookingId || !Number.isFinite(amount) || amount <= 0) {
    redirect(`/account/bookings/${bookingId}?complete=1&status=invalid_payment`);
  }

  // Query through the customer's authenticated Supabase session/RLS.
  const bookingResult = await supabase
    .from("bookings")
    .select("id, booking_number, balance_due")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingResult.error || !bookingResult.data) {
    redirect(`/account/bookings/${bookingId}?complete=1&status=booking_not_found`);
  }

  const safeAmount = Math.min(amount, Math.max(0, Number((bookingResult.data as any).balance_due || amount)));
  const session = await createStripeCheckoutSession({
    bookingId,
    amount: safeAmount,
    baseAmount: safeAmount,
    tipAmount: 0,
    source: "customer_temporary_deposit",
    successPath: `/account/bookings/${bookingId}?complete=1`,
    cancelPath: `/account/bookings/${bookingId}?complete=1`,
    description: `Bounce Party LA deposit ${(bookingResult.data as any).booking_number || String(bookingId).slice(0, 8)}`,
  });

  revalidatePath(`/account/bookings/${bookingId}`);
  redirect(session.url);
}

export async function finalizeTemporaryBookingAction(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("finalize_temporary_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    redirect(`/account/bookings/${bookingId}?complete=1&error=${encodeURIComponent(error.message)}`);
  }

  const result = data as { success?: boolean; status?: string } | null;
  revalidatePath(`/account/bookings/${bookingId}`);

  if (result?.success) {
    try {
      await ensureReservationsForFinalizedBooking({
        supabase,
        bookingId,
      });
    } catch (inventoryError: any) {
      redirect(
        `/account/bookings/${bookingId}?confirmed=1&inventoryWarning=${encodeURIComponent(
          String(inventoryError?.message || "inventory_reservation_failed"),
        )}`,
      );
    }

    redirect(`/account/bookings/${bookingId}?confirmed=1`);
  }

  redirect(`/account/bookings/${bookingId}?complete=1&status=${encodeURIComponent(result?.status || "not_ready")}`);
}

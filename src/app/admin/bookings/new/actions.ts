"use server";

import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getUnifiedAccess } from "@/lib/auth/access";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import {
  enqueueBookingNotification,
  processNotificationQueueBestEffort,
} from "@/lib/notifications/engine";
import { validateBookingItemsAvailability } from "@/features/booking/server/validate-booking-items-availability";
import { insertBookingIdempotently } from "@/features/booking/server/booking-persistence";
import { createBookingCompletionSession } from "@/features/booking/server/booking-completion-session";
import {
  attachAvailabilityToBookingItems,
  groupModifierSelectionsByProductId,
  normalizeBookingItemRequests,
} from "@/features/booking/server/normalize-booking-request";
import {
  getBookingFormBoolean as getBooleanString,
  getBookingFormNullableString as getNullableString,
  getBookingFormNumber as getNumber,
  getBookingFormString as getString,
  parseBookingModifierItems,
  parseBookingProductItems,
  type ParsedBookingModifierItem,
  type ParsedBookingProductItem,
} from "@/lib/booking/form-data";

type ParsedBookingItem = ParsedBookingProductItem;
type ParsedModifierItem = ParsedBookingModifierItem;

type BookingActor = "customer" | "cashier";

type BookingStatus =
  | "draft"
  | "quote"
  | "pending_deposit"
  | "booked"
  | "scheduled"
  | "inventory_reserved"
  | "picking"
  | "loaded"
  | "out_for_delivery"
  | "installed"
  | "pickup_scheduled"
  | "picked_up"
  | "returned"
  | "cleaning"
  | "closed"
  | "cancelled"
  | "refunded";

const PARK_VENUE_MARKER_COLOR = "#2f6fa3";

function calculateBookingWindow({
  eventDate,
  eventStartTime,
  eventEndTime,
}: {
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
}) {
  return {
    reservedFrom: `${eventDate}T${eventStartTime}:00`,
    reservedUntil: `${eventDate}T${eventEndTime}:00`,
  };
}

function timeToMinutes(value: string) {
  const [hoursRaw, minutesRaw] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);

  return hours * 60 + minutes;
}

function isValidTimeString(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "").trim(),
  );
}

function parseBookingActor(value: string): BookingActor {
  return value === "customer" ? "customer" : "cashier";
}

function normalizeBookingStatus(value: string): BookingStatus {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "pending") return "pending_deposit";
  if (raw === "confirmed") return "booked";
  if (raw === "paid") return "booked";
  if (raw === "completed") return "closed";
  if (raw === "failed") return "cancelled";

  const allowed: BookingStatus[] = [
    "draft",
    "quote",
    "pending_deposit",
    "booked",
    "scheduled",
    "inventory_reserved",
    "picking",
    "loaded",
    "out_for_delivery",
    "installed",
    "pickup_scheduled",
    "picked_up",
    "returned",
    "cleaning",
    "closed",
    "cancelled",
    "refunded",
  ];

  return allowed.includes(raw as BookingStatus)
    ? (raw as BookingStatus)
    : "inventory_reserved";
}

function normalizeMarkerText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHexColor(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();

  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

async function resolveLocationMarkerColor(params: {
  supabase: any;
  modifiers: ParsedModifierItem[];
}) {
  const { supabase, modifiers } = params;

  const optionIds = Array.from(
    new Set(
      modifiers
        .map((modifier) =>
          String(modifier.modifierOptionId || "").trim(),
        )
        .filter(Boolean),
    ),
  );

  if (optionIds.length > 0) {
    const optionsResult = await supabase
      .from("modifier_group_options")
      .select("id, marker_color")
      .in("id", optionIds);

    if (optionsResult.error) {
      if (
        !isMissingColumnError(
          optionsResult.error,
          "modifier_group_options",
          "marker_color",
        )
      ) {
        throw new Error(optionsResult.error.message);
      }
    } else {
      for (const row of optionsResult.data || []) {
        const color = normalizeHexColor((row as any).marker_color);

        if (color) {
          return color;
        }
      }
    }
  }

  for (const modifier of modifiers) {
    const groupText = normalizeMarkerText(
      modifier.modifierGroupName,
    );
    const optionText = normalizeMarkerText(
      modifier.modifierOptionName,
    );
    const combinedText = `${groupText} ${optionText}`.trim();

    const isLocationGroup =
      groupText.includes("location") ||
      groupText.includes("venue") ||
      groupText.includes("setup");

    const isParkVenueOption =
      optionText.includes("park") ||
      optionText.includes("venue") ||
      combinedText.includes("park venue");

    if (isLocationGroup && isParkVenueOption) {
      return PARK_VENUE_MARKER_COLOR;
    }
  }

  return null;
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

function isMissingFunctionError(error: any, functionName?: string) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const target = String(functionName || "").toLowerCase();

  if (code === "42883") {
    if (!target) {
      return true;
    }

    return message.includes(target);
  }

  return (
    message.includes("function") &&
    message.includes("does not exist") &&
    (!target || message.includes(target))
  );
}

function isRefreshPaymentTotalsPermissionError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42501" &&
    message.includes("permission denied for function") &&
    message.includes("refresh_booking_payment_totals")
  );
}

function isUniqueConflictError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "23505" ||
    message.includes("duplicate key value")
  );
}

function isMissingColumnError(
  error: any,
  tableName: string,
  columnName: string,
) {
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

function isContractsAuditColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();

  return (
    isMissingColumnError(
      error,
      "contracts",
      "rendered_html",
    ) ||
    isMissingColumnError(
      error,
      "contracts",
      "template_version",
    ) ||
    isMissingColumnError(
      error,
      "contracts",
      "signature_text",
    ) ||
    isMissingColumnError(
      error,
      "contracts",
      "signature_date",
    ) ||
    isMissingColumnError(
      error,
      "contracts",
      "signer_ip",
    ) ||
    isMissingColumnError(
      error,
      "contracts",
      "signer_user_agent",
    ) ||
    isMissingColumnError(
      error,
      "contracts",
      "signature_metadata",
    ) ||
    (
      message.includes("contracts") &&
      message.includes("schema cache") &&
      message.includes("column")
    )
  );
}

function isValidPasswordHash(
  stored: string | null | undefined,
  candidate: string,
) {
  if (!stored || !candidate) {
    return false;
  }

  const [salt, savedHash] = String(stored).split(":");

  if (!salt || !savedHash) {
    return false;
  }

  const computedHash = scryptSync(
    candidate,
    salt,
    64,
  ).toString("hex");

  try {
    return timingSafeEqual(
      Buffer.from(savedHash, "hex"),
      Buffer.from(computedHash, "hex"),
    );
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

  if (
    error &&
    !isMissingTableError(error) &&
    !isMissingFunctionError(error, "get_discount_security_settings")
  ) {
    throw new Error(error.message);
  }

  return (
    (data as { discount_password_enabled: boolean; discount_password_hash: string | null } | null) || {
      discount_password_enabled: false,
      discount_password_hash: null,
    }
  );
}

async function getContractSettings() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("booking_contract_settings")
    .select(
      "template_html, require_contract_before_payment, require_typed_signature, signature_label",
    )
    .limit(1)
    .maybeSingle();

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }

  return (
    data || {
      template_html:
        "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>",
      require_contract_before_payment: true,
      require_typed_signature: true,
      signature_label: "Client signature",
    }
  );
}

async function getReceiptDesignSettings() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("booking_receipt_design_settings")
    .select(
      "logo_url, brand_name, accent_color, receipt_title, footer_text",
    )
    .limit(1)
    .maybeSingle();

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }

  return (
    data || {
      logo_url: null,
      brand_name: "Bounce Party LA",
      accent_color: "#23313f",
      receipt_title: "Payment Receipt",
      footer_text: "Thank you for booking with us!",
    }
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(value) ? value : 0);
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    String(process.env.SMTP_SECURE || "true").toLowerCase() ===
    "true";
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from =
    process.env.BOOKING_FROM_EMAIL ||
    process.env.FROM_EMAIL ||
    user;

  if (
    !host ||
    !user ||
    !password ||
    !from ||
    !params.to
  ) {
    throw new Error(
      "SMTP email sending is not configured",
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass: password,
    },
  });

  await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

function buildReceiptHtml(params: {
  design: {
    logo_url?: string | null;
    brand_name?: string | null;
    accent_color?: string | null;
    receipt_title?: string | null;
    footer_text?: string | null;
  };
  bookingNumber: string;
  customerName: string;
  customerEmail: string;
  eventDate: string;
  paymentMethod: string;
  paymentReference: string;
  paymentAmount: number;
  tipAmount: number;
  totalPaid: number;
}) {
  const accent =
    params.design.accent_color || "#23313f";

  const logo = params.design.logo_url
    ? `<img src="${escapeHtml(
        params.design.logo_url,
      )}" alt="logo" style="height:44px;width:44px;border-radius:10px;object-fit:cover;" />`
    : "";

  return `
    <div style="font-family:Arial,sans-serif;background:#f8f6f3;padding:24px;color:#221f1b;">
      <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e7ddd0;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 20px;background:${escapeHtml(
          accent,
        )};color:#fff;display:flex;align-items:center;gap:12px;">
          ${logo}
          <div>
            <div style="font-size:18px;font-weight:700;">${escapeHtml(
              params.design.brand_name ||
                "Bounce Party LA",
            )}</div>
            <div style="font-size:12px;opacity:0.85;">${escapeHtml(
              params.design.receipt_title ||
                "Payment Receipt",
            )}</div>
          </div>
        </div>

        <div style="padding:18px 20px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;color:#4a433a;">
            <div><strong>Booking:</strong> ${escapeHtml(
              params.bookingNumber,
            )}</div>
            <div><strong>Event date:</strong> ${escapeHtml(
              params.eventDate,
            )}</div>
            <div><strong>Customer:</strong> ${escapeHtml(
              params.customerName,
            )}</div>
            <div><strong>Email:</strong> ${escapeHtml(
              params.customerEmail,
            )}</div>
            <div><strong>Payment method:</strong> ${escapeHtml(
              params.paymentMethod,
            )}</div>
            <div><strong>Reference:</strong> ${escapeHtml(
              params.paymentReference || "-",
            )}</div>
          </div>

          <div style="margin-top:14px;border-top:1px solid #e7ddd0;padding-top:12px;font-size:14px;color:#2b251f;display:grid;gap:6px;">
            <div style="display:flex;justify-content:space-between;"><span>Payment amount</span><strong>${money(
              params.paymentAmount,
            )}</strong></div>
            <div style="display:flex;justify-content:space-between;"><span>Tip</span><strong>${money(
              params.tipAmount,
            )}</strong></div>
            <div style="display:flex;justify-content:space-between;font-size:16px;"><span>Total paid</span><strong>${money(
              params.totalPaid,
            )}</strong></div>
          </div>

          <div style="margin-top:16px;font-size:12px;color:#6a6156;">
            ${escapeHtml(
              params.design.footer_text ||
                "Thank you for booking with us!",
            )}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderContractTemplate({
  template,
  values,
}: {
  template: string;
  values: Record<string, string>;
}) {
  return template.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_, key) => {
      return values[key] ?? "";
    },
  );
}

function isPngDataUrl(value: string) {
  return /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(
    String(value || ""),
  );
}

function toSha256(value: string) {
  return createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

async function validateBookingTimePolicy(params: {
  bookingActor: BookingActor;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
}) {
  if (!params.eventDate) {
    throw new Error("Choose event date.");
  }

  if (
    !isValidTimeString(params.eventStartTime) ||
    !isValidTimeString(params.eventEndTime)
  ) {
    throw new Error(
      "Choose valid start and end time.",
    );
  }

  const startMinutes = timeToMinutes(
    params.eventStartTime,
  );
  const endMinutes = timeToMinutes(
    params.eventEndTime,
  );

  if (endMinutes <= startMinutes) {
    throw new Error(
      "End time must be later than start time.",
    );
  }

  if (
    startMinutes % 30 !== 0 ||
    endMinutes % 30 !== 0
  ) {
    throw new Error(
      "Time must be selected in 30-minute increments.",
    );
  }

  if (params.bookingActor !== "customer") {
    return;
  }

  const supabase = await createClient();

  const {
    data: exception,
    error: exceptionError,
  } = await supabase
    .from("warehouse_working_hour_exceptions")
    .select("is_open, open_time, close_time")
    .eq("exception_date", params.eventDate)
    .maybeSingle();

  if (exceptionError) {
    throw new Error(exceptionError.message);
  }

  let isOpen = true;
  let openTime = "08:00";
  let closeTime = "21:00";

  if (exception) {
    isOpen = exception.is_open !== false;
    openTime = exception.open_time
      ? String(exception.open_time).slice(0, 5)
      : openTime;
    closeTime = exception.close_time
      ? String(exception.close_time).slice(0, 5)
      : closeTime;
  } else {
    const dayOfWeek = new Date(
      `${params.eventDate}T00:00:00`,
    ).getDay();

    const {
      data: workingHour,
      error: workingHourError,
    } = await supabase
      .from("warehouse_working_hours")
      .select("is_open, open_time, close_time")
      .eq("day_of_week", dayOfWeek)
      .maybeSingle();

    if (workingHourError) {
      throw new Error(workingHourError.message);
    }

    if (workingHour) {
      isOpen = workingHour.is_open !== false;
      openTime = workingHour.open_time
        ? String(workingHour.open_time).slice(0, 5)
        : openTime;
      closeTime = workingHour.close_time
        ? String(workingHour.close_time).slice(0, 5)
        : closeTime;
    }
  }

  if (!isOpen) {
    throw new Error(
      "Customer bookings are not available on this date.",
    );
  }

  const openMinutes = timeToMinutes(openTime);
  const closeMinutes = timeToMinutes(closeTime);

  if (
    startMinutes < openMinutes ||
    endMinutes > closeMinutes
  ) {
    throw new Error(
      `Customer bookings are only available from ${openTime} to ${closeTime}.`,
    );
  }
}

async function ensureCustomer({
  existingCustomerId,
  customerFirstName,
  customerLastName,
  customerName,
  customerPhone,
  customerEmail,
}: {
  existingCustomerId: string;
  customerFirstName: string;
  customerLastName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}) {
  const supabase = await createClient();

  const fullName =
    `${customerFirstName} ${customerLastName}`.trim() ||
    customerName;

  if (existingCustomerId) {
    const { data: customer, error } = await supabase
      .from("customers")
      .select("id")
      .eq("id", existingCustomerId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!customer?.id) {
      throw new Error(
        "Selected customer was not found.",
      );
    }

    const updateResult = await supabase
      .from("customers")
      .update({
        full_name: fullName,
        phone: customerPhone,
        email: customerEmail,
      })
      .eq("id", existingCustomerId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    return customer.id as string;
  }

  if (!fullName) {
    throw new Error(
      "Choose existing customer or enter customer name.",
    );
  }

  const {
    data: createdCustomer,
    error,
  } = await supabase
    .from("customers")
    .insert({
      full_name: fullName,
      phone: customerPhone,
      email: customerEmail,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return createdCustomer.id as string;
}

async function validateRequiredModifierGroups({
  items,
  modifiers,
}: {
  items: ParsedBookingItem[];
  modifiers: ParsedModifierItem[];
}) {
  const supabase = await createClient();

  const productIds = items.map(
    (item) => item.productId,
  );

  if (productIds.length === 0) {
    return;
  }

  const {
    data: requiredGroups,
    error,
  } = await supabase
    .from("product_modifier_groups")
    .select(
      `
      id,
      product_id,
      modifier_group_id,
      required,
      active,
      modifier_groups (
        id,
        name,
        active,
        required_by_default
      )
    `,
    )
    .in("product_id", productIds)
    .neq("active", false);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of requiredGroups || []) {
    const group = Array.isArray(
      (row as any).modifier_groups,
    )
      ? (row as any).modifier_groups[0]
      : (row as any).modifier_groups;

    const isRequired =
      (row as any).required === true ||
      group?.required_by_default === true;

    const isActive =
      (row as any).active !== false &&
      group?.active !== false;

    if (!isRequired || !isActive) {
      continue;
    }

    const selected = modifiers.some(
      (modifier) =>
        modifier.productId ===
          (row as any).product_id &&
        modifier.modifierGroupId ===
          (row as any).modifier_group_id,
    );

    if (!selected) {
      throw new Error(
        `Choose required option: ${
          group?.name || "required option group"
        }.`,
      );
    }
  }
}

async function validateModifierInventory({
  modifiers,
  items,
  availabilityResults,
}: {
  modifiers: ParsedModifierItem[];
  items: ParsedBookingItem[];
  availabilityResults: Array<{
    reservedFrom: string;
    reservedUntil: string;
    components: any[];
  }>;
}) {
  const supabase = await createClient();

  const reservationWindowByProduct = new Map<
    string,
    {
      reservedFrom: string;
      reservedUntil: string;
    }
  >();

  for (
    let index = 0;
    index < items.length;
    index += 1
  ) {
    const item = items[index];
    const availability =
      availabilityResults[index];

    if (
      !availability?.reservedFrom ||
      !availability?.reservedUntil
    ) {
      continue;
    }

    reservationWindowByProduct.set(
      item.productId,
      {
        reservedFrom: availability.reservedFrom,
        reservedUntil:
          availability.reservedUntil,
      },
    );
  }

  for (const modifier of modifiers) {
    if (
      !modifier.trackInventory ||
      !modifier.inventoryItemId
    ) {
      continue;
    }

    const productQty =
      items.find(
        (item) =>
          item.productId === modifier.productId,
      )?.quantity || 1;

    const selectedModifierQty = Math.max(
      1,
      Number(modifier.quantity || 1),
    );

    const quantityNeeded =
      modifier.inventoryQuantity *
      productQty *
      selectedModifierQty;

    if (quantityNeeded <= 0) {
      continue;
    }

    const window =
      reservationWindowByProduct.get(
        modifier.productId,
      );

    if (!window) {
      throw new Error(
        `Missing reservation window for option "${modifier.modifierOptionName}".`,
      );
    }

    const {
      data: inventoryItem,
      error: itemError,
    } = await supabase
      .from("inventory_items")
      .select(
        `
        id,
        name,
        tracking_type,
        quantity_on_hand,
        quantity_available,
        active
      `,
      )
      .eq("id", modifier.inventoryItemId)
      .maybeSingle();

    if (itemError) {
      throw new Error(itemError.message);
    }

    if (!inventoryItem) {
      throw new Error(
        `Inventory item for option "${modifier.modifierOptionName}" was not found.`,
      );
    }

    if ((inventoryItem as any).active === false) {
      throw new Error(
        `Inventory item "${(inventoryItem as any).name}" is inactive.`,
      );
    }

    const {
      data: overlappingReservations,
      error: reservationsError,
    } = await supabase
      .from("inventory_reservations")
      .select("inventory_unit_id, quantity")
      .eq(
        "inventory_item_id",
        modifier.inventoryItemId,
      )
      .in("status", [
        "reserved",
        "picked",
        "loaded",
        "installed",
      ])
      .lt(
        "reserved_from",
        window.reservedUntil,
      )
      .gt(
        "reserved_until",
        window.reservedFrom,
      );

    if (reservationsError) {
      throw new Error(
        reservationsError.message,
      );
    }

    const trackingType = String(
      (inventoryItem as any).tracking_type ||
        "quantity",
    );

    if (
      trackingType === "quantity" ||
      trackingType === "consumable"
    ) {
      const reservedQuantity = (
        overlappingReservations || []
      ).reduce(
        (sum: number, row: any) =>
          sum + Number(row.quantity || 0),
        0,
      );

      const totalQuantity = Number(
        (inventoryItem as any)
          .quantity_on_hand ??
          (inventoryItem as any)
            .quantity_available ??
          0,
      );

      const availableQuantity = Math.max(
        0,
        totalQuantity - reservedQuantity,
      );

      if (
        availableQuantity < quantityNeeded
      ) {
        throw new Error(
          `Not enough stock for option "${modifier.modifierOptionName}". Need ${quantityNeeded}, available ${availableQuantity} for the selected dates.`,
        );
      }

      continue;
    }

    const reservedUnitIds = new Set(
      (overlappingReservations || [])
        .map(
          (row: any) =>
            row.inventory_unit_id,
        )
        .filter(Boolean)
        .map(String),
    );

    const { data: units, error: unitsError } =
      await supabase
        .from("inventory_units")
        .select("id, status, retired_at")
        .eq(
          "inventory_item_id",
          modifier.inventoryItemId,
        )
        .is("retired_at", null)
        .not(
          "status",
          "in",
          "(retired,lost,damaged,maintenance)",
        );

    if (unitsError) {
      throw new Error(unitsError.message);
    }

    const availableUnits = (units || []).filter(
      (unit: any) =>
        !reservedUnitIds.has(
          String(unit.id),
        ),
    );

    if (
      availableUnits.length < quantityNeeded
    ) {
      throw new Error(
        `Not enough available units for option "${modifier.modifierOptionName}". Need ${quantityNeeded}, available ${availableUnits.length} for the selected dates.`,
      );
    }
  }
}

async function insertBookingItems({
  bookingId,
  items,
}: {
  bookingId: string;
  items: ParsedBookingItem[];
}) {
  const supabase = await createClient();

  const rows = items.map((item) => ({
    booking_id: bookingId,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    subtotal: Number(
      (
        item.quantity * item.unitPrice
      ).toFixed(2),
    ),
    notes: item.lineNotes,
  }));

  let { data, error } = await supabase
    .from("booking_items")
    .insert(rows)
    .select("id, product_id");

  if (
    error &&
    isMissingColumnError(
      error,
      "booking_items",
      "subtotal",
    )
  ) {
    const fallbackRows = rows.map((row) => {
      const copy = {
        ...row,
      } as Record<string, any>;

      copy.line_total = copy.subtotal;
      delete copy.subtotal;

      return copy;
    });

    const fallbackResult = await supabase
      .from("booking_items")
      .insert(fallbackRows)
      .select("id, product_id");

    data = fallbackResult.data as typeof data;
    error = fallbackResult.error;
  }

  if (
    error &&
    isMissingColumnError(
      error,
      "booking_items",
      "notes",
    )
  ) {
    const fallbackRows = rows.map((row) => {
      const copy = {
        ...row,
      } as Record<string, any>;

      if ("subtotal" in copy) {
        copy.line_total = copy.subtotal;
        delete copy.subtotal;
      }

      delete copy.notes;

      return copy;
    });

    const fallbackResult = await supabase
      .from("booking_items")
      .insert(fallbackRows)
      .select("id, product_id");

    data = fallbackResult.data as typeof data;
    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as Array<{
    id: string;
    product_id: string;
  }>;
}

async function reserveProductComponentsInventory({
  bookingId,
  items,
  insertedBookingItems,
  availabilityResults,
}: {
  bookingId: string;
  items: ParsedBookingItem[];
  insertedBookingItems: Array<{
    id: string;
    product_id: string;
  }>;
  availabilityResults: Array<{
    reservedFrom: string;
    reservedUntil: string;
    components: any[];
  }>;
}) {
  const supabase = await createClient();

  const bookingItemsByProduct = new Map<
    string,
    Array<{
      id: string;
      product_id: string;
    }>
  >();

  for (const row of insertedBookingItems) {
    const queue =
      bookingItemsByProduct.get(
        row.product_id,
      ) || [];

    queue.push(row);

    bookingItemsByProduct.set(
      row.product_id,
      queue,
    );
  }

  for (
    let index = 0;
    index < items.length;
    index += 1
  ) {
    const item = items[index];

    const queue =
      bookingItemsByProduct.get(
        item.productId,
      ) || [];

    const bookingItem = queue.shift();

    bookingItemsByProduct.set(
      item.productId,
      queue,
    );

    const availability =
      availabilityResults[index];

    let insertedReservationsForItem = 0;

    if (!bookingItem || !availability) {
      continue;
    }

    if (
      !availability.reservedFrom ||
      !availability.reservedUntil
    ) {
      throw new Error(
        "Missing reservation window for product components.",
      );
    }

    const requiredReservableComponents = (
      availability.components || []
    ).filter(
      (component: any) =>
        component?.isRequired !== false &&
        String(
          component?.inventoryItemId || "",
        ).trim().length > 0 &&
        Math.max(
          0,
          Number(
            component?.quantityNeeded || 0,
          ),
        ) > 0,
    );

    for (
      const component of
      availability.components || []
    ) {
      if (
        component?.isRequired === false
      ) {
        continue;
      }

      const inventoryItemId = String(
        component?.inventoryItemId || "",
      );

      if (!inventoryItemId) {
        continue;
      }

      const quantityNeeded = Math.max(
        0,
        Number(
          component?.quantityNeeded || 0,
        ),
      );

      if (quantityNeeded <= 0) {
        continue;
      }

      const trackingType = String(
        component?.trackingType ||
          "serialized",
      );

      if (
        trackingType === "quantity" ||
        trackingType === "consumable"
      ) {
        const { error } = await supabase
          .from("inventory_reservations")
          .insert({
            booking_id: bookingId,
            booking_item_id:
              bookingItem.id,
            inventory_item_id:
              inventoryItemId,
            inventory_unit_id: null,
            quantity: quantityNeeded,
            status: "reserved",
            inventory_behavior: component?.inventoryBehavior === "consumable" ? "consumable" : "reusable",
            reserved_from:
              availability.reservedFrom,
            reserved_until:
              availability.reservedUntil,
            notes: `Product component: ${
              component?.componentName ||
              "item"
            }`,
          });

        if (error) {
          throw new Error(error.message);
        }

        insertedReservationsForItem += 1;

        continue;
      }

      const availableUnitIds =
        Array.isArray(
          component?.availableUnitIds,
        )
          ? component.availableUnitIds.slice(
              0,
              quantityNeeded,
            )
          : [];

      if (
        availableUnitIds.length <
        quantityNeeded
      ) {
        throw new Error(
          `Not enough serialized units for component "${
            component?.componentName ||
            "item"
          }".`,
        );
      }

      const reservationRows =
        availableUnitIds.map(
          (unitId: string) => ({
            booking_id: bookingId,
            booking_item_id:
              bookingItem.id,
            inventory_item_id:
              inventoryItemId,
            inventory_unit_id: unitId,
            quantity: 1,
            status: "reserved",
            inventory_behavior: "reusable",
            reserved_from:
              availability.reservedFrom,
            reserved_until:
              availability.reservedUntil,
            notes: `Product component: ${
              component?.componentName ||
              "item"
            }`,
          }),
        );

      const { error } = await supabase
        .from("inventory_reservations")
        .insert(reservationRows);

      if (error) {
        throw new Error(error.message);
      }

      insertedReservationsForItem +=
        reservationRows.length;
    }

    if (
      requiredReservableComponents.length >
        0 &&
      insertedReservationsForItem === 0
    ) {
      throw new Error(
        "Booking could not lock inventory reservations for required components.",
      );
    }
  }
}

async function insertBookingModifiers({
  bookingId,
  modifiers,
  items,
  insertedBookingItems,
}: {
  bookingId: string;
  modifiers: ParsedModifierItem[];
  items: ParsedBookingItem[];
  insertedBookingItems: Array<{
    id: string;
    product_id: string;
  }>;
}) {
  const supabase = await createClient();

  if (modifiers.length === 0) {
    return;
  }

  const optionIds = Array.from(
    new Set(
      modifiers.map(
        (item) =>
          item.modifierOptionId,
      ),
    ),
  ).filter(Boolean);

  const optionToLegacyModifierId =
    new Map<string, string>();

  if (optionIds.length > 0) {
    let optionRowsResult: any =
      await supabase
        .from("modifier_group_options")
        .select(
          "id, modifier_id, name, option_name, label",
        )
        .in("id", optionIds);

    if (
      optionRowsResult.error &&
      isMissingColumnError(
        optionRowsResult.error,
        "modifier_group_options",
        "modifier_id",
      )
    ) {
      optionRowsResult = await supabase
        .from("modifier_group_options")
        .select(
          "id, name, option_name, label",
        )
        .in("id", optionIds);
    }

    for (
      const row of
      optionRowsResult.data || []
    ) {
      if (
        (row as any).id &&
        (row as any).modifier_id
      ) {
        optionToLegacyModifierId.set(
          (row as any).id,
          (row as any).modifier_id,
        );
      }
    }
  }

  const bookingItemsByProduct = new Map<
    string,
    Array<{
      id: string;
      product_id: string;
    }>
  >();

  for (const row of insertedBookingItems) {
    const queue =
      bookingItemsByProduct.get(
        row.product_id,
      ) || [];

    queue.push(row);

    bookingItemsByProduct.set(
      row.product_id,
      queue,
    );
  }

  const preparedModifiers =
    modifiers.map((modifier) => {
      const productQty =
        items.find(
          (item) =>
            item.productId ===
            modifier.productId,
        )?.quantity || 1;

      const itemIndex = Math.max(
        0,
        items.findIndex(
          (item) =>
            item.productId ===
            modifier.productId,
        ),
      );

      const queue =
        bookingItemsByProduct.get(
          modifier.productId,
        ) || [];

      const bookingItem =
        queue[0] || null;

      const selectedModifierQty =
        Math.max(
          1,
          Number(
            modifier.quantity || 1,
          ),
        );

      const totalModifierUnits =
        productQty *
        selectedModifierQty;

      return {
        itemIndex,
        bookingItemId:
          bookingItem?.id || "",
        productId:
          modifier.productId,
        quantity:
          totalModifierUnits,
        groupId:
          modifier.modifierGroupId,
        groupName:
          modifier.modifierGroupName,
        optionId:
          modifier.modifierOptionId,
        optionName:
          modifier.modifierOptionName,
        priceDelta:
          modifier.priceDelta,
        inventoryItemId:
          modifier.inventoryItemId,
        inventoryQuantity:
          modifier.inventoryQuantity,
        trackInventory:
          modifier.trackInventory,
      };
    });

  const modifierNote = (item: {
    itemIndex: number;
    groupId: string;
    optionId: string;
    groupName: string;
    optionName: string;
  }) =>
    `[idx:${item.itemIndex}][gid:${item.groupId}][oid:${item.optionId}] ${item.groupName}: ${item.optionName}`;

  async function ensureLegacyModifierId(
    optionId: string,
    optionName: string,
  ) {
    const existing =
      optionToLegacyModifierId.get(
        optionId,
      );

    if (existing) {
      return existing;
    }

    const slugBase =
      `auto-opt-${optionId
        .replace(
          /[^a-zA-Z0-9]+/g,
          "",
        )
        .slice(0, 16)}`;

    const existingBySlugResult =
      await supabase
        .from("modifiers")
        .select("id")
        .eq("slug", slugBase)
        .maybeSingle();

    if (
      !existingBySlugResult.error &&
      (existingBySlugResult.data as any)
        ?.id
    ) {
      const id = String(
        (
          existingBySlugResult.data as any
        ).id,
      );

      optionToLegacyModifierId.set(
        optionId,
        id,
      );

      return id;
    }

    let createResult: any =
      await supabase
        .from("modifiers")
        .insert({
          name:
            optionName || "Option",
          slug: slugBase,
          base_price: 0,
          taxable: true,
          active: true,
          sort_order: 0,
        })
        .select("id")
        .single();

    if (
      createResult.error &&
      isMissingColumnError(
        createResult.error,
        "modifiers",
        "slug",
      )
    ) {
      createResult = await supabase
        .from("modifiers")
        .insert({
          name:
            optionName ||
            "Option",
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

    const createdId = String(
      (createResult.data as any)
        ?.id || "",
    );

    if (!createdId) {
      return "";
    }

    optionToLegacyModifierId.set(
      optionId,
      createdId,
    );

    const linkResult = await supabase
      .from("modifier_group_options")
      .update({
        modifier_id: createdId,
      })
      .eq("id", optionId);

    if (
      linkResult.error &&
      !isMissingColumnError(
        linkResult.error,
        "modifier_group_options",
        "modifier_id",
      )
    ) {
      console.warn(
        "Failed to link option to generated legacy modifier",
        {
          optionId,
          createdId,
          error:
            linkResult.error.message,
        },
      );
    }

    return createdId;
  }

  const resolvedLegacyModifierIdByOptionId =
    new Map<string, string>();

  for (
    const item of preparedModifiers
  ) {
    const optionId = String(
      item.optionId || "",
    );

    if (!optionId) {
      continue;
    }

    const ensuredId =
      await ensureLegacyModifierId(
        optionId,
        item.optionName,
      );

    if (ensuredId) {
      resolvedLegacyModifierIdByOptionId.set(
        optionId,
        ensuredId,
      );
    }
  }

  async function insertWithNewSchemaVariants() {
    const variants: Array<
      Array<Record<string, any>>
    > = [
      preparedModifiers.map(
        (item) => ({
          booking_id: bookingId,
          booking_item_id:
            item.bookingItemId,
          modifier_group_id:
            item.groupId,
          modifier_group_option_id:
            item.optionId,
          inventory_item_id:
            item.inventoryItemId,
          inventory_quantity:
            item.inventoryQuantity *
            item.quantity,
          track_inventory:
            item.trackInventory,
          price_delta:
            item.priceDelta,
          label: item.optionName,
          quantity: item.quantity,
          unit_price:
            item.priceDelta,
          line_total: Number(
            (
              item.priceDelta *
              item.quantity
            ).toFixed(2),
          ),
          notes: modifierNote(item),
        }),
      ),

      preparedModifiers.map(
        (item) => ({
          booking_id: bookingId,
          booking_item_id:
            item.bookingItemId,
          modifier_group_id:
            item.groupId,
          modifier_group_option_id:
            item.optionId,
          quantity: item.quantity,
          unit_price:
            item.priceDelta,
          line_total: Number(
            (
              item.priceDelta *
              item.quantity
            ).toFixed(2),
          ),
          notes: modifierNote(item),
        }),
      ),

      preparedModifiers.map(
        (item) => ({
          booking_id: bookingId,
          booking_item_id:
            item.bookingItemId,
          modifier_group_option_id:
            item.optionId,
          quantity: item.quantity,
          notes: modifierNote(item),
        }),
      ),
    ];

    let lastError: any = null;

    for (const rows of variants) {
      const result = await supabase
        .from("booking_modifiers")
        .insert(rows);

      if (!result.error) {
        return null;
      }

      lastError = result.error;
    }

    return lastError;
  }

  const fkModifierIdConstraint =
    "booking_modifiers_modifier_id_fkey";

  let { error } = await supabase
    .from("booking_modifiers")
    .insert(
      preparedModifiers.map(
        (item) => ({
          booking_id: bookingId,
          booking_item_id:
            item.bookingItemId,
          modifier_id:
            resolvedLegacyModifierIdByOptionId.get(
              item.optionId,
            ) || item.optionId,
          quantity:
            item.quantity,
          unit_price:
            item.priceDelta,
          subtotal: Number(
            (
              item.priceDelta *
              item.quantity
            ).toFixed(2),
          ),
          taxable: true,
          notes:
            modifierNote(item),
        }),
      ),
    );

  if (
    error &&
    String(
      error?.message || "",
    )
      .toLowerCase()
      .includes(
        fkModifierIdConstraint,
      )
  ) {
    const retryResult =
      await supabase
        .from("booking_modifiers")
        .insert(
          preparedModifiers.map(
            (item) => ({
              booking_id:
                bookingId,
              booking_item_id:
                item.bookingItemId,
              modifier_id:
                item.optionId,
              quantity:
                item.quantity,
              unit_price:
                item.priceDelta,
              subtotal:
                Number(
                  (
                    item.priceDelta *
                    item.quantity
                  ).toFixed(
                    2,
                  ),
                ),
              taxable: true,
              notes:
                modifierNote(
                  item,
                ),
            }),
          ),
        );

    error =
      retryResult.error;
  }

  if (
    error &&
    String(
      error?.message || "",
    )
      .toLowerCase()
      .includes(
        fkModifierIdConstraint,
      )
  ) {
    error =
      await insertWithNewSchemaVariants();
  }

  if (
    error &&
    isMissingColumnError(
      error,
      "booking_modifiers",
      "modifier_id",
    )
  ) {
    error =
      await insertWithNewSchemaVariants();
  }

  if (error) {
    throw new Error(
      `Failed to save booking options: ${error.message}`,
    );
  }
}

async function reserveModifierInventory({
  bookingId,
  modifiers,
  items,
  reservationWindowsByProduct,
}: {
  bookingId: string;
  modifiers: ParsedModifierItem[];
  items: ParsedBookingItem[];
  reservationWindowsByProduct: Map<
    string,
    {
      reservedFrom: string;
      reservedUntil: string;
    }
  >;
}) {
  const supabase = await createClient();
  const optionIds = Array.from(
    new Set(modifiers.map((modifier) => modifier.modifierOptionId).filter(Boolean)),
  );
  const inventoryBehaviorByOptionId = new Map<string, "reusable" | "consumable">();

  if (optionIds.length > 0) {
    const { data: optionRows, error: optionRowsError } = await supabase
      .from("modifier_group_options")
      .select("id, inventory_behavior")
      .in("id", optionIds);

    if (optionRowsError && !isMissingColumnError(optionRowsError, "modifier_group_options", "inventory_behavior")) {
      throw new Error(optionRowsError.message);
    }

    for (const row of optionRows || []) {
      inventoryBehaviorByOptionId.set(
        String((row as any).id),
        (row as any).inventory_behavior === "consumable" ? "consumable" : "reusable",
      );
    }
  }

  for (const modifier of modifiers) {
    if (
      !modifier.trackInventory ||
      !modifier.inventoryItemId
    ) {
      continue;
    }

    const productQty =
      items.find(
        (item) =>
          item.productId ===
          modifier.productId,
      )?.quantity || 1;

    const selectedModifierQty =
      Math.max(
        1,
        Number(modifier.quantity || 1),
      );

    const quantityNeeded =
      modifier.inventoryQuantity *
      productQty *
      selectedModifierQty;

    if (quantityNeeded <= 0) {
      continue;
    }

    const window =
      reservationWindowsByProduct.get(
        modifier.productId,
      );

    if (!window) {
      throw new Error(
        "Missing reservation window for modifier product.",
      );
    }

    const {
      data: inventoryItem,
      error: itemError,
    } = await supabase
      .from("inventory_items")
      .select(
        `
        id,
        name,
        tracking_type,
        quantity_on_hand,
        quantity_available,
        active
      `,
      )
      .eq(
        "id",
        modifier.inventoryItemId,
      )
      .maybeSingle();

    if (itemError) {
      throw new Error(
        itemError.message,
      );
    }

    if (!inventoryItem) {
      throw new Error(
        `Inventory item for option "${modifier.modifierOptionName}" was not found.`,
      );
    }

    if (
      (inventoryItem as any)
        .active === false
    ) {
      throw new Error(
        `Inventory item "${(inventoryItem as any).name}" is inactive.`,
      );
    }

    const {
      data: overlappingReservations,
      error: reservationsError,
    } = await supabase
      .from("inventory_reservations")
      .select(
        "inventory_unit_id, quantity",
      )
      .eq(
        "inventory_item_id",
        modifier.inventoryItemId,
      )
      .in("status", [
        "reserved",
        "picked",
        "loaded",
        "installed",
      ])
      .lt(
        "reserved_from",
        window.reservedUntil,
      )
      .gt(
        "reserved_until",
        window.reservedFrom,
      );

    if (reservationsError) {
      throw new Error(
        reservationsError.message,
      );
    }

    const trackingType = String(
      (inventoryItem as any)
        .tracking_type ||
        "quantity",
    );
    const inventoryBehavior =
      inventoryBehaviorByOptionId.get(modifier.modifierOptionId) ||
      (modifier.inventoryBehavior === "consumable" ? "consumable" : "reusable");

    if (
      trackingType ===
        "quantity" ||
      trackingType ===
        "consumable"
    ) {
      const reservedQuantity = (
        overlappingReservations ||
        []
      ).reduce(
        (
          sum: number,
          row: any,
        ) =>
          sum +
          Number(
            row.quantity ||
              0,
          ),
        0,
      );

      const totalQuantity =
        Number(
          (inventoryItem as any)
            .quantity_on_hand ??
            (inventoryItem as any)
              .quantity_available ??
            0,
        );

      const availableQuantity =
        Math.max(
          0,
          totalQuantity -
            reservedQuantity,
        );

      if (
        availableQuantity <
        quantityNeeded
      ) {
        throw new Error(
          `Not enough stock for option "${modifier.modifierOptionName}". Need ${quantityNeeded}, available ${availableQuantity} for the selected dates.`,
        );
      }

      const {
        error:
          reservationError,
      } = await supabase
        .from(
          "inventory_reservations",
        )
        .insert({
          booking_id:
            bookingId,
          inventory_item_id:
            modifier.inventoryItemId,
          inventory_unit_id:
            null,
          quantity:
            quantityNeeded,
          status: "reserved",
          inventory_behavior: inventoryBehavior,
          reserved_from:
            window.reservedFrom,
          reserved_until:
            window.reservedUntil,
          notes:
            `Modifier option: ${modifier.modifierOptionName}`,
        });

      if (reservationError) {
        throw new Error(
          reservationError.message,
        );
      }

      const movementResult =
        await supabase
          .from(
            "inventory_movements",
          )
          .insert({
            inventory_item_id:
              modifier.inventoryItemId,
            quantity:
              quantityNeeded,
            movement_type:
              "reservation_hold",
            status:
              "completed",
            reference_type:
              "booking",
            reference_id:
              bookingId,
            notes:
              `Reserved for modifier option: ${modifier.modifierOptionName}`,
          });

      if (
        movementResult.error &&
        !isMissingTableError(
          movementResult.error,
        )
      ) {
        throw new Error(
          movementResult.error
            .message,
        );
      }

      continue;
    }

    const reservedUnitIds =
      new Set(
        (
          overlappingReservations ||
          []
        )
          .map(
            (row: any) =>
              row.inventory_unit_id,
          )
          .filter(Boolean)
          .map(String),
      );

    const {
      data: units,
      error: unitsError,
    } = await supabase
      .from("inventory_units")
      .select(
        "id, status, retired_at",
      )
      .eq(
        "inventory_item_id",
        modifier.inventoryItemId,
      )
      .is("retired_at", null)
      .not(
        "status",
        "in",
        "(retired,lost,damaged,maintenance)",
      );

    if (unitsError) {
      throw new Error(
        unitsError.message,
      );
    }

    const availableUnitIds = (
      units || []
    )
      .filter(
        (unit: any) =>
          !reservedUnitIds.has(
            String(unit.id),
          ),
      )
      .slice(0, quantityNeeded)
      .map((unit: any) =>
        String(unit.id),
      );

    if (
      availableUnitIds.length <
      quantityNeeded
    ) {
      throw new Error(
        `Not enough available units for option "${modifier.modifierOptionName}". Need ${quantityNeeded}, available ${availableUnitIds.length} for the selected dates.`,
      );
    }

    const reservationRows =
      availableUnitIds.map(
        (unitId) => ({
          booking_id: bookingId,
          inventory_item_id:
            modifier.inventoryItemId,
          inventory_unit_id:
            unitId,
          quantity: 1,
          status: "reserved",
          inventory_behavior: "reusable",
          reserved_from:
            window.reservedFrom,
          reserved_until:
            window.reservedUntil,
          notes:
            `Modifier option: ${modifier.modifierOptionName}`,
        }),
      );

    const {
      error:
        reservationError,
    } = await supabase
      .from(
        "inventory_reservations",
      )
      .insert(
        reservationRows,
      );

    if (reservationError) {
      throw new Error(
        reservationError.message,
      );
    }

    const movementRows =
      availableUnitIds.map(
        (unitId) => ({
          inventory_item_id:
            modifier.inventoryItemId,
          inventory_unit_id:
            unitId,
          quantity: 1,
          movement_type:
            "reservation_hold",
          status:
            "completed",
          reference_type:
            "booking",
          reference_id:
            bookingId,
          notes:
            `Reserved for modifier option: ${modifier.modifierOptionName}`,
        }),
      );

    const movementResult =
      await supabase
        .from(
          "inventory_movements",
        )
        .insert(movementRows);

    if (
      movementResult.error &&
      !isMissingTableError(
        movementResult.error,
      )
    ) {
      throw new Error(
        movementResult.error.message,
      );
    }
  }
}

async function buildBookingItemsSummary({
  bookingId,
  fallbackItems,
}: {
  bookingId: string;
  fallbackItems: ParsedBookingItem[];
}) {
  const supabase = await createClient();

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
    .eq(
      "booking_id",
      bookingId,
    );

  if (error) {
    return fallbackItems
      .map(
        (item) =>
          `Product ${item.productId.slice(
            0,
            8,
          )} x ${item.quantity}`,
      )
      .join("\n");
  }

  return (data || [])
    .map((item: any) => {
      const product =
        Array.isArray(
          item.products,
        )
          ? item.products[0]
          : item.products;

      return `${
        product?.name ||
        "Product"
      } x ${Number(
        item.quantity || 1,
      )}`;
    })
    .join("\n");
}

async function autoCreateRouteStopsForBooking({
  bookingId,
  eventDate,
  eventStartTime,
  eventEndTime,
  setupAddress,
  setupCity,
  setupState,
  setupZip,
  customerName,
  customerPhone,
  balanceDue,
  items,
}: {
  bookingId: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  setupAddress: string;
  setupCity: string;
  setupState: string;
  setupZip: string;
  customerName: string;
  customerPhone: string;
  balanceDue: number;
  items: ParsedBookingItem[];
}) {
  const supabase = createServiceClient();

  const existingResult =
    await supabase
      .from("route_stops")
      .select(
        "id, stop_type, status",
      )
      .eq(
        "booking_id",
        bookingId,
      )
      .in("stop_type", [
        "delivery",
        "pickup",
      ]);

  if (existingResult.error) {
    if (
      isMissingTableError(
        existingResult.error,
      )
    ) {
      return;
    }

    throw new Error(
      existingResult.error.message,
    );
  }

  const activeStops = (
    existingResult.data || []
  ).filter((stop: any) => {
    return ![
      "cancelled",
      "failed",
    ].includes(
      String(stop.status || ""),
    );
  });

  const hasDelivery =
    activeStops.some(
      (stop: any) =>
        stop.stop_type ===
        "delivery",
    );

  const hasPickup =
    activeStops.some(
      (stop: any) =>
        stop.stop_type ===
        "pickup",
    );

  const rows: any[] = [];
  const now =
    new Date().toISOString();

  const itemsSummary =
    await buildBookingItemsSummary({
      bookingId,
      fallbackItems: items,
    });

  if (!hasDelivery) {
    rows.push({
      booking_id: bookingId,
      stop_date: eventDate,
      stop_type: "delivery",
      status: "scheduled",

      customer_name:
        customerName || null,
      customer_phone:
        customerPhone || null,

      address:
        setupAddress || null,
      city: setupCity || null,
      state:
        setupState || "CA",
      zip: setupZip || null,

      scheduled_start_time:
        null,
      scheduled_end_time:
        eventStartTime || null,

      driver_name: null,
      truck_name: null,

      items_summary:
        itemsSummary || null,
      surface: null,
      gate_code: null,
      parking_notes: null,
      setup_notes:
        eventStartTime
          ? `Event starts at ${eventStartTime}. Setup should be completed before start time.`
          : null,
      pickup_notes: null,

      balance_due:
        balanceDue,
      sort_order: 100,

      updated_at: now,
    });
  }

  if (!hasPickup) {
    rows.push({
      booking_id: bookingId,
      stop_date: eventDate,
      stop_type: "pickup",
      status: "scheduled",

      customer_name:
        customerName || null,
      customer_phone:
        customerPhone || null,

      address:
        setupAddress || null,
      city: setupCity || null,
      state:
        setupState || "CA",
      zip: setupZip || null,

      scheduled_start_time:
        eventEndTime || null,
      scheduled_end_time:
        null,

      driver_name: null,
      truck_name: null,

      items_summary:
        itemsSummary || null,
      surface: null,
      gate_code: null,
      parking_notes: null,
      setup_notes: null,
      pickup_notes:
        eventEndTime
          ? `Event ends at ${eventEndTime}. Pickup can be scheduled after event end.`
          : null,

      balance_due: 0,
      sort_order: 200,

      updated_at: now,
    });
  }

  if (rows.length === 0) {
    return;
  }

  const insertResult =
    await supabase
      .from("route_stops")
      .insert(rows);

  if (insertResult.error) {
    if (
      isMissingTableError(
        insertResult.error,
      ) ||
      isUniqueConflictError(
        insertResult.error,
      )
    ) {
      return;
    }

    throw new Error(
      insertResult.error.message,
    );
  }
}

export async function createBookingAction(
  formData: FormData,
) {
  const supabase =
    await createClient();

  const access =
    await getUnifiedAccess(
      supabase,
    );

  if (
    !access.user ||
    !access.isActive ||
    !access.can(
      "bookings.create",
    )
  ) {
    throw new Error(
      "You do not have permission to create bookings.",
    );
  }

  const bookingAttemptId =
    getString(
      formData,
      "bookingAttemptId",
    );

  const existingCustomerId =
    getString(
      formData,
      "existingCustomerId",
    );

  const customerFirstName =
    getString(
      formData,
      "customerFirstName",
    );

  const customerLastName =
    getString(
      formData,
      "customerLastName",
    );

  const customerName =
    `${customerFirstName} ${customerLastName}`.trim() ||
    getString(
      formData,
      "customerName",
    );

  const customerPhone =
    getString(
      formData,
      "customerPhone",
    );

  const customerEmail =
    getString(
      formData,
      "customerEmail",
    );

  const eventDate =
    getString(
      formData,
      "eventDate",
    );

  const eventStartTime =
    getString(
      formData,
      "eventStartTime",
    );

  const eventEndTime =
    getString(
      formData,
      "eventEndTime",
    );

  const bookingActor =
    parseBookingActor(
      getString(
        formData,
        "bookingActor",
      ),
    );

  const setupAddress =
    getString(
      formData,
      "setupAddress",
    );

  const setupCity =
    getString(
      formData,
      "setupCity",
    );

  const setupState =
    getString(
      formData,
      "setupState",
    ) || "CA";

  const setupZip =
    getString(
      formData,
      "setupZip",
    );

  const requestedStatus =
    normalizeBookingStatus(
      getString(
        formData,
        "status",
      ),
    );

  const completionStrategy =
    getString(
      formData,
      "completionStrategy",
    ) ===
    "staff_complete_now"
      ? "staff_complete_now"
      : "staff_send_to_customer";

  const isStaffSendToCustomer =
    completionStrategy ===
    "staff_send_to_customer";

  const status: BookingStatus =
    isStaffSendToCustomer
      ? "inventory_reserved"
      : requestedStatus;

  const deliveryFee =
    getNumber(
      formData,
      "deliveryFee",
      0,
    );

  const taxRate =
    getNumber(
      formData,
      "taxRate",
      0,
    );

  const depositAmount =
    getNumber(
      formData,
      "depositAmount",
      0,
    );

  const notes =
    getNullableString(
      formData,
      "notes",
    );

  const paymentMethod =
    getString(
      formData,
      "paymentMethod",
    );

  const paymentAmount =
    getNumber(
      formData,
      "paymentAmount",
      0,
    );

  const tipMode =
    getString(
      formData,
      "tipMode",
    ) === "amount"
      ? "amount"
      : "percent";

  const tipPercent =
    getNumber(
      formData,
      "tipPercent",
      0,
    );

  const tipAmount =
    getNumber(
      formData,
      "tipAmount",
      0,
    );

  const paymentReference =
    getNullableString(
      formData,
      "paymentReference",
    );

  const discountAmountInput =
    getNumber(
      formData,
      "discountAmount",
      0,
    );

  const discountPassword =
    getString(
      formData,
      "discountPassword",
    );

  const contractAccepted =
    getBooleanString(
      formData,
      "contractAccepted",
    );

  const contractSignerName =
    getString(
      formData,
      "contractSignerName",
    );

  const contractManualSignature =
    getString(
      formData,
      "contractManualSignature",
    );

  const contractSignatureDataUrl =
    getString(
      formData,
      "contractSignatureDataUrl",
    );

  const contractRenderedHtmlFromForm =
    getString(
      formData,
      "contractRenderedHtml",
    );

  const items =
    parseBookingProductItems(
      formData,
    );

  const modifiers =
    parseBookingModifierItems(
      formData,
    );

  const locationMarkerColor =
    await resolveLocationMarkerColor({
      supabase,
      modifiers,
    });

  const discountSettings =
    await getDiscountSecuritySettings();

  const contractSettings =
    await getContractSettings();

  const receiptDesign =
    await getReceiptDesignSettings();

  if (!eventDate) {
    throw new Error(
      "Choose event date.",
    );
  }

  await validateBookingTimePolicy({
    bookingActor,
    eventDate,
    eventStartTime,
    eventEndTime,
  });

  if (items.length === 0) {
    redirect(
      "/admin/bookings/new?error=add_product",
    );
  }

  if (!customerFirstName) {
    throw new Error(
      "Customer first name is required.",
    );
  }

  if (!customerLastName) {
    throw new Error(
      "Customer last name is required.",
    );
  }

  if (!customerPhone) {
    throw new Error(
      "Customer phone is required.",
    );
  }

  if (!customerEmail) {
    throw new Error(
      "Customer email is required.",
    );
  }

  if (
    !isValidEmail(
      customerEmail,
    )
  ) {
    throw new Error(
      "Customer email must be a valid email address.",
    );
  }

  const customerId =
    await ensureCustomer({
      existingCustomerId,
      customerFirstName,
      customerLastName,
      customerName,
      customerPhone,
      customerEmail,
    });

  const {
    data: customerRecord,
    error:
      customerRecordError,
  } = await supabase
    .from("customers")
    .select(
      "full_name, email, phone",
    )
    .eq("id", customerId)
    .maybeSingle();

  if (customerRecordError) {
    throw new Error(
      customerRecordError.message,
    );
  }

  const modifierSelectionsByProductId =
    groupModifierSelectionsByProductId(
      modifiers.map(
        (modifier) => ({
          productId:
            modifier.productId,
          modifierOptionId:
            modifier.modifierOptionId,
          quantity:
            modifier.quantity,
        }),
      ),
    );

  const normalizedAvailabilityItems =
    normalizeBookingItemRequests(
      items.map((item) => {
        const selection =
          modifierSelectionsByProductId.get(
            item.productId,
          );

        return {
          productId:
            item.productId,
          quantity:
            item.quantity,
          selectedModifierGroupOptionIds:
            selection?.optionIds ||
            [],
          selectedModifierOptionQuantities:
            selection?.quantities ||
            {},
        };
      }),
    );

  const availabilityResults =
    await validateBookingItemsAvailability({
      items:
        normalizedAvailabilityItems,
      eventDate,
      eventStartTime,
      eventEndTime,
      bookingActor,
    });

  await validateRequiredModifierGroups({
    items,
    modifiers,
  });

  await validateModifierInventory({
    modifiers,
    items,
    availabilityResults,
  });

  const safeDiscountAmount =
    Number(
      Math.max(
        0,
        Math.min(
          discountAmountInput,
          1_000_000,
        ),
      ).toFixed(2),
    );

  if (
    discountSettings
      .discount_password_enabled ===
      true &&
    safeDiscountAmount > 0
  ) {
    const validPassword =
      isValidPasswordHash(
        discountSettings
          .discount_password_hash,
        discountPassword,
      );

    if (!validPassword) {
      throw new Error(
        "Invalid discount password.",
      );
    }
  }

  if (
    !isStaffSendToCustomer &&
    contractSettings
      .require_contract_before_payment !==
      false &&
    !contractAccepted
  ) {
    throw new Error(
      "Contract must be accepted before payment.",
    );
  }

  if (
    !isStaffSendToCustomer &&
    contractSettings
      .require_contract_before_payment !==
      false &&
    !isPngDataUrl(
      contractSignatureDataUrl,
    )
  ) {
    throw new Error(
      "Draw manual signature before payment.",
    );
  }

  const productSubtotal =
    items.reduce(
      (sum, item) =>
        sum +
        item.quantity *
          item.unitPrice,
      0,
    );

  const modifiersSubtotal =
    modifiers.reduce(
      (sum, modifier) => {
        const productQty =
          items.find(
            (item) =>
              item.productId ===
              modifier.productId,
          )?.quantity || 1;

        return (
          sum +
          modifier.priceDelta *
            productQty
        );
      },
      0,
    );

  const subtotal = Number(
    (
      productSubtotal +
      modifiersSubtotal
    ).toFixed(2),
  );

  const discountAmount =
    Number(
      Math.max(
        0,
        Math.min(
          safeDiscountAmount,
          subtotal,
        ),
      ).toFixed(2),
    );

  const taxableSubtotal =
    Number(
      (
        subtotal -
        discountAmount
      ).toFixed(2),
    );

  const taxAmount =
    Number(
      (
        (taxableSubtotal +
          deliveryFee) *
        (taxRate / 100)
      ).toFixed(2),
    );

  const totalAmount =
    Number(
      (
        taxableSubtotal +
        deliveryFee +
        taxAmount
      ).toFixed(2),
    );

  const balanceDue =
    Number(
      (
        totalAmount -
        depositAmount
      ).toFixed(2),
    );

  if (
    !isStaffSendToCustomer &&
    paymentAmount < 0
  ) {
    throw new Error(
      "Payment amount cannot be negative.",
    );
  }

  if (
    !isStaffSendToCustomer &&
    tipAmount < 0
  ) {
    throw new Error(
      "Tip amount cannot be negative.",
    );
  }

  if (
    !isStaffSendToCustomer &&
    paymentAmount >
      totalAmount
  ) {
    throw new Error(
      "Payment amount cannot exceed booking total.",
    );
  }

  if (
    !isStaffSendToCustomer &&
    paymentAmount > 0 &&
    !paymentMethod
  ) {
    throw new Error(
      "Payment method is required when payment amount is set.",
    );
  }

  if (
    !isStaffSendToCustomer &&
    paymentMethod
  ) {
    const allowedMethods = [
      "zelle",
      "venmo",
      "stripe",
      "cash",
      "card",
      "check",
      "bank_transfer",
      "other",
    ];

    if (
      !allowedMethods.includes(
        paymentMethod,
      )
    ) {
      throw new Error(
        "Unsupported payment method.",
      );
    }
  }

  const bookingPayload: Record<
    string,
    any
  > = {
    customer_id: customerId,

    booking_source: "admin",
    amount_paid: 0,
    payment_status: "unpaid",

    event_date: eventDate,
    event_start_time:
      eventStartTime || null,
    event_end_time:
      eventEndTime || null,

    setup_address:
      setupAddress || null,
    setup_city:
      setupCity || null,
    setup_state:
      setupState || null,
    setup_zip:
      setupZip || null,

    status,

    subtotal,
    discount_amount:
      discountAmount,
    delivery_fee:
      deliveryFee,
    tax_rate: taxRate,
    tax_amount:
      taxAmount,
    total_amount:
      totalAmount,
    deposit_amount:
      depositAmount,

    balance_due:
      isStaffSendToCustomer
        ? totalAmount
        : balanceDue,

    contract_status:
      isStaffSendToCustomer
        ? "not_sent"
        : contractSettings
              .require_contract_before_payment !==
            false
          ? "signed"
          : "not_sent",

    notes,
  };

  if (locationMarkerColor) {
    bookingPayload.marker_color =
      locationMarkerColor;
  }

  const persistedBooking =
    await insertBookingIdempotently({
      supabase,
      payload: bookingPayload,
      bookingAttemptId:
        bookingAttemptId ||
        undefined,
      optionalFallbackColumns: [
        "notes",
        "marker_color",
      ],
      select: "id",
    });

  const bookingId = String(
    persistedBooking.booking.id,
  );

  if (
    persistedBooking.reusedExistingBooking
  ) {
    redirect(
      `/admin/bookings/${bookingId}`,
    );
  }

  let renderedContractForEmail =
    contractRenderedHtmlFromForm ||
    "";

  if (
    !isStaffSendToCustomer &&
    contractSettings
      .require_contract_before_payment !==
      false
  ) {
    const requestHeaders =
      await headers();

    const signerIp =
      requestHeaders.get(
        "x-forwarded-for",
      ) ||
      requestHeaders.get(
        "x-real-ip",
      ) ||
      null;

    const signerUserAgent =
      requestHeaders.get(
        "user-agent",
      ) || null;

    const contractTemplate =
      contractSettings
        .template_html ||
      "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>";

    const signerDate =
      new Date()
        .toISOString()
        .slice(0, 10);

    const serverRenderedContract =
      renderContractTemplate({
        template:
          contractTemplate,
        values: {
          customer_name:
            customerRecord?.full_name ||
            customerName ||
            "Customer",
          customer_email:
            customerEmail ||
            customerRecord?.email ||
            "",
          event_date:
            eventDate || "",
          event_start_time:
            eventStartTime || "",
          event_end_time:
            eventEndTime || "",
          setup_address:
            setupAddress || "",
          setup_city:
            setupCity || "",
          setup_state:
            setupState || "",
          setup_zip:
            setupZip || "",
          subtotal:
            subtotal.toFixed(2),
          discount_amount:
            discountAmount.toFixed(
              2,
            ),
          delivery_fee:
            deliveryFee.toFixed(2),
          tax_amount:
            taxAmount.toFixed(2),
          total_amount:
            totalAmount.toFixed(
              2,
            ),
          deposit_amount:
            depositAmount.toFixed(
              2,
            ),
          balance_due:
            balanceDue.toFixed(2),
          signature_label:
            contractSettings
              .signature_label ||
            "Client signature",
          signature_name:
            contractSignerName ||
            customerName ||
            customerRecord?.full_name ||
            "",
          signature_manual:
            isPngDataUrl(
              contractSignatureDataUrl,
            )
              ? `<img src="${contractSignatureDataUrl}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`
              : contractManualSignature ||
                "",
          signature_date:
            signerDate,
        },
      });

    const renderedContract =
      serverRenderedContract;

    const signedAtIso =
      new Date().toISOString();

    const signatureImageDataUrl =
      isPngDataUrl(
        contractSignatureDataUrl,
      )
        ? contractSignatureDataUrl
        : null;

    const documentHashSha256 =
      toSha256(renderedContract);

    renderedContractForEmail =
      renderedContract;

    const {
      error:
        contractInsertError,
    } = await supabase
      .from("contracts")
      .insert({
        booking_id: bookingId,
        status: "signed",
        signer_name:
          contractSignerName ||
          null,
        signer_email:
          customerEmail || null,
        provider:
          "internal_esign",
        sent_at: signedAtIso,
        viewed_at: signedAtIso,
        signed_at: signedAtIso,
        template_version:
          "v1",
        rendered_html:
          renderedContract,
        signature_text:
          contractSignerName ||
          contractManualSignature ||
          null,
        signature_date:
          signerDate,
        signer_ip: signerIp,
        signer_user_agent:
          signerUserAgent,
        signature_metadata: {
          accepted:
            contractAccepted,
          requireTypedSignature:
            true,
          manualSignature:
            contractManualSignature ||
            null,
          signatureImageDataUrl,
          signatureMethod:
            "drawn_manual",
          consentText:
            "I read and agree with the contract terms",
          consentAcceptedAt:
            signedAtIso,
          intentAction:
            "continue_to_pos",
          documentHashSha256,
          signedDocumentFormat:
            "rendered_html",
          signingProvider:
            "internal_esign",
          signerIp,
          signerUserAgent,
          evidenceVersion: 2,
        },
      });

    if (contractInsertError) {
      if (
        isContractsAuditColumnError(
          contractInsertError,
        )
      ) {
        const {
          error:
            basicContractError,
        } = await supabase
          .from("contracts")
          .insert({
            booking_id:
              bookingId,
            status: "signed",
            signer_name:
              contractSignerName ||
              null,
            signer_email:
              customerEmail ||
              null,
            provider:
              "internal_esign",
            sent_at:
              new Date().toISOString(),
            viewed_at:
              new Date().toISOString(),
            signed_at:
              new Date().toISOString(),
          });

        if (
          basicContractError
        ) {
          throw new Error(
            basicContractError.message,
          );
        }
      } else {
        throw new Error(
          contractInsertError.message,
        );
      }
    }
  }

  const insertedBookingItems =
    await insertBookingItems({
      bookingId,
      items,
    });

  await reserveProductComponentsInventory({
    bookingId,
    items,
    insertedBookingItems,
    availabilityResults,
  });

  await insertBookingModifiers({
    bookingId,
    modifiers,
    items,
    insertedBookingItems,
  });

  const normalizedItemsWithAvailability =
    attachAvailabilityToBookingItems({
      items:
        normalizedAvailabilityItems,
      availabilityResults,
    });

  const reservationWindowsByProduct =
    new Map<
      string,
      {
        reservedFrom: string;
        reservedUntil: string;
      }
    >(
      normalizedItemsWithAvailability.map(
        (item) => [
          item.productId,
          {
            reservedFrom:
              item.reservedFrom!,
            reservedUntil:
              item.reservedUntil!,
          },
        ],
      ),
    );

  await reserveModifierInventory({
    bookingId,
    modifiers,
    items,
    reservationWindowsByProduct,
  });

  let staffCompletionUrl = "";

  let staffCompletionEmailStatus:
    | "sent"
    | "not_configured"
    | "failed" =
    "not_configured";

  if (isStaffSendToCustomer) {
    const { data: authData } =
      await supabase.auth.getUser();

    try {
      const completionSession =
        await createBookingCompletionSession(
          {
            supabase,
            bookingId,
            customerEmail,
            createdByAuthUserId:
              authData.user?.id ||
              null,
          },
        );

      const requestHeaders =
        await headers();

      const origin =
        requestHeaders.get(
          "origin",
        ) ||
        process.env
          .NEXT_PUBLIC_SITE_URL ||
        "http://localhost:3001";

      const completionUrl =
        new URL(
          `/booking/complete/${encodeURIComponent(
            completionSession.token,
          )}`,
          origin,
        ).toString();

      staffCompletionUrl =
        completionUrl;

      const bookingNumberLabel =
        `#${String(
          bookingId,
        ).slice(0, 8)}`;

      const expirationLabel =
        new Date(
          completionSession.expiresAt,
        ).toLocaleString(
          "en-US",
          {
            dateStyle:
              "medium",
            timeStyle:
              "short",
            timeZone:
              "America/Los_Angeles",
          },
        );

      void bookingNumberLabel;

      if (customerEmail) {
        try {
          await enqueueBookingNotification({
            eventCode:
              "contract_ready",
            bookingId,
            dedupeSuffix:
              `completion:${completionSession.token}`,
            payload: {
              action_url:
                completionUrl,
              expires_at:
                `${expirationLabel} Pacific Time`,
            },
          });

          const delivery =
            await processNotificationQueueBestEffort(
              {
                bookingId,
                limit: 20,
              },
            );

          staffCompletionEmailStatus =
            delivery.sent > 0
              ? "sent"
              : delivery.failed >
                  0
                ? "failed"
                : "not_configured";
        } catch (
          notificationError
        ) {
          staffCompletionEmailStatus =
            "failed";

          console.error(
            "Booking completion notification failed",
            notificationError,
          );
        }
      }
    } catch (completionSessionError) {
      staffCompletionEmailStatus =
        "failed";

      console.error(
        "Booking completion session creation failed",
        {
          bookingId,
          error:
            completionSessionError instanceof
            Error
              ? completionSessionError.message
              : String(
                  completionSessionError,
                ),
        },
      );
    }
  }

  if (
    !isStaffSendToCustomer
  ) {
    await autoCreateRouteStopsForBooking({
      bookingId,
      eventDate,
      eventStartTime,
      eventEndTime,
      setupAddress,
      setupCity,
      setupState,
      setupZip,
      customerName:
        customerRecord?.full_name ||
        customerName ||
        "",
      customerPhone:
        customerRecord?.phone ||
        customerPhone ||
        "",
      balanceDue,
      items,
    });
  }

  if (
    !isStaffSendToCustomer &&
    paymentAmount > 0 &&
    paymentMethod
  ) {
    const paymentTotal =
      Number(
        (
          paymentAmount +
          tipAmount
        ).toFixed(2),
      );

    if (
      paymentMethod ===
      "stripe"
    ) {
      const targetEmail =
        customerRecord?.email ||
        customerEmail ||
        "";

      const session =
        await createStripeCheckoutSession(
          {
            bookingId,
            amount:
              paymentTotal,
            baseAmount:
              paymentAmount,
            tipAmount,
            customerEmail:
              targetEmail ||
              null,
            source:
              "admin_new_booking",
            successPath:
              `/admin/bookings/${bookingId}`,
            cancelPath:
              `/admin/bookings/${bookingId}`,
            description:
              `Bounce Party LA booking #${String(
                bookingId,
              ).slice(
                0,
                8,
              )}`,
          },
        );

      revalidatePath(
        "/admin/bookings",
      );

      revalidatePath(
        `/admin/bookings/${bookingId}`,
      );

      redirect(
        session.url,
      );
    }

    const paymentInsertPayload = {
      booking_id: bookingId,
      amount:
        paymentTotal,
      method:
        paymentMethod,
      status: "paid",
      external_reference:
        paymentReference,
      note:
        `Initial payment captured at booking creation. Base: ${paymentAmount.toFixed(
          2,
        )}, Tip: ${tipAmount.toFixed(
          2,
        )}, Tip%: ${tipPercent.toFixed(
          2,
        )}, TipMode: ${tipMode}`,
      paid_at:
        new Date().toISOString(),
    };

    let paymentInsertResult = await supabase
      .from("payments")
      .insert(paymentInsertPayload);

    if (
      paymentInsertResult.error &&
      isRefreshPaymentTotalsPermissionError(paymentInsertResult.error)
    ) {
      try {
        const serviceSupabase = createServiceClient();

        paymentInsertResult = await serviceSupabase
          .from("payments")
          .insert(paymentInsertPayload);
      } catch {
        // Keep the original database error from the staff-scoped insert.
      }
    }

    if (paymentInsertResult.error) {
      throw new Error(
        paymentInsertResult.error.message,
      );
    }

    await processNotificationQueueBestEffort({
      bookingId,
      limit: 20,
    });
  }

  if (
    !isStaffSendToCustomer &&
    status === "booked"
  ) {
    try {
      await enqueueBookingNotification({
        eventCode:
          "booking_confirmed",
        bookingId,
        dedupeSuffix:
          "admin-created",
      });
    } catch (
      notificationError
    ) {
      console.error(
        "Booking confirmed notification enqueue failed",
        notificationError,
      );
    }

    await processNotificationQueueBestEffort({
      bookingId,
      limit: 20,
    });
  }

  revalidatePath(
    "/admin/bookings",
  );

  revalidatePath(
    "/admin/calendar",
  );

  revalidatePath(
    "/admin/inventory",
  );

  revalidatePath(
    "/admin/bookings/new",
  );

  revalidatePath(
    "/admin/routes",
  );

  revalidatePath(
    "/admin/routes/driver",
  );

  revalidatePath(
    "/admin/routes/driver/checklists",
  );

  revalidatePath(
    `/admin/bookings/${bookingId}`,
  );

  revalidatePath(
    `/admin/bookings/${bookingId}/routes`,
  );

  if (
    isStaffSendToCustomer &&
    staffCompletionUrl
  ) {
    const query =
      new URLSearchParams({
        completionUrl:
          staffCompletionUrl,
        completionEmail:
          staffCompletionEmailStatus,
      });

    redirect(
      `/admin/bookings/${bookingId}?${query.toString()}`,
    );
  }

  redirect(
    `/admin/bookings/${bookingId}`,
  );
}
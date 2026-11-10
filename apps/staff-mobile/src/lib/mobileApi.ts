import { supabase } from "./supabase";

const DEFAULT_APP_URL = "https://bouncepartybooking.netlify.app";

function appUrl() {
  return String(
    process.env.EXPO_PUBLIC_APP_URL || DEFAULT_APP_URL,
  )
    .trim()
    .replace(/\/+$/, "");
}

type MobileApiResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

async function authenticatedFetch<T>(
  path: string,
  init: RequestInit,
): Promise<MobileApiResult<T>> {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;

  if (!token) {
    return {
      success: false,
      error: "Your session expired. Please sign in again.",
    };
  }

  try {
    const requestUrl = `${appUrl()}${path}`;

    const response = await fetch(requestUrl, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });

    const responseText = await response.text();

    let body: Record<string, unknown> = {};

    if (responseText) {
      try {
        const parsed = JSON.parse(responseText);
        if (
          parsed &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          body = parsed as Record<string, unknown>;
        }
      } catch {
        body = {};
      }
    }

    const contentType =
      String(response.headers.get("content-type") || "unknown")
        .trim() || "unknown";

    const normalizedBody = responseText
      .replace(/\s+/g, " ")
      .trim();

    const bodyPreview =
      normalizedBody.length > 250
        ? `${normalizedBody.slice(0, 250)}...`
        : normalizedBody || "(empty)";

    const diagnosticBase = [
      `HTTP ${response.status}`,
      `URL: ${response.url || requestUrl}`,
      `Content-Type: ${contentType}`,
    ].join("\n");

    if (!response.ok || body?.success === false) {
      if (typeof body?.error === "string") {
        return {
          success: false,
          error: `${body.error}\n${diagnosticBase}`,
        };
      }

      return {
        success: false,
        error: `${diagnosticBase}\nBody: ${bodyPreview}`,
      };
    }

    return {
      success: true,
      data: body as T,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not reach the Admin API.",
    };
  }
}

export async function cancelBookingFromMobile(
  bookingId: string,
  cancellationReason: string,
) {
  return authenticatedFetch<{
    success: true;
    alreadyCancelled: boolean;
    booking: {
      id: string;
      booking_number?: string | null;
      status?: string | null;
    };
  }>(
    `/api/admin/mobile/bookings/${encodeURIComponent(bookingId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({
        cancellationReason,
      }),
    },
  );
}

export type MobileNewBookingCustomer = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type MobileNewBookingProduct = {
  id: string;
  name?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  base_price?: number | string | null;
  price?: number | string | null;
  deposit_amount?: number | string | null;
  active?: boolean | null;
  image_url?: string | null;
  [key: string]: unknown;
};

export type MobileNewBookingCategory = {
  id: string;
  name?: string | null;
  active?: boolean | null;
  sort_order?: number | null;
};

export type MobileNewBookingModifierOption = {
  id: string;
  modifierGroupId?: string | null;
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  priceDelta?: number | null;
  inventoryItemId?: string | null;
  inventoryQuantity?: number | null;
  trackInventory?: boolean;
  inventoryBehavior?: "reusable" | "consumable";
  active?: boolean;
  sortOrder?: number | null;
};

export type MobileNewBookingModifierGroup = {
  connectionId?: string | null;
  productId: string;
  modifierGroupId?: string | null;
  id: string;
  name?: string | null;
  description?: string | null;
  required?: boolean;
  active?: boolean;
  sortOrder?: number | null;
  selectionType?: string | null;
  maxTotalQuantity?: number | null;
  imageUrl?: string | null;
  options: MobileNewBookingModifierOption[];
};

export type MobileNewBookingPaymentMethod = {
  method: string;
  displayName: string;
  integrationEnabled: boolean;
  integrationType: string;
  accountLabel: string | null;
  accountValue: string | null;
  iconUrl: string | null;
};

export type MobileNewBookingBootstrap = {
  customers: MobileNewBookingCustomer[];
  products: MobileNewBookingProduct[];
  categories: MobileNewBookingCategory[];
  modifierGroups: MobileNewBookingModifierGroup[];

  timeFormat: string;

  workingHours: Array<Record<string, unknown>>;

  workingHourExceptions: Array<Record<string, unknown>>;

  paymentMethods: MobileNewBookingPaymentMethod[];

  tipSettings: {
    tipsEnabled: boolean;
    allowCustomTip: boolean;
    tipMode: "percent" | "amount";
    defaultTipPercent: number;
    defaultTipAmount: number;
    tipPercentOptions: number[];
    tipAmountOptions: number[];
  };

  discountSecurity: {
    discount_password_enabled: boolean;
    discount_password_hint: string | null;
  };

  contractSettings: {
    template_html: string;
    require_contract_before_payment: boolean;
    require_typed_signature: boolean;
    signature_label: string;
  };
};

export async function loadNewBookingBootstrapFromMobile() {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileNewBookingBootstrap;
  }>(
    "/api/admin/mobile/bookings/new/bootstrap",
    {
      method: "GET",
    },
  );

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not load new booking data.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error:
        "New booking data was not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}
export type MobileNewBookingAvailabilityItem = {
  productId: string;
  available: boolean;
  remainingQuantity: number;
  message: string | null;
};

export type MobileNewBookingModifierAvailabilityItem = {
  optionId: string;
  optionName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  trackingType: string;
  quantityNeeded: number;
  quantityAvailable: number;
  available: boolean;
  reason: string | null;
};

export type MobileNewBookingAvailabilitySnapshot = {
  ok: boolean;
  message: string | null;
  items: MobileNewBookingAvailabilityItem[];
  modifierAvailabilityByProductId?: Record<
    string,
    MobileNewBookingModifierAvailabilityItem[]
  >;
};

export type MobileQuickAvailabilityCategory = {
  id: string;
  name: string;
  count: number;
};

export type MobileQuickAvailabilityItem = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string;
  available: boolean;
  remainingQuantity: number;
  message: string | null;
  checkFailed: boolean;
};

export type MobileQuickAvailabilitySnapshot = {
  ok: boolean;
  message: string | null;
  selectedDate: string;
  eventStartTime: string;
  eventEndTime: string;
  categories: MobileQuickAvailabilityCategory[];
  items: MobileQuickAvailabilityItem[];
};

export async function loadQuickAvailabilityFromMobile(params: {
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
}) {
  const query = new URLSearchParams({
    date: params.eventDate,
    start: params.eventStartTime,
    end: params.eventEndTime,
  }).toString();

  const result = await authenticatedFetch<{
    success: true;
    data: MobileQuickAvailabilitySnapshot;
  }>(`/api/admin/mobile/availability?${query}`, { method: "GET" });

  if (!result.success) {
    return {
      success: false as const,
      error: result.error || "Could not check availability.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error: "Availability was not returned by the server.",
    };
  }

  return { success: true as const, data: result.data.data };
}

export type MobileNewBookingPricingProductLine = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type MobileNewBookingPricingModifierLine = {
  productId: string;
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  quantity: number;
  productQuantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type MobileNewBookingPricing = {
  ok: boolean;
  products: MobileNewBookingPricingProductLine[];
  modifiers: MobileNewBookingPricingModifierLine[];
  productSubtotal: number;
  modifiersSubtotal: number;
  subtotal: number;
  discountAmount: number;
  minimumDeposit: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  taxableAmount: number;
  totalAmount: number;
  depositAmount: number;
  balanceDue: number;
  distanceMiles: number | null;
  deliveryMode: string;
  matchedZoneName: string | null;
  deliveryReason: string;
  deliveryError: string | null;
  taxError: string | null;
};

export async function verifyNewBookingDiscountPasswordFromMobile(
  password: string,
) {
  const result = await authenticatedFetch<{
    success: true;
    data: {
      ok: boolean;
      message: string;
    };
  }>(
    "/api/admin/mobile/bookings/new/discount/verify",
    {
      method: "POST",
      body: JSON.stringify({ password }),
    },
  );

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not verify discount password.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error:
        "Discount verification was not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}

export async function loadNewBookingPricingFromMobile(params: {
  setupAddress: string;
  setupCity: string;
  setupState: string;
  setupZip: string;
  discountAmount?: number;
  products: Array<{
    productId: string;
    quantity: number;
  }>;
  modifiers: Array<{
    productId: string;
    groupId: string;
    optionId: string;
    quantity: number;
  }>;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileNewBookingPricing;
  }>(
    "/api/admin/mobile/bookings/new/pricing",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
  );

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not calculate booking pricing.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error:
        "Booking pricing was not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}

export async function loadNewBookingAvailabilityFromMobile(params: {
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  productIds: string[];
  includeModifierAvailability?: boolean;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileNewBookingAvailabilitySnapshot;
  }>(
    "/api/admin/mobile/bookings/new/availability",
    {
      method: "POST",
      body: JSON.stringify({
        eventDate: params.eventDate,
        eventStartTime: params.eventStartTime,
        eventEndTime: params.eventEndTime,
        productIds: params.productIds,
        includeModifierAvailability:
          params.includeModifierAvailability === true,
      }),
    },
  );

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not check product availability.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error:
        "Product availability was not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}


export type MobileCreateBookingResult = {
  bookingId: string;
  reusedExistingBooking: boolean;
  completionUrl: string | null;
  completionEmailStatus:
    | "sent"
    | "not_configured"
    | "failed";
  status: string;
  totalAmount: number;
  balanceDue: number;
  stripeCheckoutUrl?: string | null;
};

export async function createNewBookingFromMobile(params: {
  bookingAttemptId: string;
  completionStrategy?:
    | "staff_send_to_customer"
    | "staff_complete_now";
  status?: string;
  existingCustomerId?: string | null;
  newCustomer?: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  } | null;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  setupAddress: string;
  setupCity: string;
  setupState: string;
  setupZip: string;
  products: Array<{
    productId: string;
    quantity: number;
  }>;
  modifiers: Array<{
    productId: string;
    groupId: string;
    optionId: string;
    quantity: number;
  }>;
  contract?: {
    accepted: boolean;
    signerName: string;
    manualSignature: string;
    signatureDataUrl: string;
  };
  payment?: {
    method: string;
    amount: number;
    reference?: string;
    tipMode?: "percent" | "amount";
    tipPercent?: number;
    tipAmount?: number;
    discountAmount?: number;
    discountPassword?: string;
  };
}) {
  const result =
    await authenticatedFetch<{
      success: true;
      data: MobileCreateBookingResult;
    }>(
      "/api/admin/mobile/bookings/new/create",
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not create booking.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error:
        "Created booking was not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}


export type MobileBookingPaymentSettings = {
  paymentMethods: Array<{
    method: string;
    displayName: string;
  }>;
  tipSettings: {
    tipsEnabled: boolean;
    allowCustomTip: boolean;
    tipMode: "percent" | "amount";
    defaultTipPercent: number;
    defaultTipAmount: number;
    tipPercentOptions: number[];
    tipAmountOptions: number[];
  };
};

export type MobileAddBookingPaymentResult = {
  bookingId: string;
  paymentId: string | null;
  method: string;
  amount: number;
  baseAmount: number;
  tipAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  balanceDue: number;
  paidAt: string | null;
  stripeCheckoutUrl: string | null;
};

export async function loadBookingPaymentSettingsFromMobile() {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileBookingPaymentSettings;
  }>("/api/admin/mobile/bookings/payment", { method: "GET" });

  if (!result.success) {
    return {
      success: false as const,
      error: result.error || "Could not load payment settings.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error: "Payment settings were not returned by the server.",
    };
  }

  return { success: true as const, data: result.data.data };
}

export async function addBookingPaymentFromMobile(params: {
  bookingId: string;
  amount: number;
  method: string;
  baseAmount?: number;
  tipAmount?: number;
  note?: string;
  discountAmount?: number;
  discountPassword?: string;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileAddBookingPaymentResult;
  }>("/api/admin/mobile/bookings/payment", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!result.success) {
    return {
      success: false as const,
      error: result.error || "Could not add payment.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error: "Payment result was not returned by the server.",
    };
  }

  return { success: true as const, data: result.data.data };
}

export type MobileUpdateBookingDiscountResult = {
  bookingId: string;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  balanceDue: number;
};

export async function updateBookingDiscountFromMobile(params: {
  bookingId: string;
  discountAmount: number;
  discountPassword?: string;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileUpdateBookingDiscountResult;
  }>("/api/admin/mobile/bookings/discount", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!result.success) {
    return {
      success: false as const,
      error: result.error || "Could not update discount.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error: "Discount result was not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}

export type MobileBookingDiscountSettings = {
  passwordEnabled: boolean;
  passwordHint: string;
};

export async function loadBookingDiscountSettingsFromMobile() {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileBookingDiscountSettings;
  }>("/api/admin/mobile/bookings/discount", {
    method: "GET",
  });

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not load discount settings.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error:
        "Discount settings were not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}

export type MobileBookingArchiveResult = {
  bookingId: string;
  archived: boolean;
  archivedAt: string | null;
};

export async function setBookingArchivedFromMobile(params: {
  bookingId: string;
  archived: boolean;
  archiveReason?: string;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileBookingArchiveResult;
  }>("/api/admin/mobile/bookings/archive", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!result.success) {
    return {
      success: false as const,
      error: result.error || "Could not update booking archive state.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error: "Booking archive result was not returned by the server.",
    };
  }

  return { success: true as const, data: result.data.data };
}

export type MobileTaskStatusResult = {
  taskId: string;
  status: "open" | "completed";
  completedAt: string | null;
};

export async function setTaskCompletedFromMobile(params: {
  taskId: string;
  completed: boolean;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileTaskStatusResult;
  }>("/api/admin/mobile/tasks/status", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!result.success) {
    return {
      success: false as const,
      error: result.error || "Could not update task status.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error: "Task status result was not returned by the server.",
    };
  }

  return { success: true as const, data: result.data.data };
}

export type MobileRouteWeatherForecast = {
  temperatureF: number | null;
  condition: string | null;
  windMph: number | null;
  gustMph: number | null;
  forecastTime: string | null;
};

export async function loadDriverRouteWeatherFromMobile(date: string) {
  const result = await authenticatedFetch<{
    success: true;
    data: Record<string, MobileRouteWeatherForecast | null>;
  }>(`/api/mobile/driver/weather?date=${encodeURIComponent(date)}`, {
    method: "GET",
  });

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not load route weather.",
    };
  }

  return {
    success: true as const,
    data: result.data?.data || {},
  };
}

export type MobileDriverManualPaymentMethod =
  | "cash"
  | "zelle"
  | "venmo"
  | "card";

export type MobileDriverPaymentNotCollectedReason =
  | "customer_will_pay_later"
  | "customer_not_available"
  | "online_payment_pending"
  | "payment_issue"
  | "other";

export type MobileDriverCollectPaymentResult = {
  stopId: string;
  bookingId: string;
  method: MobileDriverManualPaymentMethod;
  amountRecorded: number;
  amountReported?: number;
  balanceDue: number;
  alreadyReported: boolean;
  reportStatus?: "reported" | "already_reported" | "no_balance_due";
  reportedAt?: string | null;
};

export type MobileDriverPaymentNotCollectedResult = {
  stopId: string;
  bookingId: string;
  reason: MobileDriverPaymentNotCollectedReason;
  comment?: string | null;
  outstandingBalance: number;
  alreadyReported: boolean;
  reportStatus?: "reported" | "already_reported" | "no_balance_due";
  reportedAt?: string | null;
};

export async function collectDriverManualPaymentFromMobile(params: {
  stopId: string;
  method: MobileDriverManualPaymentMethod;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileDriverCollectPaymentResult;
  }>("/api/mobile/driver/payments/collect", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not collect payment.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error:
        "Payment result was not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}

export async function reportDriverPaymentNotCollectedFromMobile(params: {
  stopId: string;
  reason: MobileDriverPaymentNotCollectedReason;
  comment?: string;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: MobileDriverPaymentNotCollectedResult;
  }>("/api/mobile/driver/payments/not-collected", {
    method: "POST",
    body: JSON.stringify(params),
  });

  if (!result.success) {
    return {
      success: false as const,
      error:
        result.error ||
        "Could not report payment-not-collected.",
    };
  }

  if (!result.data?.data) {
    return {
      success: false as const,
      error:
        "Payment-not-collected result was not returned by the server.",
    };
  }

  return {
    success: true as const,
    data: result.data.data,
  };
}

export type MobileNotification = {
  id: string;
  event_code?: string | null;
  subject?: string | null;
  rendered_body?: string | null;
  booking_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
};

export async function loadMobileNotifications() {
  const result = await authenticatedFetch<{
    success: true;
    data: { unreadCount: number; deliveries: MobileNotification[] };
  }>("/api/admin/mobile/notifications", { method: "GET" });

  if (!result.success || !result.data?.data) {
    return {
      success: false as const,
      error: result.error || "Could not load notifications.",
    };
  }

  return { success: true as const, data: result.data.data };
}

export async function markMobileNotificationsRead(params: {
  deliveryId?: string;
  markAll?: boolean;
}) {
  const result = await authenticatedFetch<{ success: true }>(
    "/api/admin/mobile/notifications",
    { method: "POST", body: JSON.stringify(params) },
  );

  if (!result.success) {
    return {
      success: false as const,
      error: result.error || "Could not mark notifications as read.",
    };
  }

  return { success: true as const };
}

export type MobileCleaningTask = {
  id: string;
  status?: "waiting" | "in_progress" | "problem" | string | null;
  quantity?: number | null;
  notes?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  inventory_items?: { name?: string | null; sku?: string | null } | Array<{ name?: string | null; sku?: string | null }> | null;
  inventory_units?: { unit_code?: string | null } | Array<{ unit_code?: string | null }> | null;
  bookings?: { booking_number?: string | null; event_date?: string | null } | Array<{ booking_number?: string | null; event_date?: string | null }> | null;
};

export async function loadMobileCleaningTasks() {
  const result = await authenticatedFetch<{
    success: true;
    data: { tasks: MobileCleaningTask[] };
  }>("/api/admin/mobile/inventory/cleaning", { method: "GET" });
  if (!result.success || !result.data?.data) {
    return { success: false as const, error: result.error || "Could not load the cleaning queue." };
  }
  return { success: true as const, data: result.data.data };
}

export async function updateMobileCleaningTask(params: {
  taskId: string;
  action: "start" | "complete" | "problem";
  notes?: string;
}) {
  const result = await authenticatedFetch<{ success: true }>(
    "/api/admin/mobile/inventory/cleaning",
    { method: "POST", body: JSON.stringify(params) },
  );
  if (!result.success) {
    return { success: false as const, error: result.error || "Could not update the cleaning task." };
  }
  return { success: true as const };
}

export type MobileReturnReservation = {
  id: string;
  status: string | null;
  quantity: number | null;
  reserved_until: string | null;
  picked_up_at: string | null;
  inventory_items?: { id: string; name: string | null; sku: string | null } | Array<{ id: string; name: string | null; sku: string | null }> | null;
  inventory_units?: { id: string; unit_code: string | null; status: string | null } | Array<{ id: string; unit_code: string | null; status: string | null }> | null;
  bookings?: { id: string; booking_number: string | null; event_date: string | null; customers?: { id: string; full_name: string | null } | Array<{ id: string; full_name: string | null }> | null } | Array<{ id: string; booking_number: string | null; event_date: string | null; customers?: { id: string; full_name: string | null } | Array<{ id: string; full_name: string | null }> | null }> | null;
};

export async function loadMobileReturns() {
  const result = await authenticatedFetch<{
    success: true;
    data: { reservations: MobileReturnReservation[]; defaultLocationId: string | null };
  }>("/api/admin/mobile/inventory/returns", { method: "GET" });
  if (!result.success || !result.data?.data) {
    return { success: false as const, error: result.error || "Could not load returns." };
  }
  return { success: true as const, data: result.data.data };
}

export async function processMobileReturn(params: {
  reservationId: string;
  itemId: string;
  unitId?: string | null;
  bookingId?: string | null;
  currentStatus?: string | null;
  resultStatus: "available" | "returned" | "cleaning" | "maintenance" | "damaged";
  locationId?: string | null;
  notes?: string;
}) {
  const result = await authenticatedFetch<{ success: true }>("/api/admin/mobile/inventory/returns", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.success
    ? { success: true as const }
    : { success: false as const, error: result.error || "Could not process return." };
}

export type MobileDamageReport = {
  id: string;
  title: string | null;
  severity: string | null;
  status: string | null;
  repair_cost: number | string | null;
  description: string | null;
  reported_at: string | null;
  resolved_at: string | null;
  inventory_items?: { id: string; name: string | null; sku: string | null } | Array<{ id: string; name: string | null; sku: string | null }> | null;
  inventory_units?: { id: string; unit_code: string | null; serial_number: string | null; status: string | null } | Array<{ id: string; unit_code: string | null; serial_number: string | null; status: string | null }> | null;
  bookings?: { id: string; booking_number: string | null; event_date: string | null } | Array<{ id: string; booking_number: string | null; event_date: string | null }> | null;
};

export async function loadMobileDamageReports() {
  const result = await authenticatedFetch<{
    success: true;
    data: { reports: MobileDamageReport[] };
  }>("/api/admin/mobile/inventory/damages", { method: "GET" });
  if (!result.success || !result.data?.data) {
    return { success: false as const, error: result.error || "Could not load damage reports." };
  }
  return { success: true as const, data: result.data.data };
}

export async function updateMobileDamageReport(params: {
  reportId: string;
  status: "open" | "in_repair" | "resolved" | "closed";
  unitStatus?: "maintenance" | "damaged" | "available" | "retired";
  notes?: string;
}) {
  const result = await authenticatedFetch<{ success: true }>("/api/admin/mobile/inventory/damages", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.success
    ? { success: true as const }
    : { success: false as const, error: result.error || "Could not update damage report." };
}

export type MobileReceiveItem = {
  id: string;
  name: string | null;
  sku: string | null;
  category_id: string | null;
  tracking_type: string | null;
  default_purchase_price: number | string | null;
  quantity_available: number | string | null;
  image_url: string | null;
};

export type MobileReceiveOption = {
  id: string;
  name: string | null;
  slug?: string | null;
  location_type?: string | null;
};

export async function loadMobileReceiveStock() {
  const result = await authenticatedFetch<{
    success: true;
    data: {
      items: MobileReceiveItem[];
      categories: MobileReceiveOption[];
      locations: MobileReceiveOption[];
      defaultLocationId: string | null;
    };
  }>("/api/admin/mobile/inventory/receive", { method: "GET" });
  if (!result.success || !result.data?.data) {
    return { success: false as const, error: result.error || "Could not load inventory receiving." };
  }
  return { success: true as const, data: result.data.data };
}

export async function receiveMobileInventoryStock(params: {
  itemId: string;
  locationId?: string | null;
  quantity: number;
  purchasePrice: number;
  serialPrefix?: string;
  condition?: string;
  notes?: string;
}) {
  const result = await authenticatedFetch<{
    success: true;
    data: { itemId: string; received: number; unitCodes: string[] };
  }>("/api/admin/mobile/inventory/receive", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (!result.success || !result.data?.data) {
    return { success: false as const, error: result.error || "Could not receive inventory stock." };
  }
  return { success: true as const, data: result.data.data };
}

export type MobileInventoryCountLine = {
  id: string; inventory_item_id: string | null; inventory_unit_id: string | null;
  expected_quantity: number | string | null; counted_quantity: number | string | null;
  difference_quantity: number | string | null; expected_status: string | null;
  counted_status: string | null; notes: string | null;
  inventory_items?: { id: string; name: string | null; sku: string | null; tracking_type: string | null } | Array<{ id: string; name: string | null; sku: string | null; tracking_type: string | null }> | null;
  inventory_units?: { id: string; unit_code: string | null; status: string | null } | Array<{ id: string; unit_code: string | null; status: string | null }> | null;
};

export type MobileInventoryCount = {
  id: string; count_number: string | null; status: string | null; warehouse_location_id: string | null;
  started_at: string | null; completed_at: string | null; notes: string | null;
  warehouse_locations?: { id: string; name: string | null; location_type: string | null } | Array<{ id: string; name: string | null; location_type: string | null }> | null;
  inventory_count_lines?: MobileInventoryCountLine[] | null;
};

export async function loadMobileInventoryCounts() {
  const result = await authenticatedFetch<{ success: true; data: {
    locations: MobileReceiveOption[]; counts: MobileInventoryCount[]; statuses: string[];
  } }>("/api/admin/mobile/inventory/counts", { method: "GET" });
  if (!result.success || !result.data?.data) return { success: false as const, error: result.error || "Could not load inventory counts." };
  return { success: true as const, data: result.data.data };
}

export async function updateMobileInventoryCount(params: {
  action: "start" | "update_line" | "complete" | "cancel";
  countId?: string; lineId?: string; locationId?: string | null; expectedQuantity?: number;
  countedQuantity?: number; countedStatus?: string | null; notes?: string;
}) {
  const result = await authenticatedFetch<{ success: true; data?: unknown }>("/api/admin/mobile/inventory/counts", { method: "POST", body: JSON.stringify(params) });
  return result.success ? { success: true as const, data: result.data?.data } : { success: false as const, error: result.error || "Could not update inventory count." };
}

export type MobileInventoryMovement = {
  id: string; movement_type: string | null; quantity: number | string | null;
  from_status: string | null; to_status: string | null; reason: string | null; notes: string | null; created_at: string | null;
  inventory_items?: { id: string; name: string | null; sku: string | null } | Array<{ id: string; name: string | null; sku: string | null }> | null;
  inventory_units?: { id: string; unit_code: string | null; status: string | null } | Array<{ id: string; unit_code: string | null; status: string | null }> | null;
  bookings?: { id: string; booking_number: string | null; event_date: string | null; customers?: { id: string; full_name: string | null } | Array<{ id: string; full_name: string | null }> | null } | Array<{ id: string; booking_number: string | null; event_date: string | null; customers?: { id: string; full_name: string | null } | Array<{ id: string; full_name: string | null }> | null }> | null;
  from_location?: { id: string; name: string | null; location_type: string | null } | Array<{ id: string; name: string | null; location_type: string | null }> | null;
  to_location?: { id: string; name: string | null; location_type: string | null } | Array<{ id: string; name: string | null; location_type: string | null }> | null;
};

export async function loadMobileInventoryMovements() {
  const result = await authenticatedFetch<{ success: true; data: { movements: MobileInventoryMovement[] } }>("/api/admin/mobile/inventory/movements", { method: "GET" });
  if (!result.success || !result.data?.data) return { success: false as const, error: result.error || "Could not load inventory movements." };
  return { success: true as const, data: result.data.data };
}

export type MobileWarehouseUnit = {
  id: string; unit_code: string | null; status: string | null; condition: string | null; warehouse_location_id: string | null;
  inventory_items?: { id: string; name: string | null; sku: string | null; tracking_type: string | null } | Array<{ id: string; name: string | null; sku: string | null; tracking_type: string | null }> | null;
  warehouse_locations?: { id: string; name: string | null; location_type: string | null } | Array<{ id: string; name: string | null; location_type: string | null }> | null;
};
export type MobileInventoryAdjustment = {
  id: string; adjustment_type: string | null; quantity_change: number | string | null; from_status: string | null; to_status: string | null;
  reason: string | null; notes: string | null; created_at: string | null;
  inventory_items?: { id: string; name: string | null; sku: string | null } | Array<{ id: string; name: string | null; sku: string | null }> | null;
  inventory_units?: { id: string; unit_code: string | null } | Array<{ id: string; unit_code: string | null }> | null;
};

export async function loadMobileWarehouseOperations() {
  const result = await authenticatedFetch<{ success: true; data: { units: MobileWarehouseUnit[]; locations: MobileReceiveOption[]; adjustments: MobileInventoryAdjustment[] } }>("/api/admin/mobile/inventory/operations", { method: "GET" });
  if (!result.success || !result.data?.data) return { success: false as const, error: result.error || "Could not load warehouse operations." };
  return { success: true as const, data: result.data.data };
}

export async function updateMobileWarehouseOperation(params: {
  action: "transfer" | "write_off"; unitId: string; locationId?: string | null;
  toStatus?: "retired" | "lost" | "damaged" | "maintenance"; reason?: string; notes?: string;
}) {
  const result = await authenticatedFetch<{ success: true }>("/api/admin/mobile/inventory/operations", { method: "POST", body: JSON.stringify(params) });
  return result.success ? { success: true as const } : { success: false as const, error: result.error || "Could not update warehouse unit." };
}

export type MobileSupplyItem = {
  id: string; name: string | null; sku: string | null; tracking_type: string | null; default_purchase_price: number | string | null;
};
export type MobileSupplyLine = {
  id: string; inventory_item_id: string | null; quantity: number | string | null; unit_cost: number | string | null;
  total_cost: number | string | null; condition: string | null; notes: string | null; received_at: string | null;
  inventory_items?: MobileSupplyItem | MobileSupplyItem[] | null;
};
export type MobileSupply = {
  id: string; supply_number: string | null; supplier_name: string | null; warehouse_location_id: string | null;
  received_by: string | null; currency: string | null; status: string | null; supply_date: string | null; received_at: string | null;
  notes: string | null; created_at: string | null;
  warehouse_locations?: MobileReceiveOption | MobileReceiveOption[] | null;
  inventory_supply_lines?: MobileSupplyLine[] | null;
};

export async function loadMobileSupplies() {
  const result = await authenticatedFetch<{ success: true; data: { supplies: MobileSupply[]; items: MobileSupplyItem[]; locations: MobileReceiveOption[] } }>("/api/admin/mobile/inventory/supplies", { method: "GET" });
  if (!result.success || !result.data?.data) return { success: false as const, error: result.error || "Could not load supplies." };
  return { success: true as const, data: result.data.data };
}

export async function updateMobileSupply(params: {
  action: "create" | "add_line" | "cancel" | "receive"; supplyId?: string; supplierName?: string; locationId?: string;
  receivedBy?: string; currency?: string; notes?: string; itemId?: string; quantity?: number; unitCost?: number; condition?: string;
}) {
  const result = await authenticatedFetch<{ success: true; data?: { supplyId?: string } }>("/api/admin/mobile/inventory/supplies", { method: "POST", body: JSON.stringify(params) });
  return result.success ? { success: true as const, data: result.data?.data } : { success: false as const, error: result.error || "Could not update supply." };
}

export type MobileInventorySetupRecord = {
  id: string; name: string | null; slug: string | null; parent_id: string | null; description: string | null;
  sort_order: number | string | null; active: boolean | null; location_type?: string | null;
};
export async function loadMobileInventorySetup() {
  const result = await authenticatedFetch<{ success: true; data: { categories: MobileInventorySetupRecord[]; locations: MobileInventorySetupRecord[]; categoryCounts: Record<string, number>; locationCounts: Record<string, number> } }>("/api/admin/mobile/inventory/setup", { method: "GET" });
  if (!result.success || !result.data?.data) return { success: false as const, error: result.error || "Could not load warehouse setup." };
  return { success: true as const, data: result.data.data };
}
export async function updateMobileInventorySetup(params: { action: "create" | "toggle"; kind: "category" | "location"; id?: string; active?: boolean; name?: string; parentId?: string | null; description?: string; sortOrder?: number; locationType?: string }) {
  const result = await authenticatedFetch<{ success: true }>("/api/admin/mobile/inventory/setup", { method: "POST", body: JSON.stringify(params) });
  return result.success ? { success: true as const } : { success: false as const, error: result.error || "Could not update warehouse setup." };
}

export type MobileCrmConversation = {
  id: string; display_name?: string; subject?: string | null; status?: string | null;
  conversation_scope?: string | null; last_channel?: string | null; last_message?: string | null;
  last_message_at?: string | null; unread_count?: number | null; needs_reply?: boolean | null;
};
export type MobileCrmMessage = {
  id: string; direction?: string | null; channel?: string | null; sender_identity?: string | null;
  body_text?: string | null; sent_at?: string | null; created_at?: string | null;
};

export async function loadMobileCrmInbox(conversationId?: string) {
  const suffix = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
  const result = await authenticatedFetch<{ success: true; data: { conversations?: MobileCrmConversation[]; conversation?: MobileCrmConversation; messages?: MobileCrmMessage[] } }>(`/api/admin/mobile/crm/inbox${suffix}`, { method: "GET" });
  if (!result.success || !result.data?.data) return { success: false as const, error: result.error || "Could not load CRM Inbox." };
  return { success: true as const, data: result.data.data };
}

export async function updateMobileCrmConversation(params: { action: "read" | "reply"; conversationId: string; body?: string }) {
  const result = await authenticatedFetch<{ success: true }>("/api/admin/mobile/crm/inbox", { method: "POST", body: JSON.stringify(params) });
  if (!result.success) return { success: false as const, error: result.error || "Could not update CRM conversation." };
  return { success: true as const };
}

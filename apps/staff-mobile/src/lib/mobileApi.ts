import { supabase } from "./supabase";

const DEFAULT_APP_URL = "https://bouncepartyla.com";

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
    const response = await fetch(`${appUrl()}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });

    const body = await response
      .json()
      .catch(() => ({} as Record<string, unknown>));

    if (!response.ok || body?.success === false) {
      return {
        success: false,
        error:
          typeof body?.error === "string"
            ? body.error
            : `Request failed (${response.status}).`,
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

export async function loadNewBookingPricingFromMobile(params: {
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
};

export async function createNewBookingFromMobile(params: {
  bookingAttemptId: string;
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

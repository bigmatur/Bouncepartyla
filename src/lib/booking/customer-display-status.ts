export type CustomerDisplayStatusCode =
  | "awaiting_approval"
  | "approval_approved"
  | "approval_rejected"
  | "approval_expired"
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
  | "refunded"
  | "unknown";

export type CustomerDisplayStatusInput = {
  bookingStatus: string | null | undefined;
  bookingSource?: string | null | undefined;
  customerApprovalState?: string | null | undefined;
  customerApprovalExpiresAt?: string | null | undefined;
  paymentStatus?: string | null | undefined;
};

const LABELS: Record<CustomerDisplayStatusCode, string> = {
  awaiting_approval: "Awaiting review",
  approval_approved: "Approved - continue to payment",
  approval_rejected: "Request declined",
  approval_expired: "Payment window expired",
  draft: "Booking started",
  quote: "Quote prepared",
  pending_deposit: "Waiting for deposit",
  booked: "Booked",
  scheduled: "Scheduled",
  inventory_reserved: "Equipment reserved",
  picking: "Preparing equipment",
  loaded: "Equipment loaded",
  out_for_delivery: "Out for delivery",
  installed: "Installed",
  pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  returned: "Returned",
  cleaning: "Equipment cleaning",
  closed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  unknown: "Unknown",
};

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function toKnownStatusCode(value: string): CustomerDisplayStatusCode {
  switch (value) {
    case "draft":
    case "quote":
    case "pending_deposit":
    case "booked":
    case "scheduled":
    case "inventory_reserved":
    case "picking":
    case "loaded":
    case "out_for_delivery":
    case "installed":
    case "pickup_scheduled":
    case "picked_up":
    case "returned":
    case "cleaning":
    case "closed":
    case "cancelled":
    case "refunded":
      return value;

    default:
      return "unknown";
  }
}

export function resolveCustomerDisplayStatus(
  input: CustomerDisplayStatusInput,
): CustomerDisplayStatusCode {
  const status = normalize(input.bookingStatus);
  const source = normalize(input.bookingSource);
  const approval = normalize(input.customerApprovalState);

  if (source === "customer_self_service" && status === "pending_deposit") {
    if (approval === "pending") {
      return "awaiting_approval";
    }

    if (approval === "approved") {
      const approvalExpiresAtMs = Date.parse(String(input.customerApprovalExpiresAt || ""));

      if (Number.isFinite(approvalExpiresAtMs) && approvalExpiresAtMs <= Date.now()) {
        return "approval_expired";
      }

      return "approval_approved";
    }

    if (approval === "rejected") {
      return "approval_rejected";
    }

    if (approval === "expired") {
      return "approval_expired";
    }
  }

  return toKnownStatusCode(status);
}

export function customerDisplayStatusLabel(code: CustomerDisplayStatusCode) {
  if (code === "unknown") {
    return "Unknown";
  }

  return LABELS[code];
}

"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireCustomerAccess } from "@/lib/auth/require-customer";
import { executeCreateBooking } from "@/features/booking/engine/create-booking";
import { buildCustomerCreateBookingCommand } from "@/features/booking/adapters/customer-create-booking-command";
import { validateBookingItemsAvailability } from "@/features/booking/server/validate-booking-items-availability";
import { processNotificationQueueBestEffort } from "@/lib/notifications/engine";
import { createStripeCheckoutSession } from "@/lib/payments/stripe";
import {
  attachAvailabilityToBookingItems,
  getCombinedReservationWindow,
  normalizeBookingItemRequests,
} from "@/features/booking/server/normalize-booking-request";
import {
  getBookingFormNumber as getNumber,
  getBookingFormString as getString,
  parseCustomerBookingItems,
  parseModifierQuantityJson,
  parseModifierSelectionsForProduct,
} from "@/lib/booking/form-data";

function normalizeActionErrorMessage(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as any).message || "")
      : String(error || "");

  const cleaned = message.trim();

  if (!cleaned) {
    return "Could not confirm booking. Please try again.";
  }

  return cleaned.slice(0, 500);
}

function isNextRedirectError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const digest = String((error as any)?.digest || "");
  return digest.startsWith("NEXT_REDIRECT");
}

function toSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function classifyBookingError(error: unknown): {
  code: "availability" | "contract" | "validation" | "system";
  message: string;
  focus: "quantity" | "address" | "modifiers" | "contract" | "summary";
} {
  const raw = normalizeActionErrorMessage(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes("not available") ||
    lower.includes("missing:") ||
    lower.includes("not enough") ||
    lower.includes("no available option for alternative group")
  ) {
    return {
      code: "availability",
      message: raw,
      focus:
        lower.includes("alternative group") || lower.includes("modifier")
          ? "modifiers"
          : lower.includes("required") && lower.includes("available")
            ? "quantity"
            : "summary",
    };
  }

  if (lower.includes("contract") || lower.includes("signature")) {
    return {
      code: "contract",
      message: raw,
      focus: "contract",
    };
  }

  if (
    lower.includes("required") ||
    lower.includes("choose ") ||
    lower.includes("invalid") ||
    lower.includes("must")
  ) {
    return {
      code: "validation",
      message: raw,
      focus:
        lower.includes("address") || lower.includes("zip") || lower.includes("city")
          ? "address"
          : lower.includes("quantity")
            ? "quantity"
            : "summary",
    };
  }

  return {
    code: "system",
    message: raw,
    focus: "summary",
  };
}

function buildBookNowRedirectUrl(params: {
  productId: string;
  eventDate: string;
  quantity: number;
  setupAddress: string;
  setupCity: string;
  setupZip: string;
  selectedModifierGroupOptionIds: string[];
  selectedModifierOptionQuantities: Record<string, number>;
  bookingError?: string;
  bookingErrorCode?: "availability" | "contract" | "validation" | "system";
  bookingFocus?: "quantity" | "address" | "modifiers" | "contract" | "summary";
}) {
  const query = new URLSearchParams();

  query.set("productId", params.productId);
  query.set("date", params.eventDate);
  query.set("quantity", String(params.quantity));

  if (params.setupAddress) query.set("setupAddress", params.setupAddress);
  if (params.setupCity) query.set("setupCity", params.setupCity);
  if (params.setupZip) query.set("setupZip", params.setupZip);

  for (const optionId of params.selectedModifierGroupOptionIds) {
    query.append("selectedModifierGroupOptionIds", optionId);
  }

  if (Object.keys(params.selectedModifierOptionQuantities).length > 0) {
    query.set(
      "selectedModifierOptionQuantities",
      JSON.stringify(params.selectedModifierOptionQuantities)
    );
  }

  if (params.bookingError) {
    query.set("bookingError", params.bookingError);
  }

  if (params.bookingErrorCode) {
    query.set("bookingErrorCode", params.bookingErrorCode);
  }

  if (params.bookingFocus) {
    query.set("bookingFocus", params.bookingFocus);
  }

  return `/account/book-now?${query.toString()}`;
}

export async function createCustomerBookingAction(formData: FormData) {
  const { supabase, access } = await requireCustomerAccess();

  const indexedBookingItems = parseCustomerBookingItems(formData);
  const firstIndexedItem = indexedBookingItems[0];
  const productId = getString(formData, "productId") || firstIndexedItem?.productId || "";
  const bookingAttemptId = getString(formData, "bookingAttemptId");
  const eventDate = getString(formData, "eventDate");
  const eventStartTime = getString(formData, "eventStartTime");
  const eventEndTime = getString(formData, "eventEndTime");
  const quantity = Math.max(1, Math.floor(getNumber(formData, "quantity", firstIndexedItem?.quantity || 1)));
  const setupAddress = getString(formData, "setupAddress");
  const setupCity = getString(formData, "setupCity");
  const setupState = getString(formData, "setupState");
  const setupZip = getString(formData, "setupZip");
  const existingCustomerId = getString(formData, "existingCustomerId");
  const customerFirstName = getString(formData, "customerFirstName");
  const customerLastName = getString(formData, "customerLastName");
  const customerNameField = getString(formData, "customerName");
  const customerPhoneInput = getString(formData, "customerPhone");
  const customerEmailField = getString(formData, "customerEmail");
  // Customer checkout is card-only. Never trust a client-posted manual method.
  const paymentMethod = "stripe";
  const paymentAmount = Math.max(0, getNumber(formData, "paymentAmount", 0));
  const tipAmount = Math.max(0, getNumber(formData, "tipAmount", 0));
  const paymentReference = getString(formData, "paymentReference");

  const selectedModifierGroupOptionIdsRaw = formData
    .getAll("selectedModifierGroupOptionIds")
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const selectedModifierOptionQuantitiesRaw = parseModifierQuantityJson(formData);
  const indexedModifiers = productId
    ? parseModifierSelectionsForProduct(formData, productId)
    : { optionIds: [] as string[], quantities: {} as Record<string, number> };
  const selectedModifierGroupOptionIds = selectedModifierGroupOptionIdsRaw.length > 0
    ? selectedModifierGroupOptionIdsRaw
    : indexedModifiers.optionIds;
  const selectedModifierOptionQuantities =
    Object.keys(selectedModifierOptionQuantitiesRaw).length > 0
      ? selectedModifierOptionQuantitiesRaw
      : indexedModifiers.quantities;

  const contractAcceptedRaw = getString(formData, "contractAccepted").toLowerCase();
  const contractAccepted = ["yes", "true", "1", "on"].includes(contractAcceptedRaw);
  const contractSignerName = getString(formData, "contractSignerName");
  const contractManualSignature = getString(formData, "contractManualSignature");
  const contractSignatureDataUrl = getString(formData, "contractSignatureDataUrl");
  const contractRenderedHtml = getString(formData, "contractRenderedHtml");

  let safeExistingCustomerId = "";

  if (access.user?.id) {
    const ownCustomerLookup = await supabase
      .from("customers")
      .select("id")
      .eq("auth_user_id", access.user.id)
      .limit(1)
      .maybeSingle();

    if (ownCustomerLookup.error) {
      throw new Error(ownCustomerLookup.error.message);
    }

    if (ownCustomerLookup.data?.id) {
      safeExistingCustomerId = String(ownCustomerLookup.data.id);
    }
  }

  if (!safeExistingCustomerId && existingCustomerId && access.user?.id) {
    const existingCustomerLookup = await supabase
      .from("customers")
      .select("id")
      .eq("id", existingCustomerId)
      .eq("auth_user_id", access.user.id)
      .maybeSingle();

    if (existingCustomerLookup.error) {
      throw new Error(existingCustomerLookup.error.message);
    }

    if (existingCustomerLookup.data?.id) {
      safeExistingCustomerId = String(existingCustomerLookup.data.id);
    }
  }

  if (indexedBookingItems.length === 0 && !productId) {
    throw new Error("Choose at least one product first.");
  }

  if (bookingAttemptId) {
    const existingAttemptResult = await supabase
      .from("bookings")
      .select("id")
      .eq("booking_attempt_id", bookingAttemptId)
      .limit(1)
      .maybeSingle();

    if (existingAttemptResult.error && String(existingAttemptResult.error.code || "") !== "42703") {
      throw new Error(existingAttemptResult.error.message);
    }

    if (existingAttemptResult.data?.id) {
      redirect(`/account/bookings/${existingAttemptResult.data.id}`);
    }
  }

  if (!eventDate) {
    throw new Error("Choose event date.");
  }

  const contractSettingsResult = await supabase
    .from("booking_contract_settings")
    .select("require_contract_before_payment, require_typed_signature, signature_label")
    .limit(1)
    .maybeSingle();

  if (contractSettingsResult.error) {
    throw new Error(contractSettingsResult.error.message);
  }

  const contractSettings = contractSettingsResult.data;

  if (contractSettings?.require_contract_before_payment !== false) {
    if (!contractAccepted) {
      throw new Error("Contract must be accepted before booking.");
    }

    if (contractSettings?.require_typed_signature !== false && !contractSignerName) {
      throw new Error("Type your full name to sign the contract.");
    }
  }

  const customerName = [customerFirstName, customerLastName]
    .filter(Boolean)
    .join(" ")
    .trim() ||
    customerNameField ||
    String(access.displayName || access.user?.email || "Customer").trim();

  const resolvedCustomerId = safeExistingCustomerId;
  const customerEmail = String(customerEmailField || access.user?.email || "").trim();
  const customerPhone = String(customerPhoneInput || "").trim();
  const requestedItems = indexedBookingItems.length > 0
    ? indexedBookingItems
    : [{ productId, quantity }];

  const requestedItemsWithModifiers = normalizeBookingItemRequests(
    requestedItems.map((item) => {
      const itemModifiers = parseModifierSelectionsForProduct(formData, item.productId);

      return {
        productId: item.productId,
        quantity: item.quantity,
        selectedModifierGroupOptionIds: itemModifiers.optionIds,
        selectedModifierOptionQuantities: itemModifiers.quantities,
      };
    }),
  );

  let provisionalBookingId: string | null = null;

  try {
    const availabilityResults = await validateBookingItemsAvailability({
      items: requestedItemsWithModifiers,
      eventDate,
      eventStartTime: eventStartTime || undefined,
      eventEndTime: eventEndTime || undefined,
      bookingActor: "customer",
    });

    const itemsWithAvailability = attachAvailabilityToBookingItems({
      items: requestedItemsWithModifiers,
      availabilityResults,
    });

    const { reservedFrom, reservedUntil } = getCombinedReservationWindow(
      itemsWithAvailability,
    );

    const command = buildCustomerCreateBookingCommand({
      customerId: resolvedCustomerId || undefined,
      authUserId: access.user?.id || undefined,
      customerName,
      customerEmail: customerEmail || undefined,
      customerPhone: customerPhone || undefined,
      attemptId: bookingAttemptId || undefined,
      items: itemsWithAvailability,
      eventDate,
      eventStartTime: eventStartTime || undefined,
      eventEndTime: eventEndTime || undefined,
      setupAddress: setupAddress || undefined,
      setupCity: setupCity || undefined,
      setupZip: setupZip || undefined,
      reservedFrom,
      reservedUntil,
    });

    const result = await executeCreateBooking({
      supabase,
      command,
    });

    provisionalBookingId =
      String(result.booking?.id || "").trim() || null;

    const provisionalBookingUpdate = await supabase.rpc(
  "mark_my_booking_pending_deposit",
  {
    p_booking_id: result.booking.id,
  },
);

if (provisionalBookingUpdate.error) {
  throw new Error(provisionalBookingUpdate.error.message);
}

const provisionalResult = provisionalBookingUpdate.data as {
  success?: boolean;
  status?: string;
} | null;

if (!provisionalResult?.success) {
  throw new Error(
    `Could not prepare customer booking for deposit: ${
      provisionalResult?.status || "unknown_error"
    }`,
  );
}

    if (contractAccepted) {
      const bookingNumber = String(result.booking?.booking_number || result.booking?.id || "");
      const renderedContract = contractRenderedHtml.trim() || `
        <section>
          <h2>Rental Agreement</h2>
          <p><strong>Customer:</strong> ${escapeHtml(customerName)}</p>
          <p><strong>Booking:</strong> ${escapeHtml(bookingNumber)}</p>
          <p><strong>Event date:</strong> ${escapeHtml(eventDate)}</p>
          <p><strong>Total:</strong> $${Number(result.booking?.total_amount || 0).toFixed(2)}</p>
          <p><strong>Deposit:</strong> $${Number(result.booking?.deposit_amount || 0).toFixed(2)}</p>
          <p><strong>Client signature:</strong> ${escapeHtml(contractSignerName || customerName)}</p>
        </section>
      `;
      const signatureImageDataUrl = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(contractSignatureDataUrl)
        ? contractSignatureDataUrl
        : null;
      const documentHashSha256 = toSha256(renderedContract);

      const { data: signResult, error: signError } = await supabase.rpc(
        "sign_customer_booking_contract",
        {
          p_booking_id: result.booking.id,
          p_signer_name: contractSignerName || customerName,
          p_rendered_html: renderedContract,
          p_document_hash: documentHashSha256,
          p_signature_image_data_url: signatureImageDataUrl,
        },
      );

      const signStatus = signResult as { success?: boolean; status?: string } | null;
      const signErrorMessage = String(signError?.message || "").toLowerCase();
      const signFunctionMissing =
        signErrorMessage.includes("could not find the function") ||
        signErrorMessage.includes("schema cache") ||
        signErrorMessage.includes("sign_customer_booking_contract");

      if (signError && signFunctionMissing) {
        throw new Error(
          "Customer contract signing RPC is not installed. Apply migration 063 before accepting Stripe bookings.",
        );
      }

      if (signError) {
        throw new Error(signError.message);
      }

      if (signStatus && !signStatus.success) {
        throw new Error(signStatus.status || "contract_sign_failed");
      }

      // Flush the queued contract_signed email now; the Stripe webhook only
      // fires for payment events and would otherwise leave it undelivered.
      await processNotificationQueueBestEffort({ bookingId: result.booking.id, limit: 20 });

      if (paymentAmount > 0) {
        const totalCharge = Number((paymentAmount + tipAmount).toFixed(2));
        const session = await createStripeCheckoutSession({
          bookingId: result.booking.id,
          amount: totalCharge,
          baseAmount: paymentAmount,
          tipAmount,
          customerEmail: customerEmail || null,
          source: "customer_initial_deposit",
          successPath: `/account/bookings/${result.booking.id}`,
          cancelPath: `/api/stripe/checkout/cancel?booking_id=${encodeURIComponent(result.booking.id)}`,
          expiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
          description: `Bounce Party LA deposit ${bookingNumber || String(result.booking.id).slice(0, 8)}`,
        });

        revalidatePath(`/account/bookings/${result.booking.id}`);
        redirect(session.url);
      } else {
        const { data: completionResult, error: completionError } = await supabase.rpc(
          "complete_customer_booking_checkout",
          {
            p_booking_id: result.booking.id,
            p_amount: 0,
            p_method: paymentMethod,
            p_payment_reference: paymentReference || null,
          },
        );

        const completionStatus = completionResult as { success?: boolean; status?: string } | null;
        if (completionError) throw new Error(completionError.message);
        if (completionStatus && !completionStatus.success) {
          throw new Error(completionStatus.status || "booking_finalize_failed");
        }
      }
    }

    revalidatePath(`/account/bookings/${result.booking.id}`);

    redirect(`/account/bookings/${result.booking.id}`);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    if (provisionalBookingId) {
      try {
        const cleanup = await supabase.rpc(
          "cancel_my_unpaid_customer_stripe_booking",
          {
            p_booking_id: provisionalBookingId,
          },
        );

        if (cleanup.error) {
          console.error(
            "Failed customer checkout cleanup RPC:",
            {
              bookingId: provisionalBookingId,
              message: cleanup.error.message,
            },
          );
        }
      } catch (cleanupError) {
        console.error(
          "Customer checkout cleanup threw:",
          {
            bookingId: provisionalBookingId,
            error:
              cleanupError instanceof Error
                ? cleanupError.message
                : String(cleanupError),
          },
        );
      }
    }

    const classified = classifyBookingError(error);

    redirect(
      buildBookNowRedirectUrl({
        productId,
        eventDate,
        quantity,
        setupAddress,
        setupCity,
        setupZip,
        selectedModifierGroupOptionIds,
        selectedModifierOptionQuantities,
        bookingError: classified.message,
        bookingErrorCode: classified.code,
        bookingFocus: classified.focus,
      })
    );
  }
}

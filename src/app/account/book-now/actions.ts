"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireCustomerAccess } from "@/lib/auth/require-customer";
import { executeCreateBooking } from "@/features/booking/engine/create-booking";
import { buildCustomerCreateBookingCommand } from "@/features/booking/adapters/customer-create-booking-command";
import { validateBookingItemsAvailability } from "@/features/booking/server/validate-booking-items-availability";
import {
  enqueueBookingNotification,
  enqueueStaffBookingNotification,
  processNotificationQueueBestEffort,
} from "@/lib/notifications/engine";
import {
  createStripeCheckoutSession,
  getApplicationOrigin,
} from "@/lib/payments/stripe";
import {
  type CustomerApprovalReason,
  evaluateCustomerBookingApproval,
  requestCustomerBookingApproval,
} from "@/lib/booking/customer-approval";
import type { DeferredInventoryRequirementRow } from "@/lib/booking/createBooking";
import { createServiceClient } from "@/lib/supabase/service";
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

async function signCustomerBookingContractIfAccepted(params: {
  supabase: any;
  bookingId: string;
  bookingNumber: string;
  customerName: string;
  eventDate: string;
  totalAmount: number;
  depositAmount: number;
  contractAccepted: boolean;
  contractSignerName: string;
  contractSignatureDataUrl: string;
  contractRenderedHtml: string;
}) {
  if (!params.contractAccepted) {
    return;
  }

  const renderedContract =
    params.contractRenderedHtml.trim() ||
    `
        <section>
          <h2>Rental Agreement</h2>
          <p><strong>Customer:</strong> ${escapeHtml(params.customerName)}</p>
          <p><strong>Booking:</strong> ${escapeHtml(params.bookingNumber)}</p>
          <p><strong>Event date:</strong> ${escapeHtml(params.eventDate)}</p>
          <p><strong>Total:</strong> $${Number(params.totalAmount || 0).toFixed(2)}</p>
          <p><strong>Deposit:</strong> $${Number(params.depositAmount || 0).toFixed(2)}</p>
          <p><strong>Client signature:</strong> ${escapeHtml(params.contractSignerName || params.customerName)}</p>
        </section>
      `;
  const signatureImageDataUrl = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(
    params.contractSignatureDataUrl,
  )
    ? params.contractSignatureDataUrl
    : null;
  const documentHashSha256 = toSha256(renderedContract);

  const { data: signResult, error: signError } = await params.supabase.rpc(
    "sign_customer_booking_contract",
    {
      p_booking_id: params.bookingId,
      p_signer_name: params.contractSignerName || params.customerName,
      p_rendered_html: renderedContract,
      p_document_hash: documentHashSha256,
      p_signature_image_data_url: signatureImageDataUrl,
    },
  );

  const signStatus = signResult as {
    success?: boolean;
    status?: string;
  } | null;
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

  if (
    lower.includes("approval_request_failed") ||
    lower.includes("booking approval settings") ||
    lower.includes(
      "event start time is required before this booking can be submitted",
    )
  ) {
    return {
      code: "validation",
      message: raw,
      focus: "summary",
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
        lower.includes("address") ||
        lower.includes("zip") ||
        lower.includes("city")
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
      JSON.stringify(params.selectedModifierOptionQuantities),
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

async function enqueueBookingCreatedForStaff(params: {
  bookingId: string;
  source: "customer_self_service" | "admin";
}) {
  const bookingId = String(params.bookingId || "").trim();

  if (!bookingId) {
    return;
  }

  const applicationOrigin = await getApplicationOrigin();
  const adminBookingUrl = `${applicationOrigin}/admin/bookings/${bookingId}`;

  await Promise.all([
    enqueueStaffBookingNotification({
      eventCode: "booking_created",
      bookingId,
      recipientRole: "admin",
      dedupeSuffix: "created",
      payload: {
        action_url: adminBookingUrl,
        booking_source: params.source,
      },
    }),
    enqueueStaffBookingNotification({
      eventCode: "booking_created",
      bookingId,
      recipientRole: "manager",
      dedupeSuffix: "created",
      payload: {
        action_url: adminBookingUrl,
        booking_source: params.source,
      },
    }),
  ]);
}

async function saveDeferredInventoryRequirementsWithService(params: {
  bookingId: string;
  rows: DeferredInventoryRequirementRow[];
  customerAuthUserId: string;
}) {
  const bookingId = String(params.bookingId || "").trim();
  const customerAuthUserId = String(params.customerAuthUserId || "").trim();

  if (!bookingId) {
    throw new Error("Deferred inventory writer received empty booking id.");
  }

  if (!customerAuthUserId) {
    throw new Error("Deferred inventory writer requires customer identity.");
  }

  if (!Array.isArray(params.rows) || params.rows.length === 0) {
    throw new Error("Deferred inventory rows are required.");
  }

  if (!params.rows.every((row) => String(row.booking_id || "") === bookingId)) {
    throw new Error("Deferred inventory rows contain mismatched booking ids.");
  }

  const service = createServiceClient();

  const bookingOwnerResult = await service
    .from("bookings")
    .select("id, booking_source, status, payment_status, amount_paid, customers!inner(auth_user_id)")
    .eq("id", bookingId)
    .eq("customers.auth_user_id", customerAuthUserId)
    .limit(1)
    .maybeSingle();

  if (bookingOwnerResult.error) {
    throw new Error(bookingOwnerResult.error.message);
  }

  const bookingOwnerRow = bookingOwnerResult.data as {
    id: string;
    booking_source?: string | null;
    status?: string | null;
    payment_status?: string | null;
    amount_paid?: number | null;
  } | null;

  if (!bookingOwnerRow?.id) {
    throw new Error("Deferred inventory write rejected: booking ownership check failed.");
  }

  if (
    String(bookingOwnerRow.booking_source || "") !== "customer_self_service" ||
    String(bookingOwnerRow.status || "") !== "pending_deposit"
  ) {
    throw new Error("Deferred inventory write rejected: booking is not pending self-service.");
  }

  const paymentStatus = String(bookingOwnerRow.payment_status || "").toLowerCase();
  if (
    paymentStatus === "paid" ||
    paymentStatus === "partial" ||
    Number(bookingOwnerRow.amount_paid || 0) > 0
  ) {
    throw new Error("Deferred inventory write rejected: booking already has payment.");
  }

  const insertResult = await service
    .from("booking_inventory_requirements")
    .insert(params.rows);

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }
}

export async function preflightCustomerBookingApprovalAction(
  formData: FormData,
) {
  const { supabase } = await requireCustomerAccess();
  const eventDate = getString(formData, "eventDate");
  const eventStartTime = getString(formData, "eventStartTime");
  const indexedBookingItems = parseCustomerBookingItems(formData);
  const productId =
    getString(formData, "productId") || indexedBookingItems[0]?.productId || "";
  const requestedItems =
    indexedBookingItems.length > 0
      ? indexedBookingItems
      : productId
        ? [{ productId, quantity: 1 }]
        : [];
  const allSelectedOptionIds = Array.from(
    new Set(
      requestedItems.flatMap(
        (item) =>
          parseModifierSelectionsForProduct(formData, item.productId).optionIds,
      ),
    ),
  );
  const evaluation = await evaluateCustomerBookingApproval({
    supabase,
    eventDate,
    eventStartTime: eventStartTime || undefined,
    selectedModifierOptionIds: allSelectedOptionIds,
  });
  return {
    ok: evaluation.ok,
    requiresApproval: evaluation.requiresApproval,
    reasons: evaluation.reasons,
    configErrors: evaluation.configErrors,
  };
}
export async function createCustomerBookingAction(formData: FormData) {
  const { supabase, access } = await requireCustomerAccess();

  const indexedBookingItems = parseCustomerBookingItems(formData);
  const firstIndexedItem = indexedBookingItems[0];
  const productId =
    getString(formData, "productId") || firstIndexedItem?.productId || "";
  const bookingAttemptId = getString(formData, "bookingAttemptId");
  const eventDate = getString(formData, "eventDate");
  const eventStartTime = getString(formData, "eventStartTime");
  const eventEndTime = getString(formData, "eventEndTime");
  const quantity = Math.max(
    1,
    Math.floor(
      getNumber(formData, "quantity", firstIndexedItem?.quantity || 1),
    ),
  );
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
  const selectedModifierOptionQuantitiesRaw =
    parseModifierQuantityJson(formData);
  const indexedModifiers = productId
    ? parseModifierSelectionsForProduct(formData, productId)
    : { optionIds: [] as string[], quantities: {} as Record<string, number> };
  const selectedModifierGroupOptionIds =
    selectedModifierGroupOptionIdsRaw.length > 0
      ? selectedModifierGroupOptionIdsRaw
      : indexedModifiers.optionIds;
  const selectedModifierOptionQuantities =
    Object.keys(selectedModifierOptionQuantitiesRaw).length > 0
      ? selectedModifierOptionQuantitiesRaw
      : indexedModifiers.quantities;

  const contractAcceptedRaw = getString(
    formData,
    "contractAccepted",
  ).toLowerCase();
  const contractAccepted = ["yes", "true", "1", "on"].includes(
    contractAcceptedRaw,
  );
  const contractSignerName = getString(formData, "contractSignerName");
  const contractManualSignature = getString(
    formData,
    "contractManualSignature",
  );
  const contractSignatureDataUrl = getString(
    formData,
    "contractSignatureDataUrl",
  );
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

    if (
      existingAttemptResult.error &&
      String(existingAttemptResult.error.code || "") !== "42703"
    ) {
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
    .select(
      "require_contract_before_payment, require_typed_signature, signature_label",
    )
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

    if (
      contractSettings?.require_typed_signature !== false &&
      !contractSignerName
    ) {
      throw new Error("Type your full name to sign the contract.");
    }
  }

  const customerName =
    [customerFirstName, customerLastName].filter(Boolean).join(" ").trim() ||
    customerNameField ||
    String(access.displayName || access.user?.email || "Customer").trim();

  const resolvedCustomerId = safeExistingCustomerId;
  const customerEmail = String(
    customerEmailField || access.user?.email || "",
  ).trim();
  const customerPhone = String(customerPhoneInput || "").trim();
  const requestedItems =
    indexedBookingItems.length > 0
      ? indexedBookingItems
      : [{ productId, quantity }];
  const requestedItemsWithModifiers = normalizeBookingItemRequests(
    requestedItems.map((item) => {
      const itemModifiers = parseModifierSelectionsForProduct(
        formData,
        item.productId,
      );

      return {
        productId: item.productId,
        quantity: item.quantity,
        selectedModifierGroupOptionIds: itemModifiers.optionIds,
        selectedModifierOptionQuantities: itemModifiers.quantities,
      };
    }),
  );

  let provisionalBookingId: string | null = null;
  let skipCleanupOnError = false;

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

    const allSelectedOptionIds = Array.from(
      new Set(
        requestedItemsWithModifiers.flatMap(
          (item) => item.selectedModifierGroupOptionIds || [],
        ),
      ),
    );

    const approvalEvaluation = await evaluateCustomerBookingApproval({
      supabase,
      eventDate,
      eventStartTime: eventStartTime || undefined,
      selectedModifierOptionIds: allSelectedOptionIds,
    });

    if (!approvalEvaluation.ok) {
      if (
        approvalEvaluation.configErrors.includes("event_start_time_required")
      ) {
        throw new Error(
          "Event start time is required before this booking can be submitted.",
        );
      }

      if (
        approvalEvaluation.configErrors.includes("park_venue_mapping_required")
      ) {
        throw new Error(
          "Booking approval settings are not configured for Park/Venue options. Please contact support.",
        );
      }

      if (approvalEvaluation.configErrors.includes("event_time_in_past")) {
        throw new Error("Event start time must be in the future.");
      }

      throw new Error(
        "Booking approval rules are not configured correctly. Please contact support.",
      );
    }

    if (approvalEvaluation.requiresApproval) {
      command.deferInventoryReservation = true;
    }

    const result = await executeCreateBooking({
      supabase,
      command,
      saveDeferredInventoryRequirements:
        approvalEvaluation.requiresApproval
          ? async ({ bookingId, rows }) => {
              await saveDeferredInventoryRequirementsWithService({
                bookingId,
                rows,
                customerAuthUserId: String(access.user?.id || ""),
              });
            }
          : undefined,
    });

    if (!result.reusedExistingBooking) {
      try {
        await enqueueBookingCreatedForStaff({
          bookingId: result.booking.id,
          source: "customer_self_service",
        });
      } catch (notifyError) {
        console.error("Booking created staff notification enqueue failed", {
          bookingId: result.booking.id,
          error:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
        });
      }

      await processNotificationQueueBestEffort({
        bookingId: result.booking.id,
        limit: 20,
      });
    }

    provisionalBookingId = String(result.booking?.id || "").trim() || null;

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

    const capacityRecheck = await evaluateCustomerBookingApproval({
      supabase,
      eventDate,
      eventStartTime: eventStartTime || undefined,
      selectedModifierOptionIds: allSelectedOptionIds,
      bookingId: result.booking.id,
    });

    const requiresApprovalAfterRecheck =
      approvalEvaluation.requiresApproval ||
      !capacityRecheck.ok ||
      capacityRecheck.requiresApproval;
    const effectiveApprovalReasons: CustomerApprovalReason[] =
      capacityRecheck.ok && capacityRecheck.requiresApproval
        ? capacityRecheck.reasons
        : approvalEvaluation.reasons.length > 0
          ? approvalEvaluation.reasons
          : ["park_venue_capacity"];

    const bookingNumber = String(
      result.booking?.booking_number || result.booking?.id || "",
    );
    await signCustomerBookingContractIfAccepted({
      supabase,
      bookingId: result.booking.id,
      bookingNumber,
      customerName,
      eventDate,
      totalAmount: Number(result.booking?.total_amount || 0),
      depositAmount: Number(result.booking?.deposit_amount || 0),
      contractAccepted,
      contractSignerName,
      contractSignatureDataUrl,
      contractRenderedHtml,
    });

    if (requiresApprovalAfterRecheck) {
      if (!approvalEvaluation.requiresApproval) {
        const prepareResult = await supabase.rpc(
          "prepare_customer_booking_for_pending_approval",
          {
            p_booking_id: result.booking.id,
            p_reason: "post_create_capacity_recheck",
          },
        );

        if (prepareResult.error) {
          throw new Error(prepareResult.error.message);
        }

        const preparePayload = (
          Array.isArray(prepareResult.data)
            ? prepareResult.data[0]
            : prepareResult.data
        ) as { success?: boolean; status?: string } | null;

        if (!preparePayload?.success || preparePayload.status !== "prepared") {
          throw new Error(
            `Booking recheck preparation failed: ${preparePayload?.status || "unknown_error"}`,
          );
        }
      }

      const snapshot = {
        event_date: eventDate,
        event_start_time: eventStartTime || null,
        event_end_time: eventEndTime || null,
        setup_address: setupAddress || null,
        setup_city: setupCity || null,
        setup_zip: setupZip || null,
        reasons: effectiveApprovalReasons,
        recheck_ok: capacityRecheck.ok,
        recheck_config_errors: capacityRecheck.configErrors,
        selected_modifier_option_ids: allSelectedOptionIds,
      };

      const approvalRequest = await requestCustomerBookingApproval({
        supabase,
        bookingId: result.booking.id,
        reasons: effectiveApprovalReasons,
        snapshot,
      });

      skipCleanupOnError = true;

      try {
        const approvalRevision = Number(approvalRequest?.revision || 0);
        const dedupeSuffix =
          approvalRevision > 0
            ? `revision-${approvalRevision}`
            : "revision-current";
        const applicationOrigin = await getApplicationOrigin();
        const adminBookingUrl = `${applicationOrigin}/admin/bookings/${result.booking.id}`;
        const customerBookingUrl = `${applicationOrigin}/account/bookings/${result.booking.id}`;

        await Promise.all([
          enqueueBookingNotification({
            eventCode: "customer_booking_approval_requested",
            bookingId: result.booking.id,
            dedupeSuffix,
            payload: {
              action_url: customerBookingUrl,
              approval_revision: approvalRevision > 0 ? approvalRevision : null,
            },
          }),
          enqueueStaffBookingNotification({
            eventCode: "customer_booking_approval_requested",
            bookingId: result.booking.id,
            recipientRole: "admin",
            dedupeSuffix,
            payload: {
              action_url: adminBookingUrl,
              approval_revision: approvalRevision > 0 ? approvalRevision : null,
            },
          }),
          enqueueStaffBookingNotification({
            eventCode: "customer_booking_approval_requested",
            bookingId: result.booking.id,
            recipientRole: "manager",
            dedupeSuffix,
            payload: {
              action_url: adminBookingUrl,
              approval_revision: approvalRevision > 0 ? approvalRevision : null,
            },
          }),
        ]);
      } catch (notifyError) {
        console.error("Approval request staff notification enqueue failed", {
          bookingId: result.booking.id,
          error:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
        });
      }

      await processNotificationQueueBestEffort({
        bookingId: result.booking.id,
        limit: 20,
      });

      revalidatePath(`/account/bookings/${result.booking.id}`);
      redirect(
        `/account/bookings/${result.booking.id}?approval=pending&bookingErrorCode=approval_pending`,
      );
    }

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
      const { data: completionResult, error: completionError } =
        await supabase.rpc("complete_customer_booking_checkout", {
          p_booking_id: result.booking.id,
          p_amount: 0,
          p_method: paymentMethod,
          p_payment_reference: paymentReference || null,
        });

      const completionStatus = completionResult as {
        success?: boolean;
        status?: string;
      } | null;
      if (completionError) throw new Error(completionError.message);
      if (completionStatus && !completionStatus.success) {
        throw new Error(completionStatus.status || "booking_finalize_failed");
      }

      await processNotificationQueueBestEffort({
        bookingId: result.booking.id,
        limit: 20,
      });
    }

    revalidatePath(`/account/bookings/${result.booking.id}`);

    redirect(`/account/bookings/${result.booking.id}`);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    if (provisionalBookingId && !skipCleanupOnError) {
      try {
        const cleanup = await supabase.rpc(
          "cancel_my_unpaid_customer_stripe_booking",
          {
            p_booking_id: provisionalBookingId,
          },
        );

        if (cleanup.error) {
          console.error("Failed customer checkout cleanup RPC:", {
            bookingId: provisionalBookingId,
            message: cleanup.error.message,
          });
        }
      } catch (cleanupError) {
        console.error("Customer checkout cleanup threw:", {
          bookingId: provisionalBookingId,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
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
      }),
    );
  }
}

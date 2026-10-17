import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CustomerShell from "@/components/account/CustomerShell";
import BookingDetailsLayout from "./components/BookingDetailsLayout";
import { getCustomerBookingDetails } from "./booking-data";
import { getAdminBookingPreviewDetails } from "./admin-preview-data";
import AdminPreviewBar from "./components/AdminPreviewBar";
import { buildBookingPageModel } from "./booking-view-model";
import { createClient } from "@/lib/supabase/server";
import { getUnifiedAccess } from "@/lib/auth/access";
import { syncStripeCheckoutSessionPayment } from "@/lib/payments/stripe";
import type { CustomerManualPaymentMethod } from "./booking-types";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    bookingId: string;
  }>;
  searchParams?: Promise<{ preview?: string; complete?: string; status?: string; error?: string; confirmed?: string; signed?: string; stripe?: string; session_id?: string; approval?: string; cancellation?: string }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { bookingId } = await params;
  const query = searchParams ? await searchParams : {};
  const isAdminPreview = query.preview === "admin";

  const details = isAdminPreview
    ? await getAdminBookingPreviewDetails(bookingId)
    : await getCustomerBookingDetails(bookingId);

  const model = buildBookingPageModel(details);

  return {
    title: `${model.metadataTitle} | Bounce Party LA`,
    description:
      "View your Bounce Party LA booking details, payment status, contract, delivery information, and party preparation notes.",
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function CustomerBookingDetailsPage({
  params,
  searchParams,
}: PageProps) {
  const { bookingId } = await params;
  const query = searchParams ? await searchParams : {};
  const isAdminPreview = query.preview === "admin";
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user) {
    redirect(`/account/login?next=${encodeURIComponent(`/account/bookings/${bookingId}`)}`);
  }

  if (!access.isActive || (access.role !== "customer" && !access.can("preview.customer"))) {
    redirect("/unauthorized");
  }

  // Do not make localhost testing depend only on webhook delivery. On the
  // verified Stripe success return, read the Checkout Session directly from
  // Stripe, upsert the payment idempotently, and finalize the provisional
  // booking. The webhook remains the production source of truth and uses the
  // same synchronization helper.
  if (!isAdminPreview && query.stripe === "success" && query.session_id) {
    let stripeReconciled = false;
    let stripeNeedsReconciliation = false;

    try {
      const stripeSync = await syncStripeCheckoutSessionPayment({
        sessionId: query.session_id,
        expectedBookingId: bookingId,
      });
      stripeReconciled = stripeSync.success === true;
      stripeNeedsReconciliation =
        stripeSync.success !== true &&
        stripeSync.source === "customer_temporary_deposit";
    } catch (error) {
      console.error("Stripe return reconciliation failed", {
        bookingId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // redirect() throws NEXT_REDIRECT. Keep it outside the try/catch so Next.js
    // can start a clean request and re-read authoritative booking/payment data.
    if (stripeReconciled) {
      redirect(`/account/bookings/${bookingId}?payment=success`);
    }

    if (stripeNeedsReconciliation) {
      redirect(`/account/bookings/${bookingId}?complete=1&status=payment_reconciliation_required`);
    }
  }

  const details = isAdminPreview
    ? await getAdminBookingPreviewDetails(bookingId)
    : await getCustomerBookingDetails(bookingId);

  let manualPaymentMethods: CustomerManualPaymentMethod[] = [];

  const paymentMethodsResult = await supabase
    .from("payment_method_settings")
    .select("method, display_name, account_label, account_value, is_enabled, sort_order")
    .in("method", ["zelle", "venmo"])
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });

  if (!paymentMethodsResult.error && Array.isArray(paymentMethodsResult.data)) {
    manualPaymentMethods = paymentMethodsResult.data
      .map((row: any) => {
        const method = String(row?.method || "").trim().toLowerCase();
        const accountValue = String(row?.account_value || "").trim();

        if ((method !== "zelle" && method !== "venmo") || !accountValue) {
          return null;
        }

        return {
          method,
          display_name: String(row?.display_name || (method === "zelle" ? "Zelle" : "Venmo")),
          account_label: row?.account_label ? String(row.account_label).trim() || null : null,
          account_value: accountValue,
          is_enabled: row?.is_enabled !== false,
          sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : null,
        } satisfies CustomerManualPaymentMethod;
      })
      .filter(Boolean) as CustomerManualPaymentMethod[];
  }

  const model = buildBookingPageModel(details);

  // These are two intentionally different customer flows:
  //
  // 1) admin-created temporary booking -> customer must sign contract and pay
  //    deposit from the booking page;
  // 2) customer self-service -> contract + deposit were already completed in
  //    Book Now / Stripe Checkout, so NEVER show that completion module again.
  //
  // Read the source directly as a fallback because older get_my_booking_details
  // RPC versions may not expose booking_source yet.
  let bookingSource = String((details.booking as any).booking_source || "").trim();
  let customerApprovalState = String((details.booking as any).customer_approval_state || "").trim();
  const approvalQueryState = String(query.approval || "").toLowerCase().trim();

  if ((!bookingSource || !customerApprovalState) && !isAdminPreview) {
    const sourceLookup = await supabase
      .from("bookings")
      .select("booking_source, customer_approval_state, customer_approval_expires_at, customer_approval_revision, customer_approval_reasons")
      .eq("id", bookingId)
      .maybeSingle();

    if (!sourceLookup.error) {
      bookingSource = String(sourceLookup.data?.booking_source || "").trim();
      customerApprovalState = String(sourceLookup.data?.customer_approval_state || "").trim();
      (details.booking as any).booking_source = bookingSource || null;
      (details.booking as any).customer_approval_state = customerApprovalState || null;
      (details.booking as any).customer_approval_expires_at = sourceLookup.data?.customer_approval_expires_at || null;
      (details.booking as any).customer_approval_revision = sourceLookup.data?.customer_approval_revision ?? null;
      (details.booking as any).customer_approval_reasons = sourceLookup.data?.customer_approval_reasons || [];
    }
  }

  if (!isAdminPreview) {
    if (
      approvalQueryState === "expired" ||
      approvalQueryState === "recheck-error" ||
      approvalQueryState === "recheck-not-required"
    ) {
      customerApprovalState = "expired";
      (details.booking as any).customer_approval_state = "expired";
    }

    if (approvalQueryState === "recheck-error" || approvalQueryState === "recheck-not-required") {
      (details.booking as any).__approval_rerequest_state = approvalQueryState;
    }
  }

  const isCustomerSelfService = bookingSource === "customer_self_service";
  const needsAdminCreatedCompletion =
  !isAdminPreview &&
  !isCustomerSelfService &&
  String(details.booking.status || "").toLowerCase() === "pending_deposit";

  return (
    <CustomerShell
      displayName={access.displayName}
      userEmail={access.user?.email || null}
      role={access.role}
      defaultInterface={access.defaultInterface}
      availableInterfaces={access.availableInterfaces}
      grantedPermissions={access.grantedPermissions}
      previewMode={isAdminPreview}
    >
      {isAdminPreview ? <AdminPreviewBar bookingId={bookingId} /> : null}
      <BookingDetailsLayout
        details={details}
        model={model}
        adminPreview={isAdminPreview}
        completionMode={needsAdminCreatedCompletion}
        completionStatus={query.status}
        completionError={query.error}
        cancellationState={query.cancellation}
        manualPaymentMethods={manualPaymentMethods}
      />
    </CustomerShell>
  );
}
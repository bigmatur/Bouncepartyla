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

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    bookingId: string;
  }>;
  searchParams?: Promise<{ preview?: string; complete?: string; status?: string; error?: string; confirmed?: string; signed?: string; stripe?: string; session_id?: string }>;
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

    try {
      const stripeSync = await syncStripeCheckoutSessionPayment({
        sessionId: query.session_id,
        expectedBookingId: bookingId,
      });
      stripeReconciled = stripeSync.success === true;
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
  }

  const details = isAdminPreview
    ? await getAdminBookingPreviewDetails(bookingId)
    : await getCustomerBookingDetails(bookingId);

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

  if (!bookingSource && !isAdminPreview) {
    const sourceLookup = await supabase
      .from("bookings")
      .select("booking_source")
      .eq("id", bookingId)
      .maybeSingle();

    if (!sourceLookup.error) {
      bookingSource = String(sourceLookup.data?.booking_source || "").trim();
      (details.booking as any).booking_source = bookingSource || null;
    }
  }

  const isCustomerSelfService = bookingSource === "customer_self_service";
  const needsAdminCreatedCompletion =
  !isAdminPreview &&
  !isCustomerSelfService &&
  ["draft", "quote", "pending_deposit", "inventory_reserved"].includes(
    String(details.booking.status || "").toLowerCase(),
  );

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
      />
    </CustomerShell>
  );
}
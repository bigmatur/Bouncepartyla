import { createClient } from "@/lib/supabase/server";
import CustomerContractSigner from "./CustomerContractSigner";
import CustomerDepositPos from "./CustomerDepositPos";
import { finalizeTemporaryBookingAction } from "./actions";
import type { BookingDetails } from "../booking-types";

function isMissingTableError(error: any) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42p01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => values[key] ?? "");
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

type Props = {
  bookingId: string;
  details: BookingDetails;
  contractSigned: boolean;
  depositAmount: number;
  amountPaid: number;
  status?: string;
  error?: string;
};

export default async function BookingCompletionPanel({
  bookingId,
  details,
  contractSigned,
  depositAmount,
  amountPaid,
  status,
  error,
}: Props) {
  const supabase = await createClient();
  const [settingsResult, profileResult, userResult, paymentMethodsResult, paymentPosSettingsResult] = await Promise.all([
    supabase
      .from("booking_contract_settings")
      .select("template_html, signature_label")
      .limit(1)
      .maybeSingle(),
    supabase.rpc("get_my_customer_profile"),
    supabase.auth.getUser(),
    supabase
      .from("payment_method_settings")
      .select("method, display_name, is_enabled, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("payment_pos_settings")
      .select("tips_enabled, allow_custom_tip, tip_mode, default_tip_percent, default_tip_amount, tip_percent_options, tip_amount_options")
      .limit(1)
      .maybeSingle(),
  ]);

  const settings = settingsResult.data;
  const booking = details.booking;
  const items = details.items || [];
  const profile = Array.isArray(profileResult.data)
    ? profileResult.data[0]
    : profileResult.data;
  const signedInEmail = String(userResult.data.user?.email || "");

  const profileFullName = String(profile?.full_name || "").trim();
  const profileFirst = String(profile?.first_name || "").trim();
  const profileLast = String(profile?.last_name || "").trim();
  const profileName = [profileFirst, profileLast].filter(Boolean).join(" ").trim();

  const customerName =
    String(details.contract?.signer_name || "").trim() ||
    profileFullName ||
    profileName ||
    "Customer";

  const customerEmail = String(
    profile?.email || signedInEmail || "",
  ).trim();

  const itemList = (items || [])
    .map((item: any) => {
      return `${escapeHtml(item?.product_name || "Product")} × ${Number(item.quantity || 1)}`;
    })
    .join(", ");

  const defaultTemplate = `
    <h2>Rental Agreement</h2>
    <p><strong>Customer:</strong> {{customer_name}}</p>
    <p><strong>Booking:</strong> {{booking_number}}</p>
    <p><strong>Event date:</strong> {{event_date}}</p>
    <p><strong>Event time:</strong> {{event_start_time}} – {{event_end_time}}</p>
    <p><strong>Address:</strong> {{setup_address}}, {{setup_city}}, {{setup_state}} {{setup_zip}}</p>
    <p><strong>Equipment:</strong> {{items_summary}}</p>
    <p><strong>Total:</strong> $ {{total_amount}}</p>
    <p><strong>Deposit:</strong> $ {{deposit_amount}}</p>
  `;

  const replacements = {
    customer_name: escapeHtml(customerName),
    customer_email: escapeHtml(customerEmail),
    booking_number: escapeHtml(String(booking.booking_number || bookingId)),
    event_date: escapeHtml(String(booking.event_date || "")),
    event_start_time: escapeHtml(String(booking.event_start_time || "")),
    event_end_time: escapeHtml(String(booking.event_end_time || "")),
    setup_address: escapeHtml(String(booking.setup_address || "")),
    setup_city: escapeHtml(String(booking.setup_city || "")),
    setup_state: escapeHtml(String(booking.setup_state || "")),
    setup_zip: escapeHtml(String(booking.setup_zip || "")),
    items_summary: itemList,
    subtotal: Number(booking.subtotal || 0).toFixed(2),
    discount_amount: Number(booking.discount_amount || 0).toFixed(2),
    delivery_fee: Number(booking.delivery_fee || 0).toFixed(2),
    tax_amount: Number(booking.tax_amount || 0).toFixed(2),
    total_amount: Number(booking.total_amount || 0).toFixed(2),
    deposit_amount: Number(booking.deposit_amount || 0).toFixed(2),
    balance_due: Number(booking.balance_due || 0).toFixed(2),
    signature_label: escapeHtml(String(settings?.signature_label || "Client signature")),
    signature_name: "",
    signature_manual: "",
    signature_date: new Date().toISOString().slice(0, 10),
  };

  const renderedTemplate = renderTemplate(
    String(settings?.template_html || defaultTemplate),
    replacements,
  );

  const orderInfoBlock = buildOrderSummaryHtml({
    customerName: replacements.customer_name,
    customerEmail: replacements.customer_email,
    bookingNumber: replacements.booking_number,
    eventDate: replacements.event_date,
    eventStartTime: replacements.event_start_time,
    eventEndTime: replacements.event_end_time,
    setupAddress: replacements.setup_address,
    setupCity: replacements.setup_city,
    setupState: replacements.setup_state,
    setupZip: replacements.setup_zip,
    itemSummary: replacements.items_summary,
    subtotal: replacements.subtotal,
    discountAmount: replacements.discount_amount,
    deliveryFee: replacements.delivery_fee,
    taxAmount: replacements.tax_amount,
    totalAmount: replacements.total_amount,
    depositAmount: replacements.deposit_amount,
    balanceDue: replacements.balance_due,
  });

  const contractHtml = `${orderInfoBlock}${renderedTemplate}`;

  const depositPaid = amountPaid >= depositAmount;
  const depositDue = Math.max(0, depositAmount - amountPaid);

  // Payment methods — always include Stripe (Card Payment) even if disabled in settings,
  // because customers pay the deposit online. Other methods (Zelle, Cash) are alternatives
  // the admin records manually after receiving payment on-site.
  const allMethods = (!paymentMethodsResult.error && Array.isArray(paymentMethodsResult.data))
    ? paymentMethodsResult.data
    : [];
  // Non-stripe enabled methods (Zelle, Cash, etc.)
  const nonStripeMethods = allMethods
    .filter((m: any) => m.is_enabled !== false && String(m.method || "") !== "stripe")
    .map((m: any) => ({ method: String(m.method), display_name: String(m.display_name || m.method) }));
  // Stripe method — find it in settings for label, always include
  const stripeRow = allMethods.find((m: any) => String(m.method) === "stripe");
  const stripeMethod = { method: "stripe", display_name: String(stripeRow?.display_name || "Card Payment") };
  // Card Payment first, then others
  const paymentMethods = [stripeMethod, ...nonStripeMethods];

  // Tip settings
  const posData = (!paymentPosSettingsResult.error && paymentPosSettingsResult.data) ? paymentPosSettingsResult.data : null;
  const tipSettings = {
    tipsEnabled: posData ? posData.tips_enabled !== false : true,
    allowCustomTip: posData ? posData.allow_custom_tip !== false : true,
    tipMode: ((posData?.tip_mode === "amount") ? "amount" : "percent") as "percent" | "amount",
    defaultTipPercent: Number(posData?.default_tip_percent || 15),
    defaultTipAmount: Number(posData?.default_tip_amount || 10),
    tipPercentOptions: String(posData?.tip_percent_options || "10,15,20").split(",").map((v: string) => Number(v.trim())).filter((v: number) => Number.isFinite(v) && v >= 0),
    tipAmountOptions: String(posData?.tip_amount_options || "5,10,20").split(",").map((v: string) => Number(v.trim())).filter((v: number) => Number.isFinite(v) && v >= 0),
  };
  if (tipSettings.tipPercentOptions.length === 0) tipSettings.tipPercentOptions = [10, 15, 20];
  if (tipSettings.tipAmountOptions.length === 0) tipSettings.tipAmountOptions = [5, 10, 20];

  // Summary for POS display
  const posSummary = {
    productsSubtotal: Number(booking.subtotal || 0),
    modifiersSubtotal: Number(booking.modifiers_total || 0),
    subtotal: Number(booking.subtotal || 0) + Number(booking.modifiers_total || 0),
    discountAmount: Number(booking.discount_amount || 0),
    deliveryFee: Number(booking.delivery_fee || 0),
    taxRate: Number(booking.tax_rate || 0),
    taxAmount: Number(booking.tax_amount || 0),
    depositAmount: Number(booking.deposit_amount || 0),
    totalAmount: Number(booking.total_amount || 0),
    balanceDue: Math.max(0, depositDue),
  };

  return (
    <section className="mt-6 overflow-hidden rounded-[28px] border border-amber-300/70 bg-amber-50 shadow-sm print:hidden">
      <div className="border-b border-amber-200 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-800/70">Complete reservation</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Contract and deposit</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/60">Review and sign the full rental agreement. After signature, the POS terminal opens for the required deposit.</p>
      </div>

      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">1. Contract</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${contractSigned ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
              {contractSigned ? "Signed" : "Required"}
            </span>
          </div>
          {contractSigned ? (
            <p className="mt-4 text-sm leading-6 text-black/55">Your rental agreement has been signed and saved.</p>
          ) : (
            <div className="mt-4">
              <CustomerContractSigner bookingId={bookingId} signerName={customerName} contractHtml={contractHtml} signatureLabel={String(settings?.signature_label || "Client signature")} />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">2. Deposit</h3>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${depositPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
              {depositPaid ? "Paid" : contractSigned ? "Ready" : "After contract"}
            </span>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-black/50">Required deposit</dt><dd className="font-semibold">{money(depositAmount)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-black/50">Recorded payments</dt><dd className="font-semibold">{money(amountPaid)}</dd></div>
          </dl>
          {contractSigned && !depositPaid ? <CustomerDepositPos bookingId={bookingId} amountDue={depositDue} paymentMethods={paymentMethods} tipSettings={tipSettings} summary={posSummary} /> : null}
          {!contractSigned ? <p className="mt-4 rounded-xl bg-black/[0.035] p-3 text-xs leading-5 text-black/55">Sign the contract first. The POS terminal will then open here.</p> : null}
        </div>
      </div>

      {(error || status) ? (
        <div className="mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ? decodeURIComponent(error) : status === "deposit_required" ? "The deposit has not been recorded yet." : status === "contract_required" ? "The contract still needs to be signed." : "The booking is not ready to confirm yet."}
        </div>
      ) : null}

      <form action={finalizeTemporaryBookingAction} className="px-6 pb-6">
        <input type="hidden" name="bookingId" value={bookingId} />
        <button disabled={!contractSigned || !depositPaid} className="min-h-12 w-full rounded-2xl bg-[#1d1d1b] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">
          Confirm booking
        </button>
      </form>
    </section>
  );
}

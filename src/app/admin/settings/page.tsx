import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import RegionalSettingsForm from "./components/RegionalSettingsForm";
import PaymentPosSettingsForm from "./components/PaymentPosSettingsForm";
import ContractTemplateEditorForm from "./components/ContractTemplateEditorForm";
import HandoverTemplateEditorForm from "./components/HandoverTemplateEditorForm";
import WarehouseAddressFields from "./components/WarehouseAddressFields";
import TimeSelect from "./components/TimeSelect";
import {
  addDeliveryRadiusZoneAction,
  addDeliveryZipZoneAction,
  addWarehouseWorkingHourExceptionAction,
  deleteDeliveryRadiusZoneAction,
  deleteDeliveryZipZoneAction,
  deleteWarehouseWorkingHourExceptionAction,
  updateDeliveryRadiusZoneAction,
  updateDeliveryZipZoneAction,
  updateDiscountSecuritySettingsAction,
  updatePaymentMethodsAction,
  updateDeliveryPricingSettingsAction,
  updateAccountHelpSettingsAction,
  updateReceiptDesignSettingsAction,
  resendContractAction,
  updateWarehouseAddressSettingsAction,
  updateWarehouseWorkingHourAction,
} from "./actions";
import {
  datePlaceholder,
  formatDate,
  formatTime,
  timePlaceholder,
  type DateFormat,
  type TimeFormat,
} from "@/lib/date-time-format";

const dayLabels = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function numberValue(value: any, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
        {label}
      </span>

      {children}

      {hint && <span className="mt-1 block text-[11px] leading-4 text-[#8b8177] sm:text-xs">{hint}</span>}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full min-w-0 resize-y rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
        props.className || "",
      ].join(" ")}
    />
  );
}

function timeValue(value: string | null | undefined) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function deliveryModeLabel(value: string | null | undefined) {
  if (value === "radius_zones") return "By radius zones";
  if (value === "zip_zones") return "By ZIP zones";
  return "By miles";
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function contractStatusClass(status: string | null | undefined) {
  if (status === "signed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (status === "viewed") {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (status === "sent") {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  if (status === "expired" || status === "cancelled") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

type ContractFilter = "all" | "not_sent" | "sent" | "viewed" | "signed" | "expired" | "cancelled";

function parseContractFilter(value?: string): ContractFilter {
  if (
    value === "all" ||
    value === "not_sent" ||
    value === "sent" ||
    value === "viewed" ||
    value === "signed" ||
    value === "expired" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "all";
}

function isMissingColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return code === "42703" || message.includes("does not exist");
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

type SettingsSection =
  | "regional"
  | "operations"
  | "delivery"
  | "payments"
  | "account-help"
  | "receipt"
  | "security"
  | "contracts"
  | "handover"
  | "integrations";

function parseSettingsSection(value?: string): SettingsSection {
  if (
    value === "regional" ||
    value === "operations" ||
    value === "delivery" ||
    value === "payments" ||
    value === "account-help" ||
    value === "receipt" ||
    value === "security" ||
    value === "contracts"||
    value === "handover" ||
    value === "integrations"
  ) {
    return value;
  }

  return "regional";
}

export default async function AdminSettingsPage(props: {
  searchParams?: Promise<{
    section?: string;
    contractStatus?: string;
    contractQuery?: string;
    saved?: string;
    error?: string;
  }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const activeSection = parseSettingsSection(searchParams.section);
  const contractFilter = parseContractFilter(searchParams.contractStatus);
  const contractQuery = String(searchParams.contractQuery || "").trim().toLowerCase();
  const savedSection = String(searchParams.saved || "").trim().toLowerCase();
  const errorCode = String(searchParams.error || "").trim().toLowerCase();

  const { supabase } = await requireAdminPermission("settings.view");

  const [
    settingsResult,
    hoursResult,
    exceptionsResult,
    radiusZonesResult,
    zipZonesResult,
    paymentMethodsResult,
    paymentPosSettingsResult,
    accountHelpSettingsResult,
    receiptDesignResult,
    discountSecurityResult,
    contractSettingsResult,
    handoverSettingsResult,
    contractsResult,
    contractRenderedResult,
  ] = await Promise.all([
    supabase
      .from("system_settings")
      .select(
        `
        id,
        business_name,
        timezone,
        time_format,
        date_format,
        warehouse_address,
        warehouse_city,
        warehouse_state,
        warehouse_zip,
        warehouse_lat,
        warehouse_lng,
        delivery_pricing_mode,
        free_delivery_miles,
        price_per_mile,
        minimum_delivery_fee
      `
      )
      .limit(1)
      .maybeSingle(),

    supabase
      .from("warehouse_working_hours")
      .select("id, day_of_week, is_open, open_time, close_time, sort_order")
      .order("sort_order", { ascending: true }),

    supabase
      .from("warehouse_working_hour_exceptions")
      .select(
        "id, exception_date, is_open, open_time, close_time, title, notes, created_at"
      )
      .order("exception_date", { ascending: true }),

    supabase
      .from("delivery_radius_zones")
      .select(
        "id, name, from_miles, to_miles, delivery_fee, active, sort_order"
      )
      .order("sort_order", { ascending: true }),

    supabase
      .from("delivery_zip_zones")
      .select("id, zone_name, zip_code, delivery_fee, active, sort_order")
      .order("sort_order", { ascending: true }),

    supabase
      .from("payment_method_settings")
      .select(
        "method, display_name, is_enabled, integration_enabled, integration_type, account_label, account_value, icon_url, sort_order"
      )
      .order("sort_order", { ascending: true }),

    supabase
      .from("payment_pos_settings")
      .select(
        "id, tips_enabled, allow_custom_tip, tip_mode, default_tip_percent, default_tip_amount, tip_percent_options, tip_amount_options"
      )
      .limit(1)
      .maybeSingle(),

    supabase
      .from("system_settings")
      .select("account_help_title, account_help_description, account_help_email, account_help_phone")
      .limit(1)
      .maybeSingle(),

    supabase
      .from("booking_receipt_design_settings")
      .select("id, logo_url, brand_name, accent_color, receipt_title, footer_text, business_address, business_phone, business_email, business_website")
      .limit(1)
      .maybeSingle(),

    supabase
      .from("booking_discount_security_settings")
      .select("id, discount_password_enabled, discount_password_hint")
      .limit(1)
      .maybeSingle(),

    supabase
      .from("booking_contract_settings")
      .select(
        "id, template_html, require_contract_before_payment, require_typed_signature, signature_label"
      )
      .limit(1)
      .maybeSingle(),

    supabase
      .from("handover_settings")
      .select(
        "id, template_html, acknowledgement_label, signature_label, require_acknowledgement, require_signature"
      )
      .limit(1)
      .maybeSingle(),

    supabase
      .from("contracts")
      .select(
        `
        id,
        booking_id,
        status,
        signer_name,
        signer_email,
        provider,
        pdf_url,
        sent_at,
        viewed_at,
        signed_at,
        created_at,
        bookings (
          id,
          booking_number,
          event_date,
          total_amount,
          customers (
            id,
            full_name,
            email
          )
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("contracts")
      .select("id, rendered_html")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (settingsResult.error) {
    throw new Error(settingsResult.error.message);
  }

  if (hoursResult.error) {
    throw new Error(hoursResult.error.message);
  }

  if (exceptionsResult.error) {
    throw new Error(exceptionsResult.error.message);
  }

  if (radiusZonesResult.error) {
    throw new Error(radiusZonesResult.error.message);
  }

  if (zipZonesResult.error) {
    throw new Error(zipZonesResult.error.message);
  }

  if (accountHelpSettingsResult.error && !isMissingColumnError(accountHelpSettingsResult.error)) {
    throw new Error(accountHelpSettingsResult.error.message);
  }

  const hasPaymentMethodsTable = !paymentMethodsResult.error;
  const hasPaymentPosTable = !paymentPosSettingsResult.error;
  const paymentSchemaMissing =
    isMissingTableError(paymentMethodsResult.error) ||
    isMissingTableError(paymentPosSettingsResult.error);

  const settings = settingsResult.data || {
    business_name: "Bounce Party LA",
    timezone: "America/Los_Angeles",
    time_format: "12h",
    date_format: "us",
    warehouse_address: "",
    warehouse_city: "",
    warehouse_state: "CA",
    warehouse_zip: "",
    warehouse_lat: null,
    warehouse_lng: null,
    delivery_pricing_mode: "miles",
    free_delivery_miles: 10,
    price_per_mile: 1,
    minimum_delivery_fee: 0,
  };

  const accountHelpSettings =
    accountHelpSettingsResult.error || !accountHelpSettingsResult.data
      ? {
          account_help_title: "Need support?",
          account_help_description:
            "Contact Bounce Party LA for booking updates, delivery window changes, payment help or contract questions.",
          account_help_email: "support@bouncepartyla.com",
          account_help_phone: "(323) 000-0000",
        }
      : accountHelpSettingsResult.data;

  const hasAccountHelpSettingsColumns = !accountHelpSettingsResult.error;

  const timeFormat = String(settings.time_format || "12h") as TimeFormat;
  const dateFormat = String(settings.date_format || "us") as DateFormat;

  const hours = hoursResult.data || [];
  const exceptions = exceptionsResult.data || [];
  const radiusZones = radiusZonesResult.data || [];
  const zipZones = zipZonesResult.data || [];
  const paymentMethodsFromDb = hasPaymentMethodsTable
    ? paymentMethodsResult.data || []
    : [];

  const paymentPosSettings =
    paymentPosSettingsResult.error || !paymentPosSettingsResult.data
      ? {
          tips_enabled: true,
          allow_custom_tip: true,
          tip_mode: "percent",
          default_tip_percent: 15,
          default_tip_amount: 10,
          tip_percent_options: "10,15,20",
          tip_amount_options: "5,10,20",
        }
      : paymentPosSettingsResult.data;

  const receiptDesign =
    receiptDesignResult.error || !receiptDesignResult.data
      ? {
          logo_url: null,
          brand_name: "Bounce Party LA",
          accent_color: "#23313f",
          receipt_title: "Payment Receipt",
          footer_text: "Thank you for booking with us!",
          business_address: null,
          business_phone: null,
          business_email: null,
          business_website: null,
        }
      : receiptDesignResult.data;

  const hasReceiptDesignTable = !receiptDesignResult.error;

  const discountSecurity =
    discountSecurityResult.error || discountSecurityResult.error?.code === "42P01"
      ? {
          discount_password_enabled: false,
          discount_password_hint: "",
        }
      : discountSecurityResult.data || {
          discount_password_enabled: false,
          discount_password_hint: "",
        };

  const contractSettings =
    contractSettingsResult.error || contractSettingsResult.error?.code === "42P01"
      ? {
          template_html:
            "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>Address: {{setup_address}}, {{setup_city}} {{setup_zip}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>",
          require_contract_before_payment: true,
          require_typed_signature: true,
          signature_label: "Client signature",
        }
      : contractSettingsResult.data || {
          template_html:
            "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>Address: {{setup_address}}, {{setup_city}} {{setup_zip}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>",
          require_contract_before_payment: true,
          require_typed_signature: true,
          signature_label: "Client signature",
        };

  const hasContractSettingsTable = !contractSettingsResult.error;

  const handoverSettings =
    handoverSettingsResult.error || !handoverSettingsResult.data
      ? {
          template_html:
            "<h2>Equipment Delivery & Acceptance</h2><p>I acknowledge receipt of the rental equipment and items listed below. At the time of delivery, I have inspected the equipment and confirm that it has been received in acceptable condition, except for any damage, missing items, or discrepancies specifically noted on this form.</p><p>I understand that I am responsible for the reasonable care and supervision of the rented equipment while it is in my possession and agree to notify Bounce Party LA promptly of any damage, loss, missing items, or other issues.</p>",
          acknowledgement_label:
            "I confirm that I reviewed and accept the equipment and quantities listed above.",
          signature_label: "Customer signature",
          require_acknowledgement: true,
          require_signature: true,
        }
      : handoverSettingsResult.data;

  const hasHandoverSettingsTable = !handoverSettingsResult.error;

  if (contractsResult.error) {
    throw new Error(contractsResult.error.message);
  }

  if (contractRenderedResult.error && !isMissingColumnError(contractRenderedResult.error)) {
    throw new Error(contractRenderedResult.error.message);
  }

  const contractRows = (contractsResult.data || []) as any[];
  const renderedMap = new Map<string, string>();

  for (const row of contractRenderedResult.data || []) {
    if ((row as any).id && (row as any).rendered_html) {
      renderedMap.set((row as any).id, (row as any).rendered_html);
    }
  }

  const hasRenderedHtmlColumn = !contractRenderedResult.error;
  const filteredContracts = contractRows.filter((row) => {
    const matchesStatus = contractFilter === "all" || row.status === contractFilter;

    if (!matchesStatus) {
      return false;
    }

    if (!contractQuery) {
      return true;
    }

    const booking = getOne(row.bookings);
    const customer = getOne(booking?.customers);

    const searchable = [
      row.id,
      booking?.booking_number,
      row.signer_name,
      row.signer_email,
      customer?.full_name,
      customer?.email,
      row.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(contractQuery);
  });

  const paymentMethods = paymentMethodsFromDb.length > 0 ? paymentMethodsFromDb : [
    {
      method: "zelle",
      display_name: "Zelle",
      is_enabled: true,
      integration_enabled: false,
      integration_type: "manual",
      account_label: "Zelle contact",
      account_value: "",
      icon_url: "",
      sort_order: 10,
    },
    {
      method: "venmo",
      display_name: "Venmo",
      is_enabled: true,
      integration_enabled: false,
      integration_type: "manual",
      account_label: "Venmo username",
      account_value: "",
      icon_url: "",
      sort_order: 20,
    },
    {
      method: "stripe",
      display_name: "Stripe",
      is_enabled: false,
      integration_enabled: false,
      integration_type: "stripe",
      account_label: "Publishable key",
      account_value: "",
      icon_url: "",
      sort_order: 30,
    },
    {
      method: "cash",
      display_name: "Cash",
      is_enabled: true,
      integration_enabled: false,
      integration_type: "manual",
      account_label: "",
      account_value: "",
      icon_url: "",
      sort_order: 40,
    },
  ];

  const hoursByDay = new Map<number, any>();

  for (const hour of hours) {
    hoursByDay.set(Number(hour.day_of_week), hour);
  }

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      {savedSection === activeSection && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          Settings saved successfully.
        </div>
      )}

      {activeSection === "payments" && errorCode === "payments-schema-missing" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          Payment settings were not saved. Missing database tables for payment settings. Apply migrations
          004_payment_method_settings.sql, 005_payment_pos_and_icons.sql and 006_tip_mode_and_options.sql.
        </div>
      )}

      {activeSection === "payments" && errorCode === "payments-rls" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          Payment settings were not saved due to RLS policy restrictions. Apply migration
          008_fix_payment_settings_rls.sql and try again.
        </div>
      )}

      <section className="sticky top-[3.75rem] z-30 min-w-0 overflow-hidden rounded-[18px] border border-black/5 bg-white/95 p-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:top-3 sm:rounded-[24px] sm:p-4">
        <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {[
            { id: "regional", label: "Regional" },
            { id: "operations", label: "Hours & Address" },
            { id: "delivery", label: "Delivery" },
            { id: "payments", label: "Payments" },
            { id: "account-help", label: "Account Help" },
            { id: "receipt", label: "Receipt Design" },
            { id: "security", label: "Discount Security" },
            { id: "contracts", label: "Contracts" },
            { id: "handover", label: "Handover" },
            { id: "integrations", label: "Integrations", href: "/admin/settings/integrations" },
          ].map((item) => {
            const active = activeSection === item.id;

            return (
              <Link
                key={item.id}
                href={item.href || `/admin/settings?section=${item.id}`}
                className={[
                  "shrink-0 rounded-full border px-3 py-2 text-[11px] font-bold transition sm:px-4 sm:text-xs sm:font-semibold",
                  active
                    ? "border-[#23313f] bg-[#23313f] text-white"
                    : "border-[#d8cec0] bg-[#fcfaf7] text-[#2b2a28] hover:bg-white",
                ].join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
            System settings
          </div>

          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
            Settings
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
            Формат даты/времени, адрес склада, расчет доставки, режим работы
            склада и исключения.
          </p>
        </div>
      </section>

      {activeSection === "regional" && (
      <section id="regional" className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Regional / warehouse / delivery settings
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Эти настройки будут использовать календарь, бронирования и расчет
              доставки.
            </p>
          </div>

          <RegionalSettingsForm settings={settings} />
        </section>

        <aside className="space-y-6">
          <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Current preview
            </h3>

            <div className="mt-5 space-y-4 text-sm">
              <div className="rounded-[22px] bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Time
                </div>

                <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                  {formatTime("09:00", timeFormat)} —{" "}
                  {formatTime("18:30", timeFormat)}
                </div>

                <div className="mt-1 text-xs text-[#6c6258]">
                  Placeholder: {timePlaceholder(timeFormat)}
                </div>
              </div>

              <div className="rounded-[22px] bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Date
                </div>

                <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                  {formatDate("2026-06-27", dateFormat)}
                </div>

                <div className="mt-1 text-xs text-[#6c6258]">
                  Placeholder: {datePlaceholder(dateFormat)}
                </div>
              </div>

              <div className="rounded-[22px] bg-[#eaf2f9] p-4 ring-1 ring-[#cfe0ef]">
                <div className="text-sm font-semibold text-[#1f1e1b]">
                  Customer calendar
                </div>

                <p className="mt-1 text-sm leading-6 text-[#355879]">
                  Клиент будет видеть только слоты внутри warehouse hours.
                  Admin / cashier сможет выбирать любое время.
                </p>
              </div>

              <div className="rounded-[22px] bg-[#fff8e8] p-4 ring-1 ring-[#ead6a8]">
                <div className="text-sm font-semibold text-[#1f1e1b]">
                  Delivery
                </div>

                <p className="mt-1 text-sm leading-6 text-[#8a6b20]">
                  Mode:{" "}
                  <span className="font-semibold">
                    {deliveryModeLabel(settings.delivery_pricing_mode)}
                  </span>
                </p>
              </div>
            </div>
          </section>
        </aside>
      </section>
      )}

      {activeSection === "operations" && (
      <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Warehouse address
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Адрес и координаты склада. Используется для доставки, карт и расчета расстояния.
          </p>
        </div>

        <form action={updateWarehouseAddressSettingsAction} className="grid min-w-0 gap-3.5 p-3.5 sm:gap-4 sm:p-6 md:grid-cols-3">
          <WarehouseAddressFields
            googleMapsApiKey={process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
            defaultAddress={settings.warehouse_address || ""}
            defaultCity={settings.warehouse_city || ""}
            defaultState={settings.warehouse_state || "CA"}
            defaultZip={settings.warehouse_zip || ""}
            defaultLat={numberValue(settings.warehouse_lat, "")}
            defaultLng={numberValue(settings.warehouse_lng, "")}
          />

          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              className="rounded-full bg-[#23313f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Save warehouse address
            </button>
          </div>
        </form>
      </section>
      )}

      {activeSection === "operations" && (
      <section id="hours" className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Warehouse working hours
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Выбор времени каждые 30 минут. Формат зависит от Regional settings.
          </p>
        </div>

        <div className="divide-y divide-[#eee5d9]">
          {dayLabels.map((day) => {
            const row = hoursByDay.get(day.value);
            const isOpen = row?.is_open !== false;

            return (
              <form
                key={day.value}
                action={updateWarehouseWorkingHourAction}
                className="grid min-w-0 grid-cols-2 gap-3 px-3.5 py-3.5 sm:gap-4 sm:px-6 sm:py-5 lg:grid-cols-[180px_120px_1fr_1fr_150px]"
              >
                <input type="hidden" name="dayOfWeek" value={day.value} />
                <input
                  type="hidden"
                  name="sortOrder"
                  value={row?.sort_order ?? day.value * 10}
                />

                <div className="flex items-center">
                  <div>
                    <div className="font-semibold text-[#1f1e1b]">
                      {day.label}
                    </div>

                    <div className="mt-1 text-xs text-[#6c6258]">
                      {isOpen
                        ? `${formatTime(
                            timeValue(row?.open_time),
                            timeFormat
                          )} — ${formatTime(
                            timeValue(row?.close_time),
                            timeFormat
                          )}`
                        : "Closed"}
                    </div>
                  </div>
                </div>

                <label className="flex items-center">
                  <span className="flex h-[46px] w-full items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#1f1e1b]">
                    Open
                    <input
                      type="checkbox"
                      name="isOpen"
                      defaultChecked={isOpen}
                      className="h-5 w-5"
                    />
                  </span>
                </label>

                <Field label="Open time">
                  <TimeSelect
                    name="openTime"
                    defaultValue={timeValue(row?.open_time) || "09:00"}
                    timeFormat={timeFormat}
                  />
                </Field>

                <Field label="Close time">
                  <TimeSelect
                    name="closeTime"
                    defaultValue={timeValue(row?.close_time) || "18:00"}
                    timeFormat={timeFormat}
                  />
                </Field>

                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                  >
                    Save day
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      </section>
      )}

      {activeSection === "payments" && (
      <section id="payment-pos" className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">POS & tips</h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Сначала выбираете тип чаевых (проценты или сумма), затем настраиваете
            варианты кнопок для POS-терминала.
          </p>

          {paymentSchemaMissing && (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Payment tables are missing in the current database. Saving will not persist until the payment migrations are applied.
            </p>
          )}
        </div>

        <PaymentPosSettingsForm settings={paymentPosSettings} />
      </section>
      )}

      {activeSection === "account-help" && (
      <section id="account-help" className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">Customer account help block</h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Эти поля отображаются в разделе Help внутри личного кабинета клиента.
          </p>
        </div>

        <form action={updateAccountHelpSettingsAction} className="grid gap-5 p-6 md:grid-cols-2">
          {!hasAccountHelpSettingsColumns && (
            <p className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Account Help settings columns are missing in the database schema. Apply migration 041_account_help_content_settings.sql.
            </p>
          )}

          <Field label="Title">
            <Input
              name="accountHelpTitle"
              defaultValue={accountHelpSettings.account_help_title || "Need support?"}
            />
          </Field>

          <Field label="Email support">
            <Input
              name="accountHelpEmail"
              defaultValue={accountHelpSettings.account_help_email || "support@bouncepartyla.com"}
              placeholder="support@bouncepartyla.com"
            />
          </Field>

          <Field label="Description">
            <Textarea
              name="accountHelpDescription"
              rows={4}
              defaultValue={
                accountHelpSettings.account_help_description ||
                "Contact Bounce Party LA for booking updates, delivery window changes, payment help or contract questions."
              }
            />
          </Field>

          <Field label="Phone support">
            <Input
              name="accountHelpPhone"
              defaultValue={accountHelpSettings.account_help_phone || "(323) 000-0000"}
            />
          </Field>

          <div className="md:col-span-2 flex justify-end border-t border-[#eee5d9] pt-5">
            <button
              type="submit"
              disabled={!hasAccountHelpSettingsColumns}
              className="rounded-full bg-[#23313f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              {hasAccountHelpSettingsColumns ? "Save help content" : "Apply migration to enable save"}
            </button>
          </div>
        </form>
      </section>
      )}


      {activeSection === "payments" && (
      <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">Stripe card integration</h3>
          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Stripe secret credentials stay on the server and are never stored in payment_method_settings.
          </p>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-3">
          <div className="rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Secret key</div>
            <div className={`mt-2 text-sm font-semibold ${process.env.STRIPE_SECRET_KEY ? "text-emerald-700" : "text-red-700"}`}>
              {process.env.STRIPE_SECRET_KEY ? "Configured" : "Missing STRIPE_SECRET_KEY"}
            </div>
          </div>
          <div className="rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Webhook</div>
            <div className={`mt-2 text-sm font-semibold ${process.env.STRIPE_WEBHOOK_SECRET ? "text-emerald-700" : "text-red-700"}`}>
              {process.env.STRIPE_WEBHOOK_SECRET ? "Configured" : "Missing STRIPE_WEBHOOK_SECRET"}
            </div>
          </div>
          <div className="rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Webhook URL</div>
            <div className="mt-2 break-all text-sm font-semibold text-[#23313f]">/api/stripe/webhook</div>
          </div>
          <div className="md:col-span-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Enable the <strong>Stripe</strong> payment method below after both server secrets are configured. Customer checkout will show only this card method; Admin/Cashier POS keeps all enabled methods.
          </div>
        </div>
      </section>
      )}

      {activeSection === "payments" && (
      <section id="payment-methods" className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Payment methods
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Методы оплаты для попапа при создании бронирования (Zelle, Venmo,
            Stripe и другие).
          </p>
        </div>

        <form action={updatePaymentMethodsAction} className="space-y-3.5 p-3.5 sm:space-y-5 sm:p-6">
          {paymentMethods.map((item: any) => (
            <div
              key={item.method}
              className="rounded-[22px] border border-[#eee5d9] bg-[#fcfaf7] p-4"
            >
              <div className="grid gap-4 md:grid-cols-[1.2fr_120px_150px]">
                <Field label="Display name">
                  <Input
                    name={`${item.method}_displayName`}
                    defaultValue={item.display_name || item.method}
                  />
                </Field>

                <Field label="Sort">
                  <Input
                    name={`${item.method}_sortOrder`}
                    type="number"
                    defaultValue={numberValue(item.sort_order, "100")}
                  />
                </Field>

                <Field label="Integration type">
                  <Input
                    name={`${item.method}_integrationType`}
                    defaultValue={item.integration_type || "manual"}
                    placeholder="manual / stripe"
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Account label">
                  <Input
                    name={`${item.method}_accountLabel`}
                    defaultValue={item.account_label || ""}
                    placeholder="Username / key / details label"
                  />
                </Field>

                <Field label="Account value">
                  <Input
                    name={`${item.method}_accountValue`}
                    defaultValue={item.method === "stripe" ? "" : item.account_value || ""}
                    placeholder={item.method === "stripe" ? "Do not store Stripe secret keys here" : "@yourvenmo / zelle@email / details"}
                    disabled={item.method === "stripe"}
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[120px_1fr]">
                <div className="rounded-2xl border border-[#eee5d9] bg-white p-2">
                  {item.icon_url ? (
                    <img
                      src={item.icon_url}
                      alt={`${item.display_name || item.method} icon`}
                      className="h-16 w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-16 items-center justify-center text-xs font-semibold text-[#8b8177]">
                      No icon
                    </div>
                  )}
                </div>

                <div className="grid gap-3">
                  <Field label="Upload icon">
                    <Input
                      name={`${item.method}_iconFile`}
                      type="file"
                      accept="image/*"
                      className="file:mr-4 file:rounded-full file:border-0 file:bg-[#23313f] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
                    />
                  </Field>

                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f1e1b]">
                    <input name={`${item.method}_clearIcon`} type="checkbox" />
                    Remove current icon
                  </label>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-6 text-sm font-semibold text-[#1f1e1b]">
                <label className="inline-flex items-center gap-2">
                  <input
                    name={`${item.method}_isEnabled`}
                    type="checkbox"
                    defaultChecked={item.is_enabled !== false}
                  />
                  Enabled in booking popup
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    name={`${item.method}_integrationEnabled`}
                    type="checkbox"
                    defaultChecked={item.integration_enabled === true}
                  />
                  Integration enabled
                </label>
              </div>
            </div>
          ))}

          <div className="flex justify-end border-t border-[#eee5d9] pt-5">
            <button
              type="submit"
              className="rounded-full bg-[#23313f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Save payment methods
            </button>
          </div>
        </form>
      </section>
      )}

      {activeSection === "delivery" && (
      <section id="delivery" className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-2">
        <section className="xl:col-span-2 rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Delivery pricing mode
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Выберите основной режим доставки и параметры расчета по милям.
            </p>
          </div>

          <form action={updateDeliveryPricingSettingsAction} className="space-y-3.5 p-3.5 sm:space-y-5 sm:p-6">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                <input
                  type="radio"
                  name="deliveryPricingMode"
                  value="miles"
                  defaultChecked={(settings.delivery_pricing_mode || "miles") === "miles"}
                />
                By miles
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                <input
                  type="radio"
                  name="deliveryPricingMode"
                  value="radius_zones"
                  defaultChecked={settings.delivery_pricing_mode === "radius_zones"}
                />
                By radius zones
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                <input
                  type="radio"
                  name="deliveryPricingMode"
                  value="zip_zones"
                  defaultChecked={settings.delivery_pricing_mode === "zip_zones"}
                />
                By ZIP zones
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Free delivery miles">
                <Input
                  name="freeDeliveryMiles"
                  type="number"
                  step="0.01"
                  defaultValue={numberValue(settings.free_delivery_miles, "10")}
                />
              </Field>

              <Field label="Price per mile">
                <Input
                  name="pricePerMile"
                  type="number"
                  step="0.01"
                  defaultValue={numberValue(settings.price_per_mile, "1")}
                />
              </Field>

              <Field label="Minimum delivery fee">
                <Input
                  name="minimumDeliveryFee"
                  type="number"
                  step="0.01"
                  defaultValue={numberValue(settings.minimum_delivery_fee, "0")}
                />
              </Field>
            </div>

            <div className="flex justify-end border-t border-[#eee5d9] pt-5">
              <button
                type="submit"
                className="rounded-full bg-[#23313f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Save delivery settings
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Radius delivery zones
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Добавляются вручную. Например: 0–10 mi = $0.
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {radiusZones.map((zone: any) => (
              <form
                key={zone.id}
                action={updateDeliveryRadiusZoneAction}
                className="grid min-w-0 gap-3 px-3.5 py-3.5 sm:gap-4 sm:px-6 sm:py-5 md:grid-cols-2"
              >
                <input type="hidden" name="zoneId" value={zone.id} />

                <Field label="Zone name">
                  <Input name="name" defaultValue={zone.name || "Radius zone"} />
                </Field>

                <Field label="Fee">
                  <Input
                    name="deliveryFee"
                    type="number"
                    step="0.01"
                    defaultValue={numberValue(zone.delivery_fee, "0")}
                  />
                </Field>

                <Field label="From miles">
                  <Input
                    name="fromMiles"
                    type="number"
                    step="0.01"
                    defaultValue={numberValue(zone.from_miles, "0")}
                  />
                </Field>

                <Field label="To miles">
                  <Input
                    name="toMiles"
                    type="number"
                    step="0.01"
                    defaultValue={numberValue(zone.to_miles, "0")}
                  />
                </Field>

                <Field label="Sort">
                  <Input
                    name="sortOrder"
                    type="number"
                    defaultValue={numberValue(zone.sort_order, "100")}
                  />
                </Field>

                <label className="flex items-end">
                  <span className="flex h-[46px] w-full items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#1f1e1b]">
                    Active
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={zone.active !== false}
                      className="h-5 w-5"
                    />
                  </span>
                </label>

                <div className="flex gap-2 md:col-span-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                  >
                    Save radius zone
                  </button>

                  <button
                    formAction={deleteDeliveryRadiusZoneAction}
                    className="rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </form>
            ))}

            {radiusZones.length === 0 && (
              <div className="px-6 py-10 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No radius zones yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Add zones only if you want delivery pricing by radius.
                </p>
              </div>
            )}

            <form
              action={addDeliveryRadiusZoneAction}
              className="grid min-w-0 gap-3 bg-[#fcfaf7] px-3.5 py-3.5 sm:gap-4 sm:px-6 sm:py-5 md:grid-cols-2"
            >
              <Field label="New radius zone">
                <Input name="name" placeholder="Local zone" />
              </Field>

              <Field label="Fee">
                <Input
                  name="deliveryFee"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
              </Field>

              <Field label="From miles">
                <Input
                  name="fromMiles"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
              </Field>

              <Field label="To miles">
                <Input
                  name="toMiles"
                  type="number"
                  step="0.01"
                  defaultValue="10"
                />
              </Field>

              <Field label="Sort">
                <Input name="sortOrder" type="number" defaultValue="100" />
              </Field>

              <label className="flex items-end">
                <span className="flex h-[46px] w-full items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#1f1e1b]">
                  Active
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked
                    className="h-5 w-5"
                  />
                </span>
              </label>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
                >
                  Add radius zone
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              ZIP delivery zones
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Отдельные цены доставки по ZIP-кодам.
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {zipZones.map((zone: any) => (
              <form
                key={zone.id}
                action={updateDeliveryZipZoneAction}
                className="grid min-w-0 gap-3 px-3.5 py-3.5 sm:gap-4 sm:px-6 sm:py-5 md:grid-cols-2"
              >
                <input type="hidden" name="zoneId" value={zone.id} />

                <Field label="Zone name">
                  <Input
                    name="zoneName"
                    defaultValue={zone.zone_name || "ZIP zone"}
                  />
                </Field>

                <Field label="ZIP code">
                  <Input name="zipCode" defaultValue={zone.zip_code || ""} />
                </Field>

                <Field label="Fee">
                  <Input
                    name="deliveryFee"
                    type="number"
                    step="0.01"
                    defaultValue={numberValue(zone.delivery_fee, "0")}
                  />
                </Field>

                <Field label="Sort">
                  <Input
                    name="sortOrder"
                    type="number"
                    defaultValue={numberValue(zone.sort_order, "100")}
                  />
                </Field>

                <label className="flex items-end">
                  <span className="flex h-[46px] w-full items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#1f1e1b]">
                    Active
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={zone.active !== false}
                      className="h-5 w-5"
                    />
                  </span>
                </label>

                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                  >
                    Save
                  </button>

                  <button
                    formAction={deleteDeliveryZipZoneAction}
                    className="rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </form>
            ))}

            {zipZones.length === 0 && (
              <div className="px-6 py-10 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No ZIP zones yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Add ZIP pricing only if you want delivery pricing by ZIP.
                </p>
              </div>
            )}

            <form
              action={addDeliveryZipZoneAction}
              className="grid min-w-0 gap-3 bg-[#fcfaf7] px-3.5 py-3.5 sm:gap-4 sm:px-6 sm:py-5 md:grid-cols-2"
            >
              <Field label="New ZIP zone">
                <Input name="zoneName" placeholder="Glendale" />
              </Field>

              <Field label="ZIP code">
                <Input name="zipCode" placeholder="91214" />
              </Field>

              <Field label="Fee">
                <Input
                  name="deliveryFee"
                  type="number"
                  step="0.01"
                  defaultValue="0"
                />
              </Field>

              <Field label="Sort">
                <Input name="sortOrder" type="number" defaultValue="100" />
              </Field>

              <label className="flex items-end">
                <span className="flex h-[46px] w-full items-center justify-between gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 text-sm font-semibold text-[#1f1e1b]">
                  Active
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked
                    className="h-5 w-5"
                  />
                </span>
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
                >
                  Add ZIP zone
                </button>
              </div>
            </form>
          </div>
        </section>
      </section>
      )}

      {activeSection === "operations" && (
      <section id="exceptions" className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Add exception
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Праздник, выходной или специальный короткий день.
            </p>
          </div>

          <form
            action={addWarehouseWorkingHourExceptionAction}
            className="space-y-3.5 p-3.5 sm:space-y-5 sm:p-6"
          >
            <Field label="Date">
              <Input name="exceptionDate" type="date" required />
            </Field>

            <Field label="Title">
              <Input
                name="title"
                placeholder="Holiday, private event, short day..."
              />
            </Field>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
              <span>Open on this date</span>
              <input type="checkbox" name="isOpen" className="h-5 w-5" />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Open time">
                <TimeSelect
                  name="openTime"
                  defaultValue="09:00"
                  timeFormat={timeFormat}
                />
              </Field>

              <Field label="Close time">
                <TimeSelect
                  name="closeTime"
                  defaultValue="18:00"
                  timeFormat={timeFormat}
                />
              </Field>
            </div>

            <Field label="Notes">
              <Textarea
                name="notes"
                rows={4}
                placeholder="Internal notes..."
              />
            </Field>

            <button
              type="submit"
              className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
            >
              Save exception
            </button>
          </form>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Exceptions / holidays
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Эти даты заменяют обычный режим работы по дням недели.
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {exceptions.map((exception: any) => (
              <div
                key={exception.id}
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 px-3.5 py-3.5 sm:gap-4 sm:px-6 sm:py-5 md:grid-cols-[1fr_160px_120px]"
              >
                <div>
                  <div className="font-semibold text-[#1f1e1b]">
                    {exception.title || "Exception"}
                  </div>

                  <div className="mt-1 text-sm text-[#6c6258]">
                    {formatDate(exception.exception_date, dateFormat)} ·{" "}
                    {exception.is_open
                      ? `${formatTime(
                          timeValue(exception.open_time),
                          timeFormat
                        )} — ${formatTime(
                          timeValue(exception.close_time),
                          timeFormat
                        )}`
                      : "Closed"}
                  </div>

                  {exception.notes && (
                    <div className="mt-2 text-sm text-[#8b8177]">
                      {exception.notes}
                    </div>
                  )}
                </div>

                <div className="flex items-center">
                  <span
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      exception.is_open
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200",
                    ].join(" ")}
                  >
                    {exception.is_open ? "Special hours" : "Closed"}
                  </span>
                </div>

                <form
                  action={deleteWarehouseWorkingHourExceptionAction}
                  className="flex items-center justify-end"
                >
                  <input
                    type="hidden"
                    name="exceptionId"
                    value={exception.id}
                  />

                  <button
                    type="submit"
                    className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Delete
                  </button>
                </form>
              </div>
            ))}

            {exceptions.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No exceptions yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Add holidays, closed dates or special working hours.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
      )}

      {activeSection === "security" && (
      <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Discount authorization password
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Кассир/админ смогут применить скидку только после ввода этого пароля.
          </p>
        </div>

        <form action={updateDiscountSecuritySettingsAction} className="grid min-w-0 gap-3.5 p-3.5 sm:gap-5 sm:p-6 md:grid-cols-2">
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b] md:col-span-2">
            <span>Enable discount password</span>
            <input
              type="checkbox"
              name="discountPasswordEnabled"
              defaultChecked={discountSecurity.discount_password_enabled === true}
              className="h-5 w-5"
            />
          </label>

          <Field label="New password">
            <Input name="newDiscountPassword" type="password" placeholder="At least 6 chars" />
          </Field>

          <Field label="Confirm password">
            <Input name="confirmDiscountPassword" type="password" placeholder="Repeat password" />
          </Field>

          <Field label="Password hint">
            <Input
              name="discountPasswordHint"
              defaultValue={discountSecurity.discount_password_hint || ""}
              placeholder="Optional hint for superadmin"
            />
          </Field>

          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-full bg-[#23313f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Save security settings
            </button>
          </div>
        </form>
      </section>
      )}

      {activeSection === "receipt" && (
      <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Receipt design
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Настрой внешний вид чека, который отправляется клиенту после оплаты.
          </p>
        </div>

        <form action={updateReceiptDesignSettingsAction} className="grid min-w-0 gap-3.5 p-3.5 sm:gap-5 sm:p-6 md:grid-cols-2">
          {!hasReceiptDesignTable && (
            <div className="rounded-2xl border border-[#efd582] bg-[#fff8eb] p-4 text-sm text-[#8a6b20] ring-1 ring-[#efd582] md:col-span-2">
              Receipt design table is missing business info columns. Apply migrations 006_receipt_design_settings.sql and 091_receipt_design_business_info.sql.
            </div>
          )}

          <Field label="Brand name">
            <Input name="brandName" defaultValue={receiptDesign.brand_name || "Bounce Party LA"} />
          </Field>

          <Field label="Accent color (hex)">
            <Input name="accentColor" defaultValue={receiptDesign.accent_color || "#23313f"} placeholder="#23313f" />
          </Field>

          <Field label="Receipt title">
            <Input name="receiptTitle" defaultValue={receiptDesign.receipt_title || "Payment Receipt"} />
          </Field>

          <Field label="Footer text">
            <Input name="footerText" defaultValue={receiptDesign.footer_text || "Thank you for booking with us!"} />
          </Field>

          <Field label="Business address">
            <Input name="businessAddress" defaultValue={receiptDesign.business_address || ""} placeholder="123 Main St, Los Angeles, CA 90001" />
          </Field>

          <Field label="Business phone">
            <Input name="businessPhone" defaultValue={receiptDesign.business_phone || ""} placeholder="(555) 555-0100" />
          </Field>

          <Field label="Business email">
            <Input name="businessEmail" defaultValue={receiptDesign.business_email || ""} placeholder="support@bouncepartyla.com" />
          </Field>

          <Field label="Website">
            <Input name="businessWebsite" defaultValue={receiptDesign.business_website || ""} placeholder="www.bouncepartyla.com" />
          </Field>

          <div className="md:col-span-2 rounded-2xl border border-[#d8cec0] bg-[#fcfaf7] p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Receipt logo
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4">
              {receiptDesign.logo_url ? (
                <img
                  src={receiptDesign.logo_url}
                  alt="Receipt logo"
                  className="h-12 w-12 rounded-xl object-cover ring-1 ring-[#e8ddce]"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xs text-[#8f7f6b] ring-1 ring-[#e8ddce]">
                  No logo
                </div>
              )}

              <Input name="logoFile" type="file" accept="image/*" className="max-w-sm" />

              <label className="inline-flex items-center gap-2 text-sm text-[#6c6258]">
                <input type="checkbox" name="clearLogo" className="h-4 w-4" />
                Remove current logo
              </label>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={!hasReceiptDesignTable}
              className="rounded-full bg-[#23313f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {hasReceiptDesignTable ? "Save receipt design" : "Apply migration to enable save"}
            </button>
          </div>
        </form>
      </section>
      )}

      {activeSection === "contracts" && (
      <section className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Contract template & signature
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            Текст контракта перед оплатой депозита. Поддерживаются переменные из бронирования и обязательная подпись.
          </p>
        </div>

        <ContractTemplateEditorForm
          settings={contractSettings}
          hasContractSettingsTable={hasContractSettingsTable}
        />
      </section>



      <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
          <h3 className="text-xl font-semibold text-[#1f1e1b]">
            Contract history
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            История всех контрактов с фильтрацией, просмотром и повторной отправкой.
          </p>
        </div>

        <div className="space-y-4 p-6">
          <form className="grid min-w-0 gap-3 sm:gap-4 md:grid-cols-[1fr_220px_auto]" method="get">
            <input type="hidden" name="section" value="contracts" />

            <Field label="Search">
              <Input
                name="contractQuery"
                defaultValue={searchParams.contractQuery || ""}
                placeholder="Booking #, signer, email..."
              />
            </Field>

            <Field label="Status">
              <select
                name="contractStatus"
                defaultValue={contractFilter}
                title="Contract status"
                className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
              >
                <option value="all">All statuses</option>
                <option value="not_sent">Not sent</option>
                <option value="sent">Sent</option>
                <option value="viewed">Viewed</option>
                <option value="signed">Signed</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="rounded-full bg-[#23313f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
              >
                Apply
              </button>
              <Link
                href="/admin/settings?section=contracts"
                className="rounded-full border border-[#d8cec0] bg-white px-6 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Reset
              </Link>
            </div>
          </form>

          <div className="space-y-4">
            {filteredContracts.map((row: any) => {
              const booking = getOne(row.bookings);
              const customer = getOne(booking?.customers);
              const renderedHtml = renderedMap.get(row.id) || "";

              return (
                <div
                  key={row.id}
                  className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eee5d9] p-4">
                    <div>
                      <div className="text-sm font-semibold text-[#1f1e1b]">
                        Booking #{booking?.booking_number || String(row.booking_id || "").slice(0, 8)}
                      </div>
                      <div className="mt-1 text-xs text-[#6c6258]">
                        {customer?.full_name || row.signer_name || "Unknown signer"}
                        {booking?.event_date ? ` · ${booking.event_date}` : ""}
                        {booking?.total_amount ? ` · ${money(booking.total_amount)}` : ""}
                      </div>
                    </div>

                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        contractStatusClass(row.status),
                      ].join(" ")}
                    >
                      {String(row.status || "not_sent").replace(/_/g, " ")}
                    </span>
                  </div>

                  <div className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
                    <div className="space-y-1 text-sm text-[#6c6258]">
                      <div>Contract id: {row.id}</div>
                      <div>Signer email: {row.signer_email || customer?.email || "—"}</div>
                      <div>
                        Timeline: sent {row.sent_at || "—"}, viewed {row.viewed_at || "—"}, signed {row.signed_at || "—"}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-start gap-2 md:justify-end">
                      <Link
                        href={`/admin/bookings/${row.booking_id}`}
                        className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                      >
                        Open booking
                      </Link>

                      {row.pdf_url && (
                        <a
                          href={row.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                        >
                          Open PDF
                        </a>
                      )}

                      <form action={resendContractAction}>
                        <input type="hidden" name="contractId" value={row.id} />
                        <button
                          type="submit"
                          className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d]"
                        >
                          Resend
                        </button>
                      </form>
                    </div>
                  </div>

                  <details className="border-t border-[#eee5d9]">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#355879]">
                      View rendered contract
                    </summary>
                    <div className="border-t border-[#eee5d9] bg-white p-3 sm:p-4">
                      {renderedHtml ? (
                        <div
                          className="max-h-[420px] overflow-y-auto rounded-2xl border border-[#eee5d9] p-4 text-sm leading-6 text-[#4b4339]"
                          dangerouslySetInnerHTML={{ __html: renderedHtml }}
                        />
                      ) : hasRenderedHtmlColumn ? (
                        <div className="rounded-2xl border border-dashed border-[#d8cec0] bg-[#fcfaf7] p-4 text-sm text-[#6c6258]">
                          No rendered contract HTML saved.
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[#d8cec0] bg-[#fcfaf7] p-4 text-sm text-[#6c6258]">
                          Rendered HTML column is not available yet. Apply latest migration to enable contract preview.
                        </div>
                      )}
                    </div>
                  </details>
                </div>
              );
            })}

            {filteredContracts.length === 0 && (
              <div className="rounded-[24px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-12 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">No contracts found</div>
                <p className="mt-2 text-sm text-[#6c6258]">
                  Create bookings with signed contract to see history here.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
      </section>
      )}

      // ← ВСТАВИТЬ ЗДЕСЬ

      {activeSection === "handover" && (
        <section className="space-y-6">
          <section className="rounded-[24px] border border-[#e7d8bf] bg-[#fffaf2] shadow-[0_12px_40px_rgba(0,0,0,0.035)] sm:rounded-[30px]">
            <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a723e] sm:text-xs">
                Separate document
              </div>

              <h3 className="mt-1 text-lg font-semibold text-[#1f1e1b] sm:text-xl">
                Equipment Handover / Delivery Receipt
              </h3>

              <p className="mt-1 text-xs leading-5 text-[#6c6258] sm:text-sm sm:leading-6">
                This text belongs only to the equipment handover document. It does not modify the rental contract.
              </p>
            </div>

            <HandoverTemplateEditorForm
              settings={handoverSettings}
              hasHandoverSettingsTable={hasHandoverSettingsTable}
            />
          </section>
        </section>
      )}

    </div>
  );
}

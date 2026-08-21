import { randomUUID } from "node:crypto";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import { resolveIntegrationConnection } from "@/lib/integrations/connections";
import NewBookingWizard from "./components/NewBookingWizard";

type PageProps = {
  searchParams?: Promise<{
    eventDate?: string;
    eventStartTime?: string;
    eventEndTime?: string;
    setupAddress?: string;
    setupCity?: string;
    setupZip?: string;
    error?: string;
  }>;
};

function resolveWizardErrorMessage(code: string | undefined) {
  if (code === "add_product") {
    return "Add at least one available product before creating booking.";
  }

  return "";
}

function getProductCategoryName(categories: any[], categoryId: string | null) {
  if (!categoryId) return null;

  const category = categories.find((item) => item.id === categoryId);
  return category?.name || null;
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

export default async function NewBookingPage(props: PageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const initialErrorMessage = resolveWizardErrorMessage(searchParams.error);
  const { supabase } = await requireAdminPermission("bookings.create");

  const [
    customersResult,
    productsResult,
    categoriesResult,
    productModifierGroupsResult,
    modifierGroupOptionsResult,
    systemSettingsResult,
    workingHoursResult,
    workingHourExceptionsResult,
    paymentMethodsResult,
    paymentPosSettingsResult,
    discountSecurityResult,
    contractSettingsResult,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, phone, email")
      .order("created_at", { ascending: false })
      .limit(200),

    supabase
      .from("products")
      .select("*")
      .neq("active", false)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("categories")
      .select("id, name, active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("product_modifier_groups")
      .select(
        `
        id,
        product_id,
        modifier_group_id,
        sort_order,
        required,
        active,
  modifier_groups (

  id,
  name,
  description,
  selection_type,
  max_total_quantity,
  image_url,
  sort_order,
  active,
  required_by_default

)
      `
      )
      .neq("active", false)
      .order("sort_order", { ascending: true }),

    supabase
      .from("modifier_group_options")
      .select("*")
      .neq("active", false)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

    supabase
      .from("system_settings")
      .select("time_format")
      .limit(1)
      .maybeSingle(),

    supabase
      .from("warehouse_working_hours")
      .select("day_of_week, is_open, open_time, close_time, sort_order")
      .order("sort_order", { ascending: true }),

    supabase
      .from("warehouse_working_hour_exceptions")
      .select("exception_date, is_open, open_time, close_time")
      .order("exception_date", { ascending: true }),

    supabase
      .from("payment_method_settings")
      .select(
        "method, display_name, is_enabled, integration_enabled, integration_type, account_label, account_value, icon_url, sort_order"
      )
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),

    supabase
      .from("payment_pos_settings")
      .select(
        "tips_enabled, allow_custom_tip, tip_mode, default_tip_percent, default_tip_amount, tip_percent_options, tip_amount_options"
      )
      .limit(1)
      .maybeSingle(),

    // security-definer RPC: the raw table only allows super_admin SELECT,
    // which would hide the password requirement from other staff roles.
    supabase
      .rpc("get_discount_security_settings")
      .maybeSingle(),

    supabase
      .from("booking_contract_settings")
      .select(
        "template_html, require_contract_before_payment, require_typed_signature, signature_label"
      )
      .limit(1)
      .maybeSingle(),
  ]);

  if (customersResult.error) {
    throw new Error(customersResult.error.message);
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  if (productModifierGroupsResult.error) {
    throw new Error(productModifierGroupsResult.error.message);
  }

  if (modifierGroupOptionsResult.error) {
    throw new Error(modifierGroupOptionsResult.error.message);
  }

  if (systemSettingsResult.error) {
    throw new Error(systemSettingsResult.error.message);
  }

  if (workingHoursResult.error) {
    throw new Error(workingHoursResult.error.message);
  }

  if (workingHourExceptionsResult.error) {
    throw new Error(workingHourExceptionsResult.error.message);
  }

  if (discountSecurityResult.error && !isMissingTableError(discountSecurityResult.error)) {
    throw new Error(discountSecurityResult.error.message);
  }

  if (contractSettingsResult.error && !isMissingTableError(contractSettingsResult.error)) {
    throw new Error(contractSettingsResult.error.message);
  }

  const hasPaymentMethodsTable = !paymentMethodsResult.error;
  const googleMapsIntegration = await resolveIntegrationConnection("google_maps");
  const googleMapsCredentials = googleMapsIntegration.credentials as Record<string, string>;
  const googleMapsApiKey =
    googleMapsCredentials.browser_api_key ||
    googleMapsCredentials.server_api_key ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    "";

  const customers = customersResult.data || [];
  const categories = (categoriesResult.data || []).filter(
    (category: any) => category.active !== false
  );

  const products = (productsResult.data || []).map((product: any) => ({
    ...product,
    category_name: getProductCategoryName(categories, product.category_id),
  }));

  const optionRows = modifierGroupOptionsResult.data || [];
  const paymentMethodsFromDb =
    (hasPaymentMethodsTable ? paymentMethodsResult.data || [] : []).map((item: any) => ({
      method: item.method,
      displayName: item.display_name || item.method,
      integrationEnabled: item.integration_enabled === true,
      integrationType: item.integration_type || "manual",
      accountLabel: item.account_label || null,
      accountValue: item.account_value || null,
      iconUrl: item.icon_url || null,
    }));

  const paymentMethods = paymentMethodsFromDb.length > 0
    ? paymentMethodsFromDb
    : [
      { method: "cash", displayName: "Cash", integrationEnabled: false, integrationType: "manual", accountLabel: null, accountValue: null, iconUrl: null },
      { method: "zelle", displayName: "Zelle", integrationEnabled: false, integrationType: "manual", accountLabel: null, accountValue: null, iconUrl: null },
      { method: "venmo", displayName: "Venmo", integrationEnabled: false, integrationType: "manual", accountLabel: null, accountValue: null, iconUrl: null },
    ];

  const tipSettings: {
    tipsEnabled: boolean;
    allowCustomTip: boolean;
    tipMode: "percent" | "amount";
    defaultTipPercent: number;
    defaultTipAmount: number;
    tipPercentOptions: number[];
    tipAmountOptions: number[];
  } =
    paymentPosSettingsResult.error || !paymentPosSettingsResult.data
      ? {
          tipsEnabled: true,
          allowCustomTip: true,
          tipMode: "percent",
          defaultTipPercent: 15,
          defaultTipAmount: 10,
          tipPercentOptions: [10, 15, 20],
          tipAmountOptions: [5, 10, 20],
        }
      : {
          tipsEnabled: paymentPosSettingsResult.data.tips_enabled !== false,
          allowCustomTip: paymentPosSettingsResult.data.allow_custom_tip !== false,
          tipMode:
            paymentPosSettingsResult.data.tip_mode === "amount"
              ? "amount"
              : "percent",
          defaultTipPercent: Number(
            paymentPosSettingsResult.data.default_tip_percent || 15
          ),
          defaultTipAmount: Number(
            paymentPosSettingsResult.data.default_tip_amount || 10
          ),
          tipPercentOptions: String(
            paymentPosSettingsResult.data.tip_percent_options || "10,15,20"
          )
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isFinite(item) && item >= 0 && item <= 100),
          tipAmountOptions: String(
            paymentPosSettingsResult.data.tip_amount_options || "5,10,20"
          )
            .split(",")
            .map((item) => Number(item.trim()))
            .filter((item) => Number.isFinite(item) && item >= 0),
        };

  if (tipSettings.tipPercentOptions.length === 0) {
    tipSettings.tipPercentOptions = [10, 15, 20];
  }

  if (tipSettings.tipAmountOptions.length === 0) {
    tipSettings.tipAmountOptions = [5, 10, 20];
  }

  const discountSecurity =
    discountSecurityResult.data || {
      discount_password_enabled: false,
      discount_password_hint: null,
    };

  const contractSettings =
    contractSettingsResult.data || {
      template_html:
        "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>",
      require_contract_before_payment: true,
      require_typed_signature: true,
      signature_label: "Client signature",
    };

  const modifierGroups = (productModifierGroupsResult.data || [])
    .filter((row: any) => row.modifier_groups)
    .map((row: any) => {
      const group = Array.isArray(row.modifier_groups)
        ? row.modifier_groups[0]
        : row.modifier_groups;

      return {
        connectionId: row.id,
        productId: row.product_id,
        modifierGroupId: row.modifier_group_id,
        required: row.required === true || group?.required_by_default === true,
        active: row.active !== false && group?.active !== false,
        sortOrder: row.sort_order || group?.sort_order || 100,
        id: group.id,
        name: group.name,
        description: group.description,
        selectionType: group.selection_type || "single",
        maxTotalQuantity:
        group.max_total_quantity == null
        ? null
        : Math.max(1, Number(group.max_total_quantity)),
        imageUrl: group.image_url,
        options: optionRows
          .filter((option: any) => option.modifier_group_id === group.id)
          .map((option: any) => ({
            id: option.id,
            modifierGroupId: option.modifier_group_id,
            name:
              option.option_name ||
              option.name ||
              option.label ||
              option.title ||
              "Option",
            description: option.description,
            imageUrl: option.image_url,
            priceDelta: Number(option.price_delta || 0),
            inventoryItemId: option.inventory_item_id,
            inventoryQuantity: Number(option.inventory_quantity || 1),
            trackInventory: option.track_inventory !== false,
            inventoryBehavior: (option.inventory_behavior === "consumable" ? "consumable" : "reusable") as "reusable" | "consumable",
            active: option.active !== false,
            sortOrder: option.sort_order || 100,
          })),
      };
    })
    .filter((group: any) => group.active)
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <a
              href="/admin/bookings"
              className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
            >
              ← Back to bookings
            </a>

            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Booking wizard
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              New Booking
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
              Создание заказа по шагам: клиент, дата/время, товары, доп. опции,
              цена и подтверждение.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/calendar"
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Calendar
            </a>

            <a
              href="/admin/inventory"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Inventory
            </a>
          </div>
        </div>
      </section>

      <NewBookingWizard
        bookingAttemptId={randomUUID()}
        initialErrorMessage={initialErrorMessage}
        customers={customers}
        products={products}
        categories={categories}
        modifierGroups={modifierGroups}
        googleMapsApiKey={googleMapsApiKey}
        initialEventDate={searchParams.eventDate || ""}
        initialEventStartTime={searchParams.eventStartTime || ""}
        initialEventEndTime={searchParams.eventEndTime || ""}
        initialSetupAddress={searchParams.setupAddress || ""}
        initialSetupCity={searchParams.setupCity || ""}
        initialSetupZip={searchParams.setupZip || ""}
        timeFormat={(systemSettingsResult.data?.time_format || "24h") as
          | "12h"
          | "24h"}
        workingHours={workingHoursResult.data || []}
        workingHourExceptions={workingHourExceptionsResult.data || []}
        paymentMethods={paymentMethods}
        tipSettings={tipSettings}
        discountSecurity={discountSecurity}
        contractSettings={contractSettings}
      />
    </div>
  );
}
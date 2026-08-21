"use server";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPermission } from "@/lib/auth/require-admin";

const SETTINGS_IMAGE_BUCKET = "catalog-images";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = getString(formData, key);

  if (!value) return fallback;

  const parsed = Number(value.replace(",", "."));

  return Number.isNaN(parsed) ? fallback : parsed;
}

function getNullableNumber(formData: FormData, key: string) {
  const value = getString(formData, key);

  if (!value) return null;

  const parsed = Number(value.replace(",", "."));

  return Number.isNaN(parsed) ? null : parsed;
}

function safeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isRealFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "name" in value &&
      "size" in value &&
      Number((value as File).size) > 0
  );
}

function parsePercentOptions(value: string) {
  const parsed = String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0 && item <= 100);

  const unique = Array.from(new Set(parsed));

  return unique.length > 0 ? unique : [10, 15, 20];
}

function parseAmountOptions(value: string) {
  const parsed = String(value || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item >= 0)
    .map((item) => Number(item.toFixed(2)));

  const unique = Array.from(new Set(parsed));

  return unique.length > 0 ? unique : [5, 10, 20];
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

function isRlsPolicyError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return code === "42501" || message.includes("row-level security policy");
}

async function uploadSettingsImage({
  file,
  folder,
}: {
  file: File;
  folder: string;
}) {
  const supabase = await createClient();

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()
    : "png";

  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(
    file.name || `icon.${extension}`
  )}`;

  const { error: uploadError } = await supabase.storage
    .from(SETTINGS_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/png",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(SETTINGS_IMAGE_BUCKET).getPublicUrl(path);

  if (!data.publicUrl) {
    throw new Error("Could not create public URL for icon.");
  }

  return data.publicUrl;
}

function cleanTime(value: string | null) {
  if (!value) return null;

  const cleanValue = value.trim();

  if (!/^\d{2}:\d{2}$/.test(cleanValue)) {
    return null;
  }

  return cleanValue;
}

function cleanDate(value: string | null) {
  if (!value) return null;

  const cleanValue = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    return null;
  }

  return cleanValue;
}

function cleanHexColor(value: string | null, fallback = "#23313f") {
  const input = String(value || "").trim();
  if (!input) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(input)) return input;
  return fallback;
}

function revalidateSettings() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/bookings/new");
  revalidatePath("/admin/calendar");
  revalidatePath("/account/help");
}

function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(value, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function isValidPasswordHash(stored: string | null | undefined, candidate: string) {
  if (!stored || !candidate) {
    return false;
  }

  const [salt, savedHash] = String(stored).split(":");

  if (!salt || !savedHash) {
    return false;
  }

  const computedHash = scryptSync(candidate, salt, 64).toString("hex");

  try {
    return timingSafeEqual(Buffer.from(savedHash, "hex"), Buffer.from(computedHash, "hex"));
  } catch {
    return false;
  }
}

async function getOrCreateDiscountSecuritySettingsId() {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("booking_discount_security_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError)) {
      return null;
    }

    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("booking_discount_security_settings")
    .insert({
      discount_password_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createError) {
    if (isMissingTableError(createError)) {
      return null;
    }

    if (isRlsPolicyError(createError)) {
      return null;
    }

    throw new Error(createError.message);
  }

  return created.id;
}

async function getOrCreateBookingContractSettingsId() {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("booking_contract_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError)) {
      return null;
    }

    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("booking_contract_settings")
    .insert({
      template_html:
        "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>Address: {{setup_address}}, {{setup_city}} {{setup_zip}}</p><p>I confirm that I read and agree with this contract.</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>",
      require_contract_before_payment: true,
      require_typed_signature: true,
      signature_label: "Client signature",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createError) {
    if (isMissingTableError(createError)) {
      return null;
    }

    if (isRlsPolicyError(createError)) {
      return null;
    }

    throw new Error(createError.message);
  }

  return created.id;
}

async function getOrCreateReceiptDesignSettingsId() {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("booking_receipt_design_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    if (isMissingTableError(existingError) || isRlsPolicyError(existingError)) {
      return null;
    }

    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("booking_receipt_design_settings")
    .insert({
      logo_url: null,
      brand_name: "Bounce Party LA",
      accent_color: "#23313f",
      receipt_title: "Payment Receipt",
      footer_text: "Thank you for booking with us!",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createError) {
    if (isMissingTableError(createError) || isRlsPolicyError(createError)) {
      return null;
    }

    throw new Error(createError.message);
  }

  return created.id;
}

export async function updateDiscountSecuritySettingsAction(formData: FormData) {
  const supabase = await createClient();

  const settingsId = await getOrCreateDiscountSecuritySettingsId();

  if (!settingsId) {
    throw new Error(
      "Cannot save security settings: missing settings row or blocked by RLS. Apply migration 005_fix_booking_settings_rls.sql."
    );
  }

  const enabled = getBoolean(formData, "discountPasswordEnabled");
  const hint = getNullableString(formData, "discountPasswordHint");
  const newPassword = getString(formData, "newDiscountPassword");
  const confirmPassword = getString(formData, "confirmDiscountPassword");

  const { data: existing, error: existingError } = await supabase
    .from("booking_discount_security_settings")
    .select("discount_password_hash")
    .eq("id", settingsId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  let passwordHash = existing?.discount_password_hash || null;

  if (newPassword) {
    if (newPassword.length < 6) {
      throw new Error("Discount password must be at least 6 characters.");
    }

    if (newPassword !== confirmPassword) {
      throw new Error("Discount password confirmation does not match.");
    }

    passwordHash = hashPassword(newPassword);
  }

  if (enabled && !passwordHash) {
    throw new Error("Set discount password before enabling discount authorization.");
  }

  const { error } = await supabase
    .from("booking_discount_security_settings")
    .update({
      discount_password_enabled: enabled,
      discount_password_hash: passwordHash,
      discount_password_hint: hint,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);

  if (error) {
    if (isRlsPolicyError(error)) {
      throw new Error(
        "Cannot save security settings due to RLS policy. Apply migration 005_fix_booking_settings_rls.sql."
      );
    }

    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=security&saved=security");
}

export async function updateBookingContractSettingsAction(formData: FormData) {
  const supabase = await createClient();

  const settingsId = await getOrCreateBookingContractSettingsId();

  if (!settingsId) {
    throw new Error(
      "Cannot save contract settings: missing settings row or blocked by RLS. Apply migration 005_fix_booking_settings_rls.sql."
    );
  }

  const templateHtml = getString(formData, "templateHtml");
  const requireContractBeforePayment = getBoolean(formData, "requireContractBeforePayment");
  const requireTypedSignature = getBoolean(formData, "requireTypedSignature");
  const signatureLabel = getString(formData, "signatureLabel") || "Client signature";

  if (!templateHtml) {
    throw new Error("Contract template cannot be empty.");
  }

  const { error } = await supabase
    .from("booking_contract_settings")
    .update({
      template_html: templateHtml,
      require_contract_before_payment: requireContractBeforePayment,
      require_typed_signature: requireTypedSignature,
      signature_label: signatureLabel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);

  if (error) {
    if (isRlsPolicyError(error)) {
      throw new Error(
        "Cannot save contract settings due to RLS policy. Apply migration 005_fix_booking_settings_rls.sql."
      );
    }

    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=contracts&saved=contracts");
}

export async function updateReceiptDesignSettingsAction(formData: FormData) {
  const supabase = await createClient();

  const settingsId = await getOrCreateReceiptDesignSettingsId();

  if (!settingsId) {
    throw new Error(
      "Cannot save receipt design: missing settings row or blocked by RLS. Apply migration 006_receipt_design_settings.sql."
    );
  }

  const brandName = getString(formData, "brandName") || "Bounce Party LA";
  const accentColor = cleanHexColor(
    getString(formData, "accentColor"),
    "#23313f"
  );
  const receiptTitle =
    getString(formData, "receiptTitle") || "Payment Receipt";
  const footerText =
    getString(formData, "footerText") || "Thank you for booking with us!";

  const businessAddress = getNullableString(formData, "businessAddress");
  const businessPhone = getNullableString(formData, "businessPhone");
  const businessEmail = getNullableString(formData, "businessEmail");
  const businessWebsite = getNullableString(formData, "businessWebsite");

  const clearLogo = getBoolean(formData, "clearLogo");
  const logoFile = formData.get("logoFile");

  const { data: currentSettings, error: currentSettingsError } =
    await supabase
      .from("booking_receipt_design_settings")
      .select("logo_url")
      .eq("id", settingsId)
      .maybeSingle();

  if (currentSettingsError) {
    if (isMissingTableError(currentSettingsError)) {
      throw new Error(
        "Cannot save receipt design. Apply migration 006_receipt_design_settings.sql."
      );
    }

    if (isRlsPolicyError(currentSettingsError)) {
      throw new Error("Cannot save receipt design due to RLS policy.");
    }

    throw new Error(currentSettingsError.message);
  }

  let logoUrl = clearLogo ? null : currentSettings?.logo_url || null;

  if (isRealFile(logoFile)) {
    logoUrl = await uploadSettingsImage({
      file: logoFile,
      folder: "receipt-design",
    });
  }

  const { error } = await supabase
    .from("booking_receipt_design_settings")
    .update({
      logo_url: logoUrl,
      brand_name: brandName,
      accent_color: accentColor,
      receipt_title: receiptTitle,
      footer_text: footerText,
      business_address: businessAddress,
      business_phone: businessPhone,
      business_email: businessEmail,
      business_website: businessWebsite,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error(
        "Cannot save receipt design. Apply migrations 006_receipt_design_settings.sql and 091_receipt_design_business_info.sql."
      );
    }

    if (isRlsPolicyError(error)) {
      throw new Error("Cannot save receipt design due to RLS policy.");
    }

    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=receipt&saved=receipt");
}

export async function updateHandoverSettingsAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const templateHtml = getString(formData, "templateHtml");

  const acknowledgementLabel =
    getString(formData, "acknowledgementLabel") ||
    "I confirm that I reviewed and accept the equipment and quantities listed above.";

  const signatureLabel =
    getString(formData, "signatureLabel") || "Customer signature";

  const requireAcknowledgement = getBoolean(
    formData,
    "requireAcknowledgement"
  );

  const requireSignature = getBoolean(
    formData,
    "requireSignature"
  );

  if (!templateHtml) {
    throw new Error("Handover text cannot be empty.");
  }

  const { data: settingsRow, error: lookupError } = await supabase
    .from("handover_settings")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    if (isMissingTableError(lookupError)) {
      throw new Error(
        "Cannot save handover settings. Apply migration 101_handover_documents_foundation.sql."
      );
    }

    throw new Error(lookupError.message);
  }

  if (!settingsRow?.id) {
    throw new Error("Handover settings row was not found.");
  }

  const { error } = await supabase
    .from("handover_settings")
    .update({
      template_html: templateHtml,
      acknowledgement_label: acknowledgementLabel,
      signature_label: signatureLabel,
      require_acknowledgement: requireAcknowledgement,
      require_signature: requireSignature,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsRow.id);

  if (error) {
    if (isRlsPolicyError(error)) {
      throw new Error(
        "Cannot save handover settings due to RLS policy."
      );
    }

    throw new Error(error.message);
  }

  revalidateSettings();
  revalidatePath("/driver");
  revalidatePath("/admin/reports");

  redirect("/admin/settings?section=handover&saved=handover");
}

export async function verifyDiscountPasswordAction(formData: FormData) {
  const supabase = await createClient();

  const password = getString(formData, "password");

  const { data: settings, error } = await supabase
    .from("booking_discount_security_settings")
    .select("discount_password_enabled, discount_password_hash")
    .limit(1)
    .maybeSingle();

  if (error && !isMissingTableError(error)) {
    throw new Error(error.message);
  }

  if (!settings || settings.discount_password_enabled !== true) {
    return {
      ok: true,
      message: "Discount password is disabled.",
    };
  }

  const valid = isValidPasswordHash(settings.discount_password_hash, password);

  return {
    ok: valid,
    message: valid ? "Discount authorized." : "Invalid discount password.",
  };
}

export async function resendContractAction(formData: FormData) {
  const supabase = await createClient();

  const contractId = getString(formData, "contractId");

  if (!contractId) {
    throw new Error("Missing contract id.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("contracts")
    .select("id, status")
    .eq("id", contractId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    throw new Error("Contract not found.");
  }

  const nextStatus = existing.status === "signed" ? "signed" : "sent";

  const { error } = await supabase
    .from("contracts")
    .update({
      status: nextStatus,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
}

async function getOrCreateSystemSettingsId() {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("system_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.id) {
    return existing.id;
  }

  const { data: created, error: createError } = await supabase
    .from("system_settings")
    .insert({
      business_name: "Bounce Party LA",
      timezone: "America/Los_Angeles",
      time_format: "12h",
      date_format: "us",
      delivery_pricing_mode: "miles",
      free_delivery_miles: 10,
      price_per_mile: 1,
      minimum_delivery_fee: 0,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (createError) {
    throw new Error(createError.message);
  }

  return created.id;
}

export async function updateSystemSettingsAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const settingsId = await getOrCreateSystemSettingsId();

  const businessName = getNullableString(formData, "businessName");
  const timezone = getString(formData, "timezone") || "America/Los_Angeles";

  const timeFormat = getString(formData, "timeFormat") || "12h";
  const dateFormat = getString(formData, "dateFormat") || "us";

  const warehouseAddress = getNullableString(formData, "warehouseAddress");
  const warehouseCity = getNullableString(formData, "warehouseCity");
  const warehouseState = getNullableString(formData, "warehouseState");
  const warehouseZip = getNullableString(formData, "warehouseZip");
  const warehouseLat = getNullableNumber(formData, "warehouseLat");
  const warehouseLng = getNullableNumber(formData, "warehouseLng");

  const deliveryPricingMode =
    getString(formData, "deliveryPricingMode") || "miles";

  const freeDeliveryMiles = getNumber(formData, "freeDeliveryMiles", 10);
  const pricePerMile = getNumber(formData, "pricePerMile", 1);
  const minimumDeliveryFee = getNumber(formData, "minimumDeliveryFee", 0);

  if (!["12h", "24h"].includes(timeFormat)) {
    throw new Error("Invalid time format.");
  }

  if (!["us", "eu"].includes(dateFormat)) {
    throw new Error("Invalid date format.");
  }

  if (!["miles", "radius_zones", "zip_zones"].includes(deliveryPricingMode)) {
    throw new Error("Invalid delivery pricing mode.");
  }

  const { error } = await supabase
    .from("system_settings")
    .update({
      business_name: businessName,
      timezone,
      time_format: timeFormat,
      date_format: dateFormat,

      warehouse_address: warehouseAddress,
      warehouse_city: warehouseCity,
      warehouse_state: warehouseState,
      warehouse_zip: warehouseZip,
      warehouse_lat: warehouseLat,
      warehouse_lng: warehouseLng,

      delivery_pricing_mode: deliveryPricingMode,
      free_delivery_miles: freeDeliveryMiles,
      price_per_mile: pricePerMile,
      minimum_delivery_fee: minimumDeliveryFee,

      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
}

export async function updateAccountHelpSettingsAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");
  const settingsId = await getOrCreateSystemSettingsId();

  const title = getString(formData, "accountHelpTitle") || "Need support?";
  const description =
    getString(formData, "accountHelpDescription") ||
    "Contact Bounce Party LA for booking updates, delivery window changes, payment help or contract questions.";
  const email = getString(formData, "accountHelpEmail") || "support@bouncepartyla.com";
  const phone = getString(formData, "accountHelpPhone") || "(323) 000-0000";

  const { error } = await supabase
    .from("system_settings")
    .update({
      account_help_title: title,
      account_help_description: description,
      account_help_email: email,
      account_help_phone: phone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=account-help&saved=account-help");
}

export async function updateDeliveryPricingSettingsAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const settingsId = await getOrCreateSystemSettingsId();

  const deliveryPricingMode =
    getString(formData, "deliveryPricingMode") || "miles";
  const freeDeliveryMiles = getNumber(formData, "freeDeliveryMiles", 10);
  const pricePerMile = getNumber(formData, "pricePerMile", 1);
  const minimumDeliveryFee = getNumber(formData, "minimumDeliveryFee", 0);

  if (![
    "miles",
    "radius_zones",
    "zip_zones",
  ].includes(deliveryPricingMode)) {
    throw new Error("Invalid delivery pricing mode.");
  }

  const { error } = await supabase
    .from("system_settings")
    .update({
      delivery_pricing_mode: deliveryPricingMode,
      free_delivery_miles: freeDeliveryMiles,
      price_per_mile: pricePerMile,
      minimum_delivery_fee: minimumDeliveryFee,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=delivery&saved=delivery");
}

export async function updateWarehouseAddressSettingsAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");
  const settingsId = await getOrCreateSystemSettingsId();

  const warehouseAddress = getNullableString(formData, "warehouseAddress");
  const warehouseCity = getNullableString(formData, "warehouseCity");
  const warehouseState = getNullableString(formData, "warehouseState");
  const warehouseZip = getNullableString(formData, "warehouseZip");
  const warehouseLat = getNullableNumber(formData, "warehouseLat");
  const warehouseLng = getNullableNumber(formData, "warehouseLng");

  const { error } = await supabase
    .from("system_settings")
    .update({
      warehouse_address: warehouseAddress,
      warehouse_city: warehouseCity,
      warehouse_state: warehouseState,
      warehouse_zip: warehouseZip,
      warehouse_lat: warehouseLat,
      warehouse_lng: warehouseLng,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
}

export async function updatePaymentMethodsAction(formData: FormData) {
  const supabase = await createClient();

  const methods = [
    "zelle",
    "venmo",
    "stripe",
    "cash",
    "card",
    "check",
    "bank_transfer",
    "other",
  ];

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("payment_method_settings")
    .select("method, icon_url");

  if (existingRowsError && !isMissingTableError(existingRowsError)) {
    if (isRlsPolicyError(existingRowsError)) {
      revalidateSettings();
      redirect("/admin/settings?section=payments&error=payments-rls");
    }

    throw new Error(existingRowsError.message);
  }

  if (existingRowsError && isMissingTableError(existingRowsError)) {
    revalidateSettings();
    redirect("/admin/settings?section=payments&error=payments-schema-missing");
  }

  const iconByMethod = new Map<string, string | null>();

  for (const row of existingRows || []) {
    iconByMethod.set(String((row as any).method), (row as any).icon_url || null);
  }

  const rows = await Promise.all(methods.map(async (method, index) => {
    const displayName = getString(formData, `${method}_displayName`) || method;
    const isEnabled = getBoolean(formData, `${method}_isEnabled`);
    const integrationEnabled = getBoolean(
      formData,
      `${method}_integrationEnabled`
    );

    const integrationType =
      getNullableString(formData, `${method}_integrationType`) ||
      (method === "stripe" ? "stripe" : "manual");

    const accountLabel = getNullableString(formData, `${method}_accountLabel`);
    const accountValue = getNullableString(formData, `${method}_accountValue`);
    const sortOrder = getNumber(formData, `${method}_sortOrder`, (index + 1) * 10);

    const iconFile = formData.get(`${method}_iconFile`);
    const clearIcon = getBoolean(formData, `${method}_clearIcon`);

    let iconUrl = iconByMethod.get(method) || null;

    if (clearIcon) {
      iconUrl = null;
    }

    if (isRealFile(iconFile)) {
      iconUrl = await uploadSettingsImage({
        file: iconFile,
        folder: `payment-methods/${method}`,
      });
    }

    return {
      method,
      display_name: displayName,
      is_enabled: isEnabled,
      integration_enabled: integrationEnabled,
      integration_type: integrationType,
      account_label: accountLabel,
      account_value: accountValue,
      icon_url: iconUrl,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    };
  }));

  const { error } = await supabase.from("payment_method_settings").upsert(rows, {
    onConflict: "method",
  });

  if (error) {
    if (isMissingTableError(error)) {
      revalidateSettings();
      redirect("/admin/settings?section=payments&error=payments-schema-missing");
    }

    if (isRlsPolicyError(error)) {
      revalidateSettings();
      redirect("/admin/settings?section=payments&error=payments-rls");
    }

    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=payments&saved=payments");
}

export async function updatePaymentPosSettingsAction(formData: FormData) {
  const supabase = await createClient();

  const tipsEnabled = getBoolean(formData, "tipsEnabled");
  const allowCustomTip = getBoolean(formData, "allowCustomTip");
  const tipModeRaw = getString(formData, "tipMode");
  const tipMode = tipModeRaw === "amount" ? "amount" : "percent";
  const defaultTipPercent = getNumber(formData, "defaultTipPercent", 15);
  const defaultTipAmount = getNumber(formData, "defaultTipAmount", 10);
  const tipPercentOptions = parsePercentOptions(
    getString(formData, "tipPercentOptions")
  );
  const tipAmountOptions = parseAmountOptions(
    getString(formData, "tipAmountOptions")
  );

  const payload = {
    tips_enabled: tipsEnabled,
    allow_custom_tip: allowCustomTip,
    tip_mode: tipMode,
    default_tip_percent: Number(defaultTipPercent.toFixed(2)),
    default_tip_amount: Number(defaultTipAmount.toFixed(2)),
    tip_percent_options: tipPercentOptions.join(","),
    tip_amount_options: tipAmountOptions.join(","),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: existingError } = await supabase
    .from("payment_pos_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existingError && !isMissingTableError(existingError)) {
    if (isRlsPolicyError(existingError)) {
      revalidateSettings();
      redirect("/admin/settings?section=payments&error=payments-rls");
    }

    throw new Error(existingError.message);
  }

  if (existingError && isMissingTableError(existingError)) {
    revalidateSettings();
    redirect("/admin/settings?section=payments&error=payments-schema-missing");
  }

  let error: any = null;

  if (existing?.id) {
    const result = await supabase
      .from("payment_pos_settings")
      .update(payload)
      .eq("id", existing.id);

    error = result.error;
  } else {
    const result = await supabase.from("payment_pos_settings").insert(payload);
    error = result.error;
  }

  if (error) {
    if (isMissingTableError(error)) {
      revalidateSettings();
      redirect("/admin/settings?section=payments&error=payments-schema-missing");
    }

    if (isRlsPolicyError(error)) {
      revalidateSettings();
      redirect("/admin/settings?section=payments&error=payments-rls");
    }

    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=payments&saved=payments");
}

export async function updateWarehouseWorkingHourAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const dayOfWeek = getNumber(formData, "dayOfWeek", -1);
  const isOpen = getBoolean(formData, "isOpen");
  const openTime = cleanTime(getNullableString(formData, "openTime"));
  const closeTime = cleanTime(getNullableString(formData, "closeTime"));
  const sortOrder = getNumber(formData, "sortOrder", dayOfWeek * 10);

  if (dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error("Invalid day of week.");
  }

  if (isOpen && (!openTime || !closeTime)) {
    throw new Error("Open and close time are required for open days.");
  }

  if (isOpen && openTime && closeTime && openTime >= closeTime) {
    throw new Error("Close time must be later than open time.");
  }

  const { error } = await supabase
    .from("warehouse_working_hours")
    .upsert(
      {
        day_of_week: dayOfWeek,
        is_open: isOpen,
        open_time: isOpen ? openTime : null,
        close_time: isOpen ? closeTime : null,
        sort_order: sortOrder,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "day_of_week",
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
}

export async function addWarehouseWorkingHourExceptionAction(
  formData: FormData
) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const exceptionDate = cleanDate(getNullableString(formData, "exceptionDate"));
  const isOpen = getBoolean(formData, "isOpen");
  const openTime = cleanTime(getNullableString(formData, "openTime"));
  const closeTime = cleanTime(getNullableString(formData, "closeTime"));
  const title = getNullableString(formData, "title");
  const notes = getNullableString(formData, "notes");

  if (!exceptionDate) {
    throw new Error("Exception date is required.");
  }

  if (isOpen && (!openTime || !closeTime)) {
    throw new Error("Open and close time are required for open exceptions.");
  }

  if (isOpen && openTime && closeTime && openTime >= closeTime) {
    throw new Error("Close time must be later than open time.");
  }

  const { error } = await supabase
    .from("warehouse_working_hour_exceptions")
    .upsert(
      {
        exception_date: exceptionDate,
        is_open: isOpen,
        open_time: isOpen ? openTime : null,
        close_time: isOpen ? closeTime : null,
        title,
        notes,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "exception_date",
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
}

export async function deleteWarehouseWorkingHourExceptionAction(
  formData: FormData
) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const exceptionId = getString(formData, "exceptionId");

  if (!exceptionId) {
    throw new Error("Missing exception id.");
  }

  const { error } = await supabase
    .from("warehouse_working_hour_exceptions")
    .delete()
    .eq("id", exceptionId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
}

export async function addDeliveryRadiusZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const name = getString(formData, "name") || "Radius zone";
  const fromMiles = getNumber(formData, "fromMiles", 0);
  const toMiles = getNumber(formData, "toMiles", 0);
  const deliveryFee = getNumber(formData, "deliveryFee", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const active = getBoolean(formData, "active");

  if (toMiles <= fromMiles) {
    throw new Error("To miles must be greater than from miles.");
  }

  const { error } = await supabase.from("delivery_radius_zones").insert({
    name,
    from_miles: fromMiles,
    to_miles: toMiles,
    delivery_fee: deliveryFee,
    sort_order: sortOrder,
    active,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=delivery&saved=delivery");
}

export async function updateDeliveryRadiusZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const zoneId = getString(formData, "zoneId");
  const name = getString(formData, "name") || "Radius zone";
  const fromMiles = getNumber(formData, "fromMiles", 0);
  const toMiles = getNumber(formData, "toMiles", 0);
  const deliveryFee = getNumber(formData, "deliveryFee", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const active = getBoolean(formData, "active");

  if (!zoneId) {
    throw new Error("Missing radius zone id.");
  }

  if (toMiles <= fromMiles) {
    throw new Error("To miles must be greater than from miles.");
  }

  const { error } = await supabase
    .from("delivery_radius_zones")
    .update({
      name,
      from_miles: fromMiles,
      to_miles: toMiles,
      delivery_fee: deliveryFee,
      sort_order: sortOrder,
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", zoneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=delivery&saved=delivery");
}

export async function deleteDeliveryRadiusZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const zoneId = getString(formData, "zoneId");

  if (!zoneId) {
    throw new Error("Missing radius zone id.");
  }

  const { error } = await supabase
    .from("delivery_radius_zones")
    .delete()
    .eq("id", zoneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=delivery&saved=delivery");
}

export async function addDeliveryZipZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const zoneName = getString(formData, "zoneName") || "ZIP zone";
  const zipCode = getString(formData, "zipCode");
  const deliveryFee = getNumber(formData, "deliveryFee", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const active = getBoolean(formData, "active");

  if (!zipCode) {
    throw new Error("ZIP code is required.");
  }

  const { error } = await supabase.from("delivery_zip_zones").insert({
    zone_name: zoneName,
    zip_code: zipCode,
    delivery_fee: deliveryFee,
    sort_order: sortOrder,
    active,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=delivery&saved=delivery");
}

export async function updateDeliveryZipZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const zoneId = getString(formData, "zoneId");
  const zoneName = getString(formData, "zoneName") || "ZIP zone";
  const zipCode = getString(formData, "zipCode");
  const deliveryFee = getNumber(formData, "deliveryFee", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const active = getBoolean(formData, "active");

  if (!zoneId) {
    throw new Error("Missing ZIP zone id.");
  }

  if (!zipCode) {
    throw new Error("ZIP code is required.");
  }

  const { error } = await supabase
    .from("delivery_zip_zones")
    .update({
      zone_name: zoneName,
      zip_code: zipCode,
      delivery_fee: deliveryFee,
      sort_order: sortOrder,
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", zoneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=delivery&saved=delivery");
}

export async function deleteDeliveryZipZoneAction(formData: FormData) {
  const { supabase } = await requireAdminPermission("settings.edit");

  const zoneId = getString(formData, "zoneId");

  if (!zoneId) {
    throw new Error("Missing ZIP zone id.");
  }

  const { error } = await supabase
    .from("delivery_zip_zones")
    .delete()
    .eq("id", zoneId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateSettings();
  redirect("/admin/settings?section=delivery&saved=delivery");
}
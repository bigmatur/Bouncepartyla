"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableString(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = getString(formData, key);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value.replace(",", "."));

  return Number.isNaN(parsed) ? fallback : parsed;
}

function getNullableDateTime(formData: FormData, key: string) {
  const value = getString(formData, key);

  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

function cleanDate(value: string | null) {
  if (!value) return null;

  const cleanValue = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    return null;
  }

  return cleanValue;
}

function cleanTime(value: string | null) {
  if (!value) return null;

  const cleanValue = value.trim();

  if (!/^\d{2}:\d{2}$/.test(cleanValue)) {
    return null;
  }

  return cleanValue;
}

function revalidateLeads() {
  revalidatePath("/admin");
  revalidatePath("/admin/leads");
}

export async function createLeadAction(formData: FormData) {
  const supabase = await createClient();

  const customerName = getNullableString(formData, "customerName");
  const customerPhone = getNullableString(formData, "customerPhone");
  const customerEmail = getNullableString(formData, "customerEmail");
  const instagramUsername = getNullableString(formData, "instagramUsername");

  const eventDate = cleanDate(getNullableString(formData, "eventDate"));
  const eventStartTime = cleanTime(getNullableString(formData, "eventStartTime"));
  const eventEndTime = cleanTime(getNullableString(formData, "eventEndTime"));

  const eventAddress = getNullableString(formData, "eventAddress");
  const eventCity = getNullableString(formData, "eventCity");
  const eventState = getNullableString(formData, "eventState");
  const eventZip = getNullableString(formData, "eventZip");

  const requestedProduct = getNullableString(formData, "requestedProduct");
  const requestedCategory = getNullableString(formData, "requestedCategory");

  const source = getString(formData, "source") || "instagram";
  const status = getString(formData, "status") || "new";

  const quotedSubtotal = getNumber(formData, "quotedSubtotal", 0);
  const quotedDeliveryFee = getNumber(formData, "quotedDeliveryFee", 0);
  const quotedTax = getNumber(formData, "quotedTax", 0);
  const quotedTotal = getNumber(formData, "quotedTotal", 0);
  const depositRequested = getNumber(formData, "depositRequested", 50);

  const nextFollowUpAt = getNullableDateTime(formData, "nextFollowUpAt");
  const notes = getNullableString(formData, "notes");

  if (!customerName && !customerPhone && !customerEmail && !instagramUsername) {
    throw new Error("Add customer name, phone, email or Instagram username.");
  }

  if (
    ![
      "new",
      "quote_sent",
      "follow_up",
      "deposit_pending",
      "booked",
      "lost",
      "cancelled",
    ].includes(status)
  ) {
    throw new Error("Invalid lead status.");
  }

  if (
    ![
      "instagram",
      "website",
      "whatsapp",
      "phone",
      "email",
      "referral",
      "repeat_customer",
      "other",
    ].includes(source)
  ) {
    throw new Error("Invalid lead source.");
  }

  const { error } = await supabase.from("booking_leads").insert({
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    instagram_username: instagramUsername,

    event_date: eventDate,
    event_start_time: eventStartTime,
    event_end_time: eventEndTime,

    event_address: eventAddress,
    event_city: eventCity,
    event_state: eventState,
    event_zip: eventZip,

    requested_product: requestedProduct,
    requested_category: requestedCategory,

    source,
    status,

    quoted_subtotal: quotedSubtotal,
    quoted_delivery_fee: quotedDeliveryFee,
    quoted_tax: quotedTax,
    quoted_total: quotedTotal,
    deposit_requested: depositRequested,

    next_follow_up_at: nextFollowUpAt,
    notes,

    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidateLeads();
}

export async function updateLeadAction(formData: FormData) {
  const supabase = await createClient();

  const leadId = getString(formData, "leadId");

  if (!leadId) {
    throw new Error("Missing lead id.");
  }

  const customerName = getNullableString(formData, "customerName");
  const customerPhone = getNullableString(formData, "customerPhone");
  const customerEmail = getNullableString(formData, "customerEmail");
  const instagramUsername = getNullableString(formData, "instagramUsername");

  const eventDate = cleanDate(getNullableString(formData, "eventDate"));
  const eventStartTime = cleanTime(getNullableString(formData, "eventStartTime"));
  const eventEndTime = cleanTime(getNullableString(formData, "eventEndTime"));

  const eventAddress = getNullableString(formData, "eventAddress");
  const eventCity = getNullableString(formData, "eventCity");
  const eventState = getNullableString(formData, "eventState");
  const eventZip = getNullableString(formData, "eventZip");

  const requestedProduct = getNullableString(formData, "requestedProduct");
  const requestedCategory = getNullableString(formData, "requestedCategory");

  const source = getString(formData, "source") || "instagram";
  const status = getString(formData, "status") || "new";

  const quotedSubtotal = getNumber(formData, "quotedSubtotal", 0);
  const quotedDeliveryFee = getNumber(formData, "quotedDeliveryFee", 0);
  const quotedTax = getNumber(formData, "quotedTax", 0);
  const quotedTotal = getNumber(formData, "quotedTotal", 0);
  const depositRequested = getNumber(formData, "depositRequested", 50);

  const nextFollowUpAt = getNullableDateTime(formData, "nextFollowUpAt");
  const notes = getNullableString(formData, "notes");

  const { error } = await supabase
    .from("booking_leads")
    .update({
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      instagram_username: instagramUsername,

      event_date: eventDate,
      event_start_time: eventStartTime,
      event_end_time: eventEndTime,

      event_address: eventAddress,
      event_city: eventCity,
      event_state: eventState,
      event_zip: eventZip,

      requested_product: requestedProduct,
      requested_category: requestedCategory,

      source,
      status,

      quoted_subtotal: quotedSubtotal,
      quoted_delivery_fee: quotedDeliveryFee,
      quoted_tax: quotedTax,
      quoted_total: quotedTotal,
      deposit_requested: depositRequested,

      next_follow_up_at: nextFollowUpAt,
      notes,

      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateLeads();
  revalidatePath(`/admin/crm/events/${leadId}`);
}

export async function updateLeadFollowUpAction(formData: FormData) {
  const supabase = await createClient();
  const leadId = getString(formData, "leadId");
  const nextFollowUpAt = getNullableDateTime(formData, "nextFollowUpAt");

  if (!leadId) throw new Error("Missing lead id.");

  const { error } = await supabase
    .from("booking_leads")
    .update({
      next_follow_up_at: nextFollowUpAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) throw new Error(error.message);

  revalidateLeads();
  revalidatePath(`/admin/crm/events/${leadId}`);
}

export async function quickUpdateLeadStatusAction(formData: FormData) {
  const supabase = await createClient();

  const leadId = getString(formData, "leadId");
  const status = getString(formData, "status");

  if (!leadId) {
    throw new Error("Missing lead id.");
  }

  if (
    ![
      "new",
      "quote_sent",
      "follow_up",
      "deposit_pending",
      "booked",
      "lost",
      "cancelled",
    ].includes(status)
  ) {
    throw new Error("Invalid lead status.");
  }

  const updateData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "quote_sent" || status === "follow_up") {
    updateData.last_contacted_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("booking_leads")
    .update(updateData)
    .eq("id", leadId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateLeads();
  revalidatePath(`/admin/crm/events/${leadId}`);
}

export async function deleteLeadAction(formData: FormData) {
  const supabase = await createClient();

  const leadId = getString(formData, "leadId");

  if (!leadId) {
    throw new Error("Missing lead id.");
  }

  const { error } = await supabase
    .from("booking_leads")
    .delete()
    .eq("id", leadId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateLeads();
}
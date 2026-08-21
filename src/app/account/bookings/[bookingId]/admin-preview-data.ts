import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";

import { requireAdminPreviewUser } from "@/lib/auth/require-admin-preview";
import type { BookingDetails } from "./booking-types";
import { normalizeBookingDetails } from "./booking-page-utils";

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export const getAdminBookingPreviewDetails = cache(async (bookingId: string): Promise<BookingDetails> => {
  const { supabase } = await requireAdminPreviewUser();

  const [bookingResult, itemsResult, modifiersResult, contractResult, paymentsResult, photosResult] = await Promise.all([
    supabase.from("bookings").select("*").eq("id", bookingId).maybeSingle(),
    supabase.from("booking_items").select("*, products(*), product_variants(*)").eq("booking_id", bookingId).order("created_at"),
    supabase.from("booking_modifiers").select("*, modifiers(*)").eq("booking_id", bookingId).order("created_at"),
    supabase.from("contracts").select("*").eq("booking_id", bookingId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("payments").select("*").eq("booking_id", bookingId).order("paid_at", { ascending: false }),
    supabase.from("booking_photos").select("*").eq("booking_id", bookingId).order("created_at", { ascending: false }),
  ]);

  if (bookingResult.error || !bookingResult.data) notFound();

  const rawItems = itemsResult.error ? [] : itemsResult.data ?? [];
  const productIds = rawItems.map((row: any) => String(first(row.products)?.id ?? row.product_id ?? "")).filter(Boolean);

  const [categoriesResult, componentsResult] = await Promise.all([
  productIds.length
    ? supabase
        .from("products")
        .select("id, category_id, categories(id, name, slug)")
        .in("id", productIds)
    : Promise.resolve({ data: [], error: null } as any),
  productIds.length
    ? supabase
        .from("product_inventory_components")
        .select("*, inventory_items(*)")
        .in("product_id", productIds)
        .order("sort_order")
    : Promise.resolve({ data: [], error: null } as any),
]);

const categoryByProduct = new Map<string, any>();

for (const row of categoriesResult.data ?? []) {
  categoryByProduct.set(
    String((row as any).id),
    first((row as any).categories),
  );
}

  const componentsByProduct = new Map<string, any[]>();
  for (const row of componentsResult.data ?? []) {
    const key = String((row as any).product_id);
    const list = componentsByProduct.get(key) ?? [];
    list.push(row);
    componentsByProduct.set(key, list);
  }

  const items = rawItems.map((row: any) => {
    const product = first<any>(row.products) ?? {};
    const variant = first<any>(row.product_variants);
    const category = categoryByProduct.get(String(product.id ?? row.product_id)) ?? {};
    return {
      id: String(row.id),
      product_id: String(product.id ?? row.product_id),
      product_name: String(product.name ?? "Equipment"),
      product_slug: String(product.slug ?? ""),
      product_description: product.description ?? null,
      product_short_description: product.short_description ?? null,
      product_image_url: product.image_url ?? null,
      product_gallery_urls: Array.isArray(product.gallery_urls) ? product.gallery_urls : [],
      category_id: category.id ?? product.category_id ?? null,
      category_name: category.name ?? null,
      category_slug: category.slug ?? null,
      variant_id: variant?.id ?? row.product_variant_id ?? null,
      variant_name: variant?.name ?? null,
      quantity: Number(row.quantity ?? 1),
      unit_price: row.unit_price ?? 0,
      subtotal: row.subtotal ?? 0,
      setup_width_ft: product.setup_width_ft ?? null,
      setup_length_ft: product.setup_length_ft ?? null,
      setup_height_ft: product.setup_height_ft ?? null,
      min_age: product.min_age ?? null,
      max_age: product.max_age ?? null,
      max_capacity: product.max_capacity ?? null,
      item_components: (componentsByProduct.get(String(product.id ?? row.product_id)) ?? []).map((component: any) => {
        const inventory = first<any>(component.inventory_items) ?? {};
        return {
          id: String(component.id),
          inventory_item_id: String(component.inventory_item_id),
          name: String(inventory.name ?? "Equipment component"),
          role: String(component.role ?? "component"),
          quantity: component.quantity ?? 1,
          is_required: component.required !== false,
          allow_substitution: component.allow_substitution === true,
          notes: component.notes ?? null,
        };
      }),
    };
  });

  const modifiers = (modifiersResult.error ? [] : modifiersResult.data ?? []).map((row: any) => {
    const modifier = first<any>(row.modifiers) ?? {};
    return {
      id: String(row.id),
      booking_item_id: row.booking_item_id ?? null,
      modifier_id: String(row.modifier_id ?? modifier.id ?? ""),
      modifier_name: row.modifier_name ?? modifier.name ?? null,
      modifier_description: row.modifier_description ?? modifier.description ?? null,
      group_id: row.modifier_group_id ?? null,
      group_name: row.group_name ?? null,
      group_description: row.group_description ?? null,
      option_id: row.modifier_group_option_id ?? null,
      option_name: row.option_name ?? null,
      option_description: row.option_description ?? null,
      image_url: row.image_url ?? modifier.image_url ?? null,
      quantity: Number(row.quantity ?? 1),
      unit_price: row.unit_price ?? 0,
      price_delta: row.price_delta ?? row.unit_price ?? 0,
      subtotal: row.subtotal ?? 0,
      notes: row.notes ?? null,
      modifier_group_id: row.modifier_group_id ?? null,
      modifier_group_option_id: row.modifier_group_option_id ?? null,
    };
  });

  const booking: any = bookingResult.data;
  const details = normalizeBookingDetails({
    booking: {
      ...booking,
      status: booking.status ?? "draft",
      event_date: booking.event_date,
      generator_required: booking.generator_required === true,
      coi_required: booking.coi_required === true,
      coi_status: booking.coi_status ?? "not_required",
      payment_status: booking.payment_status ?? "unpaid",
      contract_status: booking.contract_status ?? "not_sent",
      subtotal: booking.subtotal ?? 0,
      modifiers_total: booking.modifiers_total ?? 0,
      delivery_fee: booking.delivery_fee ?? 0,
      discount_amount: booking.discount_amount ?? 0,
      tax_rate: booking.tax_rate ?? 0,
      tax_amount: booking.tax_amount ?? 0,
      total_amount: booking.total_amount ?? 0,
      deposit_amount: booking.deposit_amount ?? 0,
      amount_paid: booking.amount_paid ?? 0,
      balance_due: booking.balance_due ?? 0,
      created_at: booking.created_at ?? "",
    },
    items,
    modifiers,
    contract: contractResult.error ? null : (contractResult.data as any),
    payments: paymentsResult.error ? [] : (paymentsResult.data as any[] ?? []),
    photos: photosResult.error ? [] : (photosResult.data as any[] ?? []).map((photo: any) => ({
      id: String(photo.id),
      photo_type: String(photo.photo_type ?? photo.type ?? "booking"),
      photo_url: String(photo.photo_url ?? photo.url ?? ""),
      caption: photo.caption ?? null,
      created_at: photo.created_at ?? "",
    })).filter((photo: any) => photo.photo_url),
  });

  return details;
});

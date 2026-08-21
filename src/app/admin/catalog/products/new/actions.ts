"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  if (!value) return fallback;

  const parsed = Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function parseGalleryUrls(value: string | null) {
  if (!value) return [];

  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeCategoryName(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveProductCategoryId(categoryId: string | null) {
  if (!categoryId) return null;

  const supabase = await createClient();

  const { data: existingCategory, error: existingCategoryError } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .maybeSingle();

  if (existingCategoryError) {
    throw new Error(existingCategoryError.message);
  }

  if (existingCategory) {
    return categoryId;
  }

  const { data: inventoryCategory, error: inventoryCategoryError } = await supabase
    .from("inventory_categories")
    .select("id, name")
    .eq("id", categoryId)
    .maybeSingle();

  if (inventoryCategoryError) {
    throw new Error(inventoryCategoryError.message);
  }

  if (!inventoryCategory) {
    return null;
  }

  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name");

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  const target = (categories || []).find(
    (category: any) =>
      normalizeCategoryName(category.name) ===
      normalizeCategoryName(inventoryCategory.name)
  );

  return target?.id || null;
}

async function getUniqueSlug(baseSlug: string) {
  const supabase = await createClient();

  let slug = baseSlug || `product-${Date.now()}`;
  let counter = 2;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return slug;
    }

    slug = `${baseSlug}-${counter}`;
    counter += 1;
  }
}

export async function createCatalogProductAction(formData: FormData) {
  const supabase = await createClient();

  const name = getString(formData, "name");
  const categoryId = getNullableString(formData, "categoryId");
  const inventoryItemId = getNullableString(formData, "inventoryItemId");
  const shortDescription = getNullableString(formData, "shortDescription");
  const fullDescription = getNullableString(formData, "fullDescription");
  const publicTitle = getNullableString(formData, "publicTitle");
  const galleryUrls = parseGalleryUrls(getNullableString(formData, "galleryUrls"));
  const whatIncluded = getNullableString(formData, "whatIncluded");
  const whatNotIncluded = getNullableString(formData, "whatNotIncluded");
  const setupSurface = getNullableString(formData, "setupSurface");
  const powerRequirements = getNullableString(formData, "powerRequirements");
  const safetyRules = getNullableString(formData, "safetyRules");
  const seoTitle = getNullableString(formData, "seoTitle");
  const seoDescription = getNullableString(formData, "seoDescription");
  const indoorAllowed = getBoolean(formData, "indoorAllowed");
  const outdoorAllowed = getBoolean(formData, "outdoorAllowed");
  const waterUse = getBoolean(formData, "waterUse");
  const basePrice = getNumber(formData, "basePrice", 0);
  const depositAmount = getNumber(formData, "depositAmount", 50);
  const setupWidthFt = getNumber(formData, "setupWidthFt", 0);
  const setupLengthFt = getNumber(formData, "setupLengthFt", 0);
  const setupHeightFt = getNumber(formData, "setupHeightFt", 0);
  const minAge = getNumber(formData, "minAge", 0);
  const maxAge = getNumber(formData, "maxAge", 0);
  const maxCapacity = getNumber(formData, "maxCapacity", 0);
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const active = getBoolean(formData, "active");

  const rentalDurationMin = getNumber(formData, "rentalDurationMin", 1440);
  const setupDurationMin = getNumber(formData, "setupDurationMin", 60);
  const teardownDurationMin = getNumber(formData, "teardownDurationMin", 60);
  const bufferBeforeMin = getNumber(formData, "bufferBeforeMin", 0);
  const bufferAfterMin = getNumber(formData, "bufferAfterMin", 0);

  if (!name) {
    throw new Error("Product name is required.");
  }

  const resolvedCategoryId = await resolveProductCategoryId(categoryId);

  const slug = await getUniqueSlug(makeSlug(name));

  const payload = {
    name,
    slug,
    category_id: resolvedCategoryId,
    inventory_item_id: inventoryItemId,
    public_title: publicTitle,
    short_description: shortDescription,
    description: fullDescription,
    gallery_urls: galleryUrls,
    what_included: whatIncluded,
    what_not_included: whatNotIncluded,
    setup_surface: setupSurface,
    power_requirements: powerRequirements,
    safety_rules: safetyRules,
    seo_title: seoTitle,
    seo_description: seoDescription,
    indoor_allowed: indoorAllowed,
    outdoor_allowed: outdoorAllowed,
    water_use: waterUse,
    base_price: basePrice,
    deposit_amount: depositAmount,
    setup_width_ft: setupWidthFt > 0 ? setupWidthFt : null,
    setup_length_ft: setupLengthFt > 0 ? setupLengthFt : null,
    setup_height_ft: setupHeightFt > 0 ? setupHeightFt : null,
    min_age: minAge > 0 ? Math.round(minAge) : null,
    max_age: maxAge > 0 ? Math.round(maxAge) : null,
    max_capacity: maxCapacity > 0 ? Math.round(maxCapacity) : null,
    rental_duration_min: rentalDurationMin,
    setup_duration_min: setupDurationMin,
    teardown_duration_min: teardownDurationMin,
    buffer_before_min: bufferBeforeMin,
    buffer_after_min: bufferAfterMin,
    sort_order: sortOrder,
    active,
    updated_at: new Date().toISOString(),
  };

  const { data: createdProduct, error } = await supabase
    .from("products")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/catalog");
  revalidatePath("/admin/catalog/products");
  revalidatePath(`/admin/catalog/products/${createdProduct.id}`);

  redirect(`/admin/catalog/products/${createdProduct.id}`);
}
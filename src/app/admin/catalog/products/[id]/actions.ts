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

  if (!value) {
    return fallback;
  }

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

function isMissingColumnError(error: any, tableName: string, columnName: string) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  if (code === "42703") {
    return true;
  }

  return (
    message.includes("column") &&
    message.includes(String(columnName).toLowerCase()) &&
    message.includes(String(tableName).toLowerCase())
  );
}

function cleanFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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

async function getUniqueProductSlug(baseSlug: string) {
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

function revalidateProduct(productId: string) {
  revalidatePath("/admin/catalog");
  revalidatePath("/admin/catalog/inventory-links");
  revalidatePath(`/admin/catalog/products/${productId}`);
  revalidatePath("/admin/bookings/new");
}

export async function updateCatalogProductAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
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
  const adminNotes = getNullableString(formData, "adminNotes");
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

  if (!productId) {
    throw new Error("Missing product id.");
  }

  if (!name) {
    throw new Error("Product name is required.");
  }

  const resolvedCategoryId = await resolveProductCategoryId(categoryId);

  const { error } = await supabase
    .from("products")
    .update({
      name,
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
      admin_notes: adminNotes,
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
    })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateProduct(productId);
}

export async function cloneCatalogProductAction(formData: FormData) {
  const supabase = await createClient();

  const sourceProductId = getString(formData, "productId");

  if (!sourceProductId) {
    throw new Error("Missing product id.");
  }

  const { data: sourceProduct, error: sourceProductError } = await supabase
    .from("products")
    .select("*")
    .eq("id", sourceProductId)
    .maybeSingle();

  if (sourceProductError) {
    throw new Error(sourceProductError.message);
  }

  if (!sourceProduct) {
    throw new Error("Product not found.");
  }

  const cloneName = `${sourceProduct.name} (Copy)`;
  const cloneSlug = await getUniqueProductSlug(makeSlug(cloneName));

  const { data: clonedProduct, error: clonedProductError } = await supabase
    .from("products")
    .insert({
      name: cloneName,
      slug: cloneSlug,
      category_id: sourceProduct.category_id,
      inventory_item_id: sourceProduct.inventory_item_id,
      short_description: sourceProduct.short_description || null,
      description: sourceProduct.description || null,
      admin_notes: sourceProduct.admin_notes || null,
      base_price: Number(sourceProduct.base_price || 0),
      rental_duration_min: Number(sourceProduct.rental_duration_min || 1440),
      setup_duration_min: Number(sourceProduct.setup_duration_min || 60),
      teardown_duration_min: Number(sourceProduct.teardown_duration_min || 60),
      buffer_before_min: Number(sourceProduct.buffer_before_min || 0),
      buffer_after_min: Number(sourceProduct.buffer_after_min || 0),
      sort_order: Number(sourceProduct.sort_order || 100) + 1,
      active: sourceProduct.active !== false,
      image_url: sourceProduct.image_url || null,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (clonedProductError) {
    throw new Error(clonedProductError.message);
  }

  const { data: sourceComponents, error: sourceComponentsError } = await supabase
    .from("product_inventory_components")
    .select("inventory_item_id, quantity, required, inventory_behavior, sort_order, notes")
    .eq("product_id", sourceProductId)
    .order("sort_order", { ascending: true });

  if (sourceComponentsError) {
    throw new Error(sourceComponentsError.message);
  }

  if ((sourceComponents || []).length > 0) {
    const { error: componentsInsertError } = await supabase
      .from("product_inventory_components")
      .insert(
        (sourceComponents || []).map((component: any) => ({
          product_id: clonedProduct.id,
          inventory_item_id: component.inventory_item_id,
          quantity: Number(component.quantity || 1),
          required: component.required !== false,
          inventory_behavior: component.inventory_behavior === "consumable" ? "consumable" : "reusable",
          sort_order: Number(component.sort_order || 100),
          notes: component.notes || null,
          updated_at: new Date().toISOString(),
        }))
      );

    if (componentsInsertError) {
      throw new Error(componentsInsertError.message);
    }
  }

  const { data: sourceOptionGroups, error: sourceOptionGroupsError } = await supabase
    .from("product_modifier_groups")
    .select("modifier_group_id, sort_order, required, active")
    .eq("product_id", sourceProductId)
    .order("sort_order", { ascending: true });

  if (sourceOptionGroupsError) {
    throw new Error(sourceOptionGroupsError.message);
  }

  if ((sourceOptionGroups || []).length > 0) {
    const { error: optionGroupsInsertError } = await supabase
      .from("product_modifier_groups")
      .insert(
        (sourceOptionGroups || []).map((group: any) => ({
          product_id: clonedProduct.id,
          modifier_group_id: group.modifier_group_id,
          sort_order: Number(group.sort_order || 100),
          required: group.required !== false,
          active: group.active !== false,
          updated_at: new Date().toISOString(),
        }))
      );

    if (optionGroupsInsertError) {
      throw new Error(optionGroupsInsertError.message);
    }
  }

  revalidatePath("/admin/catalog");
  revalidatePath(`/admin/catalog/products/${sourceProductId}`);
  revalidatePath(`/admin/catalog/products/${clonedProduct.id}`);
  revalidatePath("/admin/catalog/inventory-links");
  revalidatePath("/admin/bookings/new");

  redirect(`/admin/catalog/products/${clonedProduct.id}`);
}

export async function uploadCatalogProductPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const file = formData.get("photo");

  if (!productId) {
    throw new Error("Missing product id.");
  }

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose image file.");
  }

  const fileExt = file.name.split(".").pop() || "jpg";

  const fileName = `${Date.now()}-${cleanFileName(
    file.name || `photo.${fileExt}`
  )}`;

  const filePath = `products/${productId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("catalog-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage
    .from("catalog-images")
    .getPublicUrl(filePath);

  const { error: updateError } = await supabase
    .from("products")
    .update({
      image_url: data.publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidateProduct(productId);
}

export async function removeCatalogProductPhotoAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");

  if (!productId) {
    throw new Error("Missing product id.");
  }

  const { error } = await supabase
    .from("products")
    .update({
      image_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateProduct(productId);
}

export async function addProductInventoryComponentAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const inventoryItemId = getString(formData, "inventoryItemId");
  const quantity = getNumber(formData, "quantity", 1);
  const required = getBoolean(formData, "required");
  const notes = getNullableString(formData, "notes");

  if (!productId) {
    throw new Error("Missing product id.");
  }

  if (!inventoryItemId) {
    return;
  }

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
  }

  const { data: existingComponent, error: existingError } = await supabase
    .from("product_inventory_components")
    .select("id, sort_order")
    .eq("product_id", productId)
    .eq("inventory_item_id", inventoryItemId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingComponent) {
    let { error: updateError } = await supabase
      .from("product_inventory_components")
      .update({
        quantity,
        quantity_required: quantity,
        required,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingComponent.id)
      .eq("product_id", productId);

    if (
      updateError &&
      isMissingColumnError(updateError, "product_inventory_components", "quantity_required")
    ) {
      const fallbackResult = await supabase
        .from("product_inventory_components")
        .update({
          quantity,
          required,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingComponent.id)
        .eq("product_id", productId);

      updateError = fallbackResult.error;
    }

    if (
      updateError &&
      isMissingColumnError(updateError, "product_inventory_components", "quantity")
    ) {
      const fallbackResult = await supabase
        .from("product_inventory_components")
        .update({
          quantity_required: quantity,
          required,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingComponent.id)
        .eq("product_id", productId);

      updateError = fallbackResult.error;
    }

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidateProduct(productId);
    return;
  }

  const { data: lastComponent, error: lastComponentError } = await supabase
    .from("product_inventory_components")
    .select("sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastComponentError) {
    throw new Error(lastComponentError.message);
  }

  const sortOrder = Number(lastComponent?.sort_order || 0) + 10;

  let { error } = await supabase.from("product_inventory_components").insert({
    product_id: productId,
    inventory_item_id: inventoryItemId,
    quantity,
    quantity_required: quantity,
    required,
    sort_order: sortOrder,
    notes,
    updated_at: new Date().toISOString(),
  });

  if (
    error &&
    isMissingColumnError(error, "product_inventory_components", "quantity_required")
  ) {
    const fallbackResult = await supabase.from("product_inventory_components").insert({
      product_id: productId,
      inventory_item_id: inventoryItemId,
      quantity,
      required,
      sort_order: sortOrder,
      notes,
      updated_at: new Date().toISOString(),
    });

    error = fallbackResult.error;
  }

  if (
    error &&
    isMissingColumnError(error, "product_inventory_components", "quantity")
  ) {
    const fallbackResult = await supabase.from("product_inventory_components").insert({
      product_id: productId,
      inventory_item_id: inventoryItemId,
      quantity_required: quantity,
      required,
      sort_order: sortOrder,
      notes,
      updated_at: new Date().toISOString(),
    });

    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  revalidateProduct(productId);
}

export async function updateProductInventoryComponentAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const componentId = getString(formData, "componentId");
  const inventoryItemId = getString(formData, "inventoryItemId");
  const quantity = getNumber(formData, "quantity", 1);
  const required = getBoolean(formData, "required");
  const notes = getNullableString(formData, "notes");

  if (!productId) {
    throw new Error("Missing product id.");
  }

  if (!componentId) {
    throw new Error("Missing component id.");
  }

  if (!inventoryItemId) {
    throw new Error("Choose inventory item.");
  }

  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0.");
  }

  let { error } = await supabase
    .from("product_inventory_components")
    .update({
      inventory_item_id: inventoryItemId,
      quantity,
      quantity_required: quantity,
      required,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", componentId)
    .eq("product_id", productId);

  if (
    error &&
    isMissingColumnError(error, "product_inventory_components", "quantity_required")
  ) {
    const fallbackResult = await supabase
      .from("product_inventory_components")
      .update({
        inventory_item_id: inventoryItemId,
        quantity,
        required,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", componentId)
      .eq("product_id", productId);

    error = fallbackResult.error;
  }

  if (
    error &&
    isMissingColumnError(error, "product_inventory_components", "quantity")
  ) {
    const fallbackResult = await supabase
      .from("product_inventory_components")
      .update({
        inventory_item_id: inventoryItemId,
        quantity_required: quantity,
        required,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", componentId)
      .eq("product_id", productId);

    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  revalidateProduct(productId);
}

export async function deleteProductInventoryComponentAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const componentId = getString(formData, "componentId");

  if (!productId) {
    throw new Error("Missing product id.");
  }

  if (!componentId) {
    throw new Error("Missing component id.");
  }

  const { error } = await supabase
    .from("product_inventory_components")
    .delete()
    .eq("id", componentId)
    .eq("product_id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateProduct(productId);
}
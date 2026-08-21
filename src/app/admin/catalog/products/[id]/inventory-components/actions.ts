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
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function getInventoryBehavior(formData: FormData) {
  return getString(formData, "inventoryBehavior") === "consumable"
    ? "consumable"
    : "reusable";
}

function revalidateProductComponents(productId: string) {
  revalidatePath(`/admin/catalog/products/${productId}`);
  revalidatePath(`/admin/catalog/products/${productId}/inventory-components`);
  revalidatePath("/admin/catalog");
}

export async function addProductInventoryComponentAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const inventoryItemId = getString(formData, "inventoryItemId");

  const componentName = getNullableString(formData, "componentName");
  const componentRole = getString(formData, "componentRole") || "required";
  const quantityRequired = getNumber(formData, "quantityRequired", 1);

  const isRequired = getBoolean(formData, "isRequired");
  const allowSubstitution = getBoolean(formData, "allowSubstitution");

  const sortOrder = getNumber(formData, "sortOrder", 100);
  const notes = getNullableString(formData, "notes");
  const inventoryBehavior = getInventoryBehavior(formData);

  if (!productId) {
    throw new Error("Missing product id.");
  }

  if (!inventoryItemId) {
    throw new Error("Choose inventory item.");
  }

  if (quantityRequired <= 0) {
    throw new Error("Quantity required must be greater than zero.");
  }

  let { error } = await supabase
    .from("product_inventory_components")
    .insert({
      product_id: productId,
      inventory_item_id: inventoryItemId,
      component_name: componentName,
      component_role: componentRole,
      quantity_required: quantityRequired,
      is_required: isRequired,
      allow_substitution: allowSubstitution,
      inventory_behavior: inventoryBehavior,
      sort_order: sortOrder,
      notes,
      active: true,
    });

  if (error && String(error.message || "").toLowerCase().includes("inventory_behavior")) {
    const fallbackResult = await supabase
      .from("product_inventory_components")
      .insert({
        product_id: productId,
        inventory_item_id: inventoryItemId,
        component_name: componentName,
        component_role: componentRole,
        quantity_required: quantityRequired,
        is_required: isRequired,
        allow_substitution: allowSubstitution,
        sort_order: sortOrder,
        notes,
        active: true,
      });

    error = fallbackResult.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  revalidateProductComponents(productId);
}

export async function updateProductInventoryComponentAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const componentId = getString(formData, "componentId");

  const componentName = getNullableString(formData, "componentName");
  const componentRole = getString(formData, "componentRole") || "required";
  const quantityRequired = getNumber(formData, "quantityRequired", 1);

  const isRequired = getBoolean(formData, "isRequired");
  const allowSubstitution = getBoolean(formData, "allowSubstitution");

  const sortOrder = getNumber(formData, "sortOrder", 100);
  const notes = getNullableString(formData, "notes");
  const inventoryBehavior = getInventoryBehavior(formData);

  if (!productId || !componentId) {
    throw new Error("Missing component data.");
  }

  if (quantityRequired <= 0) {
    throw new Error("Quantity required must be greater than zero.");
  }

  let { error } = await supabase
    .from("product_inventory_components")
    .update({
      component_name: componentName,
      component_role: componentRole,
      quantity_required: quantityRequired,
      is_required: isRequired,
      allow_substitution: allowSubstitution,
      inventory_behavior: inventoryBehavior,
      sort_order: sortOrder,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", componentId)
    .eq("product_id", productId);

  if (error && String(error.message || "").toLowerCase().includes("inventory_behavior")) {
    const fallbackResult = await supabase
      .from("product_inventory_components")
      .update({
        component_name: componentName,
        component_role: componentRole,
        quantity_required: quantityRequired,
        is_required: isRequired,
        allow_substitution: allowSubstitution,
        sort_order: sortOrder,
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

  revalidateProductComponents(productId);
}

export async function toggleProductInventoryComponentAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const componentId = getString(formData, "componentId");
  const active = getBoolean(formData, "active");

  if (!productId || !componentId) {
    throw new Error("Missing component data.");
  }

  const { error } = await supabase
    .from("product_inventory_components")
    .update({
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", componentId)
    .eq("product_id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateProductComponents(productId);
}
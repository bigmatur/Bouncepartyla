"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNullableUuid(formData: FormData, key: string) {
  const value = getString(formData, key);
  return value.length > 0 ? value : null;
}

export async function updateProductInventoryLinkAction(formData: FormData) {
  const supabase = await createClient();

  const productId = getString(formData, "productId");
  const inventoryItemId = getNullableUuid(formData, "inventoryItemId");

  if (!productId) {
    throw new Error("Missing product id.");
  }

  const { error } = await supabase
    .from("products")
    .update({
      inventory_item_id: inventoryItemId,
    })
    .eq("id", productId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/catalog");
  revalidatePath("/admin/catalog/inventory-links");
}
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

  const parsed = Number(value.replace(",", "."));
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function buildUniqueCategorySlug(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  baseSlug: string;
  excludeCategoryId?: string;
}) {
  const fallbackBase = params.baseSlug || `category-${Date.now()}`;

  const { data, error } = await params.supabase
    .from("inventory_categories")
    .select("id, slug")
    .ilike("slug", `${fallbackBase}%`)
    .limit(500);

  if (error) {
    throw new Error(error.message);
  }

  const usedSlugs = new Set(
    (data || [])
      .filter((row: any) => {
        if (!params.excludeCategoryId) return true;
        return String(row.id) !== params.excludeCategoryId;
      })
      .map((row: any) => String(row.slug || ""))
  );

  if (!usedSlugs.has(fallbackBase)) {
    return fallbackBase;
  }

  const suffixPattern = new RegExp(`^${escapeForRegex(fallbackBase)}-(\\d+)$`);
  let maxSuffix = 1;

  for (const slug of usedSlugs) {
    const match = suffixPattern.exec(slug);

    if (match) {
      const suffix = Number(match[1]);
      if (Number.isFinite(suffix)) {
        maxSuffix = Math.max(maxSuffix, suffix);
      }
    }
  }

  return `${fallbackBase}-${maxSuffix + 1}`;
}

function revalidateInventoryCategories() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/inventory/categories");
  revalidatePath("/admin/inventory/receive");
  revalidatePath("/admin/inventory/locations");
}

export async function createInventoryCategoryAction(formData: FormData) {
  const supabase = await createClient();

  const name = getString(formData, "name");
  const parentId = getNullableString(formData, "parentId");
  const description = getNullableString(formData, "description");
  const sortOrder = getNumber(formData, "sortOrder", 100);

  if (!name) {
    throw new Error("Category name is required.");
  }

  const baseSlug = createSlug(name);
  let slug = await buildUniqueCategorySlug({
    supabase,
    baseSlug,
  });

  let { error } = await supabase.from("inventory_categories").insert({
    name,
    slug,
    parent_id: parentId,
    description,
    sort_order: sortOrder,
    active: true,
  });

  if (error?.code === "23505") {
    slug = `${baseSlug || "category"}-${Date.now()}`;

    const retry = await supabase.from("inventory_categories").insert({
      name,
      slug,
      parent_id: parentId,
      description,
      sort_order: sortOrder,
      active: true,
    });

    error = retry.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryCategories();
}

export async function updateInventoryCategoryAction(formData: FormData) {
  const supabase = await createClient();

  const categoryId = getString(formData, "categoryId");
  const name = getString(formData, "name");
  const parentId = getNullableString(formData, "parentId");
  const description = getNullableString(formData, "description");
  const sortOrder = getNumber(formData, "sortOrder", 100);
  const active = getBoolean(formData, "active");

  if (!categoryId) {
    throw new Error("Missing category id.");
  }

  if (!name) {
    throw new Error("Category name is required.");
  }

  if (parentId === categoryId) {
    throw new Error("Category cannot be parent of itself.");
  }

  const baseSlug = createSlug(name);
  let slug = await buildUniqueCategorySlug({
    supabase,
    baseSlug,
    excludeCategoryId: categoryId,
  });

  let { error } = await supabase
    .from("inventory_categories")
    .update({
      name,
      slug,
      parent_id: parentId,
      description,
      sort_order: sortOrder,
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId);

  if (error?.code === "23505") {
    slug = `${baseSlug || "category"}-${Date.now()}`;

    const retry = await supabase
      .from("inventory_categories")
      .update({
        name,
        slug,
        parent_id: parentId,
        description,
        sort_order: sortOrder,
        active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", categoryId);

    error = retry.error;
  }

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryCategories();
}

export async function toggleInventoryCategoryAction(formData: FormData) {
  const supabase = await createClient();

  const categoryId = getString(formData, "categoryId");
  const active = getBoolean(formData, "active");

  if (!categoryId) {
    throw new Error("Missing category id.");
  }

  const { error } = await supabase
    .from("inventory_categories")
    .update({
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryCategories();
}

export async function deleteInventoryCategoryAction(formData: FormData) {
  const supabase = await createClient();

  const categoryId = getString(formData, "categoryId");

  if (!categoryId) {
    throw new Error("Missing category id.");
  }

  const { count: childrenCount, error: childrenError } = await supabase
    .from("inventory_categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", categoryId);

  if (childrenError) {
    throw new Error(childrenError.message);
  }

  if ((childrenCount || 0) > 0) {
    throw new Error(
      "Cannot delete this category because it has child categories. Move or delete child categories first."
    );
  }

  const { count: itemsCount, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", categoryId);

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  if ((itemsCount || 0) > 0) {
    throw new Error(
      "Cannot delete this category because inventory items are assigned to it. Move items to another category first."
    );
  }

  const { error } = await supabase
    .from("inventory_categories")
    .delete()
    .eq("id", categoryId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateInventoryCategories();
}
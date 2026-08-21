"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(formData: FormData, key: string, fallback = 0) {
  const value = getString(formData, key);

  if (!value) {
    return fallback;
  }

  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
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

async function getUniqueModifierGroupSlug(baseSlug: string) {
  const supabase = await createClient();

  const safeBaseSlug = baseSlug || `modifier-group-${Date.now()}`;
  let slug = safeBaseSlug;
  let counter = 2;

  while (true) {
    const { data, error } = await supabase
      .from("modifier_groups")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return slug;
    }

    slug = `${safeBaseSlug}-${counter}`;
    counter += 1;
  }
}

export async function createModifierGroupAction(formData: FormData) {
  const supabase = await createClient();

  const name = getString(formData, "name");
  const selectionType = getString(formData, "selectionType") || "single";
  const sortOrder = Math.max(
    0,
    Math.floor(getNumber(formData, "sortOrder", 100))
  );

  if (!name) {
    throw new Error("Group name is required.");
  }

  if (!["single", "multiple", "quantity"].includes(selectionType)) {
    throw new Error("Unsupported selection type.");
  }

  const slug = await getUniqueModifierGroupSlug(makeSlug(name));

  const now = new Date().toISOString();

  const { data: createdGroup, error } = await supabase
    .from("modifier_groups")
    .insert({
      name,
      slug,
      selection_type: selectionType,
      active: true,
      sort_order: sortOrder,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Could not create modifier group: ${error.message}`);
  }

  revalidatePath("/admin/catalog");
  revalidatePath("/admin/catalog/modifier-groups");
  revalidatePath("/admin/bookings/new");

  redirect(`/admin/catalog/modifier-groups/${createdGroup.id}`);
}

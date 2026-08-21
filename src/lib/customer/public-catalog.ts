import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

export type PublicCatalogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
};

export type PublicCatalogProduct = {
  id: string;
  name: string;
  slug: string;
  public_slug: string;
  public_title: string | null;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  base_price: number | null;
  deposit_amount: number | null;
  category_id: string | null;
  sort_order: number;
  setup_width_ft?: number | null;
  setup_length_ft?: number | null;
  setup_height_ft?: number | null;
  min_age?: number | null;
  max_age?: number | null;
  max_capacity?: number | null;
  setup_surface?: string | null;
  power_requirements?: string | null;
  indoor_allowed?: boolean | null;
  outdoor_allowed?: boolean | null;
  water_use?: boolean | null;
  gallery_urls?: string[] | null;
};

function outwardSlug(row: {
  public_slug?: unknown;
  slug?: unknown;
}) {
  return String(
    row.public_slug ||
      row.slug ||
      "",
  ).trim();
}

export async function getPublicCatalogCategories(): Promise<
  PublicCatalogCategory[]
> {
  const supabase =
    createServiceClient();

  const result = await supabase
    .from("categories")
    .select(
      "id, name, slug, description, sort_order, active",
    )
    .eq("active", true)
    .not("slug", "is", null)
    .order("sort_order", {
      ascending: true,
    })
    .order("name", {
      ascending: true,
    });

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  return (result.data || [])
    .map((row: any) => ({
      id: String(row.id),
      name: String(
        row.name || "Category",
      ),
      slug: String(
        row.slug || "",
      ).trim(),
      description:
        row.description
          ? String(row.description)
          : null,
      sort_order: Number(
        row.sort_order || 0,
      ),
    }))
    .filter((row) => row.slug);
}

export async function getPublicCatalogProducts(params?: {
  categoryId?: string | null;
}): Promise<PublicCatalogProduct[]> {
  const supabase =
    createServiceClient();

  let query = supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      public_slug,
      public_title,
      short_description,
      description,
      image_url,
      base_price,
      deposit_amount,
      category_id,
      sort_order,
      active
    `)
    .eq("active", true)
    .order("sort_order", {
      ascending: true,
    })
    .order("name", {
      ascending: true,
    })
    .limit(300);

  if (params?.categoryId) {
    query = query.eq(
      "category_id",
      params.categoryId,
    );
  }

  const result =
    await query;

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  return (result.data || [])
    .map((row: any) => ({
      id: String(row.id),
      name: String(
        row.name || "Product",
      ),
      slug: String(
        row.slug || "",
      ).trim(),
      public_slug:
        outwardSlug(row),
      public_title:
        row.public_title
          ? String(row.public_title)
          : null,
      short_description:
        row.short_description
          ? String(
              row.short_description,
            )
          : null,
      description:
        row.description
          ? String(row.description)
          : null,
      image_url:
        row.image_url
          ? String(row.image_url)
          : null,
      base_price:
        row.base_price == null
          ? null
          : Number(row.base_price),
      deposit_amount:
        row.deposit_amount == null
          ? null
          : Number(
              row.deposit_amount,
            ),
      category_id:
        row.category_id
          ? String(row.category_id)
          : null,
      sort_order: Number(
        row.sort_order || 0,
      ),
    }))
    .filter(
      (row) => row.public_slug,
    );
}

export async function getPublicCategoryBySlug(
  slug: string,
): Promise<PublicCatalogCategory | null> {
  const safeSlug =
    String(slug || "").trim();

  if (!safeSlug) {
    return null;
  }

  const supabase =
    createServiceClient();

  const result = await supabase
    .from("categories")
    .select(
      "id, name, slug, description, sort_order, active",
    )
    .eq("slug", safeSlug)
    .eq("active", true)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  if (!result.data) {
    return null;
  }

  return {
    id: String(result.data.id),
    name: String(
      result.data.name ||
        "Category",
    ),
    slug: String(
      result.data.slug || "",
    ),
    description:
      result.data.description
        ? String(
            result.data.description,
          )
        : null,
    sort_order: Number(
      result.data.sort_order ||
        0,
    ),
  };
}

export async function getPublicProductBySlug(
  slug: string,
): Promise<PublicCatalogProduct | null> {
  const safeSlug =
    String(slug || "").trim();

  if (!safeSlug) {
    return null;
  }

  const supabase =
    createServiceClient();

  const selectClause = `
    id,
    name,
    slug,
    public_slug,
    public_title,
    short_description,
    description,
    image_url,
    base_price,
    deposit_amount,
    category_id,
    sort_order,
    setup_width_ft,
    setup_length_ft,
    setup_height_ft,
    min_age,
    max_age,
    max_capacity,
    setup_surface,
    power_requirements,
    indoor_allowed,
    outdoor_allowed,
    water_use,
    gallery_urls,
    active
  `;

  let result = await supabase
    .from("products")
    .select(selectClause)
    .eq("public_slug", safeSlug)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      result.error.message,
    );
  }

  if (!result.data) {
    result = await supabase
      .from("products")
      .select(selectClause)
      .eq("slug", safeSlug)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (result.error) {
      throw new Error(
        result.error.message,
      );
    }
  }

  if (!result.data) {
    return null;
  }

  const row: any =
    result.data;

  return {
    id: String(row.id),
    name: String(
      row.name || "Product",
    ),
    slug: String(
      row.slug || "",
    ),
    public_slug:
      outwardSlug(row),
    public_title:
      row.public_title
        ? String(row.public_title)
        : null,
    short_description:
      row.short_description
        ? String(
            row.short_description,
          )
        : null,
    description:
      row.description
        ? String(row.description)
        : null,
    image_url:
      row.image_url
        ? String(row.image_url)
        : null,
    base_price:
      row.base_price == null
        ? null
        : Number(row.base_price),
    deposit_amount:
      row.deposit_amount == null
        ? null
        : Number(
            row.deposit_amount,
          ),
    category_id:
      row.category_id
        ? String(row.category_id)
        : null,
    sort_order: Number(
      row.sort_order || 0,
    ),
    setup_width_ft:
      row.setup_width_ft == null
        ? null
        : Number(
            row.setup_width_ft,
          ),
    setup_length_ft:
      row.setup_length_ft == null
        ? null
        : Number(
            row.setup_length_ft,
          ),
    setup_height_ft:
      row.setup_height_ft == null
        ? null
        : Number(
            row.setup_height_ft,
          ),
    min_age:
      row.min_age == null
        ? null
        : Number(row.min_age),
    max_age:
      row.max_age == null
        ? null
        : Number(row.max_age),
    max_capacity:
      row.max_capacity == null
        ? null
        : Number(
            row.max_capacity,
          ),
    setup_surface:
      row.setup_surface
        ? String(row.setup_surface)
        : null,
    power_requirements:
      row.power_requirements
        ? String(
            row.power_requirements,
          )
        : null,
    indoor_allowed:
      row.indoor_allowed == null
        ? null
        : Boolean(
            row.indoor_allowed,
          ),
    outdoor_allowed:
      row.outdoor_allowed == null
        ? null
        : Boolean(
            row.outdoor_allowed,
          ),
    water_use:
      row.water_use == null
        ? null
        : Boolean(row.water_use),
    gallery_urls:
      Array.isArray(
        row.gallery_urls,
      )
        ? row.gallery_urls
            .map(String)
            .filter(Boolean)
        : [],
  };
}
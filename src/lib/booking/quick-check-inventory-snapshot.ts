import type { SupabaseClient } from "@supabase/supabase-js";

import { getAdminInventorySnapshotCore } from "@/lib/booking/booking-availability-core";

const SNAPSHOT_BATCH_SIZE = 120;
const SNAPSHOT_MAX_CONCURRENCY = 3;

type ProductRow = {
  id: string;
  name: string;
  image_url: string | null;
  category_id: string | null;
  active: boolean;
  sort_order: number | null;
};

type CategoryRow = {
  id: string;
  name: string;
  active?: boolean | null;
  sort_order?: number | null;
};

export type QuickCheckSnapshotCategory = {
  id: string;
  name: string;
  count: number;
};

export type QuickCheckSnapshotItem = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string;
  available: boolean;
  remainingQuantity: number;
  message: string | null;
  checkFailed: boolean;
};

export type QuickCheckSnapshotResult = {
  ok: boolean;
  message: string | null;
  selectedDate: string;
  eventStartTime: string;
  eventEndTime: string;
  bookingActor: "cashier" | "customer";
  categories: QuickCheckSnapshotCategory[];
  items: QuickCheckSnapshotItem[];
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isValidTimeString(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function chunkArray<T>(values: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }

  return chunks;
}

async function fetchPaged<T>(
  pageLoader: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1000
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const result = await pageLoader(from, to);

    if (result.error) {
      throw new Error(result.error.message || "Quick Check query failed.");
    }

    const chunk = result.data || [];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function runBatchedSnapshotChecks(params: {
  supabase: SupabaseClient;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  bookingActor: "cashier" | "customer";
  productIds: string[];
}) {
  const chunks = chunkArray(params.productIds, SNAPSHOT_BATCH_SIZE);
  const snapshotByProductId = new Map<
    string,
    {
      available: boolean;
      remainingQuantity: number;
      message: string | null;
      checkFailed: boolean;
    }
  >();

  let nextChunkIndex = 0;

  async function processChunk(chunkIds: string[]) {
    const formData = new FormData();
    formData.set("eventDate", params.eventDate);
    formData.set("eventStartTime", params.eventStartTime);
    formData.set("eventEndTime", params.eventEndTime);
    formData.set("bookingActor", params.bookingActor);
    formData.set("productIds", JSON.stringify(chunkIds));

    try {
      const result = await getAdminInventorySnapshotCore(params.supabase, formData);

      if (!result?.ok) {
        const message = String(result?.message || "Stock snapshot request failed.");

        for (const productId of chunkIds) {
          snapshotByProductId.set(productId, {
            available: false,
            remainingQuantity: 0,
            message,
            checkFailed: true,
          });
        }

        return;
      }

      for (const row of result.items || []) {
        const productId = String(row?.productId || "").trim();

        if (!productId) {
          continue;
        }

        snapshotByProductId.set(productId, {
          available: Boolean(row.available),
          remainingQuantity: Math.max(0, Math.floor(toNumber(row.remainingQuantity, 0))),
          message: row.message || null,
          checkFailed: false,
        });
      }

      for (const productId of chunkIds) {
        if (!snapshotByProductId.has(productId)) {
          snapshotByProductId.set(productId, {
            available: false,
            remainingQuantity: 0,
            message: "Stock snapshot did not return this product.",
            checkFailed: true,
          });
        }
      }
    } catch (error: any) {
      const message = String(error?.message || "Stock snapshot request failed.");

      for (const productId of chunkIds) {
        snapshotByProductId.set(productId, {
          available: false,
          remainingQuantity: 0,
          message,
          checkFailed: true,
        });
      }
    }
  }

  const workerCount = Math.max(1, Math.min(SNAPSHOT_MAX_CONCURRENCY, chunks.length));

  await Promise.all(
    Array.from({ length: workerCount }).map(async () => {
      while (nextChunkIndex < chunks.length) {
        const currentIndex = nextChunkIndex;
        nextChunkIndex += 1;
        const chunkIds = chunks[currentIndex];

        await processChunk(chunkIds);
      }
    })
  );

  return snapshotByProductId;
}

export async function getQuickCheckInventorySnapshot(params: {
  supabase: SupabaseClient;
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  bookingActor?: "cashier" | "customer";
}) {
  const eventDate = String(params.eventDate || "").trim();
  const eventStartTime = String(params.eventStartTime || "").trim();
  const eventEndTime = String(params.eventEndTime || "").trim();
  const bookingActor = params.bookingActor || "cashier";

  if (!eventDate || !isValidTimeString(eventStartTime) || !isValidTimeString(eventEndTime)) {
    return {
      ok: false,
      message: "Choose date, start time, and end time before loading stock snapshot.",
      selectedDate: eventDate,
      eventStartTime,
      eventEndTime,
      bookingActor,
      categories: [],
      items: [],
    } satisfies QuickCheckSnapshotResult;
  }

  const [products, categories] = await Promise.all([
    fetchPaged<ProductRow>(async (from, to) => {
      return await params.supabase
        .from("products")
        .select("id, name, image_url, category_id, active, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .range(from, to);
    }),
    fetchPaged<CategoryRow>(async (from, to) => {
      return await params.supabase
        .from("inventory_categories")
        .select("id, name, active, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true })
        .range(from, to);
    }),
  ]);

  const categoryNameById = new Map<string, string>(
    categories.map((row) => [String(row.id), String(row.name || "No category")])
  );
  const categoryIds = new Set(categories.map((row) => String(row.id)));

  const productIds = products.map((product) => String(product.id || "").trim()).filter(Boolean);

  if (productIds.length === 0) {
    return {
      ok: true,
      message: null,
      selectedDate: eventDate,
      eventStartTime,
      eventEndTime,
      bookingActor,
      categories: categories.map((category) => ({
        id: String(category.id),
        name: String(category.name || "No category"),
        count: 0,
      })),
      items: [],
    } satisfies QuickCheckSnapshotResult;
  }

  const snapshotByProductId = await runBatchedSnapshotChecks({
    supabase: params.supabase,
    eventDate,
    eventStartTime,
    eventEndTime,
    bookingActor,
    productIds,
  });

  const items = products.map((product) => {
      const productId = String(product.id || "").trim();
      const snapshot = snapshotByProductId.get(productId);
      const rawCategoryId = String(product.category_id || "").trim();
      const hasKnownCategory = rawCategoryId !== "" && categoryIds.has(rawCategoryId);
      const categoryId = hasKnownCategory ? rawCategoryId : null;

      return {
        productId,
        productName: product.name,
        imageUrl: product.image_url,
        categoryId,
        categoryName: categoryId ? categoryNameById.get(categoryId) || "No category" : "No category",
        available: snapshot?.available === true,
        remainingQuantity: Math.max(0, Math.floor(toNumber(snapshot?.remainingQuantity, 0))),
        message: snapshot?.message || null,
        checkFailed: !snapshot || snapshot.checkFailed === true,
      } satisfies QuickCheckSnapshotItem;
    });

  const categoryCountById = new Map<string, number>();
  let uncategorizedCount = 0;

  for (const item of items) {
    if (item.categoryId) {
      categoryCountById.set(item.categoryId, (categoryCountById.get(item.categoryId) || 0) + 1);
      continue;
    }

    uncategorizedCount += 1;
  }

  const orderedCategories: QuickCheckSnapshotCategory[] = categories.map((category) => {
    const categoryId = String(category.id);

    return {
      id: categoryId,
      name: String(category.name || "No category"),
      count: categoryCountById.get(categoryId) || 0,
    };
  });

  if (uncategorizedCount > 0) {
    orderedCategories.push({
      id: "uncategorized",
      name: "No category",
      count: uncategorizedCount,
    });
  }

  return {
    ok: true,
    message: null,
    selectedDate: eventDate,
    eventStartTime,
    eventEndTime,
    bookingActor,
    categories: orderedCategories,
    items,
  } satisfies QuickCheckSnapshotResult;
}

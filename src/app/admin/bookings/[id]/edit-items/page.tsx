import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BookingItemsEditForm from "./BookingItemsEditForm";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function getProductCategoryName(categories: any[], categoryId: string | null) {
  if (!categoryId) return null;

  const category = categories.find((item) => item.id === categoryId);
  return category?.name || null;
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

function normalizeTimeValue(value: any) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) {
    return raw.slice(0, 5);
  }

  if (/^\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }

  return raw.slice(0, 5);
}

export default async function EditBookingItemsPage(props: PageProps) {
  const params = await props.params;
  const bookingId = params.id;

  const supabase = await createClient();

  const [
    bookingResult,
    categoriesResult,
    productsResult,
    productModifierGroupsResult,
    modifierGroupOptionsResult,
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, booking_number, event_date, event_start_time, event_end_time, setup_address, setup_city, setup_state, setup_zip, delivery_fee, tax_rate, discount_amount, deposit_amount"
      )
      .eq("id", bookingId)
      .maybeSingle(),

    supabase
      .from("categories")
      .select("id, name, active, sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase
      .from("product_modifier_groups")
      .select(
        `
        id,
        product_id,
        modifier_group_id,
        sort_order,
        required,
        active,
        modifier_groups (
          id,
          name,
          description,
          selection_type,
          image_url,
          sort_order,
          active,
          required_by_default
        )
      `
      )
      .eq("active", true)
      .order("sort_order", { ascending: true }),

    supabase
      .from("modifier_group_options")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (bookingResult.error) {
    throw new Error(bookingResult.error.message);
  }

  if (!bookingResult.data) {
    notFound();
  }

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  if (productsResult.error) {
    throw new Error(productsResult.error.message);
  }

  if (productModifierGroupsResult.error) {
    throw new Error(productModifierGroupsResult.error.message);
  }

  if (modifierGroupOptionsResult.error) {
    throw new Error(modifierGroupOptionsResult.error.message);
  }

  const booking = bookingResult.data as any;

  let bookingItemsResult: any = await supabase
    .from("booking_items")
    .select("id, product_id, quantity, unit_price, subtotal, notes")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: true });

  if (bookingItemsResult.error && isMissingColumnError(bookingItemsResult.error, "booking_items", "subtotal")) {
    bookingItemsResult = await supabase
      .from("booking_items")
      .select("id, product_id, quantity, unit_price, line_total, notes")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
  }

  if (bookingItemsResult.error && isMissingColumnError(bookingItemsResult.error, "booking_items", "notes")) {
    bookingItemsResult = await supabase
      .from("booking_items")
      .select("id, product_id, quantity, unit_price, line_total")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
  }

  if (bookingItemsResult.error) {
    throw new Error(bookingItemsResult.error.message);
  }

  const bookingModifiersResult = await supabase
    .from("booking_modifiers")
    .select("*")
    .eq("booking_id", bookingId);

  if (bookingModifiersResult.error) {
    throw new Error(bookingModifiersResult.error.message);
  }

  const categories = (categoriesResult.data || []).filter((row: any) => row.active !== false);
  const products = (productsResult.data || []).map((product: any) => ({
    ...product,
    category_name: getProductCategoryName(categories, product.category_id),
  }));

  const optionRows = modifierGroupOptionsResult.data || [];

  const modifierGroups = (productModifierGroupsResult.data || [])
    .filter((row: any) => row.modifier_groups)
    .map((row: any) => {
      const group = getOne(row.modifier_groups);

      return {
        productId: row.product_id,
        required: row.required === true || group?.required_by_default === true,
        active: row.active !== false && group?.active !== false,
        sortOrder: row.sort_order || group?.sort_order || 100,
        id: group.id,
        name: group.name,
        selectionType: group.selection_type || "single",
        options: optionRows
          .filter((option: any) => option.modifier_group_id === group.id)
          .map((option: any) => ({
            id: option.id,
            modifierGroupId: option.modifier_group_id,
            name:
              option.option_name ||
              option.name ||
              option.label ||
              option.title ||
              "Option",
            priceDelta: Number(option.price_delta || 0),
            inventoryItemId: option.inventory_item_id,
            inventoryQuantity: Number(option.inventory_quantity || 1),
            trackInventory: option.track_inventory !== false,
            active: option.active !== false,
            sortOrder: option.sort_order || 100,
            modifierId: option.modifier_id || null,
          })),
      };
    })
    .filter((group: any) => group.active);

  const bookingItems = bookingItemsResult.data || [];
  const bookingModifiers = bookingModifiersResult.data || [];

  const legacyModifierIds = Array.from(
    new Set(
      bookingModifiers
        .map((row: any) => String((row as any).modifier_id || ""))
        .filter(Boolean)
    )
  );

  const modifierNameById = new Map<string, string>();

  if (legacyModifierIds.length > 0) {
    const legacyModifiersResult = await supabase
      .from("modifiers")
      .select("id, name")
      .in("id", legacyModifierIds);

    if (!legacyModifiersResult.error) {
      for (const row of legacyModifiersResult.data || []) {
        modifierNameById.set(
          String((row as any).id),
          String((row as any).name || "").trim().toLowerCase()
        );
      }
    }
  }

  const itemIndexByBookingItemId = new Map<string, number>();

  const initialItems = bookingItems.map((item: any, index: number) => {
    itemIndexByBookingItemId.set(String(item.id), index);

    const qty = Number(item.quantity || 1);
    const unit = Number(item.unit_price || 0);
    const subtotal = Number(
      item.subtotal ?? item.line_total ?? qty * unit
    );

    return {
      productId: String(item.product_id),
      quantity: Math.max(1, qty),
      unitPrice: Number.isFinite(unit) ? unit : 0,
      notes: String(item.notes || ""),
      subtotal,
    };
  });

  const optionIdByModifierId = new Map<string, string>();

  for (const group of modifierGroups) {
    for (const option of group.options || []) {
      if ((option as any).modifierId) {
        optionIdByModifierId.set(String((option as any).modifierId), String(option.id));
      }
    }
  }

  const initialModifierSelections: Array<{
    itemIndex: number;
    groupId: string;
    optionId: string;
  }> = [];

  const optionRowsByProduct = new Map<
    string,
    Array<{ groupId: string; optionId: string; optionName: string; modifierId: string }>
  >();

  const itemIndexesByProduct = new Map<string, number[]>();
  const fallbackCursorByProduct = new Map<string, number>();

  for (let index = 0; index < bookingItems.length; index += 1) {
    const rowProductId = String((bookingItems[index] as any)?.product_id || "");
    if (!rowProductId) {
      continue;
    }

    const list = itemIndexesByProduct.get(rowProductId) || [];
    list.push(index);
    itemIndexesByProduct.set(rowProductId, list);
  }

  for (const group of modifierGroups) {
    for (const option of group.options || []) {
      const queue = optionRowsByProduct.get(String(group.productId)) || [];
      queue.push({
        groupId: String(group.id),
        optionId: String(option.id),
        optionName: String((option as any).name || "").trim().toLowerCase(),
        modifierId: String((option as any).modifierId || ""),
      });
      optionRowsByProduct.set(String(group.productId), queue);
    }
  }

  for (const row of bookingModifiers) {
    const rowBookingItemId = String((row as any).booking_item_id || "");
    const itemIndex = itemIndexByBookingItemId.get(rowBookingItemId);

    if (itemIndex === undefined) {
      const rowNotes = String((row as any).notes || "");
      const noteItemIndexMatch = rowNotes.match(/\[idx:(\d+)\]/i);
      const rowProductId = String((row as any).product_id || "");

      let fallbackItemIndex = -1;

      if (noteItemIndexMatch?.[1]) {
        const parsedNoteItemIndex = Number(noteItemIndexMatch[1]);
        if (
          Number.isInteger(parsedNoteItemIndex) &&
          parsedNoteItemIndex >= 0 &&
          parsedNoteItemIndex < bookingItems.length
        ) {
          const noteItemProductId = String(
            (bookingItems[parsedNoteItemIndex] as any)?.product_id || ""
          );

          if (!rowProductId || noteItemProductId === rowProductId) {
            fallbackItemIndex = parsedNoteItemIndex;
          }
        }
      }

      if (fallbackItemIndex < 0) {
        const candidates = itemIndexesByProduct.get(rowProductId) || [];

        if (candidates.length > 0) {
          const cursor = fallbackCursorByProduct.get(rowProductId) || 0;
          fallbackItemIndex = candidates[cursor % candidates.length];
          fallbackCursorByProduct.set(rowProductId, cursor + 1);
        }
      }

      if (fallbackItemIndex < 0) {
        continue;
      }

      const resolvedItemIndex = fallbackItemIndex;

      let optionId = String((row as any).modifier_group_option_id || "");
      const rowModifierId = String((row as any).modifier_id || "");
      const rowGroupId = String((row as any).modifier_group_id || "");
      const rowLabel = String((row as any).label || "").trim().toLowerCase();
      const parsedOptionName = String(
        rowNotes.includes(":") ? rowNotes.split(":").slice(1).join(":") : rowNotes
      )
        .trim()
        .toLowerCase();
      const itemProductId = String((bookingItems[resolvedItemIndex] as any)?.product_id || "");
      const optionsForProduct = optionRowsByProduct.get(itemProductId) || [];

      if (!optionId) {
        optionId =
          optionsForProduct.find(
            (entry) =>
              (rowGroupId && entry.groupId === rowGroupId && entry.optionName === parsedOptionName) ||
              (rowGroupId && entry.groupId === rowGroupId && entry.optionName === rowLabel) ||
              (rowModifierId && entry.modifierId && entry.modifierId === rowModifierId) ||
              (rowModifierId && entry.optionId === rowModifierId) ||
              (parsedOptionName && entry.optionName === parsedOptionName) ||
              (rowLabel && entry.optionName === rowLabel)
          )?.optionId || "";
      }

      if (!optionId) {
        continue;
      }

      const groupForOption = modifierGroups.find(
        (group: any) =>
          String(group.productId) === itemProductId &&
          (group.options || []).some((option: any) => String(option.id) === optionId)
      );

      if (!groupForOption?.id) {
        continue;
      }

      const exists = initialModifierSelections.some(
        (selected) =>
          selected.itemIndex === resolvedItemIndex &&
          selected.groupId === String(groupForOption.id) &&
          selected.optionId === optionId
      );

      if (!exists) {
        initialModifierSelections.push({
          itemIndex: resolvedItemIndex,
          groupId: String(groupForOption.id),
          optionId,
        });
      }

      continue;
    }

    let optionId = String((row as any).modifier_group_option_id || "");
    const notesRaw = String((row as any).notes || "");
    const noteOptionIdMatch = notesRaw.match(/\[oid:([^\]]+)\]/i);
    const noteGroupIdMatch = notesRaw.match(/\[gid:([^\]]+)\]/i);

    if (!optionId && noteOptionIdMatch?.[1]) {
      optionId = String(noteOptionIdMatch[1]).trim();
    }

    const legacyModifierId = String((row as any).modifier_id || "");
    const rowGroupId =
      String((row as any).modifier_group_id || "") ||
      String(noteGroupIdMatch?.[1] || "");
    const rowLabel = String((row as any).label || "").trim().toLowerCase();
    const legacyModifierName = modifierNameById.get(legacyModifierId) || "";

    if (!optionId) {
      optionId = optionIdByModifierId.get(legacyModifierId) || "";
    }

    if (!optionId) {
      const notes = String((row as any).notes || "");
      const [groupNameRaw, optionNameRaw] = notes.split(":");
      const groupName = String(groupNameRaw || "").trim().toLowerCase();
      const optionName = String(optionNameRaw || "").trim().toLowerCase();

      const itemProductId = String((bookingItems[itemIndex] as any)?.product_id || "");

      const matchGroup = modifierGroups.find(
        (group: any) =>
          String(group.productId) === itemProductId &&
          String(group.name || "").trim().toLowerCase() === groupName
      );

      const matchOption = (matchGroup?.options || []).find(
        (option: any) =>
          String(option.name || "").trim().toLowerCase() === optionName
      );

      if (matchOption?.id) {
        optionId = String(matchOption.id);
      }
    }

    if (!optionId) {
      const itemProductId = String((bookingItems[itemIndex] as any)?.product_id || "");
      const optionsForProduct = optionRowsByProduct.get(itemProductId) || [];
      const notesOptionName = notesRaw
        .split(":")
        .slice(1)
        .join(":")
        .trim()
        .toLowerCase();

      optionId =
        optionsForProduct.find(
          (entry) =>
            (rowGroupId && entry.groupId === rowGroupId && entry.optionName === notesOptionName) ||
            (rowGroupId && entry.groupId === rowGroupId && entry.optionName === rowLabel) ||
            (legacyModifierId && entry.modifierId && entry.modifierId === legacyModifierId) ||
            (legacyModifierId && entry.optionId === legacyModifierId) ||
            (legacyModifierName && entry.optionName === legacyModifierName) ||
            (notesOptionName && entry.optionName === notesOptionName) ||
            (rowLabel && entry.optionName === rowLabel)
        )?.optionId || "";
    }

    if (!optionId) {
      continue;
    }

    const itemProductId = String((bookingItems[itemIndex] as any)?.product_id || "");
    const groupForOption = modifierGroups.find(
      (group: any) =>
        String(group.productId) === itemProductId &&
        (group.options || []).some((option: any) => String(option.id) === optionId)
    );

    if (!groupForOption?.id) {
      continue;
    }

    const exists = initialModifierSelections.some(
      (selected) =>
        selected.itemIndex === itemIndex &&
        selected.groupId === String(groupForOption.id) &&
        selected.optionId === optionId
    );

    if (!exists) {
      initialModifierSelections.push({
        itemIndex,
        groupId: String(groupForOption.id),
        optionId,
      });
    }
  }

  return (
    <div className="space-y-6">
      <BookingItemsEditForm
        bookingId={bookingId}
        bookingLabel={String(booking.booking_number || String(booking.id).slice(0, 8))}
        products={products as any[]}
        categories={categories as any[]}
        modifierGroups={modifierGroups as any[]}
        initialItems={initialItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          notes: item.notes,
        }))}
        initialModifierSelections={initialModifierSelections}
        initialBooking={{
          eventDate: String(booking.event_date || ""),
          eventStartTime: normalizeTimeValue(booking.event_start_time),
          eventEndTime: normalizeTimeValue(booking.event_end_time),
          setupAddress: String(booking.setup_address || ""),
          setupCity: String(booking.setup_city || ""),
          setupState: String(booking.setup_state || "CA"),
          setupZip: String(booking.setup_zip || ""),
        }}
        financials={{
          deliveryFee: Number(booking.delivery_fee || 0),
          taxRate: Number(booking.tax_rate || 0),
          discountAmount: Number(booking.discount_amount || 0),
          depositAmount: Number(booking.deposit_amount || 0),
        }}
      />
    </div>
  );
}

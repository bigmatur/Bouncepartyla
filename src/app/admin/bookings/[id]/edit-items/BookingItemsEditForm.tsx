"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { updateBookingItemsAction } from "../actions";
import { calculateBookingPricingAction } from "../../new/pricing-actions";

type Product = {
  id: string;
  name: string;
  active?: boolean | null;
  image_url?: string | null;
  base_price?: number | string | null;
  price?: number | string | null;
  category_id?: string | null;
};

type Category = {
  id: string;
  name: string;
};

type ModifierOption = {
  id: string;
  modifierGroupId: string;
  name: string;
  priceDelta: number;
  inventoryItemId?: string | null;
  inventoryQuantity: number;
  trackInventory: boolean;
  active: boolean;
  sortOrder: number;
};

type ModifierGroup = {
  productId: string;
  id: string;
  name: string;
  selectionType: "single" | "multiple" | "quantity" | string;
  required: boolean;
  active: boolean;
  sortOrder: number;
  options: ModifierOption[];
};

type InitialItem = {
  productId: string;
  quantity: number;
  unitPrice: number;
  notes: string;
};

type InitialModifierSelection = {
  itemIndex: number;
  groupId: string;
  optionId: string;
};

type EditableItem = InitialItem & {
  localId: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function getProductPrice(product: Product) {
  const value = product.base_price ?? product.price ?? 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function modifierKey(itemLocalId: string, groupId: string) {
  return `${itemLocalId}:${groupId}`;
}

export default function BookingItemsEditForm({
  bookingId,
  bookingLabel,
  products,
  categories,
  modifierGroups,
  initialItems,
  initialModifierSelections,
  initialBooking,
  financials,
}: {
  bookingId: string;
  bookingLabel: string;
  products: Product[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  initialItems: InitialItem[];
  initialModifierSelections: InitialModifierSelection[];
  initialBooking: {
    eventDate: string;
    eventStartTime: string;
    eventEndTime: string;
    setupAddress: string;
    setupCity: string;
    setupState: string;
    setupZip: string;
  };
  financials: {
    deliveryFee: number;
    taxRate: number;
    discountAmount: number;
    depositAmount: number;
  };
}) {
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [activeItemLocalId, setActiveItemLocalId] = useState<string>(
    initialItems[0] ? "item-0" : ""
  );

  const [eventDate, setEventDate] = useState(initialBooking.eventDate || "");
  const [eventStartTime, setEventStartTime] = useState(
    initialBooking.eventStartTime || ""
  );
  const [eventEndTime, setEventEndTime] = useState(initialBooking.eventEndTime || "");
  const [setupAddress, setSetupAddress] = useState(initialBooking.setupAddress || "");
  const [setupCity, setSetupCity] = useState(initialBooking.setupCity || "");
  const [setupState, setSetupState] = useState(initialBooking.setupState || "CA");
  const [setupZip, setSetupZip] = useState(initialBooking.setupZip || "");
  const [discountAmount, setDiscountAmount] = useState(
    Number(financials.discountAmount || 0)
  );
  const [discountPassword, setDiscountPassword] = useState("");
  const [discountEditorOpen, setDiscountEditorOpen] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState(Number(financials.deliveryFee || 0));
  const [taxRate, setTaxRate] = useState(Number(financials.taxRate || 0));
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingMessage, setPricingMessage] = useState<string | null>(null);

  const [selectedItems, setSelectedItems] = useState<EditableItem[]>(() =>
    initialItems.map((item, index) => ({
      localId: `item-${index}`,
      ...item,
    }))
  );

  const [selectedModifierOptions, setSelectedModifierOptions] = useState<
    Record<string, string[]>
  >(() => {
    const initial: Record<string, string[]> = {};

    for (const row of initialModifierSelections) {
      const localId = `item-${row.itemIndex}`;
      const key = modifierKey(localId, row.groupId);
      const existing = initial[key] || [];

      if (!existing.includes(row.optionId)) {
        initial[key] = [...existing, row.optionId];
      }
    }

    return initial;
  });

  const newItemCounterRef = useRef(initialItems.length + 1);
  const itemCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const pricingRequestIdRef = useRef(0);
  const discountEditorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!discountEditorOpen) {
      return;
    }

    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;

      if (!target || !discountEditorRef.current) {
        return;
      }

      if (!discountEditorRef.current.contains(target)) {
        setDiscountEditorOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown);

    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, [discountEditorOpen]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (product.active === false) {
        return false;
      }

      const matchesCategory =
        selectedCategoryId === "all" || product.category_id === selectedCategoryId;

      const matchesSearch = product.name
        .toLowerCase()
        .includes(search.trim().toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategoryId, search]);

  function getProduct(productId: string) {
    return products.find((item) => item.id === productId) || null;
  }

  function getGroupsForProduct(productId: string) {
    return modifierGroups
      .filter((group) => group.productId === productId && group.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function addProduct(productId: string) {
    const product = getProduct(productId);

    if (!product) {
      return;
    }

    const localId = `item-${newItemCounterRef.current++}`;

    setSelectedItems((current) => [
      ...current,
      {
        localId,
        productId,
        quantity: 1,
        unitPrice: getProductPrice(product),
        notes: "",
      },
    ]);

    setActiveItemLocalId(localId);
  }

  function removeItem(localId: string) {
    setSelectedItems((current) => current.filter((item) => item.localId !== localId));

    setSelectedModifierOptions((current) => {
      const next: Record<string, string[]> = {};

      for (const key of Object.keys(current)) {
        if (!key.startsWith(`${localId}:`)) {
          next[key] = current[key];
        }
      }

      return next;
    });

    setActiveItemLocalId((current) => {
      if (current !== localId) {
        return current;
      }

      const nextItem = selectedItems.find((item) => item.localId !== localId);
      return nextItem?.localId || "";
    });
  }

  function focusItem(localId: string) {
    setActiveItemLocalId(localId);
    itemCardRefs.current[localId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function patchItem(localId: string, patch: Partial<EditableItem>) {
    setSelectedItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item))
    );
  }

  function chooseSingleOption(params: {
    itemLocalId: string;
    groupId: string;
    optionId: string;
  }) {
    const key = modifierKey(params.itemLocalId, params.groupId);

    setSelectedModifierOptions((current) => ({
      ...current,
      [key]: [params.optionId],
    }));
  }

  function toggleMultipleOption(params: {
    itemLocalId: string;
    groupId: string;
    optionId: string;
  }) {
    const key = modifierKey(params.itemLocalId, params.groupId);

    setSelectedModifierOptions((current) => {
      const existing = current[key] || [];
      const next = existing.includes(params.optionId)
        ? existing.filter((id) => id !== params.optionId)
        : [...existing, params.optionId];

      return {
        ...current,
        [key]: next,
      };
    });
  }

  const selectedModifierRows = useMemo(() => {
    return selectedItems.flatMap((item, itemIndex) => {
      const groups = getGroupsForProduct(item.productId);

      return groups.flatMap((group) => {
        const key = modifierKey(item.localId, group.id);
        const selectedOptionIds = selectedModifierOptions[key] || [];

        return selectedOptionIds
          .map((optionId) => {
            const option = group.options.find((row) => row.id === optionId);
            if (!option || option.active === false) {
              return null;
            }

            return {
              itemIndex,
              productId: item.productId,
              groupId: group.id,
              groupName: group.name,
              optionId: option.id,
              optionName: option.name,
              priceDelta: Number(option.priceDelta || 0),
              inventoryItemId: option.inventoryItemId || null,
              inventoryQuantity: Number(option.inventoryQuantity || 1),
              trackInventory: option.trackInventory !== false,
            };
          })
          .filter(Boolean) as Array<{
          itemIndex: number;
          productId: string;
          groupId: string;
          groupName: string;
          optionId: string;
          optionName: string;
          priceDelta: number;
          inventoryItemId: string | null;
          inventoryQuantity: number;
          trackInventory: boolean;
        }>;
      });
    });
  }, [modifierGroups, selectedItems, selectedModifierOptions]);

  const productSubtotal = selectedItems.reduce((sum, item) => {
    return sum + item.quantity * item.unitPrice;
  }, 0);

  const selectedProductCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const item of selectedItems) {
      counts.set(item.productId, (counts.get(item.productId) || 0) + 1);
    }

    return counts;
  }, [selectedItems]);

  const modifiersSubtotal = selectedModifierRows.reduce((sum, row) => {
    const itemQty = selectedItems[row.itemIndex]?.quantity || 1;
    return sum + row.priceDelta * itemQty;
  }, 0);

  const subtotal = Number((productSubtotal + modifiersSubtotal).toFixed(2));
  const safeDiscountAmount = Number(
    Math.max(0, Math.min(discountAmount, subtotal)).toFixed(2)
  );
  const taxableSubtotal = Number((subtotal - safeDiscountAmount).toFixed(2));
  const taxAmount = Number(((taxableSubtotal + deliveryFee) * (taxRate / 100)).toFixed(2));
  const totalAmount = Number(
    (taxableSubtotal + deliveryFee + taxAmount).toFixed(2)
  );
  const balanceDue = Number((totalAmount - financials.depositAmount).toFixed(2));

  const initialItemsFingerprint = useMemo(() => {
    return JSON.stringify({
      items: initialItems,
      modifiers: initialModifierSelections,
    });
  }, [initialItems, initialModifierSelections]);

  const currentItemsFingerprint = useMemo(() => {
    const items = selectedItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice || 0),
      notes: item.notes || "",
    }));

    const modifiers = selectedModifierRows.map((row) => ({
      itemIndex: row.itemIndex,
      groupId: row.groupId,
      optionId: row.optionId,
    }));

    return JSON.stringify({ items, modifiers });
  }, [selectedItems, selectedModifierRows]);

  const hasMaterialChanges =
    initialItemsFingerprint !== currentItemsFingerprint ||
    String(initialBooking.eventDate || "") !== String(eventDate || "") ||
    String(initialBooking.eventStartTime || "") !== String(eventStartTime || "") ||
    String(initialBooking.eventEndTime || "") !== String(eventEndTime || "") ||
    String(initialBooking.setupAddress || "") !== String(setupAddress || "") ||
    String(initialBooking.setupCity || "") !== String(setupCity || "") ||
    String(initialBooking.setupState || "") !== String(setupState || "") ||
    String(initialBooking.setupZip || "") !== String(setupZip || "") ||
    Number(financials.discountAmount || 0).toFixed(2) !== safeDiscountAmount.toFixed(2);

  useEffect(() => {
    const cleanAddress = setupAddress.trim();
    const cleanCity = setupCity.trim();
    const cleanZip = setupZip.trim();

    if (!cleanAddress || !cleanCity || !cleanZip || subtotal <= 0) {
      return;
    }

    const requestId = pricingRequestIdRef.current + 1;
    pricingRequestIdRef.current = requestId;

    const timer = window.setTimeout(async () => {
      try {
        setPricingLoading(true);
        setPricingMessage(null);

        const formData = new FormData();
        formData.set("setupAddress", cleanAddress);
        formData.set("setupCity", cleanCity);
        formData.set("setupState", setupState || "CA");
        formData.set("setupZip", cleanZip);
        formData.set("subtotal", String(subtotal));
        formData.set("depositAmount", String(financials.depositAmount || 0));

        const result = await calculateBookingPricingAction(formData);

        if (pricingRequestIdRef.current !== requestId) {
          return;
        }

        setDeliveryFee(Number(result.deliveryFee || 0));
        setTaxRate(Number(result.taxRate || 0));

        if (result.deliveryError || result.taxError) {
          setPricingMessage(result.deliveryError || result.taxError || null);
        } else {
          setPricingMessage("Delivery and tax recalculated from address.");
        }
      } catch (error: any) {
        if (pricingRequestIdRef.current === requestId) {
          setPricingMessage(error?.message || "Automatic pricing update failed.");
        }
      } finally {
        if (pricingRequestIdRef.current === requestId) {
          setPricingLoading(false);
        }
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    setupAddress,
    setupCity,
    setupState,
    setupZip,
    subtotal,
    financials.depositAmount,
  ]);

  return (
    <form action={updateBookingItemsAction} className="space-y-6">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="editedBy" value="admin_cashier" />
      <input type="hidden" name="hasMaterialChanges" value={hasMaterialChanges ? "true" : "false"} />
      <input type="hidden" name="eventDate" value={eventDate} />
      <input type="hidden" name="eventStartTime" value={eventStartTime} />
      <input type="hidden" name="eventEndTime" value={eventEndTime} />
      <input type="hidden" name="setupAddress" value={setupAddress} />
      <input type="hidden" name="setupCity" value={setupCity} />
      <input type="hidden" name="setupState" value={setupState} />
      <input type="hidden" name="setupZip" value={setupZip} />
      <input type="hidden" name="discountAmount" value={safeDiscountAmount} />
      <input type="hidden" name="discountPassword" value={discountPassword} />
      <input type="hidden" name="deliveryFee" value={deliveryFee} />
      <input type="hidden" name="taxRate" value={taxRate} />

      {selectedItems.map((item, index) => (
        <div key={`item-hidden-${item.localId}`}>
          <input type="hidden" name={`itemProductId_${index}`} value={item.productId} />
          <input type="hidden" name={`itemQuantity_${index}`} value={item.quantity} />
          <input type="hidden" name={`itemUnitPrice_${index}`} value={item.unitPrice} />
          <input type="hidden" name={`itemNotes_${index}`} value={item.notes} />
        </div>
      ))}

      {selectedModifierRows.map((row, index) => (
        <div key={`modifier-hidden-${index}`}>
          <input type="hidden" name={`modifierItemIndex_${index}`} value={row.itemIndex} />
          <input type="hidden" name={`modifierGroupId_${index}`} value={row.groupId} />
          <input type="hidden" name={`modifierGroupName_${index}`} value={row.groupName} />
          <input type="hidden" name={`modifierOptionId_${index}`} value={row.optionId} />
          <input type="hidden" name={`modifierOptionName_${index}`} value={row.optionName} />
          <input type="hidden" name={`modifierPriceDelta_${index}`} value={row.priceDelta} />
          <input
            type="hidden"
            name={`modifierInventoryItemId_${index}`}
            value={row.inventoryItemId || ""}
          />
          <input
            type="hidden"
            name={`modifierInventoryQuantity_${index}`}
            value={row.inventoryQuantity}
          />
          <input
            type="hidden"
            name={`modifierTrackInventory_${index}`}
            value={row.trackInventory ? "true" : "false"}
          />
        </div>
      ))}

      <section className="rounded-[30px] border border-black/5 bg-white px-6 py-5 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <a
              href={`/admin/bookings/${bookingId}`}
              className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
            >
              ← Back to booking
            </a>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Edit Items · {bookingLabel}
            </h1>
            <p className="mt-1 text-sm text-[#6c6258]">
              Add missing options, update schedule/address and apply discount in one place.
            </p>
          </div>

          <button
            type="submit"
            className="rounded-full bg-[#23313f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
          >
            Save items
          </button>
        </div>
      </section>

      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <h2 className="text-xl font-semibold text-[#1f1e1b]">Booking details</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Event date
            </span>
            <input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Start time
            </span>
            <input
              type="time"
              value={eventStartTime}
              onChange={(event) => setEventStartTime(event.target.value)}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              End time
            </span>
            <input
              type="time"
              value={eventEndTime}
              onChange={(event) => setEventEndTime(event.target.value)}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />
          </label>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="block md:col-span-2">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              Address
            </span>
            <input
              value={setupAddress}
              onChange={(event) => setSetupAddress(event.target.value)}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
              placeholder="Street address"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              City
            </span>
            <input
              value={setupCity}
              onChange={(event) => setSetupCity(event.target.value)}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              State
            </span>
            <input
              value={setupState}
              onChange={(event) => setSetupState(event.target.value)}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
              ZIP
            </span>
            <input
              value={setupZip}
              onChange={(event) => setSetupZip(event.target.value)}
              className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
            />
          </label>

        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[#6c6258]">
          {pricingLoading ? <span>Recalculating delivery and tax...</span> : null}
          {pricingMessage ? <span>{pricingMessage}</span> : null}
        </div>
      </section>

      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <h2 className="text-xl font-semibold text-[#1f1e1b]">Add products</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search product"
            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
          />

          <select
            aria-label="Filter products by category"
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
            className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => (
            (() => {
              const selectedCount = selectedProductCounts.get(product.id) || 0;
              const selected = selectedCount > 0;

              return (
            <button
              key={product.id}
              type="button"
              onClick={() => addProduct(product.id)}
              className={[
                "rounded-2xl border px-4 py-3 text-left transition",
                selected
                  ? "border-[#23313f] bg-[#23313f] text-white"
                  : "border-[#e7ddd0] bg-[#fcfaf7] hover:border-[#d9c7ac]",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className={selected ? "text-sm font-semibold text-white" : "text-sm font-semibold text-[#1f1e1b]"}>
                  {product.name}
                </div>
                {selected ? (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]">
                    Selected x{selectedCount}
                  </span>
                ) : null}
              </div>
              <div className={selected ? "mt-1 text-xs text-white/80" : "mt-1 text-xs text-[#7f7262]"}>
                {money(getProductPrice(product))}
              </div>
            </button>
              );
            })()
          ))}
        </div>
      </section>

      {selectedItems.length > 1 && (
        <section className="rounded-[30px] border border-black/5 bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
            Quick jump between selected products
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedItems.map((item, index) => {
              const product = getProduct(item.productId);
              const active = activeItemLocalId === item.localId;

              return (
                <button
                  key={`jump-${item.localId}`}
                  type="button"
                  onClick={() => focusItem(item.localId)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    active
                      ? "border-[#23313f] bg-[#23313f] text-white"
                      : "border-[#ddd2c4] bg-white text-[#3a342d] hover:border-[#ccb796]",
                  ].join(" ")}
                >
                  {index + 1}. {product?.name || "Product"}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-4">
        {selectedItems.map((item, index) => {
          const product = getProduct(item.productId);
          const groups = getGroupsForProduct(item.productId);
          const active = activeItemLocalId === item.localId;
          const selectedRowsForItem = selectedModifierRows.filter(
            (row) => row.itemIndex === index
          );

          return (
            <article
              key={item.localId}
              ref={(node) => {
                itemCardRefs.current[item.localId] = node;
              }}
              className={[
                "rounded-[30px] border bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]",
                active ? "border-[#23313f]" : "border-black/5",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1e1b]">
                    {index + 1}. {product?.name || "Product"}
                  </h3>
                  <p className="mt-1 text-sm text-[#6c6258]">
                    Configure quantity, price and all available options.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => removeItem(item.localId)}
                  className="rounded-full border border-[#e0d3c2] bg-white px-4 py-2 text-xs font-semibold text-[#6f6254] hover:bg-[#faf6f1]"
                >
                  Remove
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Quantity
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(event) =>
                      patchItem(item.localId, {
                        quantity: Math.max(1, Number(event.target.value || 1)),
                      })
                    }
                    className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Unit price
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(event) =>
                      patchItem(item.localId, {
                        unitPrice: Math.max(0, Number(event.target.value || 0)),
                      })
                    }
                    className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                  />
                </label>

                <div className="rounded-2xl border border-[#e8decf] bg-[#fcfaf7] px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Line total
                  </div>
                  <div className="mt-1 text-lg font-semibold text-[#1f1e1b]">
                    {money(item.quantity * item.unitPrice)}
                  </div>
                </div>
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Notes
                </span>
                <textarea
                  value={item.notes}
                  onChange={(event) => patchItem(item.localId, { notes: event.target.value })}
                  className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                  rows={2}
                />
              </label>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-[#e8decf] bg-[#f8f2e8] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Selected summary
                  </div>

                  {selectedRowsForItem.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedRowsForItem.map((row) => (
                        <div
                          key={`selected-${item.localId}-${row.groupId}-${row.optionId}`}
                          className="rounded-full bg-[#23313f] px-3 py-1 text-xs font-semibold text-white"
                        >
                          {row.groupName}: {row.optionName}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-[#6c6258]">
                      No options selected yet.
                    </div>
                  )}
                </div>

                {groups.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#e0d6c9] px-4 py-3 text-sm text-[#7a6d5d]">
                    No option groups for this product.
                  </div>
                )}

                {groups.map((group) => {
                  const key = modifierKey(item.localId, group.id);
                  const selectedIds = selectedModifierOptions[key] || [];
                  const isSingle = group.selectionType !== "multiple";

                  return (
                    <div
                      key={`${item.localId}-${group.id}`}
                      className="rounded-2xl border border-[#e8decf] bg-[#fcfaf7] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-[#1f1e1b]">{group.name}</div>
                        {group.required && (
                          <span className="rounded-full bg-[#fff4d8] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a6b20]">
                            Required
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {group.options
                          .filter((option) => option.active)
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map((option) => {
                            const selected = selectedIds.includes(option.id);

                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                  if (isSingle) {
                                    chooseSingleOption({
                                      itemLocalId: item.localId,
                                      groupId: group.id,
                                      optionId: option.id,
                                    });
                                    return;
                                  }

                                  toggleMultipleOption({
                                    itemLocalId: item.localId,
                                    groupId: group.id,
                                    optionId: option.id,
                                  });
                                }}
                                className={[
                                  "rounded-xl border px-3 py-2 text-left transition",
                                  selected
                                    ? "border-[#23313f] bg-[#23313f] text-white"
                                    : "border-[#ddd2c4] bg-white text-[#3a342d] hover:border-[#ccb796]",
                                ].join(" ")}
                              >
                                <div className="text-sm font-semibold">{option.name}</div>
                                {Number(option.priceDelta || 0) > 0 && (
                                  <div className={selected ? "text-white/80 text-xs" : "text-[#7a6d5d] text-xs"}>
                                    + {money(option.priceDelta)}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}

        {selectedItems.length === 0 && (
          <section className="rounded-[30px] border border-dashed border-[#ddd2c4] bg-[#fcfaf7] p-10 text-center text-sm text-[#6f6254]">
            Add at least one product to continue.
          </section>
        )}
      </section>

      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <h3 className="text-xl font-semibold text-[#1f1e1b]">Updated totals</h3>

        <div className="mt-4 grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[#6c6258]">Products + options subtotal</span>
            <strong className="text-[#1f1e1b]">{money(subtotal)}</strong>
          </div>

          <div className="relative" ref={discountEditorRef}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#6c6258]">Discount</span>
              <button
                type="button"
                onClick={() => setDiscountEditorOpen((value) => !value)}
                className="font-semibold text-[#1f1e1b] underline decoration-dotted underline-offset-4"
              >
                {money(safeDiscountAmount)}
              </button>
            </div>

            {discountEditorOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[min(340px,90vw)] rounded-2xl border border-[#ddd2c4] bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
                <div className="grid gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                      Admin code
                    </span>
                    <input
                      type="password"
                      value={discountPassword}
                      onChange={(event) => setDiscountPassword(event.target.value)}
                      placeholder="Enter admin discount code"
                      className="w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                      Discount amount
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={discountAmount}
                      onChange={(event) =>
                        setDiscountAmount(Math.max(0, Number(event.target.value || 0)))
                      }
                      className="w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#6c6258]">Delivery</span>
            <strong className="text-[#1f1e1b]">{money(deliveryFee)}</strong>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#6c6258]">Tax</span>
            <strong className="text-[#1f1e1b]">{money(taxAmount)} ({taxRate.toFixed(3)}%)</strong>
          </div>

          <div className="mt-2 border-t border-[#eee5d9] pt-2">
            <div className="flex items-center justify-between text-base">
              <span className="font-semibold text-[#1f1e1b]">Total</span>
              <strong className="text-[#1f1e1b]">{money(totalAmount)}</strong>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#6c6258]">Deposit</span>
            <strong className="text-[#1f1e1b]">{money(financials.depositAmount)}</strong>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[#6c6258]">Balance due</span>
            <strong className="text-[#1f1e1b]">{money(balanceDue)}</strong>
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={selectedItems.length === 0}
            className="rounded-full bg-[#23313f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
          >
            Save items and options
          </button>
          {hasMaterialChanges ? (
            <p className="mt-2 text-xs text-[#9a7a49]">
              Substantial changes detected. Contract will require re-signature after save.
            </p>
          ) : (
            <p className="mt-2 text-xs text-[#6c6258]">No substantial changes detected yet.</p>
          )}
        </div>
      </section>
    </form>
  );
}

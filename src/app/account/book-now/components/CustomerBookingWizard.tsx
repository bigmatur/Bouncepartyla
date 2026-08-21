"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createCustomerBookingAction } from "../actions";
import { checkBookingItemAvailabilityAction } from "@/lib/booking/check-booking-item-availability";
import { calculateBookingPricingAction } from "@/app/admin/bookings/new/pricing-actions";
import { verifyDiscountPasswordAction } from "@/app/admin/settings/actions";
import GoogleAddressInput from "@/components/admin/GoogleAddressInput";

type BookingActor = "customer" | "cashier";

type Customer = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
};

type Product = {
  id: string;
  name: string;
  active?: boolean | null;
  image_url?: string | null;
  base_price?: number | string | null;
  price?: number | string | null;
  category_id?: string | null;
  category_name?: string | null;
  description?: string | null;
  short_description?: string | null;
  deposit_amount?: number | string | null;
  setup_width_ft?: number | string | null;
  setup_length_ft?: number | string | null;
  setup_height_ft?: number | string | null;
};

type Category = {
  id: string;
  name: string;
};

type ModifierOption = {
  id: string;
  modifierGroupId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  priceDelta: number;
  quantity?: number;
  inventoryItemId?: string | null;
  inventoryQuantity: number;
  trackInventory: boolean;
  active: boolean;
  sortOrder: number;
};

type ModifierGroup = {
  connectionId: string;
  productId: string;
  modifierGroupId: string;
  required: boolean;
  active: boolean;
  sortOrder: number;
  id: string;
  name: string;
  description?: string | null;
  selectionType: "single" | "multiple" | "quantity" | string;
  maxTotalQuantity?: number | null;
  imageUrl?: string | null;
  options: ModifierOption[];
};

type SelectedProduct = {
  productId: string;
  quantity: number;
  unitPrice: number;
  notes: string;
};

type AvailabilityComponent = {
  componentId: string;
  componentName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  trackingType: string;
  quantityRequired: number;
  quantityNeeded: number;
  quantityAvailable: number;
  available: boolean;
  isRequired: boolean;
  role: string;
  availableUnitIds: string[];
  reason?: string;
};

type ModifierAvailabilityItem = {
  optionId: string;
  optionName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  trackingType: string;
  quantityNeeded: number;
  quantityAvailable: number;
  available: boolean;
  reason?: string | null;
};

type ProductAvailabilityState = {
  checked: boolean;
  loading: boolean;
  available: boolean | null;
  productAvailable: boolean | null;
  message: string | null;
  components: AvailabilityComponent[];
  missingComponents: AvailabilityComponent[];
  modifierAvailability: ModifierAvailabilityItem[];
};

type PricingResult = {
  ok: boolean;
  subtotal: number;
  deliveryFee: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  depositAmount: number;
  balanceDue: number;
  distanceMiles: number | null;
  deliveryMode: string;
  matchedZoneName: string | null;
  deliveryReason: string;
  deliveryError: string | null;
  taxError: string | null;
};

type SelectedModifierRow = {
  productId: string;
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
  quantity: number;
  inventoryItemId?: string | null;
  inventoryQuantity: number;
  trackInventory: boolean;
};

type WorkingHourRow = {
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
};

type WorkingHourExceptionRow = {
  exception_date: string;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
};

type PaymentMethodOption = {
  method: string;
  displayName: string;
  integrationEnabled: boolean;
  integrationType: string;
  accountLabel: string | null;
  accountValue: string | null;
  iconUrl?: string | null;
};

function formatAvailabilityIssue(component: AvailabilityComponent) {
  const itemName =
    component.inventoryItemName?.trim() ||
    component.componentName?.trim() ||
    "This item";
  const needed = Number.isFinite(component.quantityNeeded)
    ? component.quantityNeeded
    : 0;
  const available = Number.isFinite(component.quantityAvailable)
    ? component.quantityAvailable
    : 0;

  if (component.reason) {
    return `${itemName}: ${component.reason}`;
  }

  return `${itemName}: need ${needed}, available ${available}`;
}

type TipSettings = {
  tipsEnabled: boolean;
  allowCustomTip: boolean;
  tipMode: "percent" | "amount";
  defaultTipPercent: number;
  defaultTipAmount: number;
  tipPercentOptions: number[];
  tipAmountOptions: number[];
};

type DiscountSecuritySettings = {
  discount_password_enabled?: boolean | null;
  discount_password_hint?: string | null;
};

type ContractSettings = {
  template_html?: string | null;
  require_contract_before_payment?: boolean | null;
  require_typed_signature?: boolean | null;
  signature_label?: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}

function getProductPrice(product: Product) {
  const value = product.base_price ?? product.price ?? 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function modifierKey(productId: string, groupId: string) {
  return `${productId}:${groupId}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function timeToMinutes(value: string) {
  const [hoursRaw, minutesRaw] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  const safe = Math.max(0, Math.min(value, 24 * 60));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;

  return `${pad(hours)}:${pad(minutes)}`;
}

function formatTimeLabel(value: string, timeFormat: "12h" | "24h") {
  if (timeFormat === "24h") {
    return value;
  }

  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);
  const period = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${pad(minutes)} ${period}`;
}

function buildHalfHourSlots(fromMinutes: number, toMinutes: number) {
  const start = Math.ceil(fromMinutes / 30) * 30;
  const end = Math.floor(toMinutes / 30) * 30;
  const result: string[] = [];

  for (let current = start; current <= end; current += 30) {
    result.push(minutesToTime(current));
  }

  return result;
}

function splitFullName(value: string | null | undefined) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");

  if (!normalized) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = normalized.split(" ");

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function getWorkingWindowForDate(params: {
  eventDate: string;
  workingHours: WorkingHourRow[];
  workingHourExceptions: WorkingHourExceptionRow[];
}) {
  if (!params.eventDate) {
    return {
      isOpen: true,
      openTime: "08:00",
      closeTime: "21:00",
    };
  }

  const exception = params.workingHourExceptions.find(
    (item) => item.exception_date === params.eventDate
  );

  if (exception) {
    return {
      isOpen: exception.is_open !== false,
      openTime: exception.open_time ? String(exception.open_time).slice(0, 5) : null,
      closeTime: exception.close_time ? String(exception.close_time).slice(0, 5) : null,
    };
  }

  const dayOfWeek = new Date(`${params.eventDate}T00:00:00`).getDay();
  const row = params.workingHours.find(
    (item) => Number(item.day_of_week) === dayOfWeek
  );

  if (!row) {
    return {
      isOpen: true,
      openTime: "08:00",
      closeTime: "21:00",
    };
  }

  return {
    isOpen: row.is_open !== false,
    openTime: row.open_time ? String(row.open_time).slice(0, 5) : null,
    closeTime: row.close_time ? String(row.close_time).slice(0, 5) : null,
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function getAvailabilityBadge(state?: ProductAvailabilityState) {
  if (!state || !state.checked) {
    return {
      label: "Check on selection",
      className: "bg-white text-[#6c6258] ring-1 ring-[#eee5d9]",
    };
  }

  if (state.loading) {
    return {
      label: "Checking...",
      className: "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]",
    };
  }

  if (state.productAvailable ?? state.available) {
    return {
      label: "Available",
      className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    };
  }

  return {
    label: "Not available",
    className: "bg-red-50 text-red-700 ring-1 ring-red-200",
  };
}

export default function NewBookingWizard({
  customers,
  products,
  categories,
  modifierGroups,
  timeFormat,
  workingHours,
  workingHourExceptions,
  paymentMethods,
  tipSettings,
  discountSecurity,
  contractSettings,
  googleMapsApiKey,
  initialProductId,
  initialEventDate,
  initialEventStartTime,
  initialEventEndTime,
  initialSetupAddress,
  initialSetupCity,
  initialSetupZip,
  initialBookingError,
  initialBookingFocus,
  bookingAttemptId,
  forceBookingActor,
  hideBookingActorSwitcher,
}: {
  customers: Customer[];
  products: Product[];
  categories: Category[];
  modifierGroups: ModifierGroup[];
  timeFormat: "12h" | "24h";
  workingHours: WorkingHourRow[];
  workingHourExceptions: WorkingHourExceptionRow[];
  paymentMethods: PaymentMethodOption[];
  tipSettings: TipSettings;
  discountSecurity: DiscountSecuritySettings;
  contractSettings: ContractSettings;
  googleMapsApiKey: string;
  initialProductId?: string;
  initialEventDate?: string;
  initialEventStartTime?: string;
  initialEventEndTime?: string;
  initialSetupAddress?: string;
  initialSetupCity?: string;
  initialSetupZip?: string;
  initialBookingError?: string;
  initialBookingFocus?: string;
  bookingAttemptId: string;
  forceBookingActor?: BookingActor;
  hideBookingActorSwitcher?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [bookingSubmitStarted, setBookingSubmitStarted] = useState(false);

  const [existingCustomerId, setExistingCustomerId] = useState("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const [eventDate, setEventDate] = useState(initialEventDate || "");
  const [eventStartTime, setEventStartTime] = useState(initialEventStartTime || "");
  const [eventEndTime, setEventEndTime] = useState(initialEventEndTime || "");
  const [bookingActor, setBookingActor] = useState<BookingActor>(
    forceBookingActor || "customer"
  );

  const [setupAddress, setSetupAddress] = useState(initialSetupAddress || "");
  const [setupCity, setSetupCity] = useState(initialSetupCity || "");
  const [setupState, setSetupState] = useState("CA");
  const [setupZip, setSetupZip] = useState(initialSetupZip || "");
  const [status, setStatus] = useState("inventory_reserved");

  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [search, setSearch] = useState("");

  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>(
    () => {
      const requestedProductId = String(initialProductId || "").trim();

      if (!requestedProductId) {
        return [];
      }

      const initialProduct = products.find(
        (product) => String(product.id) === requestedProductId
      );

      if (!initialProduct) {
        return [];
      }

      return [
        {
          productId: initialProduct.id,
          quantity: 1,
          unitPrice: getProductPrice(initialProduct),
          notes: "",
        },
      ];
    }
  );

  const [selectedModifierOptions, setSelectedModifierOptions] = useState<
    Record<string, string[]>
  >({});
  const [selectedModifierQuantities, setSelectedModifierQuantities] = useState<
    Record<string, Record<string, number>>
  >({});
  const [optionGroupIndexByProduct, setOptionGroupIndexByProduct] = useState<
    Record<string, number>
  >({});
  const [activeOptionsProductIndex, setActiveOptionsProductIndex] = useState(0);

  const [availabilityByProductId, setAvailabilityByProductId] = useState<
    Record<string, ProductAvailabilityState>
  >({});

  const [deliveryFee, setDeliveryFee] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositWasEdited, setDepositWasEdited] = useState(false);
  const [notes, setNotes] = useState("");

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(
    paymentMethods[0]?.method || ""
  );
  const [tipMode, setTipMode] = useState<"percent" | "amount">(
    tipSettings.tipMode || "percent"
  );
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [tipPercent, setTipPercent] = useState<number>(
    Number(tipSettings.defaultTipPercent || 0)
  );
  const [tipAmount, setTipAmount] = useState(0);
  const [tipAmountEdited, setTipAmountEdited] = useState(false);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountPassword, setDiscountPassword] = useState("");
  const [discountAuthorized, setDiscountAuthorized] = useState(false);
  const [discountAuthLoading, setDiscountAuthLoading] = useState(false);
  const [discountAuthMessage, setDiscountAuthMessage] = useState<string | null>(null);
  const [discountEditorOpen, setDiscountEditorOpen] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);
  const [contractSignerName, setContractSignerName] = useState("");
  const [contractManualSignature, setContractManualSignature] = useState("");
  const [contractSignatureDataUrl, setContractSignatureDataUrl] = useState("");
  const [bookingSubmitError, setBookingSubmitError] = useState(
    initialBookingError || ""
  );

  useEffect(() => {
    if (forceBookingActor) {
      setBookingActor(forceBookingActor);
    }
  }, [forceBookingActor]);

  useEffect(() => {
    if (!initialBookingError) {
      return;
    }

    if (bookingSubmitTimeoutRef.current) {
      clearTimeout(bookingSubmitTimeoutRef.current);
      bookingSubmitTimeoutRef.current = null;
    }

    setBookingSubmitStarted(false);
    setBookingSubmitError(initialBookingError);

    const focus = String(initialBookingFocus || "").toLowerCase();
    const stepByFocus: Record<string, number> = {
      address: 2,
      quantity: 3,
      modifiers: 4,
      contract: 5,
      summary: 5,
    };

    const nextStep = stepByFocus[focus] || 5;
    setStep(nextStep);
  }, [initialBookingError, initialBookingFocus]);

  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(
    null
  );

  const formRef = useRef<HTMLFormElement | null>(null);
  const pricingRequestIdRef = useRef(0);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const discountEditorRef = useRef<HTMLDivElement | null>(null);
  const availabilityRequestCounterRef = useRef(0);
  const latestAvailabilityRequestByProductRef = useRef<Record<string, number>>({});
  const bookingSubmitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (bookingSubmitTimeoutRef.current) {
        clearTimeout(bookingSubmitTimeoutRef.current);
        bookingSubmitTimeoutRef.current = null;
      }
    };
  }, []);

  function prepareSignatureCanvas() {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return null;
    }

    const width = Math.max(720, Math.floor(canvas.clientWidth || 720));
    const height = 220;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#243242";

    return { canvas, context, width, height };
  }

  function clearAndPaintSignatureCanvas() {
    const prepared = prepareSignatureCanvas();

    if (!prepared) {
      return;
    }

    const { context, width, height } = prepared;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  function signatureCanvasHasInk(canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");

    if (!context) {
      return false;
    }

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];

      if (red !== 255 || green !== 255 || blue !== 255 || alpha !== 255) {
        return true;
      }
    }

    return false;
  }

  function captureSignatureDataUrlFromCanvas() {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return "";
    }

    if (!signatureCanvasHasInk(canvas)) {
      return "";
    }

    return canvas.toDataURL("image/png");
  }

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (product.active === false) return false;

      const matchesCategory =
        selectedCategoryId === "all" ||
        product.category_id === selectedCategoryId;

      const matchesSearch = product.name
        .toLowerCase()
        .includes(search.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategoryId, search]);

  const selectedProductIds = selectedProducts.map((item) => item.productId);
  const customerName = `${customerFirstName} ${customerLastName}`.trim();

  const selectedCustomer = useMemo(() => {
    return customers.find((item) => item.id === existingCustomerId) || null;
  }, [customers, existingCustomerId]);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();

    return customers
      .filter((customer) => {
        if (!query) {
          return true;
        }

        return [customer.full_name, customer.phone, customer.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .slice(0, 50);
  }, [customerSearch, customers]);

  useEffect(() => {
    if (existingCustomerId || customers.length !== 1) {
      return;
    }

    const onlyCustomer = customers[0];
    if (!onlyCustomer?.id) {
      return;
    }

    setExistingCustomerId(onlyCustomer.id);
    setCustomerSearch(
      onlyCustomer.full_name || onlyCustomer.phone || onlyCustomer.email || ""
    );
  }, [customers, existingCustomerId]);

  function selectExistingCustomer(customer: Customer) {
    setExistingCustomerId(customer.id);
    setCustomerSearch(
      customer.full_name || customer.phone || customer.email || ""
    );
  }

  function startNewCustomer() {
    setExistingCustomerId("");
    setCustomerSearch("");
    setCustomerFirstName("");
    setCustomerLastName("");
    setCustomerPhone("");
    setCustomerEmail("");
  }

  useEffect(() => {
    if (!selectedCustomer) {
      return;
    }

    const split = splitFullName(selectedCustomer.full_name);
    setCustomerFirstName(split.firstName);
    setCustomerLastName(split.lastName);
    setCustomerPhone(String(selectedCustomer.phone || ""));
    setCustomerEmail(String(selectedCustomer.email || ""));
  }, [selectedCustomer]);

  useEffect(() => {
    setOptionGroupIndexByProduct((current) => {
      const next: Record<string, number> = {};

      for (const selectedProduct of selectedProducts) {
        const groupsCount = getGroupsForProduct(selectedProduct.productId).length;

        if (groupsCount <= 0) {
          continue;
        }

        const existing = current[selectedProduct.productId] || 0;
        next[selectedProduct.productId] = Math.max(
          0,
          Math.min(existing, groupsCount - 1)
        );
      }

      return next;
    });
  }, [modifierGroups, selectedProducts]);

  useEffect(() => {
    setActiveOptionsProductIndex((current) =>
      Math.max(0, Math.min(current, Math.max(0, selectedProducts.length - 1)))
    );
  }, [selectedProducts.length]);

  const productSubtotal = selectedProducts.reduce((sum, item) => {
    return sum + item.quantity * item.unitPrice;
  }, 0);

  const selectedModifierRows = useMemo<SelectedModifierRow[]>(() => {
    const rows: SelectedModifierRow[] = [];

    for (const selectedProduct of selectedProducts) {
      const groupsForProduct = modifierGroups.filter(
        (group) =>
          group.productId === selectedProduct.productId &&
          group.active !== false,
      );

      for (const group of groupsForProduct) {
        const key = modifierKey(selectedProduct.productId, group.id);
        const selectedOptionIds = selectedModifierOptions[key] || [];

        for (const optionId of selectedOptionIds) {
          const option = group.options.find((item) => item.id === optionId);

          if (!option || option.active === false) continue;

          rows.push({
            productId: selectedProduct.productId,
            groupId: group.id,
            groupName: group.name,
            optionId: option.id,
            optionName: option.name,
            priceDelta: Number(option.priceDelta || 0),
            quantity: Math.max(
              1,
              Number(selectedModifierQuantities[key]?.[option.id] || 1),
            ),
            inventoryItemId: option.inventoryItemId,
            inventoryQuantity: Number(option.inventoryQuantity || 1),
            trackInventory: option.trackInventory !== false,
          });
        }
      }
    }

    return rows;
  }, [selectedProducts, modifierGroups, selectedModifierOptions, selectedModifierQuantities]);

  const modifiersSubtotal = selectedModifierRows.reduce((sum, row) => {
    const selectedProduct = selectedProducts.find(
      (item) => item.productId === row.productId,
    );

    const productQty = selectedProduct?.quantity || 1;

    return sum + row.priceDelta * row.quantity * productQty;
  }, 0);

  const selectedInventoryDemandByItemId = useMemo(() => {
    const demand = new Map<string, number>();

    for (const row of selectedModifierRows) {
      if (!row.trackInventory || !row.inventoryItemId) {
        continue;
      }

      const productQuantity =
        selectedProducts.find((item) => item.productId === row.productId)
          ?.quantity || 1;

      const quantityNeeded =
        Math.max(1, Number(row.inventoryQuantity || 1)) *
        Math.max(1, Number(row.quantity || 1)) *
        Math.max(1, Number(productQuantity || 1));

      demand.set(
        row.inventoryItemId,
        Number(demand.get(row.inventoryItemId) || 0) + quantityNeeded,
      );
    }

    return demand;
  }, [selectedModifierRows, selectedProducts]);

  const cumulativeModifierInventoryConflicts = useMemo(() => {
    const conflicts: Array<{
      inventoryItemId: string;
      optionName: string;
      quantityNeeded: number;
      quantityAvailable: number;
    }> = [];

    const checkedInventoryItems = new Set<string>();

    for (const row of selectedModifierRows) {
      if (
        !row.trackInventory ||
        !row.inventoryItemId ||
        checkedInventoryItems.has(row.inventoryItemId)
      ) {
        continue;
      }

      checkedInventoryItems.add(row.inventoryItemId);

      const state = availabilityByProductId[row.productId];
      const optionAvailability = state?.modifierAvailability.find(
        (item) =>
          item.optionId === row.optionId ||
          item.inventoryItemId === row.inventoryItemId,
      );

      if (!state?.checked || state.loading || !optionAvailability) {
        continue;
      }

      const quantityNeeded = Number(
        selectedInventoryDemandByItemId.get(row.inventoryItemId) || 0,
      );
      const quantityAvailable = Number(
        optionAvailability.quantityAvailable || 0,
      );

      if (quantityNeeded > quantityAvailable) {
        conflicts.push({
          inventoryItemId: row.inventoryItemId,
          optionName: row.optionName,
          quantityNeeded,
          quantityAvailable,
        });
      }
    }

    return conflicts;
  }, [
    availabilityByProductId,
    selectedInventoryDemandByItemId,
    selectedModifierRows,
  ]);

  const subtotal = productSubtotal + modifiersSubtotal;

  const minimumDeposit = useMemo(() => {
    return Number(
      selectedProducts
        .reduce((sum, item) => {
          const product = getProduct(item.productId);
          const perUnit = Number(product?.deposit_amount || 0);
          return sum + perUnit * item.quantity;
        }, 0)
        .toFixed(2)
    );
  }, [selectedProducts, products]);

  const safeDiscountAmount = Number(
    Math.max(0, Math.min(discountAuthorized ? discountAmount : 0, subtotal)).toFixed(2)
  );
  const taxableSubtotal = Number((subtotal - safeDiscountAmount).toFixed(2));
  const taxAmount = Number(
    ((taxableSubtotal + deliveryFee) * (taxRate / 100)).toFixed(2)
  );
  const totalAmount = Number((taxableSubtotal + deliveryFee + taxAmount).toFixed(2));
  const balanceDue = Number((totalAmount - depositAmount).toFixed(2));

  useEffect(() => {
    if (depositWasEdited) {
      return;
    }

    setDepositAmount(minimumDeposit);
  }, [depositWasEdited, minimumDeposit]);

  useEffect(() => {
    if (!paymentModalOpen) {
      return;
    }

    setPaymentAmount(depositAmount);
    const initialTipMode = tipSettings.tipMode === "amount" ? "amount" : "percent";

    setTipMode(initialTipMode);
    setTipPercent(0);
    setTipAmount(0);
    setTipAmountEdited(false);
    setPaymentError(null);

    if (!paymentMethod && paymentMethods.length > 0) {
      setPaymentMethod(paymentMethods[0].method);
    }
  }, [
    customerName,
    customers,
    depositAmount,
    existingCustomerId,
    paymentMethod,
    paymentMethods,
    paymentModalOpen,
    tipSettings.defaultTipAmount,
    tipSettings.defaultTipPercent,
    tipSettings.tipMode,
    tipSettings.tipsEnabled,
  ]);

  useEffect(() => {
    if (!contractModalOpen) {
      return;
    }

    setPaymentError(null);
    setContractAccepted(false);

    if (!contractSignerName) {
      setContractSignerName(
        customerName ||
          selectedCustomer?.full_name ||
          ""
      );
    }

    setContractSignatureDataUrl("");

    clearAndPaintSignatureCanvas();
  }, [contractModalOpen]);

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

  useEffect(() => {
    if (!contractModalOpen || !contractSignatureDataUrl) {
      return;
    }

    const prepared = prepareSignatureCanvas();

    if (!prepared) {
      return;
    }

    const { context, width, height } = prepared;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    const image = new Image();
    image.onload = () => {
      context.drawImage(image, 0, 0, width, height);
    };
    image.src = contractSignatureDataUrl;
  }, [contractModalOpen, contractSignatureDataUrl]);

  useEffect(() => {
    setContractManualSignature(contractSignerName);
  }, [contractSignerName]);

  useEffect(() => {
    if (
      !paymentModalOpen ||
      !tipSettings.tipsEnabled ||
      tipAmountEdited ||
      tipMode !== "percent"
    ) {
      return;
    }

    const nextTip = Number(((paymentAmount * tipPercent) / 100).toFixed(2));
    setTipAmount(nextTip);
  }, [
    paymentAmount,
    paymentModalOpen,
    tipAmountEdited,
    tipMode,
    tipPercent,
    tipSettings.tipsEnabled,
  ]);

  function resetAvailability() {
    setAvailabilityByProductId({});
  }

  function resetPricing() {
    setPricingResult(null);
    setTaxRate(0);
    setDeliveryFee(0);
  }

  function updateEventDate(value: string) {
    setEventDate(value);
    resetAvailability();
  }

  function updateEventStartTime(value: string) {
    setEventStartTime(value);
    resetAvailability();
  }

  function updateEventEndTime(value: string) {
    setEventEndTime(value);
    resetAvailability();
  }

  function updateSetupAddress(value: string) {
    setSetupAddress(value);
    resetPricing();
  }

  function updateSetupCity(value: string) {
    setSetupCity(value);
    resetPricing();
  }

  function updateSetupZip(value: string) {
    setSetupZip(value);
    resetPricing();
  }

  function getProduct(productId: string) {
    return products.find((product) => product.id === productId);
  }

  function getGroupsForProduct(productId: string) {
    return modifierGroups
      .filter((group) => group.productId === productId && group.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function addProduct(product: Product) {
    const exists = selectedProducts.find(
      (item) => item.productId === product.id
    );

    if (exists) {
      setSelectedProducts((current) =>
        current.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        )
      );

      resetPricing();
      return;
    }

    setSelectedProducts((current) => [
      ...current,
      {
        productId: product.id,
        quantity: 1,
        unitPrice: getProductPrice(product),
        notes: "",
      },
    ]);

    resetPricing();
  }

  function removeProduct(productId: string) {
    setSelectedProducts((current) =>
      current.filter((item) => item.productId !== productId)
    );

    setSelectedModifierOptions((current) => {
      const copy = { ...current };

      for (const key of Object.keys(copy)) {
        if (key.startsWith(`${productId}:`)) {
          delete copy[key];
        }
      }

      return copy;
    });

    setSelectedModifierQuantities((current) => {
      const copy = { ...current };

      for (const key of Object.keys(copy)) {
        if (key.startsWith(`${productId}:`)) {
          delete copy[key];
        }
      }

      return copy;
    });

    resetPricing();
  }

  function updateSelectedProduct(
    productId: string,
    patch: Partial<SelectedProduct>
  ) {
    setSelectedProducts((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, ...patch } : item
      )
    );

    setAvailabilityByProductId((current) => {
      const copy = { ...current };
      delete copy[productId];
      return copy;
    });

    resetPricing();
  }

  function chooseSingleModifierOption({
    productId,
    groupId,
    optionId,
  }: {
    productId: string;
    groupId: string;
    optionId: string;
  }) {
    const key = modifierKey(productId, groupId);

    setSelectedModifierOptions((current) => ({
      ...current,
      [key]: [optionId],
    }));
    setSelectedModifierQuantities((current) => ({
      ...current,
      [key]: { [optionId]: 1 },
    }));

    resetPricing();
  }

  function toggleMultipleModifierOption({
    productId,
    groupId,
    optionId,
  }: {
    productId: string;
    groupId: string;
    optionId: string;
  }) {
    const key = modifierKey(productId, groupId);

    setSelectedModifierOptions((current) => {
      const existing = current[key] || [];
      const isSelected = existing.includes(optionId);
      const selected = isSelected
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId];

      setSelectedModifierQuantities((currentQuantities) => {
        const groupQuantities = { ...(currentQuantities[key] || {}) };

        if (isSelected) {
          delete groupQuantities[optionId];
        } else {
          groupQuantities[optionId] = 1;
        }

        return {
          ...currentQuantities,
          [key]: groupQuantities,
        };
      });

      return {
        ...current,
        [key]: selected,
      };
    });

    resetPricing();
  }

  function setMultipleModifierQuantity({
    productId,
    groupId,
    optionId,
    quantity,
  }: {
    productId: string;
    groupId: string;
    optionId: string;
    quantity: number;
  }) {
    const key = modifierKey(productId, groupId);
    const safeQuantity = Math.max(0, Math.floor(quantity));

    setSelectedModifierOptions((current) => {
      const existing = current[key] || [];
      const selected = safeQuantity > 0
        ? Array.from(new Set([...existing, optionId]))
        : existing.filter((id) => id !== optionId);

      return { ...current, [key]: selected };
    });

    setSelectedModifierQuantities((current) => {
      const groupQuantities = { ...(current[key] || {}) };

      if (safeQuantity > 0) {
        groupQuantities[optionId] = safeQuantity;
      } else {
        delete groupQuantities[optionId];
      }

      return { ...current, [key]: groupQuantities };
    });

    resetPricing();
  }

  function getOptionGroupIndex(productId: string, groupsCount: number) {
    const index = optionGroupIndexByProduct[productId] || 0;
    return Math.max(0, Math.min(index, Math.max(0, groupsCount - 1)));
  }

  function setOptionGroupIndex(productId: string, nextIndex: number, groupsCount: number) {
    const safe = Math.max(0, Math.min(nextIndex, Math.max(0, groupsCount - 1)));

    setOptionGroupIndexByProduct((current) => ({
      ...current,
      [productId]: safe,
    }));
  }

  async function checkProductAvailability(product: Product, quantity = 1) {
    const requestDate = eventDate;
    const requestStartTime = eventStartTime;
    const requestEndTime = eventEndTime;
    const requestBookingActor = bookingActor;
    const requestId = ++availabilityRequestCounterRef.current;

    latestAvailabilityRequestByProductRef.current[product.id] = requestId;

    if (!eventDate) {
      setAvailabilityByProductId((current) => ({
        ...current,
        [product.id]: {
          checked: true,
          loading: false,
          available: false,
          productAvailable: false,
          message: "Choose event date before checking inventory.",
          components: [],
          missingComponents: [],
          modifierAvailability: [],
        },
      }));

      return null;
    }

    if (!eventStartTime || !eventEndTime) {
      setAvailabilityByProductId((current) => ({
        ...current,
        [product.id]: {
          checked: true,
          loading: false,
          available: false,
          productAvailable: false,
          message: "Choose start and end time before checking inventory.",
          components: [],
          missingComponents: [],
          modifierAvailability: [],
        },
      }));

      return null;
    }

    setAvailabilityByProductId((current) => ({
      ...current,
      [product.id]: {
        checked: true,
        loading: true,
        available: null,
        productAvailable: null,
        message: "Checking inventory...",
        components: [],
        missingComponents: [],
        modifierAvailability: [],
      },
    }));

    try {
      const formData = new FormData();

      formData.set("productId", product.id);
      formData.set("quantity", String(quantity || 1));
      formData.set("eventDate", requestDate);
      formData.set("eventStartTime", requestStartTime || "");
      formData.set("eventEndTime", requestEndTime || "");
      formData.set("bookingActor", requestBookingActor);

      const productModifierOptions = modifierGroups
        .filter(
          (group) =>
            group.productId === product.id &&
            group.active !== false,
        )
        .flatMap((group) =>
          group.options
            .filter((option) => option.active !== false)
            .map((option) => ({
              optionId: option.id,
              optionName: option.name,
              inventoryItemId: option.inventoryItemId || "",
              inventoryQuantity: Number(option.inventoryQuantity || 0),
              trackInventory: option.trackInventory !== false,
            })),
        );

      formData.set("modifierCount", String(productModifierOptions.length));

      productModifierOptions.forEach((option, index) => {
        formData.set(`modifierOptionId_${index}`, option.optionId);
        formData.set(`modifierOptionName_${index}`, option.optionName);
        formData.set(
          `modifierInventoryItemId_${index}`,
          option.inventoryItemId,
        );
        formData.set(
          `modifierInventoryQuantity_${index}`,
          String(option.inventoryQuantity),
        );
        formData.set(
          `modifierTrackInventory_${index}`,
          option.trackInventory ? "true" : "false",
        );
      });

      const result = await checkBookingItemAvailabilityAction(formData);

      const state: ProductAvailabilityState = {
        checked: true,
        loading: false,
        available: Boolean(result.available),
        productAvailable:
          result.productAvailable === undefined
            ? Boolean(result.available)
            : Boolean(result.productAvailable),
        message: result.message || null,
        components: result.components || [],
        missingComponents: result.missingComponents || [],
        modifierAvailability: result.modifierAvailability || [],
      };

      if (latestAvailabilityRequestByProductRef.current[product.id] !== requestId) {
        return state;
      }

      setAvailabilityByProductId((current) => ({
        ...current,
        [product.id]: state,
      }));

      return state;
    } catch (error: any) {
      const state: ProductAvailabilityState = {
        checked: true,
        loading: false,
        available: false,
        productAvailable: false,
        message: error?.message || "Availability check failed.",
        components: [],
        missingComponents: [],
        modifierAvailability: [],
      };

      if (latestAvailabilityRequestByProductRef.current[product.id] !== requestId) {
        return state;
      }

      setAvailabilityByProductId((current) => ({
        ...current,
        [product.id]: state,
      }));

      return state;
    }
  }

  async function addProductWithAvailability(product: Product) {
    const existing = selectedProducts.find(
      (item) => item.productId === product.id,
    );

    // A selected catalog card is not an implicit +1 button.
    // This prevents accidental double taps from checking quantity 2 and
    // overwriting the valid availability state for the already-selected item.
    if (existing) {
      return;
    }

    const state = await checkProductAvailability(product, 1);

    if (!state?.available) {
      return;
    }

    addProduct(product);
  }

  async function changeSelectedProductQuantity(
    productId: string,
    nextQuantityRaw: number,
  ) {
    const product = getProduct(productId);
    const selectedProduct = selectedProducts.find(
      (item) => item.productId === productId,
    );

    if (!product || !selectedProduct) {
      return;
    }

    const nextQuantity = Math.max(
      0,
      Math.floor(Number(nextQuantityRaw || 0)),
    );

    if (nextQuantity <= 0) {
      removeProduct(productId);
      return;
    }

    if (nextQuantity === selectedProduct.quantity) {
      return;
    }

    const currentAvailability = availabilityByProductId[productId];
    const state = await checkProductAvailability(product, nextQuantity);

    if (!state?.available) {
      // The larger quantity is unavailable. Keep the quantity that is actually
      // in the cart and restore its previous valid availability state.
      if (currentAvailability) {
        setAvailabilityByProductId((current) => ({
          ...current,
          [productId]: currentAvailability,
        }));
      } else {
        await checkProductAvailability(product, selectedProduct.quantity);
      }

      return;
    }

    updateSelectedProduct(productId, {
      quantity: nextQuantity,
    });
  }

  async function checkSelectedProductAvailability(productId: string) {
    const product = getProduct(productId);
    const selectedProduct = selectedProducts.find(
      (item) => item.productId === productId
    );

    if (!product || !selectedProduct) return;

    await checkProductAvailability(product, selectedProduct.quantity);
  }

  async function checkAllSelectedAvailability() {
    for (const item of selectedProducts) {
      const product = getProduct(item.productId);
      if (!product) continue;

      await checkProductAvailability(product, item.quantity);
    }
  }

  /*
   * Live-check selected product quantities.
   *
   * The server remains the final protection, but the customer/cashier sees
   * inventory conflicts immediately after changing Qty instead of only at
   * the final Create booking action.
   */
  useEffect(() => {
    setAvailabilityByProductId({});
  }, [eventDate, eventStartTime, eventEndTime, bookingActor]);

  useEffect(() => {
    if (
      selectedProducts.length === 0 ||
      !eventDate ||
      !eventStartTime ||
      !eventEndTime
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      for (const item of selectedProducts) {
        const product = getProduct(item.productId);

        if (!product) {
          continue;
        }

        void checkProductAvailability(product, item.quantity);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    bookingActor,
    eventDate,
    eventEndTime,
    eventStartTime,
    selectedProducts,
  ]);

  /*
   * Do not auto-check every catalog product when the Products step opens.
   *
   * A large catalog previously generated one server request per product and
   * blocked practical use of the page for several minutes. Availability is
   * still checked before a product is added, and selected products continue
   * to be re-checked automatically after date, time, actor, or quantity changes.
   */

  async function calculatePricing() {
    const cleanAddress = setupAddress.trim();
    const cleanCity = setupCity.trim();
    const cleanZip = setupZip.trim();

    if (!cleanAddress || !cleanCity || !cleanZip || subtotal <= 0) {
      setPricingResult(null);
      setTaxRate(0);
      setDeliveryFee(0);
      return;
    }

    const requestId = pricingRequestIdRef.current + 1;
    pricingRequestIdRef.current = requestId;

    setPricingLoading(true);

    try {
      const formData = new FormData();

      formData.set("setupAddress", cleanAddress);
      formData.set("setupCity", cleanCity);
      formData.set("setupState", setupState || "CA");
      formData.set("setupZip", cleanZip);
      formData.set("subtotal", String(subtotal));
      formData.set("depositAmount", String(depositAmount));

      const result = await calculateBookingPricingAction(formData);

      if (pricingRequestIdRef.current !== requestId) {
        return;
      }

      setPricingResult(result);
      setDeliveryFee(Number(result.deliveryFee || 0));
      setTaxRate(Number(result.taxRate || 0));
    } catch (error: any) {
      if (pricingRequestIdRef.current !== requestId) {
        return;
      }

      setPricingResult({
        ok: false,
        subtotal,
        deliveryFee: 0,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: subtotal,
        depositAmount,
        balanceDue: subtotal - depositAmount,
        distanceMiles: null,
        deliveryMode: "per_mile",
        matchedZoneName: null,
        deliveryReason: "",
        deliveryError: error?.message || "Pricing calculation failed.",
        taxError: error?.message || "Pricing calculation failed.",
      });
    } finally {
      if (pricingRequestIdRef.current === requestId) {
        setPricingLoading(false);
      }
    }
  }

  useEffect(() => {
    const cleanAddress = setupAddress.trim();
    const cleanCity = setupCity.trim();
    const cleanZip = setupZip.trim();

    pricingRequestIdRef.current += 1;
    setPricingResult(null);

    if (!cleanAddress || !cleanCity || !cleanZip || subtotal <= 0) {
      setPricingLoading(false);
      setTaxRate(0);
      setDeliveryFee(0);
      return;
    }

    setPricingLoading(true);

    const timer = window.setTimeout(() => {
      void calculatePricing();
    }, 700);

    return () => window.clearTimeout(timer);
  }, [
    step,
    setupAddress,
    setupCity,
    setupState,
    setupZip,
    subtotal,
    depositAmount,
  ]);

  useEffect(() => {
    setSelectedModifierOptions((current) => {
      let changed = false;
      const next: Record<string, string[]> = {};

      for (const [key, optionIds] of Object.entries(current)) {
        const productId = key.split(":", 1)[0];
        const availability = availabilityByProductId[productId];

        if (!availability?.checked || availability.loading) {
          next[key] = optionIds;
          continue;
        }

        const filtered = optionIds.filter((optionId) => {
          const optionState = availability.modifierAvailability.find(
            (item) => item.optionId === optionId,
          );

          return optionState?.available === true;
        });

        if (filtered.length !== optionIds.length) {
          changed = true;
        }

        next[key] = filtered;
      }

      return changed ? next : current;
    });
  }, [availabilityByProductId]);

  const unavailableSelectedProducts = selectedProducts.filter((item) => {
    const state = availabilityByProductId[item.productId];
    return (
      state?.checked &&
      (state.productAvailable ?? state.available) === false
    );
  });

  const unavailableSelectedModifierRows = selectedModifierRows.filter((row) => {
    if (!row.trackInventory || !row.inventoryItemId) {
      return false;
    }

    const state = availabilityByProductId[row.productId];
    const optionAvailability = state?.modifierAvailability.find(
      (item) =>
        item.optionId === row.optionId ||
        item.inventoryItemId === row.inventoryItemId,
    );

    if (optionAvailability?.available !== true) {
      return true;
    }

    return cumulativeModifierInventoryConflicts.some(
      (conflict) => conflict.inventoryItemId === row.inventoryItemId,
    );
  });

  const uncheckedSelectedProducts = selectedProducts.filter((item) => {
    const state = availabilityByProductId[item.productId];
    return !state?.checked;
  });

  const missingRequiredModifierGroups = selectedProducts.flatMap(
    (selectedProduct) => {
      const product = getProduct(selectedProduct.productId);
      const groups = getGroupsForProduct(selectedProduct.productId);

      return groups
        .filter((group) => group.required)
        .filter((group) => {
          const key = modifierKey(selectedProduct.productId, group.id);
          return (selectedModifierOptions[key] || []).length === 0;
        })
        .map((group) => ({
          productId: selectedProduct.productId,
          productName: product?.name || "Product",
          groupId: group.id,
          groupName: group.name,
        }));
    }
  );

  const hasCustomer = Boolean(existingCustomerId || customerName.trim());
  const hasRequiredCustomerFields = Boolean(
    customerFirstName.trim() &&
      customerLastName.trim() &&
      customerPhone.trim() &&
      customerEmail.trim()
  );
  const hasEventDate = Boolean(eventDate);

  const workingWindow = useMemo(() => {
    return getWorkingWindowForDate({
      eventDate,
      workingHours,
      workingHourExceptions,
    });
  }, [eventDate, workingHourExceptions, workingHours]);

  const customerStartTimeOptions = useMemo(() => {
    if (!workingWindow.isOpen || !workingWindow.openTime || !workingWindow.closeTime) {
      return [] as string[];
    }

    return buildHalfHourSlots(
      timeToMinutes(workingWindow.openTime),
      timeToMinutes(workingWindow.closeTime) - 30
    );
  }, [workingWindow]);

  const allStartTimeOptions = useMemo(() => {
    return buildHalfHourSlots(0, 23 * 60);
  }, []);

  const startTimeOptions =
    bookingActor === "customer" ? customerStartTimeOptions : allStartTimeOptions;

  const endTimeOptions = useMemo(() => {
    if (!eventStartTime) {
      return [] as string[];
    }

    const fromMinutes = timeToMinutes(eventStartTime) + 30;

    if (bookingActor === "customer") {
      if (!workingWindow.closeTime) {
        return [] as string[];
      }

      return buildHalfHourSlots(fromMinutes, timeToMinutes(workingWindow.closeTime));
    }

    return buildHalfHourSlots(fromMinutes, 23 * 60 + 30);
  }, [bookingActor, eventStartTime, workingWindow]);

  useEffect(() => {
    if (!eventStartTime) {
      return;
    }

    if (!startTimeOptions.includes(eventStartTime)) {
      setEventStartTime(startTimeOptions[0] || "");
      setEventEndTime("");
      return;
    }

    if (eventEndTime && !endTimeOptions.includes(eventEndTime)) {
      setEventEndTime(endTimeOptions[0] || "");
    }
  }, [endTimeOptions, eventEndTime, eventStartTime, startTimeOptions]);

  useEffect(() => {
    if (eventStartTime || !startTimeOptions.length) {
      return;
    }

    setEventStartTime(startTimeOptions[0]);
  }, [eventStartTime, startTimeOptions]);

  const selectedProductsAreChecking = selectedProducts.some((item) => {
    return availabilityByProductId[item.productId]?.loading === true;
  });

  const pricingReady =
    !pricingLoading &&
    pricingResult?.ok === true &&
    !pricingResult.deliveryError &&
    !pricingResult.taxError;

  const canCreateBooking =
    hasCustomer &&
    hasRequiredCustomerFields &&
    hasEventDate &&
    Boolean(eventStartTime && eventEndTime) &&
    selectedProducts.length > 0 &&
    unavailableSelectedProducts.length === 0 &&
    unavailableSelectedModifierRows.length === 0 &&
    uncheckedSelectedProducts.length === 0 &&
    !selectedProductsAreChecking &&
    missingRequiredModifierGroups.length === 0 &&
    pricingReady;

  const signatureLabel = contractSettings.signature_label || "Client signature";

  const renderedContractHtml = useMemo(() => {
    const template =
      contractSettings.template_html ||
      "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>";

    const customer =
      customerName ||
      selectedCustomer?.full_name ||
      customerName ||
      "Customer";

    const signatureMarkup = contractSignatureDataUrl
      ? `<img src="${contractSignatureDataUrl}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`
      : contractManualSignature || "";

    const replacements: Record<string, string> = {
      customer_name: customer,
      customer_email:
        customerEmail ||
        selectedCustomer?.email ||
        customerEmail ||
        "",
      event_date: eventDate || "",
      event_start_time: eventStartTime || "",
      event_end_time: eventEndTime || "",
      setup_address: setupAddress || "",
      setup_city: setupCity || "",
      setup_state: setupState || "",
      setup_zip: setupZip || "",
      subtotal: money(subtotal),
      discount_amount: money(safeDiscountAmount),
      delivery_fee: money(deliveryFee),
      tax_amount: money(taxAmount),
      total_amount: money(totalAmount),
      deposit_amount: money(depositAmount),
      balance_due: money(balanceDue),
      signature_label: signatureLabel,
      signature_name: contractSignerName || "",
      signature_manual: signatureMarkup,
      signature_date: new Date().toISOString().slice(0, 10),
    };

    const renderedTemplate = template.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_, key) => {
        return replacements[key] ?? "";
      }
    );

    const productRows = selectedProducts
      .map((item) => {
        const product = getProduct(item.productId);
        return `<tr><td style="padding:6px 0;">${product?.name || "Product"} x ${item.quantity}</td><td style="padding:6px 0; text-align:right;">${money(item.quantity * item.unitPrice)}</td></tr>`;
      })
      .join("");

    const orderInfoBlock = `
      <section style="border:1px solid #e7ddd0; border-radius:14px; padding:16px; margin-bottom:16px; background:#fcfaf7;">
        <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#9a7a49; font-weight:700;">Order Summary</div>
        <div style="margin-top:8px; display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:13px; color:#4b4339;">
          <div><strong>Customer:</strong> ${replacements.customer_name}</div>
          <div><strong>Email:</strong> ${replacements.customer_email || "-"}</div>
          <div><strong>Event date:</strong> ${replacements.event_date}</div>
          <div><strong>Time:</strong> ${replacements.event_start_time} - ${replacements.event_end_time}</div>
          <div style="grid-column:1 / -1;"><strong>Address:</strong> ${replacements.setup_address}, ${replacements.setup_city} ${replacements.setup_zip}</div>
        </div>
        <table style="width:100%; margin-top:10px; border-collapse:collapse; font-size:13px; color:#3f382f;">
          <tbody>${productRows}</tbody>
        </table>
        <div style="margin-top:10px; border-top:1px solid #e7ddd0; padding-top:10px; display:grid; gap:4px; font-size:13px; color:#3f382f;">
          <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><strong>${replacements.subtotal}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Discount</span><strong>${replacements.discount_amount}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Delivery</span><strong>${replacements.delivery_fee}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Tax</span><strong>${replacements.tax_amount}</strong></div>
          <div style="display:flex; justify-content:space-between; font-size:15px;"><span>Total</span><strong>${replacements.total_amount}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Deposit</span><strong>${replacements.deposit_amount}</strong></div>
          <div style="display:flex; justify-content:space-between;"><span>Balance due</span><strong>${replacements.balance_due}</strong></div>
        </div>
      </section>
    `;

    return `${orderInfoBlock}${renderedTemplate}`;
  }, [
    balanceDue,
    contractSettings.template_html,
    contractSignerName,
    contractManualSignature,
    contractSignatureDataUrl,
    customerEmail,
    customerFirstName,
    customerLastName,
    customerName,
    customers,
    deliveryFee,
    depositAmount,
    eventDate,
    eventEndTime,
    eventStartTime,
    existingCustomerId,
    selectedCustomer,
    safeDiscountAmount,
    setupAddress,
    setupCity,
    setupState,
    setupZip,
    signatureLabel,
    selectedModifierRows,
    selectedProducts,
    subtotal,
    taxAmount,
    totalAmount,
  ]);

  async function openPaymentModal() {
    if (!pricingReady) {
      setPaymentError(
        pricingLoading
          ? "Please wait while delivery and sales tax are calculated."
          : pricingResult?.deliveryError ||
              pricingResult?.taxError ||
              "Delivery and sales tax must be calculated before payment.",
      );
      return;
    }

    if (!canCreateBooking) {
      return;
    }

    if (discountAmount < 0) {
      setPaymentError("Discount amount cannot be negative.");
      return;
    }

    if (safeDiscountAmount > subtotal) {
      setPaymentError("Discount cannot exceed products and options subtotal.");
      return;
    }

    if (discountSecurity.discount_password_enabled && safeDiscountAmount > 0) {
      if (!discountPassword) {
        setPaymentError("Enter discount password before payment.");
        return;
      }

      const verifyFormData = new FormData();
      verifyFormData.set("password", discountPassword);

      const result = await verifyDiscountPasswordAction(verifyFormData);

      if (!result.ok) {
        setPaymentError(result.message || "Invalid discount password.");
        return;
      }

      setDiscountAuthorized(true);
    }

    setPaymentError(null);

    if (contractSettings.require_contract_before_payment !== false) {
      setContractModalOpen(true);
      return;
    }

    setPaymentAmount(depositAmount);
    setPaymentModalOpen(true);
  }

  function confirmContractAndOpenPos() {
    if (!pricingReady) {
      setPaymentError(
        pricingLoading
          ? "Please wait while delivery and sales tax are calculated."
          : pricingResult?.deliveryError ||
              pricingResult?.taxError ||
              "Delivery and sales tax must be calculated before payment.",
      );
      return;
    }

    if (!contractAccepted) {
      setPaymentError("Client must accept contract before payment.");
      return;
    }

    const capturedSignature = captureSignatureDataUrlFromCanvas();
    const effectiveSignature = capturedSignature || contractSignatureDataUrl;

    if (!effectiveSignature) {
      setPaymentError("Draw manual signature before payment.");
      return;
    }

    if (capturedSignature && capturedSignature !== contractSignatureDataUrl) {
      setContractSignatureDataUrl(capturedSignature);
    }

    setPaymentError(null);
    setContractModalOpen(false);
    setPaymentAmount(depositAmount);
    setPaymentModalOpen(true);
  }

  async function confirmCreateBooking() {
    if (bookingSubmitStarted) {
      return;
    }

    if (!pricingReady) {
      setPaymentError(
        pricingLoading
          ? "Please wait while delivery and sales tax are calculated."
          : pricingResult?.deliveryError ||
              pricingResult?.taxError ||
              "Delivery and sales tax must be calculated before payment.",
      );
      return;
    }

    if (paymentAmount < 0) {
      setPaymentError("Payment amount cannot be negative.");
      return;
    }

    if (paymentAmount > 0 && !paymentMethod) {
      setPaymentError("Choose payment method.");
      return;
    }

    if (tipAmount < 0) {
      setPaymentError("Tip amount cannot be negative.");
      return;
    }

    if (discountAmount < 0) {
      setPaymentError("Discount amount cannot be negative.");
      return;
    }

    if (safeDiscountAmount > subtotal) {
      setPaymentError("Discount cannot exceed products and options subtotal.");
      return;
    }

    const form = formRef.current;

    if (!form) {
      setPaymentError("Booking form is not ready. Please try again.");
      return;
    }

    // Prevent a stuck pending state when browser validation blocks submission.
    if (!form.reportValidity()) {
      setPaymentError("Complete required fields before creating booking.");
      return;
    }

    setBookingSubmitStarted(true);
    setPaymentModalOpen(false);

    if (bookingSubmitTimeoutRef.current) {
      clearTimeout(bookingSubmitTimeoutRef.current);
    }

    bookingSubmitTimeoutRef.current = setTimeout(() => {
      setBookingSubmitStarted(false);
      setBookingSubmitError(
        "Booking request is taking longer than expected. Please try again."
      );
    }, 30000);

    form.requestSubmit();
  }

  function applyTipPercent(percent: number) {
    const safe = Number.isFinite(percent) ? percent : 0;
    setTipPercent(safe);
    setTipAmountEdited(false);
    setTipAmount(Number(((paymentAmount * safe) / 100).toFixed(2)));
  }

  function applyTipAmount(amount: number) {
    const safe = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    setTipAmount(Number(safe.toFixed(2)));
    setTipAmountEdited(false);

    if (paymentAmount > 0) {
      setTipPercent(Number(((safe / paymentAmount) * 100).toFixed(2)));
    } else {
      setTipPercent(0);
    }
  }

  async function authorizeDiscountPassword() {
    if (!discountPassword.trim()) {
      setDiscountAuthorized(false);
      setDiscountAuthMessage("Enter admin code first.");
      return;
    }

    setDiscountAuthLoading(true);
    setDiscountAuthMessage(null);

    try {
      const verifyFormData = new FormData();
      verifyFormData.set("password", discountPassword);

      const result = await verifyDiscountPasswordAction(verifyFormData);

      if (!result.ok) {
        setDiscountAuthorized(false);
        setDiscountAuthMessage(result.message || "Invalid discount password.");
        return;
      }

      setDiscountAuthorized(true);
      setDiscountAuthMessage("Code accepted. Enter discount amount.");
      setPaymentError(null);
    } catch (error: any) {
      setDiscountAuthorized(false);
      setDiscountAuthMessage(error?.message || "Failed to verify discount code.");
    } finally {
      setDiscountAuthLoading(false);
    }
  }

  function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    return { x, y };
  }

  function onSignaturePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    const point = getCanvasPoint(event);

    if (!canvas || !context || !point) {
      return;
    }

    signatureDrawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();
    setPaymentError(null);
  }

  function onSignaturePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!signatureDrawingRef.current) {
      return;
    }

    const context = signatureCanvasRef.current?.getContext("2d");
    const point = getCanvasPoint(event);

    if (!context || !point) {
      return;
    }

    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function finishSignatureDraw() {
    if (!signatureDrawingRef.current) {
      return;
    }

    signatureDrawingRef.current = false;
    const canvas = signatureCanvasRef.current;

    if (!canvas) {
      return;
    }

    const signatureData = captureSignatureDataUrlFromCanvas();
    setContractSignatureDataUrl(signatureData);
  }

  function clearSignatureCanvas() {
    clearAndPaintSignatureCanvas();
    setContractSignatureDataUrl("");
  }

  const totalChargeNow = Number((paymentAmount + (tipSettings.tipsEnabled ? tipAmount : 0)).toFixed(2));

  const stepIsValid: Record<number, boolean> = {
    1: hasRequiredCustomerFields,
    2: Boolean(
      eventDate &&
        eventStartTime &&
        eventEndTime &&
        setupAddress.trim() &&
        setupCity.trim() &&
        setupZip.trim()
    ),
    3: Boolean(
      selectedProducts.length > 0 &&
        unavailableSelectedProducts.length === 0 &&
        uncheckedSelectedProducts.length === 0 &&
        !selectedProductsAreChecking
    ),
    4: Boolean(
      selectedProducts.length > 0 &&
        missingRequiredModifierGroups.length === 0 &&
        unavailableSelectedModifierRows.length === 0
    ),
    5: canCreateBooking,
  };

  const steps = [
    { id: 1, title: "Customer", description: "Customer details" },
    { id: 2, title: "Date & Time", description: "Date, time & address" },
    { id: 3, title: "Products", description: "Rental items" },
    { id: 4, title: "Options", description: "Add-ons" },
    { id: 5, title: "Review", description: "Summary" },
  ];

  return (
    <form
      ref={formRef}
      action={createCustomerBookingAction}
      className="space-y-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:space-y-6 md:pb-0"
    >
      <input type="hidden" name="bookingAttemptId" value={bookingAttemptId} />
      <input type="hidden" name="existingCustomerId" value={existingCustomerId} />
      <input type="hidden" name="customerFirstName" value={customerFirstName} />
      <input type="hidden" name="customerLastName" value={customerLastName} />
      <input type="hidden" name="customerName" value={customerName} />
      <input type="hidden" name="customerPhone" value={customerPhone} />
      <input type="hidden" name="customerEmail" value={customerEmail} />

      <input type="hidden" name="eventDate" value={eventDate} />
      <input type="hidden" name="eventStartTime" value={eventStartTime} />
      <input type="hidden" name="eventEndTime" value={eventEndTime} />
      <input type="hidden" name="bookingActor" value={bookingActor} />

      <input type="hidden" name="setupAddress" value={setupAddress} />
      <input type="hidden" name="setupCity" value={setupCity} />
      <input type="hidden" name="setupState" value={setupState} />
      <input type="hidden" name="setupZip" value={setupZip} />
      <input type="hidden" name="status" value={status} />

      <input type="hidden" name="deliveryFee" value={deliveryFee} />
      <input type="hidden" name="taxRate" value={taxRate} />
      <input type="hidden" name="depositAmount" value={depositAmount} />
      <input type="hidden" name="paymentMethod" value={paymentMethod} />
      <input type="hidden" name="paymentAmount" value={paymentAmount} />
      <input type="hidden" name="tipMode" value={tipMode} />
      <input type="hidden" name="tipPercent" value={tipPercent} />
      <input type="hidden" name="tipAmount" value={tipSettings.tipsEnabled ? tipAmount : 0} />
      <input type="hidden" name="discountAmount" value={safeDiscountAmount} />
      <input type="hidden" name="discountAuthorized" value={discountAuthorized ? "true" : "false"} />
      <input type="hidden" name="discountPassword" value={discountPassword} />
      <input type="hidden" name="contractAccepted" value={contractAccepted ? "yes" : "no"} />
      <input type="hidden" name="contractSignerName" value={contractSignerName} />
      <input type="hidden" name="contractManualSignature" value={contractManualSignature} />
      <input type="hidden" name="contractSignatureDataUrl" value={contractSignatureDataUrl} />
      <input type="hidden" name="contractRenderedHtml" value={renderedContractHtml} />
      <input type="hidden" name="paymentReference" value={paymentReference} />
      <input type="hidden" name="notes" value={notes} />

      {selectedProducts.map((item, index) => (
        <div key={item.productId}>
          <input type="hidden" name={`productId_${index}`} value={item.productId} />
          <input type="hidden" name={`quantity_${index}`} value={item.quantity} />
          <input type="hidden" name={`unitPrice_${index}`} value={item.unitPrice} />
          <input type="hidden" name={`lineNotes_${index}`} value={item.notes} />
        </div>
      ))}

      {selectedModifierRows.map((item, index) => (
        <div key={`${item.productId}-${item.groupId}-${item.optionId}`}>
          <input type="hidden" name={`modifierProductId_${index}`} value={item.productId} />
          <input type="hidden" name={`modifierGroupId_${index}`} value={item.groupId} />
          <input type="hidden" name={`modifierGroupName_${index}`} value={item.groupName} />
          <input type="hidden" name={`modifierOptionId_${index}`} value={item.optionId} />
          <input type="hidden" name={`modifierOptionName_${index}`} value={item.optionName} />
          <input type="hidden" name={`modifierPriceDelta_${index}`} value={item.priceDelta} />
          <input type="hidden" name={`modifierQuantity_${index}`} value={item.quantity} />
          <input
            type="hidden"
            name={`modifierInventoryItemId_${index}`}
            value={item.inventoryItemId || ""}
          />
          <input
            type="hidden"
            name={`modifierInventoryQuantity_${index}`}
            value={item.inventoryQuantity}
          />
          <input
            type="hidden"
            name={`modifierTrackInventory_${index}`}
            value={item.trackInventory ? "true" : "false"}
          />
        </div>
      ))}

      <section className="hidden rounded-[30px] border border-black/5 bg-white p-4 shadow-[0_10px_35px_rgba(0,0,0,0.035)] md:block">
        <div className="grid gap-3 md:grid-cols-5">
          {steps.map((item) => {
            const active = step === item.id;
            const valid = stepIsValid[item.id];

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setStep(item.id)}
                className={[
                  "rounded-[22px] border px-4 py-4 text-left transition",
                  active
                    ? "border-[#23313f] bg-[#23313f] text-white"
                    : valid
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                      active
                        ? "bg-white text-[#23313f]"
                        : valid
                          ? "bg-emerald-600 text-white"
                          : "bg-red-600 text-white",
                    ].join(" ")}
                  >
                    {valid ? "✓" : "!"}
                  </span>

                  <div>
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div
                      className={[
                        "mt-0.5 text-xs",
                        active ? "text-white/65" : "text-current/60",
                      ].join(" ")}
                    >
                      {item.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sticky top-0 z-30 -mx-1 rounded-[22px] border border-black/5 bg-[#f7f2ea]/95 px-4 py-3 shadow-sm backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
              Step {step} of {steps.length}
            </div>

            <div className="mt-0.5 truncate text-base font-semibold text-[#1f1e1b]">
              {steps.find((item) => item.id === step)?.title || "Booking"}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {steps.map((item) => {
              const active = item.id === step;
              const complete = item.id < step && stepIsValid[item.id];

              return (
                <button
                  key={`mobile-step-${item.id}`}
                  type="button"
                  onClick={() => {
                    if (item.id <= step || stepIsValid[item.id - 1]) {
                      setStep(item.id);
                    }
                  }}
                  aria-label={`Go to ${item.title}`}
                  className={[
                    "h-2.5 rounded-full transition-all",
                    active
                      ? "w-7 bg-[#23313f]"
                      : complete
                        ? "w-2.5 bg-emerald-500"
                        : "w-2.5 bg-[#d8cec0]",
                  ].join(" ")}
                />
              );
            })}
          </div>
        </div>
      </section>

      {bookingSubmitError ? (
        <section className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          <div className="font-semibold">Could not create booking</div>
          <div className="mt-1">{bookingSubmitError}</div>
        </section>
      ) : null}

      {step === 1 && (
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">Customer</h3>
            <p className="mt-1 text-sm text-[#6c6258]">
              Search for an existing customer or enter a new customer.
            </p>
          </div>

          <div className="space-y-5 p-6">
            <div>
              <Field label="Search existing customers">
                <Input
                  value={customerSearch}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value);

                    if (existingCustomerId) {
                      setExistingCustomerId("");
                    }
                  }}
                  placeholder="Search by name, phone, or email..."
                  autoComplete="off"
                />
              </Field>

              <div className="mt-3 max-h-72 overflow-y-auto rounded-[22px] border border-[#eee5d9] bg-[#fcfaf7]">
                <button
                  type="button"
                  onClick={startNewCustomer}
                  className={[
                    "flex w-full items-center justify-between gap-4 border-b border-[#eee5d9] px-4 py-3 text-left transition hover:bg-white",
                    existingCustomerId === "" ? "bg-[#fff8eb]" : "",
                  ].join(" ")}
                >
                  <div>
                    <div className="font-semibold text-[#1f1e1b]">
                      Create new customer
                    </div>
                    <div className="mt-1 text-xs text-[#6c6258]">
                      Enter the customer details below.
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#9a723e] ring-1 ring-[#eee5d9]">
                    New
                  </span>
                </button>

                {filteredCustomers.map((customer) => {
                  const selected = existingCustomerId === customer.id;

                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectExistingCustomer(customer)}
                      className={[
                        "flex w-full items-center justify-between gap-4 border-b border-[#eee5d9] px-4 py-3 text-left transition last:border-b-0 hover:bg-white",
                        selected ? "bg-emerald-50" : "",
                      ].join(" ")}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[#1f1e1b]">
                          {customer.full_name || "Unnamed customer"}
                        </div>
                        <div className="mt-1 truncate text-xs text-[#6c6258]">
                          {[customer.phone, customer.email]
                            .filter(Boolean)
                            .join(" · ") || "No phone or email"}
                        </div>
                      </div>

                      {selected && (
                        <span className="shrink-0 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                          Selected
                        </span>
                      )}
                    </button>
                  );
                })}

                {filteredCustomers.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-[#6c6258]">
                    No customers found.
                  </div>
                )}
              </div>
            </div>

            {selectedCustomer && (
              <div className="rounded-[22px] bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
                Existing customer selected. You can update the details below for
                this booking.
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="First name">
                <Input
                  value={customerFirstName}
                  onChange={(event) => setCustomerFirstName(event.target.value)}
                  placeholder="Kristina"
                  required
                />
              </Field>

              <Field label="Last name">
                <Input
                  value={customerLastName}
                  onChange={(event) => setCustomerLastName(event.target.value)}
                  placeholder="Netchaeva"
                  required
                />
              </Field>

              <Field label="Phone">
                <Input
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="323-555-0000"
                  required
                />
              </Field>

              <Field label="Email">
                <Input
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  type="email"
                  placeholder="client@email.com"
                  required
                />
              </Field>
            </div>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-[24px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)] md:rounded-[30px]">
          <div className="border-b border-[#eee5d9] px-4 py-4 md:px-6 md:py-5">
            <h3 className="text-lg font-semibold text-[#1f1e1b] md:text-xl">
              Date, time & location
            </h3>

            <p className="mt-1 hidden text-sm text-[#6c6258] md:block">
              The address is used to calculate delivery and sales tax automatically.
            </p>
          </div>

          <div className="space-y-3 p-4 md:space-y-4 md:p-6">
            {/* Row 1: Event date + Booking mode */}
            <div className="grid gap-3 md:grid-cols-2 md:gap-4">
              <Field label="Event date">
                <Input
                  value={eventDate}
                  onChange={(event) => updateEventDate(event.target.value)}
                  type="date"
                  required
                />
              </Field>

              {hideBookingActorSwitcher ? (
                <input type="hidden" name="bookingActor" value={bookingActor} />
              ) : (
                <Field label="Booking mode">
                  <Select
                    value={bookingActor}
                    onChange={(event) => {
                      setBookingActor(event.target.value as BookingActor);
                      resetAvailability();
                    }}
                  >
                    <option value="cashier">Cashier / Admin</option>
                    <option value="customer">Customer</option>
                  </Select>
                </Field>
              )}
            </div>

            {/* Row 2: Start time + End time */}
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <Field label="Start time">
                <Select
                  value={eventStartTime}
                  onChange={(event) => updateEventStartTime(event.target.value)}
                >
                  <option value="">Select start time</option>
                  {startTimeOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatTimeLabel(option, timeFormat)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="End time">
                <Select
                  value={eventEndTime}
                  onChange={(event) => updateEventEndTime(event.target.value)}
                >
                  <option value="">Select end time</option>
                  {endTimeOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatTimeLabel(option, timeFormat)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* Row 3: Setup address */}
            <Field label="Setup address">
              <GoogleAddressInput
                apiKey={googleMapsApiKey}
                value={setupAddress}
                onChange={updateSetupAddress}
                onResolved={(parts) => {
                  if (parts.addressLine) {
                    updateSetupAddress(parts.addressLine);
                  }

                  if (parts.city) {
                    updateSetupCity(parts.city);
                  }

                  if (parts.state) {
                    setSetupState(parts.state);
                  }

                  if (parts.zip) {
                    updateSetupZip(parts.zip);
                  }
                }}
                placeholder="331 El Bonito Ave"
                className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3.5 text-base outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] md:py-3 md:text-sm"
              />
            </Field>

            {/* Row 4: City + ZIP + State */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
              <div className="col-span-2 md:col-span-1">
              <Field label="City">
                <Input
                  value={setupCity}
                  onChange={(event) => updateSetupCity(event.target.value)}
                  placeholder="Glendale"
                />
              </Field>
              </div>

              <Field label="ZIP">
                <Input
                  value={setupZip}
                  onChange={(event) => updateSetupZip(event.target.value)}
                  placeholder="91204"
                />
              </Field>

              <Field label="State">
                <Input
                  value={setupState}
                  onChange={(event) => setSetupState(event.target.value)}
                />
              </Field>
            </div>

            {bookingActor !== "customer" ? (
              <Field label="Status">
                <Select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="quote">Quote</option>
                  <option value="pending_deposit">Pending deposit</option>
                  <option value="booked">Booked</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="inventory_reserved">Inventory reserved</option>
                  <option value="out_for_delivery">Out for delivery</option>
                  <option value="installed">Installed</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </Field>
            ) : null}
          </div>

          {!eventDate && (
            <div className="border-t border-[#eee5d9] bg-[#fff8eb] px-4 py-3 text-xs font-semibold text-[#8a6b20] md:px-6 md:py-4 md:text-sm">
              Select the event date before checking inventory.
            </div>
          )}

          {eventDate && bookingActor === "customer" && !workingWindow.isOpen && (
            <div className="border-t border-[#eee5d9] bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 md:px-6 md:py-4 md:text-sm">
              Customer bookings are not available on the selected date.
            </div>
          )}

          {eventDate &&
            bookingActor === "customer" &&
            workingWindow.isOpen &&
            workingWindow.openTime &&
            workingWindow.closeTime && (
              <div className="border-t border-[#eee5d9] bg-[#eaf2f9] px-4 py-3 text-xs font-semibold text-[#355879] md:px-6 md:py-4 md:text-sm">
                Available {formatTimeLabel(
                  workingWindow.openTime,
                  timeFormat
                )} – {formatTimeLabel(workingWindow.closeTime, timeFormat)}
              </div>
            )}
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <main className="rounded-[24px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)] md:rounded-[30px]">
            <div className="border-b border-[#eee5d9] px-4 py-4 md:px-6 md:py-5">
              <h3 className="text-lg font-semibold text-[#1f1e1b] md:text-xl">
                Choose your rental
              </h3>

              <p className="mt-1 hidden text-sm text-[#6c6258] md:block">
                Select a product. The system will check inventory for the selected
                date and time before adding it.
              </p>
            </div>

            <div className="border-b border-[#eee5d9] p-4 md:p-6">
              <div className="grid gap-3 md:grid-cols-[260px_1fr] md:gap-4">
                <Field label="Category">
                  <Select
                    value={selectedCategoryId}
                    onChange={(event) => setSelectedCategoryId(event.target.value)}
                  >
                    <option value="all">All products</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Search">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search product..."
                  />
                </Field>
              </div>
            </div>

            {selectedProducts.length > 0 && (
              <div className="border-b border-[#eee5d9] bg-[#fffdf9] p-3 xl:hidden">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a723e]">
                      Selected rentals
                    </div>
                    <div className="mt-0.5 text-xs text-[#6c6258]">
                      {selectedProducts.length} item
                      {selectedProducts.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  <div className="text-sm font-semibold text-[#1f1e1b]">
                    {money(productSubtotal)}
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedProducts.map((item) => {
                    const product = getProduct(item.productId);
                    const state = availabilityByProductId[item.productId];
                    const available =
                      state?.checked &&
                      !state.loading &&
                      (state.productAvailable ?? state.available) !== false;

                    return (
                      <div
                        key={`mobile-selected-${item.productId}`}
                        className="rounded-[16px] border border-[#eadfcf] bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[#1f1e1b]">
                              {product?.name || "Product"}
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-[#9a723e]">
                                {money(item.unitPrice * item.quantity)}
                              </span>

                              {state?.loading ? (
                                <span className="text-[11px] font-semibold text-blue-700">
                                  Checking…
                                </span>
                              ) : available ? (
                                <span className="text-[11px] font-semibold text-emerald-700">
                                  Available
                                </span>
                              ) : (
                                <span className="text-[11px] font-semibold text-red-700">
                                  Unavailable
                                </span>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeProduct(item.productId)}
                            className="shrink-0 text-xs font-semibold text-red-700"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-[#6c6258]">
                            Quantity
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void changeSelectedProductQuantity(
                                  item.productId,
                                  item.quantity - 1,
                                )
                              }
                              disabled={state?.loading}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8cec0] bg-white text-lg font-semibold text-[#23313f] disabled:opacity-40"
                              aria-label={`Decrease ${product?.name || "product"} quantity`}
                            >
                              −
                            </button>

                            <span className="min-w-8 text-center text-sm font-semibold text-[#1f1e1b]">
                              {item.quantity}
                            </span>

                            <button
                              type="button"
                              onClick={() =>
                                void changeSelectedProductQuantity(
                                  item.productId,
                                  item.quantity + 1,
                                )
                              }
                              disabled={state?.loading}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-[#d8cec0] bg-white text-lg font-semibold text-[#23313f] disabled:opacity-40"
                              aria-label={`Increase ${product?.name || "product"} quantity`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid gap-3 p-3 sm:grid-cols-2 md:gap-4 md:p-6 2xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const selected = selectedProductIds.includes(product.id);
                const price = getProductPrice(product);
                const availabilityState = availabilityByProductId[product.id];
                const badge = getAvailabilityBadge(availabilityState);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProductWithAvailability(product)}
                    disabled={availabilityState?.loading}
                    className={[
                      "group overflow-hidden rounded-[20px] border text-left transition active:scale-[0.99] md:rounded-[26px] md:hover:-translate-y-0.5 md:hover:shadow-[0_16px_35px_rgba(0,0,0,0.08)] disabled:cursor-wait disabled:opacity-70",
                      selected
                        ? "border-[#c9964f] bg-[#fff8eb] ring-2 ring-[#c9964f]/30"
                        : (availabilityState?.productAvailable ??
                            availabilityState?.available) === false
                          ? "border-red-200 bg-red-50"
                          : "border-[#eee5d9] bg-[#fcfaf7]",
                    ].join(" ")}
                  >
                    <div className="aspect-[4/3] bg-[#efe7dc]">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm font-semibold text-[#9a7a49]">
                          No image
                        </div>
                      )}
                    </div>

                    <div className="p-3 md:p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-[15px] font-semibold leading-5 text-[#1f1e1b] md:min-h-[44px] md:text-base">
                            {product.name}
                          </div>

                          <div className="mt-1 text-sm font-semibold text-[#9a723e] md:hidden">
                            {money(price)}
                          </div>
                        </div>

                        {selected && (
                          <span className="shrink-0 rounded-full bg-[#c9964f] px-2.5 py-1 text-[11px] font-semibold text-white">
                            Selected
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 md:mt-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold md:px-3 md:text-xs ${badge.className}`}
                        >
                          {availabilityState?.loading ? "Checking..." : badge.label}
                        </span>

                        {!selected && (
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6c6258] ring-1 ring-[#eee5d9] md:hidden">
                            Tap to select
                          </span>
                        )}
                      </div>

                      <div className="mt-2 hidden min-h-[84px] whitespace-pre-line text-sm leading-5 text-[#6c6258] line-clamp-4 md:block">
                        {product.short_description || "No short description"}
                      </div>

                      <div className="mt-2 hidden text-xs text-[#6c6258] md:block">
                        {product.category_name || "Other"}
                      </div>

                      <div className="mt-3 hidden items-center justify-between gap-3 md:flex">
                        <span className="text-sm font-semibold text-[#9a723e]">
                          {money(price)}
                        </span>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#eee5d9]">
                          Check & add
                        </span>
                      </div>

                      {(availabilityState?.productAvailable ??
                        availabilityState?.available) === false &&
                        availabilityState.message && (
                          <>
                            <div className="mt-2 text-xs font-semibold leading-5 text-red-700 md:hidden">
                              Not available for selected date and time
                            </div>

                            <div className="mt-3 hidden rounded-2xl bg-white p-3 text-xs leading-5 text-red-700 ring-1 ring-red-100 md:block">
                              <div className="font-semibold">
                                {availabilityState.message ||
                                  "This item is not available right now."}
                              </div>

                              {availabilityState.missingComponents.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {availabilityState.missingComponents
                                    .slice(0, 3)
                                    .map((component) => (
                                      <div key={component.componentId}>
                                        {formatAvailabilityIssue(component)}
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                    </div>
                  </button>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-full rounded-[26px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-14 text-center">
                  <div className="text-lg font-semibold text-[#1f1e1b]">
                    No products found
                  </div>
                  <p className="mt-2 text-sm text-[#6c6258]">
                    Try another category or search term.
                  </p>
                </div>
              )}
            </div>
          </main>

          <aside className="hidden space-y-6 xl:block">
            <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
              <div className="border-b border-[#eee5d9] px-6 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-[#1f1e1b]">
                      Selected
                    </h3>
                    <p className="mt-1 text-sm text-[#6c6258]">
                      {selectedProducts.length} item(s)
                    </p>
                  </div>

                  {selectedProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={checkAllSelectedAvailability}
                      className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d]"
                    >
                      Check all
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4 p-6">
                {selectedProducts.map((item) => {
                  const product = getProduct(item.productId);
                  const state = availabilityByProductId[item.productId];
                  const badge = getAvailabilityBadge(state);

                  return (
                    <div
                      key={item.productId}
                      className="rounded-[22px] border border-[#eee5d9] bg-[#fcfaf7] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-[#1f1e1b]">
                            {product?.name || "Product"}
                          </div>
                          <div className="mt-1 text-sm text-[#6c6258]">
                            {money(item.quantity * item.unitPrice)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeProduct(item.productId)}
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-100"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <Field label="Qty">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) => {
                              const nextQuantity = Math.max(
                                1,
                                Number(event.target.value || 1),
                              );

                              updateSelectedProduct(item.productId, {
                                quantity: nextQuantity,
                              });
                            }}
                          />
                        </Field>

                        <Field label="Price">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateSelectedProduct(item.productId, {
                                unitPrice: Number(event.target.value || 0),
                              })
                            }
                          />
                        </Field>
                      </div>

                      <div className="mt-3">
                        <Field label="Notes">
                          <Input
                            value={item.notes}
                            onChange={(event) =>
                              updateSelectedProduct(item.productId, {
                                notes: event.target.value,
                              })
                            }
                            placeholder="Ball colors, setup..."
                          />
                        </Field>
                      </div>

                      <button
                        type="button"
                        onClick={() => checkSelectedProductAvailability(item.productId)}
                        className="mt-3 w-full rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
                      >
                        Re-check availability
                      </button>
                    </div>
                  );
                })}

                {selectedProducts.length === 0 && (
                  <div className="rounded-[22px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-5 py-10 text-center text-sm text-[#6c6258]">
                    No products selected.
                  </div>
                )}

                <div className="rounded-[22px] bg-[#23313f] p-5 text-white">
                  <div className="text-sm text-white/60">Subtotal</div>
                  <div className="mt-1 text-3xl font-semibold">
                    {money(productSubtotal)}
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </section>
      )}

      {step === 4 && (
        <section className="rounded-[24px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)] sm:rounded-[30px]">
          <div className="border-b border-[#eee5d9] px-4 py-4 sm:px-6 sm:py-5">
            <h3 className="text-lg font-semibold text-[#1f1e1b] sm:text-xl">
              Choose options
            </h3>

            <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
              Option groups are shown in order for each selected product.
            </p>
          </div>

          <div className="space-y-3 p-3 sm:space-y-5 sm:p-6">
            {selectedProducts.length > 0 && (
              <div className="space-y-4">
                <div className="overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2">
                    {selectedProducts.map((item, index) => {
                      const itemProduct = getProduct(item.productId);
                      const itemGroups = getGroupsForProduct(item.productId);
                      const complete = itemGroups.every((group) => {
                        if (!group.required) return true;
                        const key = modifierKey(item.productId, group.id);
                        return (selectedModifierOptions[key] || []).length > 0;
                      });
                      const active = index === activeOptionsProductIndex;

                      return (
                        <button
                          key={item.productId}
                          type="button"
                          onClick={() => setActiveOptionsProductIndex(index)}
                          className={[
                            "rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:py-2 sm:text-sm",
                            active
                              ? "border-[#23313f] bg-[#23313f] text-white"
                              : complete
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-[#d8cec0] bg-white text-[#6c6258]",
                          ].join(" ")}
                        >
                          {complete ? "✓ " : ""}{index + 1}. {itemProduct?.name || "Product"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#eaf2f9] px-3 py-2.5 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef] sm:flex sm:items-center sm:justify-between sm:px-4 sm:py-3 sm:text-sm">
                  <span>Product {activeOptionsProductIndex + 1} of {selectedProducts.length}</span>
                  <span className="hidden sm:block">Complete its option groups, then continue to the next product.</span>
                </div>
              </div>
            )}

            {[selectedProducts[activeOptionsProductIndex]].filter(Boolean).map((selectedProduct) => {
              const product = getProduct(selectedProduct.productId);
              const groups = getGroupsForProduct(selectedProduct.productId);
              const currentGroupIndex = getOptionGroupIndex(
                selectedProduct.productId,
                groups.length
              );
              const currentGroup = groups[currentGroupIndex] || null;

              return (
                <section
                  key={selectedProduct.productId}
                  className="min-w-0 overflow-hidden rounded-[22px] border border-[#eee5d9] bg-[#fcfaf7] sm:rounded-[26px]"
                >
                  <div className="border-b border-[#eee5d9] p-4 sm:p-5">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">
                      Product
                    </div>

                    <h4 className="mt-1 text-xl font-semibold text-[#1f1e1b]">
                      {product?.name || "Product"}
                    </h4>

                    <p className="mt-1 text-sm text-[#6c6258]">
                      Quantity: {selectedProduct.quantity}
                    </p>
                  </div>

                  <div className="space-y-5 p-3 sm:p-5">
                    {currentGroup && (() => {
                      const key = modifierKey(selectedProduct.productId, currentGroup.id);
                      const selectedOptionIds = selectedModifierOptions[key] || [];
                      const selectedQuantities = selectedModifierQuantities[key] || {};
                      const isMultiple = currentGroup.selectionType === "multiple";
                      const selectedTotalQuantity = selectedOptionIds.reduce(
                        (sum, optionId) => sum + Math.max(1, Number(selectedQuantities[optionId] || 1)),
                        0,
                      );
                      const maxTotalQuantity =
                        currentGroup.maxTotalQuantity == null
                          ? null
                          : Math.max(1, Number(currentGroup.maxTotalQuantity));
                      const selectedUnavailableOptionIds =
                        selectedOptionIds.filter((optionId) => {
                          const option = currentGroup.options.find(
                            (item) => item.id === optionId,
                          );

                          if (!option || !option.trackInventory) {
                            return false;
                          }

                          const state =
                            availabilityByProductId[selectedProduct.productId];
                          const optionAvailability =
                            state?.modifierAvailability.find(
                              (item) => item.optionId === optionId,
                            );

                          if (!optionAvailability || state?.loading) {
                            return false;
                          }

                          const productQuantity = Math.max(
                            1,
                            Number(selectedProduct.quantity || 1),
                          );
                          const inventoryPerOption = Math.max(
                            1,
                            Number(option.inventoryQuantity || 1),
                          );
                          const selectedQuantityForOption = Math.max(
                            1,
                            Number(selectedQuantities[optionId] || 1),
                          );

                          const currentOptionDemand = option.inventoryItemId
                            ? inventoryPerOption *
                              productQuantity *
                              selectedQuantityForOption
                            : 0;
                          const totalSelectedDemand = option.inventoryItemId
                            ? Number(
                                selectedInventoryDemandByItemId.get(
                                  option.inventoryItemId,
                                ) || 0,
                              )
                            : 0;
                          const demandFromOtherSelections = Math.max(
                            0,
                            totalSelectedDemand - currentOptionDemand,
                          );
                          const quantityNeededForOneSelection =
                            inventoryPerOption * productQuantity;
                          const remainingForThisOption = Math.max(
                            0,
                            Number(optionAvailability.quantityAvailable || 0) -
                              demandFromOtherSelections,
                          );

                          return (
                            remainingForThisOption <
                            quantityNeededForOneSelection
                          );
                        });
                      const canMoveNext =
                        (currentGroup.required === false ||
                          selectedOptionIds.length > 0) &&
                        selectedUnavailableOptionIds.length === 0;
                      const atLastGroup = currentGroupIndex >= groups.length - 1;

                      return (
                        <div
                          key={currentGroup.id}
                          className="overflow-hidden rounded-[24px] border border-[#eee5d9] bg-white"
                        >
                          <div
                            className={[
                              "grid gap-0",
                              currentGroup.imageUrl
                                ? "min-w-0 lg:grid-cols-[220px_minmax(0,1fr)]"
                                : "min-w-0 lg:grid-cols-1",
                            ].join(" ")}
                          >
                            {currentGroup.imageUrl && (
                              <div className="bg-[#efe7dc]">
                                <img
                                  src={currentGroup.imageUrl}
                                  alt={currentGroup.name}
                                  className="h-36 w-full object-cover sm:h-full sm:min-h-[220px]"
                                />
                              </div>
                            )}

                            <div className="min-w-0 p-3 sm:p-5">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h5 className="text-lg font-semibold text-[#1f1e1b]">
                                      {currentGroup.name}
                                    </h5>

                                    {currentGroup.required ? (
                                      <span className="rounded-full bg-[#fff4d8] px-3 py-1 text-xs font-semibold text-[#8a6b20] ring-1 ring-[#efd582]">
                                        Required
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-[#f3f3f3] px-3 py-1 text-xs font-semibold text-[#68625d] ring-1 ring-[#e0d8cd]">
                                        Optional
                                      </span>
                                    )}

                                    <span className="rounded-full bg-[#eaf2f9] px-3 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                                      {isMultiple ? "Multiple choice" : "Single choice"}
                                    </span>

                                    {isMultiple && (
                                      <span className="rounded-full bg-[#fff8eb] px-3 py-1 text-xs font-semibold text-[#8a6b20] ring-1 ring-[#efd582]">
                                        {selectedTotalQuantity}{maxTotalQuantity != null ? ` of ${maxTotalQuantity}` : ""} selected
                                      </span>
                                    )}

                                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#eee5d9]">
                                      Group {currentGroupIndex + 1} of {groups.length}
                                    </span>
                                  </div>

                                  {currentGroup.description && (
                                    <p className="mt-2 hidden text-sm leading-6 text-[#6c6258] sm:block">
                                      {currentGroup.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="-mx-3 mt-4 flex min-w-0 max-w-[calc(100%+1.5rem)] snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-3 pb-2 sm:mx-0 sm:mt-5 sm:max-w-full sm:px-0">
                                {currentGroup.options.map((option) => {
                                  const selected = selectedOptionIds.includes(
                                    option.id
                                  );
                                  const selectedQuantity = selected
                                    ? Math.max(1, Number(selectedQuantities[option.id] || 1))
                                    : 0;
                                  const productAvailability =
                                    availabilityByProductId[
                                      selectedProduct.productId
                                    ];
                                  const optionAvailability =
                                    productAvailability?.modifierAvailability.find(
                                      (item) => item.optionId === option.id,
                                    );
                                  const optionChecking =
                                    option.trackInventory &&
                                    (productAvailability?.loading === true ||
                                      !productAvailability?.checked);
                                  const productQuantity = Math.max(
                                    1,
                                    Number(selectedProduct.quantity || 1),
                                  );
                                  const inventoryPerOption = Math.max(
                                    1,
                                    Number(option.inventoryQuantity || 1),
                                  );
                                  const currentOptionDemand =
                                    selected && option.inventoryItemId
                                      ? inventoryPerOption *
                                        productQuantity *
                                        Math.max(1, selectedQuantity)
                                      : 0;
                                  const totalSelectedDemand =
                                    option.inventoryItemId
                                      ? Number(
                                          selectedInventoryDemandByItemId.get(
                                            option.inventoryItemId,
                                          ) || 0,
                                        )
                                      : 0;
                                  const demandFromOtherSelections = Math.max(
                                    0,
                                    totalSelectedDemand - currentOptionDemand,
                                  );
                                  const databaseAvailable = Number(
                                    optionAvailability?.quantityAvailable || 0,
                                  );
                                  const remainingForThisOption = Math.max(
                                    0,
                                    databaseAvailable - demandFromOtherSelections,
                                  );
                                  const quantityNeededForOneSelection =
                                    inventoryPerOption * productQuantity;
                                  const cumulativeUnavailable =
                                    option.trackInventory &&
                                    !optionChecking &&
                                    remainingForThisOption <
                                      quantityNeededForOneSelection;
                                  const optionUnavailable =
                                    option.trackInventory &&
                                    !optionChecking &&
                                    cumulativeUnavailable;
                                  const stockMaximum =
                                    option.trackInventory && optionAvailability
                                      ? Math.max(
                                          0,
                                          Math.floor(
                                            remainingForThisOption /
                                              quantityNeededForOneSelection,
                                          ),
                                        )
                                      : Number.POSITIVE_INFINITY;
                                  const groupRemaining = maxTotalQuantity == null
                                    ? Number.POSITIVE_INFINITY
                                    : Math.max(0, maxTotalQuantity - selectedTotalQuantity);
                                  const optionMaximum = Math.max(
                                    0,
                                    Math.min(stockMaximum, selectedQuantity + groupRemaining),
                                  );
                                  const groupLimitReached =
                                    isMultiple && !selected && maxTotalQuantity != null && selectedTotalQuantity >= maxTotalQuantity;
                                  const optionDisabled =
                                    (option.trackInventory && (optionChecking || optionUnavailable)) ||
                                    groupLimitReached;

                                  return (
                                    <div
                                      key={option.id}
                                      role="button"
                                      tabIndex={optionDisabled ? -1 : 0}
                                      onClick={() => {
                                        if (optionDisabled) {
                                          return;
                                        }

                                        if (isMultiple) {
                                          toggleMultipleModifierOption({
                                            productId: selectedProduct.productId,
                                            groupId: currentGroup.id,
                                            optionId: option.id,
                                          });
                                        } else {
                                          chooseSingleModifierOption({
                                            productId: selectedProduct.productId,
                                            groupId: currentGroup.id,
                                            optionId: option.id,
                                          });
                                        }
                                      }}
                                      aria-disabled={optionDisabled}
                                      className={[
                                        "w-[68vw] max-w-[220px] shrink-0 snap-start overflow-hidden rounded-[16px] border text-left transition sm:w-[190px] sm:rounded-[18px]",
                                        optionChecking
                                          ? "cursor-wait border-amber-200 bg-amber-50 opacity-80"
                                          : optionUnavailable
                                            ? "cursor-not-allowed border-red-200 bg-red-50 opacity-75"
                                          : "hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.08)]",
                                        selected && !optionUnavailable
                                          ? "border-[#c9964f] bg-[#fff8eb] ring-2 ring-[#c9964f]/30"
                                          : optionUnavailable
                                            ? "border-red-200 bg-red-50"
                                            : "border-[#eee5d9] bg-[#fcfaf7]",
                                      ].join(" ")}
                                    >
                                      <div className="flex h-20 items-center justify-center bg-[#efe7dc] p-1.5 sm:h-24">
                                        {option.imageUrl ? (
                                          <img
                                            src={option.imageUrl}
                                            alt={option.name}
                                            className="h-full w-full object-contain"
                                          />
                                        ) : (
                                          <div className="flex h-full items-center justify-center text-xs font-semibold text-[#9a7a49]">
                                            No photo
                                          </div>
                                        )}
                                      </div>

                                      <div className="p-3">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={[
                                              "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold",
                                              selected && !optionUnavailable
                                                ? "border-[#c9964f] bg-[#c9964f] text-white"
                                                : optionUnavailable
                                                  ? "border-red-300 bg-red-100 text-red-700"
                                                  : "border-[#d8cec0] bg-white text-transparent",
                                            ].join(" ")}
                                          >
                                            ✓
                                          </span>

                                          <div className="line-clamp-2 text-sm font-semibold text-[#1f1e1b]">
                                            {option.name}
                                          </div>
                                        </div>

                                        {option.description && (
                                          <p className="mt-1 hidden line-clamp-2 text-[11px] leading-4 text-[#6c6258] sm:block">
                                            {option.description}
                                          </p>
                                        )}

                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#9a723e] ring-1 ring-[#eee5d9]">
                                            {option.priceDelta > 0
                                              ? `+ ${money(option.priceDelta)}`
                                              : "Included"}
                                          </span>

                                          {option.trackInventory ? (
                                            optionChecking ? (
                                              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                                Checking stock…
                                              </span>
                                            ) : optionUnavailable ? (
                                              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">
                                                Unavailable
                                              </span>
                                            ) : (
                                              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                                Stock
                                              </span>
                                            )
                                          ) : (
                                            <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 ring-1 ring-neutral-200">
                                              No inventory check
                                            </span>
                                          )}
                                        </div>

                                        {option.trackInventory && !optionChecking && optionAvailability && (
                                          <div
                                            className={[
                                              "mt-2 hidden rounded-xl px-2.5 py-2 text-[11px] font-medium leading-4 ring-1 sm:block",
                                              optionUnavailable
                                                ? "bg-red-50 text-red-700 ring-red-100"
                                                : "bg-emerald-50 text-emerald-700 ring-emerald-100",
                                            ].join(" ")}
                                          >
                                            Need {quantityNeededForOneSelection} · Available now {remainingForThisOption}
                                            {demandFromOtherSelections > 0
                                              ? ` · Used by other selections ${demandFromOtherSelections}`
                                              : ""}
                                          </div>
                                        )}

                                        {optionUnavailable && optionAvailability && (
                                          <div className="mt-2 rounded-xl bg-white px-2.5 py-2 text-[11px] font-medium leading-4 text-red-700 ring-1 ring-red-100">
                                            Need {quantityNeededForOneSelection},{" "}
                                            remaining after current selections{" "}
                                            {remainingForThisOption}
                                          </div>
                                        )}

                                        {isMultiple && selected && (
                                          <div
                                            className="mt-3 flex items-center justify-between rounded-xl bg-white p-1.5 ring-1 ring-[#e7ddd0]"
                                            onClick={(event) => event.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setMultipleModifierQuantity({
                                                  productId: selectedProduct.productId,
                                                  groupId: currentGroup.id,
                                                  optionId: option.id,
                                                  quantity: selectedQuantity - 1,
                                                })
                                              }
                                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#d8cec0] bg-white text-lg font-semibold text-[#2b2a28] hover:bg-[#faf8f5]"
                                            >
                                              −
                                            </button>
                                            <span className="min-w-10 text-center text-sm font-semibold text-[#1f1e1b]">
                                              {selectedQuantity}
                                            </span>
                                            <button
                                              type="button"
                                              disabled={selectedQuantity >= optionMaximum}
                                              onClick={() =>
                                                setMultipleModifierQuantity({
                                                  productId: selectedProduct.productId,
                                                  groupId: currentGroup.id,
                                                  optionId: option.id,
                                                  quantity: selectedQuantity + 1,
                                                })
                                              }
                                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#d8cec0] bg-white text-lg font-semibold text-[#2b2a28] hover:bg-[#faf8f5] disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                              +
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}

                                {currentGroup.options.length === 0 && (
                                  <div className="col-span-full rounded-[20px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-5 py-10 text-center text-sm text-[#6c6258]">
                                    No options inside this group.
                                  </div>
                                )}
                              </div>

                              <div
                                className="sticky bottom-0 left-0 right-0 z-30 -mx-3 mt-4 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-t border-[#eee5d9] bg-white/95 px-3 pt-3 shadow-[0_-8px_22px_rgba(0,0,0,0.06)] backdrop-blur sm:static sm:mx-0 sm:mt-5 sm:flex sm:flex-wrap sm:bg-transparent sm:px-0 sm:pt-4 sm:shadow-none"
                                style={{
                                  paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (currentGroupIndex > 0) {
                                      setOptionGroupIndex(
                                        selectedProduct.productId,
                                        currentGroupIndex - 1,
                                        groups.length
                                      );
                                      return;
                                    }

                                    if (activeOptionsProductIndex > 0) {
                                      const previousIndex = activeOptionsProductIndex - 1;
                                      const previousProduct = selectedProducts[previousIndex];
                                      const previousGroups = getGroupsForProduct(previousProduct.productId);
                                      setActiveOptionsProductIndex(previousIndex);
                                      setOptionGroupIndex(
                                        previousProduct.productId,
                                        Math.max(0, previousGroups.length - 1),
                                        previousGroups.length
                                      );
                                    }
                                  }}
                                  disabled={currentGroupIndex === 0 && activeOptionsProductIndex === 0}
                                  className="min-w-0 shrink-0 rounded-full border border-[#d8cec0] bg-white px-4 py-2.5 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Previous
                                </button>

                                <div className="hidden text-xs text-[#8f7f6b] sm:block">
                                  {selectedUnavailableOptionIds.length > 0
                                    ? "Selected option is unavailable. Choose another."
                                    : currentGroup.required &&
                                        selectedOptionIds.length === 0
                                      ? "Select an option to continue"
                                      : "You can return later and edit this selection"}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!atLastGroup) {
                                      setOptionGroupIndex(
                                        selectedProduct.productId,
                                        currentGroupIndex + 1,
                                        groups.length
                                      );
                                      return;
                                    }

                                    if (activeOptionsProductIndex < selectedProducts.length - 1) {
                                      setActiveOptionsProductIndex((current) => current + 1);
                                      return;
                                    }

                                    setStep(5);
                                  }}
                                  disabled={!canMoveNext}
                                  className="min-w-0 w-full rounded-full bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                                >
                                  {atLastGroup
                                    ? activeOptionsProductIndex < selectedProducts.length - 1
                                      ? "Next product"
                                      : "Continue to review"
                                    : "Next option group"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {groups.length === 0 && (
                      <div className="rounded-[20px] border border-dashed border-[#d8cec0] bg-white px-5 py-10 text-center text-sm text-[#6c6258]">
                        This product has no option groups.
                      </div>
                    )}
                  </div>
                </section>
              );
            })}

            {selectedProducts.length === 0 && (
              <div className="rounded-[26px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-14 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No products selected
                </div>
                <p className="mt-2 text-sm text-[#6c6258]">
                  Add products first, then choose options.
                </p>
              </div>
            )}

            {selectedModifierRows.length > 0 && (
              <div className="rounded-[24px] bg-[#23313f] p-5 text-white">
                <div className="text-sm text-white/60">Selected options</div>

                <div className="mt-4 space-y-2">
                  {selectedModifierRows.map((row) => (
                    <div
                      key={`${row.productId}-${row.groupId}-${row.optionId}`}
                      className="flex justify-between gap-4 text-sm"
                    >
                      <div>
                        {row.groupName}: {row.optionName}
                      </div>
                      <div className="font-semibold">
                        {row.priceDelta > 0 ? `+ ${money(row.priceDelta)}` : "$0.00"}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-white/10 pt-4 text-right text-2xl font-semibold">
                  + {money(modifiersSubtotal)}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {step === 5 && (
        <section className="grid gap-3 sm:gap-6">

          <aside className="space-y-3 sm:space-y-6 xl:ml-auto xl:w-[420px]">
            <section className="rounded-[24px] border border-black/5 bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a723e] sm:hidden">
                    Final step
                  </div>
                  <h3 className="mt-0.5 text-lg font-semibold text-[#1f1e1b] sm:mt-0 sm:text-xl">
                    Review booking
                  </h3>
                </div>

                <span className="rounded-full bg-[#f7f3ed] px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#e7ddd0] sm:hidden">
                  {selectedProducts.length} item{selectedProducts.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="mt-4 space-y-3 sm:mt-5">
                {selectedProducts.map((item) => {
                  const product = getProduct(item.productId);

                  return (
                    <div key={item.productId} className="space-y-1.5 sm:space-y-2">
                      <div className="flex justify-between gap-3 text-sm sm:gap-4">
                        <div className="text-[#6c6258]">
                          {product?.name || "Product"} × {item.quantity}
                        </div>
                        <div className="font-semibold text-[#1f1e1b]">
                          {money(item.quantity * item.unitPrice)}
                        </div>
                      </div>

                      {selectedModifierRows
                        .filter((row) => row.productId === item.productId)
                        .map((row) => (
                          <div
                            key={`${row.productId}-${row.groupId}-${row.optionId}`}
                            className="flex justify-between gap-3 pl-2 text-[11px] sm:gap-4 sm:pl-4 sm:text-xs"
                          >
                            <div className="text-[#6c6258]">
                              ↳ {row.groupName}: {row.optionName}
                            </div>
                            <div className="font-semibold text-[#1f1e1b]">
                              {row.priceDelta > 0
                                ? `+ ${money(row.priceDelta * item.quantity)}`
                                : "$0.00"}
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })}

                <div className="space-y-2 border-t border-[#eee5d9] pt-3 sm:space-y-3 sm:pt-4">
                  <div className="flex justify-between gap-4 text-sm">
                    <div className="text-[#6c6258]">Products</div>
                    <div className="font-semibold text-[#1f1e1b]">
                      {money(productSubtotal)}
                    </div>
                  </div>

                  <div className="flex justify-between gap-4 text-sm">
                    <div className="text-[#6c6258]">Options</div>
                    <div className="font-semibold text-[#1f1e1b]">
                      {money(modifiersSubtotal)}
                    </div>
                  </div>

                  {safeDiscountAmount > 0 ? (
                    <div className="flex justify-between gap-4 text-sm">
                      <div className="text-[#6c6258]">Discount</div>
                      <div className="font-semibold text-[#1f1e1b]">
                        -{money(safeDiscountAmount)}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex justify-between gap-4 text-sm">
                    <div className="text-[#6c6258]">Subtotal</div>
                    <div className="font-semibold text-[#1f1e1b]">
                      {money(taxableSubtotal)}
                    </div>
                  </div>

                  <div className="flex justify-between gap-4 text-sm">
                    <div className="text-[#6c6258]">Delivery</div>
                    <div className="font-semibold text-[#1f1e1b]">
                      {money(deliveryFee)}
                    </div>
                  </div>

                  <div className="flex justify-between gap-4 text-sm">
                    <div className="text-[#6c6258]">
                      Tax {taxRate ? `(${taxRate.toFixed(3)}%)` : ""}
                    </div>
                    <div className="font-semibold text-[#1f1e1b]">
                      {money(taxAmount)}
                    </div>
                  </div>

                  <div className="flex justify-between gap-4 rounded-xl bg-[#f7f3ed] px-3 py-2 text-sm sm:rounded-none sm:bg-transparent sm:px-0 sm:py-0">
                    <div className="text-[#6c6258]">
                      Deposit due now
                    </div>
                    <div className="font-semibold text-[#1f1e1b]">
                      {money(depositAmount)}
                    </div>
                  </div>

                  <div className="mt-1 border-t border-[#eee5d9] pt-3">
                    <div className="mb-2 text-[11px] leading-4 text-[#8b8177]">
                      Total includes products, selected options, delivery and sales tax.
                    </div>

                    <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a723e] sm:hidden">
                        Booking total
                      </div>
                      <div className="font-semibold text-[#1f1e1b]">Total</div>
                    </div>
                    <div className="text-2xl font-semibold text-[#1f1e1b]">
                      {money(totalAmount)}
                    </div>
                    </div>
                  </div>

                  <div className="flex justify-between gap-4 text-sm sm:text-base">
                    <div className="font-semibold text-[#6c6258] sm:text-[#1f1e1b]">
                      Balance after deposit
                    </div>
                    <div className="font-semibold text-[#1f1e1b] sm:text-xl sm:text-red-700">
                      {money(balanceDue)}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {!hasCustomer && (
              <div className="rounded-[18px] bg-red-50 p-3 text-xs leading-5 text-red-700 ring-1 ring-red-100 sm:rounded-[24px] sm:p-4 sm:text-sm sm:leading-6">
                Choose existing customer or enter customer name before creating
                booking.
              </div>
            )}

            {!hasEventDate && (
              <div className="rounded-[18px] bg-red-50 p-3 text-xs leading-5 text-red-700 ring-1 ring-red-100 sm:rounded-[24px] sm:p-4 sm:text-sm sm:leading-6">
                Choose event date before creating booking.
              </div>
            )}

            {selectedProducts.length === 0 && (
              <div className="rounded-[18px] bg-red-50 p-3 text-xs leading-5 text-red-700 ring-1 ring-red-100 sm:rounded-[24px] sm:p-4 sm:text-sm sm:leading-6">
                Add at least one available product before creating booking.
              </div>
            )}

            {unavailableSelectedProducts.length > 0 && (
              <div className="rounded-[18px] bg-red-50 p-3 text-xs leading-5 text-red-700 ring-1 ring-red-100 sm:rounded-[24px] sm:p-4 sm:text-sm sm:leading-6">
                Remove unavailable products before creating booking.
              </div>
            )}

            {unavailableSelectedModifierRows.length > 0 && (
              <div className="rounded-[18px] bg-red-50 p-3 text-xs leading-5 text-red-700 ring-1 ring-red-100 sm:rounded-[24px] sm:p-4 sm:text-sm sm:leading-6">
                Return to Options and choose another available option.

                {cumulativeModifierInventoryConflicts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {cumulativeModifierInventoryConflicts.map((conflict) => (
                      <div key={conflict.inventoryItemId}>
                        {conflict.optionName}: need {conflict.quantityNeeded},
                        available {conflict.quantityAvailable}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {missingRequiredModifierGroups.length > 0 && (
              <div className="rounded-[18px] bg-red-50 p-3 text-xs leading-5 text-red-700 ring-1 ring-red-100 sm:rounded-[24px] sm:p-4 sm:text-sm sm:leading-6">
                Choose required options:
                <div className="mt-2 space-y-1">
                  {missingRequiredModifierGroups.map((item) => (
                    <div key={`${item.productId}-${item.groupId}`}>
                      {item.productName}: {item.groupName}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedProductsAreChecking && (
              <div className="rounded-[18px] bg-blue-50 p-3 text-xs leading-5 text-blue-700 ring-1 ring-blue-100 sm:rounded-[24px] sm:p-4 sm:text-sm sm:leading-6">
                Checking current inventory for the selected quantities...
              </div>
            )}

            {!selectedProductsAreChecking &&
              uncheckedSelectedProducts.length > 0 && (
                <div className="rounded-[24px] bg-[#fff8eb] p-4 text-sm leading-6 text-[#8a6b20] ring-1 ring-[#efd582]">
                  Inventory must be checked after quantity or date changes.
                </div>
              )}

            <button
              type="button"
              onClick={openPaymentModal}
              disabled={!canCreateBooking}
              className="hidden w-full rounded-full bg-[#c9964f] px-6 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.28)] transition hover:bg-[#b78744] disabled:cursor-not-allowed disabled:opacity-50 md:block"
            >
              Create booking
            </button>
          </aside>
        </section>
      )}

      <section className="hidden items-center justify-between gap-3 md:flex">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(1, current - 1))}
          disabled={step === 1}
          className="rounded-full border border-[#d8cec0] bg-white px-6 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>

        {step < 5 && (
          <button
            type="button"
            onClick={() => setStep((current) => Math.min(5, current + 1))}
            className="rounded-full bg-[#23313f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
          >
            Continue
          </button>
        )}
      </section>

      <div
        className={[
          "fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 px-3 pt-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur md:hidden",
          step === 4 ? "hidden" : "",
        ].join(" ")}
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(1, current - 1))}
            disabled={step === 1}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#d8cec0] bg-white text-xl font-semibold text-[#23313f] disabled:opacity-35"
            aria-label="Back"
          >
            ←
          </button>

          <div className="min-w-0 flex-1 px-1">
            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8b8177]">
              {step === 1
                ? "Customer"
                : step === 2
                  ? eventDate || "Date & time"
                  : step === 3
                    ? `${selectedProducts.length} selected`
                    : step === 4
                      ? `${selectedModifierRows.length} options`
                      : "Booking total"}
            </div>

            <div className="mt-0.5 truncate text-sm font-semibold text-[#1f1e1b]">
              {step === 1
                ? customerName || "Customer details"
                : step === 2
                  ? [eventStartTime, eventEndTime].filter(Boolean).join(" – ") ||
                    "Choose time and address"
                  : step === 3
                    ? selectedProducts.length > 0
                      ? `${money(productSubtotal)}`
                      : "Choose rental"
                    : step === 4
                      ? modifiersSubtotal > 0
                        ? `+ ${money(modifiersSubtotal)}`
                        : "Choose options"
                      : money(totalAmount)}
            </div>
          </div>

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep((current) => Math.min(5, current + 1))}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-[#23313f] px-5 text-sm font-semibold text-white shadow-sm active:scale-[0.98]"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={openPaymentModal}
              disabled={!canCreateBooking}
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-[#c9964f] px-5 text-sm font-semibold text-white shadow-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {bookingActor === "customer"
                ? "Continue to payment"
                : "Create booking"}
            </button>
          )}
        </div>
      </div>

      {contractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Contract signature required
              </h3>
              <p className="mt-1 text-sm text-[#6c6258]">
                Review and sign contract. POS checkout opens only after signature.
              </p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-28 sm:space-y-4 sm:p-6">
              <div className="max-h-[320px] overflow-y-auto rounded-2xl bg-white p-4 text-sm leading-6 text-[#4b4339] ring-1 ring-[#eee5d9]">
                <div dangerouslySetInnerHTML={{ __html: renderedContractHtml }} />
              </div>

              <div className="rounded-2xl border border-dashed border-[#d8cec0] bg-[#fcfaf7] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Signature block
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1.25fr]">
                  <div className="space-y-3">
                    <Field label={signatureLabel}>
                      <Input
                        value={contractSignerName}
                        onChange={(event) => setContractSignerName(event.target.value)}
                        placeholder="Client full name"
                      />
                    </Field>

                    <Field label="Signature date">
                      <Input
                        value={new Date().toISOString().slice(0, 10)}
                        readOnly
                      />
                    </Field>

                    <label className="flex items-center gap-3 rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                      <input
                        type="checkbox"
                        checked={contractAccepted}
                        onChange={(event) => setContractAccepted(event.target.checked)}
                        className="h-5 w-5"
                      />
                      I read and agree with the contract terms
                    </label>
                  </div>

                  <Field label="Draw signature">
                    <div className="rounded-[22px] border border-[#d8cec0] bg-white p-3">
                      <canvas
                        ref={signatureCanvasRef}
                        onPointerDown={onSignaturePointerDown}
                        onPointerMove={onSignaturePointerMove}
                        onPointerUp={finishSignatureDraw}
                        onPointerLeave={finishSignatureDraw}
                        onPointerCancel={finishSignatureDraw}
                        className="h-48 w-full rounded-xl border border-[#c8bbb0] bg-white touch-none"
                      />
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <div className="text-xs text-[#6c6258]">
                          Use finger or mouse to sign. This signature is saved with the contract.
                        </div>
                        <button
                          type="button"
                          onClick={clearSignatureCanvas}
                          className="rounded-full border border-[#d8cec0] bg-[#faf8f5] px-3 py-1.5 text-xs font-semibold text-[#2b2a28]"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </Field>
                </div>

              </div>

              {paymentError && (
                <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-100">
                  {paymentError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#eee5d9] bg-white px-4 py-4 sm:px-6 sm:py-5">
              <button
                type="button"
                onClick={() => setContractModalOpen(false)}
                className="rounded-full border border-[#d8cec0] bg-white px-5 py-2.5 text-sm font-semibold text-[#2b2a28]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmContractAndOpenPos}
                className="rounded-full bg-[#23313f] px-5 py-2.5 text-sm font-semibold text-white"
              >
                Continue to POS
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 sm:items-center sm:p-4">
          <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-[0_18px_50px_rgba(0,0,0,0.22)] sm:h-auto sm:max-h-[92vh] sm:max-w-xl sm:rounded-[28px] sm:border sm:border-black/5">
            <div className="flex items-center justify-between gap-3 border-b border-[#eee5d9] px-4 py-3 sm:block sm:px-6 sm:py-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a723e] sm:hidden">
                  Checkout
                </div>
                <h3 className="text-lg font-semibold text-[#1f1e1b] sm:text-xl">
                  Payment
                </h3>
                <p className="mt-1 hidden text-sm text-[#6c6258] sm:block">
                  Select payment method and amount to charge now.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="rounded-full border border-[#d8cec0] bg-white px-3 py-2 text-xs font-semibold text-[#2b2a28] sm:hidden"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="rounded-[18px] bg-[#23313f] p-4 text-white sm:rounded-[20px]">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60 sm:text-xs">
                      Pay now
                    </div>
                    <div className="mt-1 text-3xl font-semibold">
                      {money(totalChargeNow)}
                    </div>
                  </div>

                  <div className="text-right text-[11px] leading-5 text-white/65 sm:hidden">
                    <div>Base {money(paymentAmount)}</div>
                    {tipSettings.tipsEnabled ? (
                      <div>Tip {money(tipAmount)}</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 hidden grid-cols-2 gap-4 border-t border-white/15 pt-3 text-sm sm:grid">
                  <div>
                    <div className="text-white/65">Base payment</div>
                    <div className="text-lg font-semibold">{money(paymentAmount)}</div>
                  </div>
                  <div>
                    <div className="text-white/65">Tip</div>
                    <div className="text-lg font-semibold">
                      {money(tipSettings.tipsEnabled ? tipAmount : 0)}
                    </div>
                  </div>
                </div>
              </div>

              <Field label="Payment method">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {paymentMethods.map((item) => {
                    const selected = item.method === paymentMethod;

                    return (
                      <button
                        key={item.method}
                        type="button"
                        onClick={() => setPaymentMethod(item.method)}
                        className={[
                          "flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-semibold transition sm:min-h-0 sm:justify-start sm:rounded-full sm:px-4 sm:py-2",
                          selected
                            ? "border-[#23313f] bg-[#23313f] text-white"
                            : "border-[#d8cec0] bg-white text-[#2b2a28]",
                        ].join(" ")}
                      >
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt={item.displayName}
                            className="h-4 w-4 object-contain"
                          />
                        ) : null}
                        {item.displayName}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Amount to pay now">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paymentAmount}
                  onChange={(event) => {
                    const next = Number(event.target.value || 0);
                    setPaymentAmount(next);

                    if (
                      tipSettings.tipsEnabled &&
                      !tipAmountEdited &&
                      tipMode === "percent"
                    ) {
                      setTipAmount(Number(((next * tipPercent) / 100).toFixed(2)));
                    }
                  }}
                />
              </Field>

              {tipSettings.tipsEnabled && (
                <div className="space-y-3 rounded-[18px] border border-[#eee5d9] bg-[#fcfaf7] p-3 sm:rounded-2xl sm:p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Tip ({tipMode === "percent" ? "%" : "$"} mode from settings)
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => {
                        setTipPercent(0);
                        setTipAmount(0);
                        setTipAmountEdited(false);
                      }}
                      className={[
                        "flex min-h-[62px] flex-col items-center justify-center rounded-2xl border px-3 py-2 text-center transition sm:min-h-[86px] sm:px-4 sm:py-3",
                        Number(tipAmount) === 0 && !tipAmountEdited
                          ? "border-[#23313f] bg-[#23313f] text-white"
                          : "border-[#d8cec0] bg-white text-[#2b2a28]",
                      ].join(" ")}
                    >
                      <span className="text-xl font-bold">0</span>
                      <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">
                        No tip
                      </span>
                    </button>

                    {tipMode === "percent"
                      ? tipSettings.tipPercentOptions.map((percent) => (
                          <button
                            key={percent}
                            type="button"
                            onClick={() => applyTipPercent(percent)}
                            className={[
                              "flex min-h-[62px] flex-col items-center justify-center rounded-2xl border px-3 py-2 text-center transition sm:min-h-[86px] sm:px-4 sm:py-3",
                              Number(percent) === Number(tipPercent) && !tipAmountEdited
                                ? "border-[#23313f] bg-[#23313f] text-white"
                                : "border-[#d8cec0] bg-white text-[#2b2a28]",
                            ].join(" ")}
                          >
                            <span className="text-xl font-bold sm:text-2xl">{percent}%</span>
                            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">
                              Tip
                            </span>
                          </button>
                        ))
                      : tipSettings.tipAmountOptions.map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => applyTipAmount(Number(amount || 0))}
                            className={[
                              "flex min-h-[62px] flex-col items-center justify-center rounded-2xl border px-3 py-2 text-center transition sm:min-h-[86px] sm:px-4 sm:py-3",
                              Number(amount) === Number(tipAmount) && !tipAmountEdited
                                ? "border-[#23313f] bg-[#23313f] text-white"
                                : "border-[#d8cec0] bg-white text-[#2b2a28]",
                            ].join(" ")}
                          >
                            <span className="text-xl font-bold sm:text-2xl">{money(Number(amount || 0))}</span>
                            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">
                              Tip
                            </span>
                          </button>
                        ))}
                  </div>

                  <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
                    <Field label={tipMode === "percent" ? "Custom tip %" : "Custom tip amount"}>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={tipMode === "percent" ? tipPercent : tipAmount}
                        onChange={(event) => {
                          const next = Number(event.target.value || 0);
                          setTipAmountEdited(true);

                          if (tipMode === "percent") {
                            applyTipPercent(next);
                            setTipAmountEdited(true);
                          } else {
                            setTipAmount(next);

                            if (paymentAmount > 0) {
                              setTipPercent(
                                Number(((next / paymentAmount) * 100).toFixed(2))
                              );
                            }
                          }
                        }}
                        disabled={!tipSettings.allowCustomTip}
                      />
                    </Field>

                    <Field label={tipMode === "percent" ? "Tip amount" : "Tip %"}>
                      <Input
                        type="number"
                        step="0.01"
                        value={tipMode === "percent" ? tipAmount : tipPercent}
                        readOnly
                      />
                    </Field>
                  </div>
                </div>
              )}

              <div className="hidden rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9] sm:block">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Summary
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span>Products</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(productSubtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Options</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(modifiersSubtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Discount</span>
                    <span className="font-semibold text-[#1f1e1b]">-{money(safeDiscountAmount)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Subtotal</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(taxableSubtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Delivery</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(deliveryFee)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Tax</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(taxAmount)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Deposit</span>
                    <span className="font-semibold text-[#1f1e1b]">-{money(depositAmount)}</span>
                  </div>

                  <div className="border-t border-[#e5dbce] pt-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#1f1e1b]">Total</span>
                      <span className="text-lg font-semibold text-[#1f1e1b]">{money(totalAmount)}</span>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span className="font-semibold text-[#1f1e1b]">Balance due</span>
                      <span className="font-semibold text-red-700">{money(balanceDue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden sm:block">
                <Field label="Reference / transaction id">
                  <Input
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>

              {paymentMethod && (
                <div className="rounded-[16px] bg-[#fcfaf7] p-3 text-xs leading-5 text-[#6c6258] ring-1 ring-[#eee5d9] sm:rounded-2xl sm:p-4 sm:text-sm">
                  {paymentMethods.find((item) => item.method === paymentMethod)
                    ?.accountLabel || "Payment details"}
                  : {" "}
                  {paymentMethods.find((item) => item.method === paymentMethod)
                    ?.accountValue || "Not configured in settings."}
                </div>
              )}

              {paymentError && (
                <div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700 ring-1 ring-red-100">
                  {paymentError}
                </div>
              )}
            </div>

            <div
              className="absolute inset-x-0 bottom-0 z-20 border-t border-[#eee5d9] bg-white/95 px-4 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:static sm:flex sm:items-center sm:justify-end sm:gap-3 sm:bg-white sm:px-6 sm:py-5 sm:shadow-none"
              style={{
                paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
              }}
            >
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="hidden rounded-full border border-[#d8cec0] bg-white px-5 py-2.5 text-sm font-semibold text-[#2b2a28] sm:inline-flex"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmCreateBooking}
                disabled={bookingSubmitStarted}
                className="flex h-12 w-full items-center justify-center rounded-full bg-[#23313f] px-5 text-sm font-semibold text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:h-auto sm:w-auto sm:py-2.5"
              >
                {bookingSubmitStarted
                  ? "Creating…"
                  : bookingActor === "customer"
                    ? `Pay ${money(totalChargeNow)}`
                    : "Create booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bookingSubmitStarted && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]">
          <div className="flex w-full max-w-sm flex-col items-center rounded-[28px] border border-white/10 bg-[#23313f] px-6 py-7 text-center text-white shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
            <div className="mt-4 text-lg font-semibold">Processing payment</div>
            <p className="mt-2 text-sm leading-6 text-white/75">
              Redirecting to Stripe. Please do not close this window.
            </p>
          </div>
        </div>
      )}
    </form>
  );
}
"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createBookingAction } from "../actions";
import {
  checkBookingItemAvailabilityAction,
  getAdminInventorySnapshotAction,
} from "../availability-actions";
import { calculateBookingPricingAction } from "../pricing-actions";
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
  inventoryBehavior?: "reusable" | "consumable";
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

type InventorySnapshotItem = {
  productId: string;
  available: boolean;
  remainingQuantity: number;
  message: string | null;
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
  inventoryBehavior?: "reusable" | "consumable";
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
  bookingAttemptId,
  initialErrorMessage,
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
  initialEventDate,
  initialEventStartTime,
  initialEventEndTime,
  initialSetupAddress,
  initialSetupCity,
  initialSetupZip,
}: {
  bookingAttemptId: string;
  initialErrorMessage?: string;
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
  initialEventDate?: string;
  initialEventStartTime?: string;
  initialEventEndTime?: string;
  initialSetupAddress?: string;
  initialSetupCity?: string;
  initialSetupZip?: string;
}) {
  const [step, setStep] = useState(1);
  const [formErrorMessage, setFormErrorMessage] = useState(
    initialErrorMessage || "",
  );

  const [existingCustomerId, setExistingCustomerId] = useState("");
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  const [eventDate, setEventDate] = useState(initialEventDate || "");
  const [eventStartTime, setEventStartTime] = useState(initialEventStartTime || "");
  const [eventEndTime, setEventEndTime] = useState(initialEventEndTime || "");
  const [bookingActor, setBookingActor] = useState<BookingActor>("cashier");

  const [setupAddress, setSetupAddress] = useState(initialSetupAddress || "");
  const [setupCity, setSetupCity] = useState(initialSetupCity || "");
  const [setupState, setSetupState] = useState("CA");
  const [setupZip, setSetupZip] = useState(initialSetupZip || "");
  const [status, setStatus] = useState("inventory_reserved");
  const [completionStrategy, setCompletionStrategy] = useState<
    "staff_send_to_customer" | "staff_complete_now"
  >("staff_send_to_customer");

  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const [search, setSearch] = useState("");

  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>(
    []
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

  const [inventorySnapshotByProductId, setInventorySnapshotByProductId] = useState<
    Record<string, InventorySnapshotItem>
  >({});
  const [inventorySnapshotLoading, setInventorySnapshotLoading] = useState(false);
  const [inventorySnapshotError, setInventorySnapshotError] = useState<string | null>(
    null,
  );
  const [inventorySnapshotUpdatedAt, setInventorySnapshotUpdatedAt] = useState<
    string | null
  >(null);

  const [deliveryFee, setDeliveryFee] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositWasEdited, setDepositWasEdited] = useState(false);
  const [notes, setNotes] = useState("");

  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [bookingSubmitPending, setBookingSubmitPending] = useState(false);
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

  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(
    null
  );

  const formRef = useRef<HTMLFormElement | null>(null);
  const pricingRequestIdRef = useRef(0);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureDrawingRef = useRef(false);
  const discountEditorRef = useRef<HTMLDivElement | null>(null);

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

  function resetInventorySnapshot() {
    setInventorySnapshotByProductId({});
    setInventorySnapshotError(null);
    setInventorySnapshotUpdatedAt(null);
  }

  function resetPricing() {
    setPricingResult(null);
    setTaxRate(0);
    setDeliveryFee(0);
  }

  function updateEventDate(value: string) {
    setEventDate(value);
    resetAvailability();
    resetInventorySnapshot();
  }

  function updateEventStartTime(value: string) {
    setEventStartTime(value);
    resetAvailability();
    resetInventorySnapshot();
  }

  function updateEventEndTime(value: string) {
    setEventEndTime(value);
    resetAvailability();
    resetInventorySnapshot();
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
      formData.set("eventDate", eventDate);
      formData.set("eventStartTime", eventStartTime || "");
      formData.set("eventEndTime", eventEndTime || "");
      formData.set("bookingActor", bookingActor);

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
              inventoryBehavior: option.inventoryBehavior === "consumable" ? "consumable" : "reusable",
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
        formData.set(
          `modifierInventoryBehavior_${index}`,
          option.inventoryBehavior,
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

      setAvailabilityByProductId((current) => ({
        ...current,
        [product.id]: state,
      }));

      return state;
    }
  }

  async function addProductWithAvailability(product: Product) {
    const existing = selectedProducts.find(
      (item) => item.productId === product.id
    );
    const quantity = existing ? existing.quantity + 1 : 1;

    const state = await checkProductAvailability(product, quantity);

    if (!state?.available) {
      return;
    }

    addProduct(product);
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

  async function loadInventorySnapshotForFilteredProducts() {
    if (!eventDate || !eventStartTime || !eventEndTime) {
      setInventorySnapshotError(
        "Choose date, start time, and end time before loading stock snapshot.",
      );
      return;
    }

    const productIds = filteredProducts.map((item) => item.id);

    if (productIds.length === 0) {
      setInventorySnapshotByProductId({});
      setInventorySnapshotError(null);
      setInventorySnapshotUpdatedAt(new Date().toISOString());
      return;
    }

    setInventorySnapshotLoading(true);
    setInventorySnapshotError(null);

    try {
      const formData = new FormData();
      formData.set("eventDate", eventDate);
      formData.set("eventStartTime", eventStartTime);
      formData.set("eventEndTime", eventEndTime);
      formData.set("bookingActor", bookingActor);
      formData.set("productIds", JSON.stringify(productIds));

      const result = await getAdminInventorySnapshotAction(formData);

      if (!result?.ok) {
        setInventorySnapshotByProductId({});
        setInventorySnapshotError(result?.message || "Failed to load stock snapshot.");
        return;
      }

      const nextSnapshot: Record<string, InventorySnapshotItem> = {};

      for (const row of result.items || []) {
        if (!row?.productId) {
          continue;
        }

        nextSnapshot[row.productId] = {
          productId: row.productId,
          available: Boolean(row.available),
          remainingQuantity: Math.max(0, Number(row.remainingQuantity || 0)),
          message: row.message || null,
        };
      }

      setInventorySnapshotByProductId(nextSnapshot);
      setInventorySnapshotUpdatedAt(new Date().toISOString());
    } catch (error: any) {
      setInventorySnapshotByProductId({});
      setInventorySnapshotError(error?.message || "Failed to load stock snapshot.");
    } finally {
      setInventorySnapshotLoading(false);
    }
  }

  useEffect(() => {
    resetAvailability();
    resetInventorySnapshot();
  }, [bookingActor]);

  /*
   * Live-check selected product quantities.
   *
   * The server remains the final protection, but the customer/cashier sees
   * inventory conflicts immediately after changing Qty instead of only at
   * the final Create booking action.
   */
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

    if (!cleanAddress || !cleanCity || !cleanZip || subtotal <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      calculatePricing();
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

  const snapshotRows = filteredProducts
    .map((product) => inventorySnapshotByProductId[product.id])
    .filter(Boolean);

  const snapshotAvailableCount = snapshotRows.filter((row) => row.available).length;
  const snapshotUnavailableCount = snapshotRows.filter((row) => !row.available).length;
  const snapshotUnavailableProducts = filteredProducts.filter((product) => {
    const row = inventorySnapshotByProductId[product.id];
    return Boolean(row && !row.available);
  });

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
    missingRequiredModifierGroups.length === 0;

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
    if (bookingSubmitPending) {
      return;
    }

    if (completionStrategy === "staff_send_to_customer") {
      setPaymentError(null);
      setContractAccepted(false);
      setContractSignatureDataUrl("");
      setPaymentAmount(0);
      setTipAmount(0);
      formRef.current?.requestSubmit();
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
    if (bookingSubmitPending) {
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

    setPaymentModalOpen(false);
    formRef.current?.requestSubmit();
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

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    // Prevent accidental Enter-key submit while required steps are incomplete.
    if (!canCreateBooking) {
      event.preventDefault();
      setStep(5);
      setFormErrorMessage("Complete required booking fields before submitting.");
      setBookingSubmitPending(false);
      return;
    }

    setFormErrorMessage("");
    setBookingSubmitPending(true);
  }

  return (
    <form
      ref={formRef}
      action={createBookingAction}
      className="space-y-6"
      onSubmit={handleFormSubmit}
    >
      {formErrorMessage ? (
        <div className="rounded-[22px] bg-red-50 p-4 text-sm font-semibold text-red-700 ring-1 ring-red-100">
          {formErrorMessage}
        </div>
      ) : null}

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
      <input type="hidden" name="completionStrategy" value={completionStrategy} />

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
      <input type="hidden" name="contractAccepted" value={contractAccepted ? "true" : "false"} />
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
          <input
            type="hidden"
            name={`modifierInventoryBehavior_${index}`}
            value={item.inventoryBehavior === "consumable" ? "consumable" : "reusable"}
          />
        </div>
      ))}

      <section className="rounded-[30px] border border-black/5 bg-white p-4 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
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
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Date, Time & Address
            </h3>
            <p className="mt-1 text-sm text-[#6c6258]">
              The address is used to calculate delivery and sales tax automatically.
            </p>
          </div>

          <div className="grid gap-4 p-6 md:grid-cols-3">
            <Field label="Event date">
              <Input
                value={eventDate}
                onChange={(event) => updateEventDate(event.target.value)}
                type="date"
                required
              />
            </Field>

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

            <div className="hidden md:block" />

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
                className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
              />
            </Field>

            <Field label="City">
              <Input
                value={setupCity}
                onChange={(event) => updateSetupCity(event.target.value)}
                placeholder="Glendale"
              />
            </Field>

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
          </div>

          {!eventDate && (
            <div className="border-t border-[#eee5d9] bg-[#fff8eb] px-6 py-4 text-sm font-semibold text-[#8a6b20]">
              Select the event date before checking inventory.
            </div>
          )}

          {eventDate && bookingActor === "customer" && !workingWindow.isOpen && (
            <div className="border-t border-[#eee5d9] bg-red-50 px-6 py-4 text-sm font-semibold text-red-700">
              Customer bookings are not available on the selected date.
            </div>
          )}

          {eventDate &&
            bookingActor === "customer" &&
            workingWindow.isOpen &&
            workingWindow.openTime &&
            workingWindow.closeTime && (
              <div className="border-t border-[#eee5d9] bg-[#eaf2f9] px-6 py-4 text-sm font-semibold text-[#355879]">
                Customer bookings are available only from {formatTimeLabel(
                  workingWindow.openTime,
                  timeFormat
                )} to {formatTimeLabel(workingWindow.closeTime, timeFormat)}.
              </div>
            )}
        </section>
      )}

      {step === 3 && (
        <section className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <main className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Booking items
              </h3>

              <p className="mt-1 text-sm text-[#6c6258]">
                Select a product. The system will check inventory for the selected
                date and time before adding it.
              </p>
            </div>

            <div className="border-b border-[#eee5d9] p-6">
              <div className="grid gap-4 md:grid-cols-[260px_1fr]">
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

              <div className="mt-4 rounded-2xl border border-[#e6dccd] bg-[#f7f2ea] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#1f1e1b]">
                      Fast stock snapshot (admin)
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#6c6258]">
                      Loads real remaining quantity for products in the current filter.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={loadInventorySnapshotForFilteredProducts}
                    disabled={inventorySnapshotLoading || !eventDate || !eventStartTime || !eventEndTime}
                    className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {inventorySnapshotLoading ? "Loading..." : "Refresh snapshot"}
                  </button>
                </div>

                {inventorySnapshotError && (
                  <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                    {inventorySnapshotError}
                  </div>
                )}

                {snapshotRows.length > 0 && !inventorySnapshotError && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      Available: {snapshotAvailableCount}
                    </span>
                    <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700 ring-1 ring-red-200">
                      Unavailable: {snapshotUnavailableCount}
                    </span>
                    {inventorySnapshotUpdatedAt && (
                      <span className="rounded-full bg-white px-3 py-1 font-semibold text-[#6c6258] ring-1 ring-[#e6dccd]">
                        Updated {new Date(inventorySnapshotUpdatedAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                )}

                {snapshotUnavailableProducts.length > 0 && !inventorySnapshotError && (
                  <div className="mt-3 rounded-xl bg-red-50 p-3 ring-1 ring-red-100">
                    <div className="text-xs font-semibold uppercase tracking-[0.08em] text-red-700">
                      Unavailable positions now
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {snapshotUnavailableProducts.slice(0, 24).map((product) => {
                        const row = inventorySnapshotByProductId[product.id];

                        return (
                          <span
                            key={product.id}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200"
                          >
                            {product.name} · {Math.max(0, Number(row?.remainingQuantity || 0))}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const selected = selectedProductIds.includes(product.id);
                const price = getProductPrice(product);
                const availabilityState = availabilityByProductId[product.id];
                const stockSnapshot = inventorySnapshotByProductId[product.id];
                const unavailableBySnapshot = Boolean(stockSnapshot && !stockSnapshot.available);
                const badge = getAvailabilityBadge(availabilityState);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProductWithAvailability(product)}
                    disabled={availabilityState?.loading}
                    className={[
                      "group overflow-hidden rounded-[26px] border text-left transition hover:-translate-y-0.5 hover:shadow-[0_16px_35px_rgba(0,0,0,0.08)] disabled:cursor-wait disabled:opacity-70",
                      selected
                        ? "border-[#c9964f] bg-[#fff8eb] ring-2 ring-[#c9964f]/30"
                        : unavailableBySnapshot
                          ? "border-red-200 bg-red-50"
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

                    <div className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {stockSnapshot && (
                          <span
                            className={[
                              "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                              stockSnapshot.available
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : "bg-red-50 text-red-700 ring-red-200",
                            ].join(" ")}
                          >
                            {stockSnapshot.available
                              ? `In stock: ${stockSnapshot.remainingQuantity}`
                              : "Out for selected date"}
                          </span>
                        )}

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>

                        {selected && (
                          <span className="rounded-full bg-[#c9964f] px-3 py-1 text-xs font-semibold text-white">
                            Added
                          </span>
                        )}
                      </div>

                      <div className="mt-3 line-clamp-2 min-h-[44px] text-base font-semibold text-[#1f1e1b]">
                        {product.name}
                      </div>

                      <div className="mt-2 min-h-[84px] whitespace-pre-line text-sm leading-5 text-[#6c6258] line-clamp-4">
                        {product.short_description || "No short description"}
                      </div>

                      <div className="mt-2 text-xs text-[#6c6258]">
                        {product.category_name || "Other"}
                      </div>

                      {stockSnapshot?.message && !stockSnapshot.available && (
                        <div className="mt-2 text-xs font-semibold text-red-700">
                          {stockSnapshot.message}
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between gap-3">
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
                          <div className="mt-3 rounded-2xl bg-white p-3 text-xs leading-5 text-red-700 ring-1 ring-red-100">
                            {availabilityState.message}

                            {availabilityState.missingComponents.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {availabilityState.missingComponents
                                  .slice(0, 3)
                                  .map((component) => (
                                    <div key={component.componentId}>
                                      {component.inventoryItemName}: need{" "}
                                      {component.quantityNeeded}, available{" "}
                                      {component.quantityAvailable}
                                    </div>
                                  ))}
                              </div>
                            )}
                          </div>
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

          <aside className="space-y-6">
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
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">
              Add-ons / Options
            </h3>

            <p className="mt-1 text-sm text-[#6c6258]">
              Option groups are shown in order for each selected product.
            </p>
          </div>

          <div className="space-y-5 p-3 sm:p-6">
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
                            "rounded-full border px-4 py-2 text-sm font-semibold transition",
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

                <div className="rounded-2xl bg-[#eaf2f9] px-4 py-3 text-sm font-semibold text-[#355879] ring-1 ring-[#cfe0ef] sm:flex sm:items-center sm:justify-between">
                  <span>Product {activeOptionsProductIndex + 1} of {selectedProducts.length}</span>
                  <span className="mt-1 block sm:mt-0">Complete its option groups, then continue to the next product.</span>
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
                  className="rounded-[22px] border border-[#eee5d9] bg-[#fcfaf7] sm:rounded-[26px]"
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
                                ? "lg:grid-cols-[220px_1fr]"
                                : "lg:grid-cols-1",
                            ].join(" ")}
                          >
                            {currentGroup.imageUrl && (
                              <div className="bg-[#efe7dc]">
                                <img
                                  src={currentGroup.imageUrl}
                                  alt={currentGroup.name}
                                  className="h-full min-h-[220px] w-full object-cover"
                                />
                              </div>
                            )}

                            <div className="p-5">
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
                                    <p className="mt-2 text-sm leading-6 text-[#6c6258]">
                                      {currentGroup.description}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="-mx-3 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
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
                                        "w-[78vw] max-w-[240px] shrink-0 snap-start overflow-hidden rounded-[18px] border text-left transition sm:w-[190px]",
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
                                      <div className="flex h-24 items-center justify-center bg-[#efe7dc] p-1.5">
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
                                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#6c6258]">
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

                              <div className="sticky bottom-0 z-10 -mx-3 mt-5 flex items-center justify-between gap-2 border-t border-[#eee5d9] bg-white/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-wrap sm:bg-transparent sm:px-0 sm:pt-4">
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
                                  className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5] disabled:cursor-not-allowed disabled:opacity-50"
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
                                  className="rounded-full bg-[#23313f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-50"
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
        <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <main className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Review & Notes
              </h3>

              <p className="mt-1 text-sm text-[#6c6258]">
                Delivery and sales tax are calculated automatically from the address
                entered in Date & Time.
              </p>
            </div>

            <div className="grid gap-4 p-6 md:grid-cols-3">
              <div className="md:col-span-3 rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                <div className="text-sm font-semibold text-[#1f1e1b]">
                  Delivery & tax
                </div>

                <p className="mt-2 text-sm leading-6 text-[#6c6258]">
                  Address: {setupAddress || "—"}, {setupCity || "—"}{" "}
                  {setupZip || ""}
                </p>

                <div className="mt-4 rounded-2xl bg-[#eaf2f9] p-4 text-sm font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                  {pricingLoading
                    ? "Calculating delivery and tax automatically..."
                    : pricingResult
                      ? "Delivery and tax calculated automatically."
                      : setupAddress && setupCity && setupZip && subtotal > 0
                        ? "Waiting for automatic calculation..."
                        : "Delivery and tax will calculate automatically after address and products are entered."}
                </div>

                {pricingResult && (
                  <div className="mt-4 rounded-[20px] bg-white p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>Mode: {pricingResult.deliveryMode}</div>
                      <div>
                        Distance:{" "}
                        {pricingResult.distanceMiles !== null
                          ? `${pricingResult.distanceMiles} mi`
                          : "—"}
                      </div>
                      <div>Zone: {pricingResult.matchedZoneName || "—"}</div>
                      <div>{pricingResult.deliveryReason || "—"}</div>
                    </div>

                    {(pricingResult.deliveryError || pricingResult.taxError) && (
                      <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700 ring-1 ring-red-100">
                        {pricingResult.deliveryError && (
                          <div>Delivery: {pricingResult.deliveryError}</div>
                        )}
                        {pricingResult.taxError && (
                          <div>Tax: {pricingResult.taxError}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Field label="Delivery fee">
                <Input
                  type="number"
                  step="0.01"
                  value={deliveryFee}
                  onChange={(event) =>
                    setDeliveryFee(Number(event.target.value || 0))
                  }
                />
              </Field>

              <Field label="Tax rate">
                <Input
                  type="text"
                  value={taxRate ? `${taxRate.toFixed(3)}%` : "Auto"}
                  readOnly
                  className="bg-[#f7f3ee]"
                />
              </Field>

              <Field label="Deposit">
                <Input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(event) =>
                    {
                      setDepositWasEdited(true);
                      setDepositAmount(Number(event.target.value || 0));
                    }
                  }
                />
              </Field>

              <div className="md:col-span-3 rounded-2xl bg-[#fff8eb] p-4 text-sm text-[#8a6b20] ring-1 ring-[#efd582]">
                Minimum deposit from selected catalog items: {money(minimumDeposit)}.
                You can edit it before payment.

                <button
                  type="button"
                  onClick={() => {
                    setDepositAmount(minimumDeposit);
                    setDepositWasEdited(false);
                  }}
                  className="ml-3 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#8a6b20] ring-1 ring-[#efd582]"
                >
                  Use minimum
                </button>
              </div>

              <div className="md:col-span-3">
                <Field label="Internal notes">
                  <Textarea
                    rows={6}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Gate code, delivery notes, colors, payment notes..."
                  />
                </Field>
              </div>
            </div>
          </main>

          <aside className="space-y-6">
            <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">Summary</h3>

              <div className="mt-5 space-y-3">
                {selectedProducts.map((item) => {
                  const product = getProduct(item.productId);

                  return (
                    <div key={item.productId} className="space-y-2">
                      <div className="flex justify-between gap-4 text-sm">
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
                            className="flex justify-between gap-4 pl-4 text-xs"
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

                <div className="space-y-3 border-t border-[#eee5d9] pt-4">
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

                  <div className="flex justify-between gap-4 text-sm">
                    <div className="text-[#6c6258]">Subtotal</div>
                    <div className="font-semibold text-[#1f1e1b]">
                      {money(subtotal)}
                    </div>
                  </div>

                  <div className="relative" ref={discountEditorRef}>
                    <div className="flex justify-between gap-4 text-sm">
                      <div className="text-[#6c6258]">Discount</div>
                      <button
                        type="button"
                        onClick={() => setDiscountEditorOpen((value) => !value)}
                        className="font-semibold text-[#1f1e1b] underline decoration-dotted underline-offset-4"
                      >
                        -{money(safeDiscountAmount)}
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
                              onChange={(event) => {
                                setDiscountPassword(event.target.value);
                                setDiscountAuthorized(false);
                                setDiscountAuthMessage(null);
                                setPaymentError(null);
                              }}
                              placeholder={discountSecurity.discount_password_hint || "Password"}
                              className="w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={authorizeDiscountPassword}
                            disabled={discountAuthLoading}
                            className="rounded-xl bg-[#23313f] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-wait disabled:opacity-70"
                          >
                            {discountAuthLoading ? "Verifying..." : "Verify code"}
                          </button>

                          {discountAuthMessage && (
                            <div
                              className={[
                                "text-xs",
                                discountAuthorized ? "text-emerald-700" : "text-red-700",
                              ].join(" ")}
                            >
                              {discountAuthMessage}
                            </div>
                          )}

                          <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                              Discount amount
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={discountAmount}
                              disabled={!discountAuthorized}
                              onChange={(event) => {
                                setDiscountAmount(Number(event.target.value || 0));
                                setPaymentError(null);
                              }}
                              className="w-full rounded-xl border border-[#d8cec0] bg-white px-3 py-2 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                            />
                          </label>

                          {!discountAuthorized && (
                            <div className="text-xs text-[#6c6258]">
                              Verify admin code to unlock discount amount.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
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

                  <div className="flex justify-between gap-4 text-sm">
                    <div className="text-[#6c6258]">Deposit</div>
                    <div className="font-semibold text-[#1f1e1b]">
                      -{money(depositAmount)}
                    </div>
                  </div>

                  <div className="flex justify-between gap-4 border-t border-[#eee5d9] pt-4">
                    <div className="font-semibold text-[#1f1e1b]">Total</div>
                    <div className="text-2xl font-semibold text-[#1f1e1b]">
                      {money(totalAmount)}
                    </div>
                  </div>

                  <div className="flex justify-between gap-4">
                    <div className="font-semibold text-[#1f1e1b]">
                      Balance due
                    </div>
                    <div className="text-xl font-semibold text-red-700">
                      {money(balanceDue)}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {!hasCustomer && (
              <div className="rounded-[24px] bg-red-50 p-4 text-sm leading-6 text-red-700 ring-1 ring-red-100">
                Choose existing customer or enter customer name before creating
                booking.
              </div>
            )}

            {!hasEventDate && (
              <div className="rounded-[24px] bg-red-50 p-4 text-sm leading-6 text-red-700 ring-1 ring-red-100">
                Choose event date before creating booking.
              </div>
            )}

            {selectedProducts.length === 0 && (
              <div className="rounded-[24px] bg-red-50 p-4 text-sm leading-6 text-red-700 ring-1 ring-red-100">
                Add at least one available product before creating booking.
              </div>
            )}

            {unavailableSelectedProducts.length > 0 && (
              <div className="rounded-[24px] bg-red-50 p-4 text-sm leading-6 text-red-700 ring-1 ring-red-100">
                Remove unavailable products before creating booking.
              </div>
            )}

            {unavailableSelectedModifierRows.length > 0 && (
              <div className="rounded-[24px] bg-red-50 p-4 text-sm leading-6 text-red-700 ring-1 ring-red-100">
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
              <div className="rounded-[24px] bg-red-50 p-4 text-sm leading-6 text-red-700 ring-1 ring-red-100">
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
              <div className="rounded-[24px] bg-blue-50 p-4 text-sm leading-6 text-blue-700 ring-1 ring-blue-100">
                Checking current inventory for the selected quantities...
              </div>
            )}

            {!selectedProductsAreChecking &&
              uncheckedSelectedProducts.length > 0 && (
                <div className="rounded-[24px] bg-[#fff8eb] p-4 text-sm leading-6 text-[#8a6b20] ring-1 ring-[#efd582]">
                  Inventory must be checked after quantity or date changes.
                </div>
              )}

            <div className="space-y-3 rounded-[24px] bg-[#f8f5f0] p-4 ring-1 ring-[#e7ddd0]">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                How to finish this booking
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-[#e7ddd0]">
                <input
                  type="radio"
                  name="completionStrategyChoice"
                  checked={completionStrategy === "staff_send_to_customer"}
                  onChange={() => setCompletionStrategy("staff_send_to_customer")}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#1f1e1b]">Send to customer</span>
                  <span className="mt-1 block text-xs leading-5 text-[#6c6258]">
                    Create a temporary reservation. The customer signs the contract and pays the deposit.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-3 ring-1 ring-[#e7ddd0]">
                <input
                  type="radio"
                  name="completionStrategyChoice"
                  checked={completionStrategy === "staff_complete_now"}
                  onChange={() => setCompletionStrategy("staff_complete_now")}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block text-sm font-semibold text-[#1f1e1b]">Complete now</span>
                  <span className="mt-1 block text-xs leading-5 text-[#6c6258]">
                    Use the current contract and payment flow for an in-person customer.
                  </span>
                </span>
              </label>
            </div>

            <button
              type="button"
              onClick={openPaymentModal}
              disabled={!canCreateBooking || bookingSubmitPending}
              className="w-full rounded-full bg-[#c9964f] px-6 py-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(201,150,79,0.28)] transition hover:bg-[#b78744] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {bookingSubmitPending
                ? "Creating booking..."
                : completionStrategy === "staff_send_to_customer"
                  ? "Create temporary booking"
                  : "Create booking"}
            </button>
          </aside>
        </section>
      )}

      <section className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((current) => Math.max(1, current - 1))}
          disabled={step === 1 || bookingSubmitPending}
          className="rounded-full border border-[#d8cec0] bg-white px-6 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>

        {step < 5 && (
          <button
            type="button"
            onClick={() => setStep((current) => Math.min(5, current + 1))}
            disabled={bookingSubmitPending}
            className="rounded-full bg-[#23313f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
          >
            Continue
          </button>
        )}
      </section>

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

            <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Payment before booking creation
              </h3>
              <p className="mt-1 text-sm text-[#6c6258]">
                Select payment method and amount to charge now.
              </p>
            </div>

            <div className="space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="rounded-[20px] bg-[#23313f] p-4 text-white">
                <div className="text-xs uppercase tracking-[0.14em] text-white/65">
                  POS checkout
                </div>
                <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
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
                <div className="mt-3 border-t border-white/15 pt-3 text-right text-2xl font-semibold">
                  {money(totalChargeNow)}
                </div>
              </div>

              <Field label="Payment method">
                <div className="flex flex-wrap gap-2">
                  {paymentMethods.map((item) => {
                    const selected = item.method === paymentMethod;

                    return (
                      <button
                        key={item.method}
                        type="button"
                        onClick={() => setPaymentMethod(item.method)}
                        className={[
                          "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition",
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
                <div className="space-y-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                    Tip ({tipMode === "percent" ? "%" : "$"} mode from settings)
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => {
                        setTipPercent(0);
                        setTipAmount(0);
                        setTipAmountEdited(false);
                      }}
                      className={[
                        "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
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
                              "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
                              Number(percent) === Number(tipPercent) && !tipAmountEdited
                                ? "border-[#23313f] bg-[#23313f] text-white"
                                : "border-[#d8cec0] bg-white text-[#2b2a28]",
                            ].join(" ")}
                          >
                            <span className="text-2xl font-bold">{percent}%</span>
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
                              "flex min-h-[86px] flex-col items-center justify-center rounded-2xl border px-4 py-3 text-center transition",
                              Number(amount) === Number(tipAmount) && !tipAmountEdited
                                ? "border-[#23313f] bg-[#23313f] text-white"
                                : "border-[#d8cec0] bg-white text-[#2b2a28]",
                            ].join(" ")}
                          >
                            <span className="text-2xl font-bold">{money(Number(amount || 0))}</span>
                            <span className="mt-1 text-xs font-semibold uppercase tracking-[0.08em]">
                              Tip
                            </span>
                          </button>
                        ))}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
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

              <div className="rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
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
                    <span>Subtotal</span>
                    <span className="font-semibold text-[#1f1e1b]">{money(subtotal)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Discount</span>
                    <span className="font-semibold text-[#1f1e1b]">-{money(safeDiscountAmount)}</span>
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

              <Field label="Reference / transaction id">
                <Input
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Optional"
                />
              </Field>

              {paymentMethod && (
                <div className="rounded-2xl bg-[#fcfaf7] p-4 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
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

            <div className="flex items-center justify-end gap-3 border-t border-[#eee5d9] bg-white px-4 py-4 sm:px-6 sm:py-5">
              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                disabled={bookingSubmitPending}
                className="rounded-full border border-[#d8cec0] bg-white px-5 py-2.5 text-sm font-semibold text-[#2b2a28]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmCreateBooking}
                disabled={bookingSubmitPending}
                className="rounded-full bg-[#23313f] px-5 py-2.5 text-sm font-semibold text-white"
              >
                {bookingSubmitPending ? "Creating..." : "Create booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bookingSubmitPending && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#1a232d]/55 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-[#1f1e1b] shadow-[0_12px_35px_rgba(0,0,0,0.22)]">
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-[#d8cec0] border-t-[#23313f]"
              aria-hidden="true"
            />
            Creating booking, please wait...
          </div>
        </div>
      )}
    </form>
  );
}
import DateTimePicker from "@react-native-community/datetimepicker";
import SignatureCanvas from "react-native-signature-canvas";
import { WebView } from "react-native-webview";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  createNewBookingFromMobile,
  loadNewBookingAvailabilityFromMobile,
  loadNewBookingBootstrapFromMobile,
  loadNewBookingPricingFromMobile,
  type MobileNewBookingAvailabilityItem,
  type MobileNewBookingModifierAvailabilityItem,
  type MobileNewBookingBootstrap,
  type MobileNewBookingCustomer,
  type MobileNewBookingModifierGroup,
  type MobileNewBookingModifierOption,
  type MobileNewBookingPricing,
  type MobileNewBookingProduct,
  verifyNewBookingDiscountPasswordFromMobile,} from "../../lib/mobileApi";

type Props = {
  onClose?: () => void;
};

type CustomerMode = "existing" | "new";

type NewCustomerDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

type EventDraft = {
  eventDate: string;
  eventStartTime: string;
  eventEndTime: string;
  setupAddress: string;
  setupCity: string;
  setupState: string;
  setupZip: string;
};

type TimePickerMode = "start" | "end" | null;

const COLORS = {
  background: "#f5f1e8",
  navy: "#23313f",
  gold: "#b88645",
  lightGold: "#f0c987",
  mutedBrown: "#81766a",
  mutedText: "#6c6258",
  white: "#ffffff",
  success: "#5f735c",
  error: "#8c2e2a",
  errorBackground: "#fff1f0",
  border: "#ded6c8",
};

const EMPTY_NEW_CUSTOMER: NewCustomerDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
};

const EMPTY_EVENT: EventDraft = {
  eventDate: "",
  eventStartTime: "",
  eventEndTime: "",
  setupAddress: "",
  setupCity: "",
  setupState: "CA",
  setupZip: "",
};

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function customerName(customer: MobileNewBookingCustomer) {
  const value = String(customer.full_name || "").trim();
  return value || "Unnamed customer";
}

function customerSubtitle(customer: MobileNewBookingCustomer) {
  return [customer.phone, customer.email]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" · ");
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}

function isoToDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date();
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const date = new Date(
    year,
    month - 1,
    day,
    12,
    0,
    0,
    0,
  );

  return Number.isNaN(date.getTime())
    ? new Date()
    : date;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return false;
  }

  const date = isoToDate(value.trim());

  return !Number.isNaN(date.getTime());
}

function formatEventDate(value: string) {
  if (!validDate(value)) {
    return "Select date";
  }

  return isoToDate(value).toLocaleDateString(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
}

function timeToMinutes(value: string) {
  const [hoursRaw, minutesRaw] = value.split(":");

  const hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);

  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${pad(hours)}:${pad(minutes)}`;
}

function buildHalfHourSlots(
  fromMinutes: number,
  toMinutes: number,
) {
  const start =
    Math.ceil(fromMinutes / 30) * 30;

  const end =
    Math.floor(toMinutes / 30) * 30;

  const result: string[] = [];

  for (
    let current = start;
    current <= end;
    current += 30
  ) {
    result.push(minutesToTime(current));
  }

  return result;
}

function normalizeTime(value: string) {
  const trimmed = value.trim();

  const match = trimmed.match(
    /^(\d{1,2}):(\d{2})$/,
  );

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return {
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
  };
}

function validEventTimes(
  startTime: string,
  endTime: string,
) {
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);

  if (!start || !end) {
    return false;
  }

  return (
    end.totalMinutes >=
    start.totalMinutes + 30
  );
}

function formatTimeLabel(
  value: string,
  timeFormat?: string | null,
) {
  if (!value) {
    return "";
  }

  const [hoursRaw, minutesRaw] =
    value.split(":");

  const hours = Number(hoursRaw || 0);
  const minutes = Number(minutesRaw || 0);

  const normalizedFormat = String(
    timeFormat || "",
  ).toLowerCase();

  const use24Hour =
    normalizedFormat.includes("24");

  if (use24Hour) {
    return `${pad(hours)}:${pad(minutes)}`;
  }

  const period =
    hours >= 12 ? "PM" : "AM";

  const hour12 =
    hours % 12 === 0 ? 12 : hours % 12;

  return `${hour12}:${pad(minutes)} ${period}`;
}

export function AdminNewBookingScreen({
  onClose,
}: Props) {
  const [bootstrap, setBootstrap] =
    useState<MobileNewBookingBootstrap | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [step, setStep] =
    useState(1);

  const [customerMode, setCustomerMode] =
    useState<CustomerMode>("existing");

  const [search, setSearch] =
    useState("");

  const [
    selectedCustomerId,
    setSelectedCustomerId,
  ] = useState<string | null>(null);

  const [newCustomer, setNewCustomer] =
    useState<NewCustomerDraft>(
      EMPTY_NEW_CUSTOMER,
    );

  const [event, setEvent] =
    useState<EventDraft>(EMPTY_EVENT);

  const [
  selectedProductIds,
  setSelectedProductIds,
] = useState<string[]>([]);

const [
  availabilityByProductId,
  setAvailabilityByProductId,
] = useState<
  Record<
    string,
    MobileNewBookingAvailabilityItem
  >
>({});

const [
  availabilityLoading,
  setAvailabilityLoading,
] = useState(false);

const [
  availabilityError,
  setAvailabilityError,
] = useState("");

const [
  selectedModifierQuantities,
  setSelectedModifierQuantities,
] = useState<Record<string, Record<string, number>>>({});

const [
  modifierAvailabilityByProductId,
  setModifierAvailabilityByProductId,
] = useState<
  Record<
    string,
    MobileNewBookingModifierAvailabilityItem[]
  >
>({});

const [
  modifierAvailabilityLoading,
  setModifierAvailabilityLoading,
] = useState(false);

const [
  modifierAvailabilityError,
  setModifierAvailabilityError,
] = useState("");

  const loadBootstrap =
    useCallback(async () => {
      setLoading(true);
      setError("");

      const result =
        await loadNewBookingBootstrapFromMobile();

      if (!result.success) {
        setBootstrap(null);
        setError(
          result.error ||
            "Could not load new booking data.",
        );
        setLoading(false);
        return;
      }

      setBootstrap(result.data);
      setLoading(false);
    }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const filteredCustomers =
    useMemo(() => {
      const customers =
        bootstrap?.customers || [];

      const query = normalize(search);

      if (!query) {
        return customers;
      }

      return customers.filter(
        (customer) => {
          const haystack = [
            customer.full_name,
            customer.phone,
            customer.email,
          ]
            .map(normalize)
            .join(" ");

          return haystack.includes(query);
        },
      );
    }, [bootstrap?.customers, search]);

  const [pricing, setPricing] =
    useState<MobileNewBookingPricing | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingError, setPricingError] = useState("");
  const [pricingRefreshKey, setPricingRefreshKey] = useState(0);

  const [creatingBooking, setCreatingBooking] =
    useState(false);

  const [completionStrategy, setCompletionStrategy] =
    useState<"staff_send_to_customer" | "staff_complete_now">(
      "staff_send_to_customer",
    );
  const [bookingStatus, setBookingStatus] =
    useState("inventory_reserved");

  const [createBookingError, setCreateBookingError] =
    useState("");

  const [contractModalOpen, setContractModalOpen] =
    useState(false);
  const [paymentModalOpen, setPaymentModalOpen] =
    useState(false);
  const [contractAccepted, setContractAccepted] =
    useState(false);
  const [contractSignerName, setContractSignerName] =
    useState("");
  const [
    contractSignatureDataUrl,
    setContractSignatureDataUrl,
  ] = useState("");
  const signatureRef = useRef<any>(null);

  const [paymentMethod, setPaymentMethod] =
    useState("");
  const [paymentAmount, setPaymentAmount] =
    useState("");
  const [paymentReference, setPaymentReference] =
    useState("");
  const [tipPercent, setTipPercent] =
    useState("");
  const [tipAmount, setTipAmount] =
    useState("");
  const [discountAmount, setDiscountAmount] =
    useState("");
  const [discountPassword, setDiscountPassword] =
    useState("");
  const [discountAuthorized, setDiscountAuthorized] =
    useState(false);
  const [discountAuthLoading, setDiscountAuthLoading] =
    useState(false);
  const [discountAuthMessage, setDiscountAuthMessage] =
    useState("");

  const [bookingAttemptId] =
    useState(
      () =>
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
          /[xy]/g,
          (character) => {
            const random = Math.floor(Math.random() * 16);
            const value =
              character === "x"
                ? random
                : (random & 0x3) | 0x8;

            return value.toString(16);
          },
        ),
    );

  const selectedCustomer =
    useMemo(
      () =>
        bootstrap?.customers.find(
          (customer) =>
            customer.id ===
            selectedCustomerId,
        ) || null,
      [
        bootstrap?.customers,
        selectedCustomerId,
      ],
    );

  const customerStepValid =
    useMemo(() => {
      if (customerMode === "existing") {
        return Boolean(
          selectedCustomerId,
        );
      }

      return (
        newCustomer.firstName.trim()
          .length > 0 &&
        newCustomer.lastName.trim()
          .length > 0 &&
        newCustomer.phone.trim()
          .length > 0 &&
        newCustomer.email.trim()
          .length > 0
      );
    }, [
      customerMode,
      newCustomer.email,
      newCustomer.firstName,
      newCustomer.lastName,
      newCustomer.phone,
      selectedCustomerId,
    ]);

  const eventStepValid =
    useMemo(() => {
      return (
        validDate(event.eventDate) &&
        validEventTimes(
          event.eventStartTime,
          event.eventEndTime,
        ) &&
        event.setupAddress.trim().length >
          0 &&
        event.setupCity.trim().length >
          0 &&
        event.setupState.trim().length >
          0 &&
        event.setupZip.trim().length > 0
      );
    }, [event]);

  const activeProductIds =
    useMemo(
      () =>
        (bootstrap?.products || [])
          .filter(
            (product) =>
              product.active !== false,
          )
          .map((product) => product.id),
      [bootstrap?.products],
    );

  useEffect(() => {
    if (
      step !== 3 ||
      !validDate(event.eventDate) ||
      !validEventTimes(
        event.eventStartTime,
        event.eventEndTime,
      ) ||
      activeProductIds.length === 0
    ) {
      return;
    }

    let cancelled = false;

    setAvailabilityLoading(true);
    setAvailabilityError("");
    setAvailabilityByProductId({});

    void (async () => {
      const result =
        await loadNewBookingAvailabilityFromMobile({
          eventDate: event.eventDate,
          eventStartTime:
            event.eventStartTime,
          eventEndTime:
            event.eventEndTime,
          productIds: activeProductIds,
        });

      if (cancelled) {
        return;
      }

      if (!result.success) {
        setAvailabilityError(
          result.error ||
            "Could not check product availability.",
        );
        setAvailabilityLoading(false);
        return;
      }

      const nextAvailability: Record<
        string,
        MobileNewBookingAvailabilityItem
      > = {};

      for (const item of result.data.items) {
        nextAvailability[item.productId] =
          item;
      }

      setAvailabilityByProductId(
        nextAvailability,
      );

      setSelectedProductIds(
        (current) =>
          current.filter(
            (productId) =>
              nextAvailability[
                productId
              ]?.available === true,
          ),
      );

      setAvailabilityLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeProductIds,
    event.eventDate,
    event.eventEndTime,
    event.eventStartTime,
    step,
  ]);

  useEffect(() => {
    const selectedProductIdSet = new Set(selectedProductIds);

    setSelectedModifierQuantities((current) => {
      let changed = false;
      const next: Record<string, Record<string, number>> = {};

      for (const [key, quantities] of Object.entries(current)) {
        const productId = key.split(":", 1)[0];

        if (selectedProductIdSet.has(productId)) {
          next[key] = quantities;
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [selectedProductIds]);

  useEffect(() => {
    if (
      step !== 4 ||
      !validDate(event.eventDate) ||
      !validEventTimes(
        event.eventStartTime,
        event.eventEndTime,
      ) ||
      selectedProductIds.length === 0
    ) {
      return;
    }

    let cancelled = false;

    setModifierAvailabilityLoading(true);
    setModifierAvailabilityError("");
    setModifierAvailabilityByProductId({});

    void (async () => {
      const result =
        await loadNewBookingAvailabilityFromMobile({
          eventDate: event.eventDate,
          eventStartTime:
            event.eventStartTime,
          eventEndTime:
            event.eventEndTime,
          productIds: selectedProductIds,
          includeModifierAvailability: true,
        });

      if (cancelled) {
        return;
      }

      if (!result.success) {
        setModifierAvailabilityError(
          result.error ||
            "Could not check option availability.",
        );
        setModifierAvailabilityLoading(false);
        return;
      }

      const next =
        result.data
          .modifierAvailabilityByProductId ||
        {};

      setModifierAvailabilityByProductId(
        next,
      );

      setSelectedModifierQuantities(
        (current) => {
          let changed = false;
          const updated: Record<
            string,
            Record<string, number>
          > = {};

          for (const [key, quantities] of Object.entries(
            current,
          )) {
            const [productId] = key.split(":");
            const productAvailability =
              next[productId] || [];
            const nextQuantities: Record<
              string,
              number
            > = {};

            for (const [
              optionId,
              quantity,
            ] of Object.entries(quantities)) {
              const availability =
                productAvailability.find(
                  (item) =>
                    item.optionId === optionId,
                );

              if (
                availability &&
                availability.available === false
              ) {
                changed = true;
                continue;
              }

              nextQuantities[optionId] =
                quantity;
            }

            updated[key] = nextQuantities;
          }

          return changed ? updated : current;
        },
      );

      setModifierAvailabilityLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    event.eventDate,
    event.eventEndTime,
    event.eventStartTime,
    selectedProductIds,
    step,
  ]);

  useEffect(() => {
    if (step !== 5 || selectedProductIds.length === 0) {
      return;
    }

    let cancelled = false;
    setPricingLoading(true);
    setPricingError("");

    const modifiers = Object.entries(selectedModifierQuantities).flatMap(
      ([key, quantities]) => {
        const separator = key.indexOf(":");
        if (separator <= 0) return [];

        const productId = key.slice(0, separator);
        const groupId = key.slice(separator + 1);

        return Object.entries(quantities)
          .filter(([, quantity]) => Number(quantity || 0) > 0)
          .map(([optionId, quantity]) => ({
            productId,
            groupId,
            optionId,
            quantity: Math.max(1, Number(quantity || 1)),
          }));
      },
    );

    void (async () => {
      const result = await loadNewBookingPricingFromMobile({
        setupAddress: event.setupAddress,
        setupCity: event.setupCity,
        setupState: event.setupState || "CA",
        setupZip: event.setupZip,
        discountAmount: Math.max(
          0,
          Number(discountAmount || 0),
        ),
        products: selectedProductIds.map((productId) => ({
          productId,
          quantity: 1,
        })),
        modifiers,
      });

      if (cancelled) return;

      if (!result.success) {
        setPricingError(
          result.error || "Could not calculate booking pricing.",
        );
        setPricingLoading(false);
        return;
      }

      setPricing(result.data);
      setPricingLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    event.setupAddress,
    event.setupCity,
    event.setupState,
    event.setupZip,
    discountAmount,
    pricingRefreshKey,
    selectedModifierQuantities,
    selectedProductIds,
    step,
  ]);

  const selectedProductsAvailable =
    useMemo(
      () =>
        selectedProductIds.length > 0 &&
        selectedProductIds.every(
          (productId) =>
            availabilityByProductId[
              productId
            ]?.available === true,
        ),
      [
        availabilityByProductId,
        selectedProductIds,
      ],
    );

  const activeModifierGroupsForSelectedProducts =
    useMemo(
      () =>
        (bootstrap?.modifierGroups || [])
          .filter(
            (group) =>
              selectedProductIds.includes(group.productId) &&
              group.active !== false,
          )
          .sort(
            (a, b) =>
              Number(a.sortOrder || 0) -
              Number(b.sortOrder || 0),
          ),
      [bootstrap?.modifierGroups, selectedProductIds],
    );

  const modifierStepValid =
    !modifierAvailabilityLoading &&
    !modifierAvailabilityError &&
    activeModifierGroupsForSelectedProducts
      .filter((group) => group.required === true)
      .every((group) => {
        const key = `${group.productId}:${group.id}`;
        const quantities =
          selectedModifierQuantities[key] || {};

        return Object.entries(quantities).some(
          ([optionId, quantity]) => {
            if (Number(quantity || 0) <= 0) {
              return false;
            }

            const availability =
              (
                modifierAvailabilityByProductId[
                  group.productId
                ] || []
              ).find(
                (item) =>
                  item.optionId === optionId,
              );

            return (
              !availability ||
              availability.available === true
            );
          },
        );
      });

  const canContinue =
    step === 1
      ? customerStepValid
      : step === 2
        ? eventStepValid
        : step === 3
          ? !availabilityLoading &&
            !availabilityError &&
            selectedProductsAvailable
          : step === 4
            ? modifierStepValid
            : step === 5
              ? Boolean(
                  pricing &&
                    pricing.ok === true &&
                    !pricingLoading &&
                    !pricingError &&
                    !creatingBooking,
                )
              : false;

  const updateNewCustomer = (
    key: keyof NewCustomerDraft,
    value: string,
  ) => {
    setNewCustomer((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateEvent = (
    key: keyof EventDraft,
    value: string,
  ) => {
    setEvent((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(
        (current) => current - 1,
      );
      return;
    }

    onClose?.();
  };

  const selectedCustomerName =
    customerMode === "existing"
      ? String(selectedCustomer?.full_name || "").trim()
      : `${newCustomer.firstName} ${newCustomer.lastName}`.trim();

  const contractHtml = (() => {
    const template =
      String(
        bootstrap?.contractSettings.template_html ||
          "<h2>Rental Agreement</h2><p>Customer: {{customer_name}}</p><p>Event date: {{event_date}}</p><p>Total: {{total_amount}}</p><p>{{signature_label}}: {{signature_name}}</p><p>Date: {{signature_date}}</p>",
      );

    const customerEmail =
      customerMode === "existing"
        ? String(selectedCustomer?.email || "").trim()
        : String(newCustomer.email || "").trim();

    const money = (value: number) =>
      `$${Number(value || 0).toFixed(2)}`;

    const signatureMarkup = contractSignatureDataUrl
      ? `<img src="${contractSignatureDataUrl}" alt="Manual signature" style="display:block;max-width:280px;height:auto;border-bottom:1px solid #d8cec0;padding-bottom:2px;" />`
      : contractSignerName.trim();

    const replacements: Record<string, string> = {
      customer_name: selectedCustomerName || "Customer",
      customer_email: customerEmail,
      event_date: event.eventDate || "",
      event_start_time: event.eventStartTime || "",
      event_end_time: event.eventEndTime || "",
      setup_address: event.setupAddress || "",
      setup_city: event.setupCity || "",
      setup_state: event.setupState || "",
      setup_zip: event.setupZip || "",
      subtotal: money(Number(pricing?.subtotal || 0)),
      discount_amount: money(
        Number(pricing?.discountAmount || 0),
      ),
      delivery_fee: money(
        Number(pricing?.deliveryFee || 0),
      ),
      tax_amount: money(Number(pricing?.taxAmount || 0)),
      total_amount: money(
        Number(pricing?.totalAmount || 0),
      ),
      deposit_amount: money(
        Number(pricing?.depositAmount || 0),
      ),
      balance_due: money(
        Number(pricing?.balanceDue || 0),
      ),
      signature_label:
        String(
          bootstrap?.contractSettings.signature_label ||
            "Client signature",
        ),
      signature_name: contractSignerName || "",
      signature_manual: signatureMarkup,
      signature_date: new Date().toISOString().slice(0, 10),
    };

    const renderedTemplate = template.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
      (_, key) => replacements[key] ?? "",
    );

    const productRows = (pricing?.products || [])
      .map(
        (item) =>
          `<tr><td style="padding:6px 0;">${item.name || "Product"} x ${item.quantity}</td><td style="padding:6px 0;text-align:right;">${money(item.lineTotal)}</td></tr>`,
      )
      .join("");

    const orderInfoBlock = `
      <section style="border:1px solid #e7ddd0;border-radius:14px;padding:16px;margin-bottom:16px;background:#fcfaf7;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9a7a49;font-weight:700;">Order Summary</div>
        <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;color:#4b4339;">
          <div><strong>Customer:</strong> ${replacements.customer_name}</div>
          <div><strong>Email:</strong> ${replacements.customer_email || "-"}</div>
          <div><strong>Event date:</strong> ${replacements.event_date}</div>
          <div><strong>Time:</strong> ${replacements.event_start_time} - ${replacements.event_end_time}</div>
          <div style="grid-column:1 / -1;"><strong>Address:</strong> ${replacements.setup_address}, ${replacements.setup_city} ${replacements.setup_zip}</div>
        </div>
        <table style="width:100%;margin-top:10px;border-collapse:collapse;font-size:13px;color:#3f382f;">
          <tbody>${productRows}</tbody>
        </table>
        <div style="margin-top:10px;border-top:1px solid #e7ddd0;padding-top:10px;display:grid;gap:4px;font-size:13px;color:#3f382f;">
          <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><strong>${replacements.subtotal}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Discount</span><strong>${replacements.discount_amount}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Delivery</span><strong>${replacements.delivery_fee}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Tax</span><strong>${replacements.tax_amount}</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:15px;"><span>Total</span><strong>${replacements.total_amount}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Deposit</span><strong>${replacements.deposit_amount}</strong></div>
          <div style="display:flex;justify-content:space-between;"><span>Balance due</span><strong>${replacements.balance_due}</strong></div>
        </div>
      </section>
    `;

    return `${orderInfoBlock}${renderedTemplate}`;
  })();

  const openPaymentFlow = () => {
    if (!pricing || !bootstrap) {
      return;
    }

    const minimumDeposit =
      Number(pricing.minimumDeposit || 0);

    const defaultPaymentAmount =
      Number(pricing.depositAmount || minimumDeposit);

    const defaultMethod =
      bootstrap.paymentMethods.find(
        (item) => Boolean(item.method),
      )?.method || "";

    setPaymentMethod((current) => current || defaultMethod);
    setPaymentAmount(
      Number(pricing.depositAmount || minimumDeposit).toFixed(2),
    );

    if (bootstrap.tipSettings.tipsEnabled) {
      const defaultPercent =
        Number(bootstrap.tipSettings.defaultTipPercent || 0);
      const defaultAmount =
        Number(bootstrap.tipSettings.defaultTipAmount || 0);

      if (bootstrap.tipSettings.tipMode === "amount") {
        setTipAmount(defaultAmount.toFixed(2));
        setTipPercent("0");
      } else {
        setTipPercent(defaultPercent.toFixed(2));
        setTipAmount(
          ((defaultPaymentAmount * defaultPercent) / 100).toFixed(2),
        );
      }
    } else {
      setTipPercent("0");
      setTipAmount("0");
    }

    setContractModalOpen(false);
    setPaymentModalOpen(true);
  };

  const buildSelectedModifiers = () =>
    Object.entries(selectedModifierQuantities).flatMap(
      ([key, quantities]) => {
        const separator = key.indexOf(":");

        if (separator <= 0) {
          return [];
        }

        const productId = key.slice(0, separator);
        const groupId = key.slice(separator + 1);

        return Object.entries(quantities)
          .filter(([, quantity]) => Number(quantity || 0) > 0)
          .map(([optionId, quantity]) => ({
            productId,
            groupId,
            optionId,
            quantity: Math.max(
              1,
              Number(quantity || 1),
            ),
          }));
      },
    );

  const submitTemporaryBooking = async () => {
    if (creatingBooking || !pricing || !bootstrap) {
      return;
    }

    setCreatingBooking(true);
    setCreateBookingError("");

    const result = await createNewBookingFromMobile({
      bookingAttemptId,
      completionStrategy: "staff_send_to_customer",
      status: bookingStatus,
      existingCustomerId:
        customerMode === "existing"
          ? selectedCustomerId
          : null,
      newCustomer:
        customerMode === "new"
          ? {
              firstName: newCustomer.firstName,
              lastName: newCustomer.lastName,
              phone: newCustomer.phone,
              email: newCustomer.email,
            }
          : null,
      eventDate: event.eventDate,
      eventStartTime: event.eventStartTime,
      eventEndTime: event.eventEndTime,
      setupAddress: event.setupAddress,
      setupCity: event.setupCity,
      setupState: event.setupState || "CA",
      setupZip: event.setupZip,
      products: selectedProductIds.map((productId) => ({
        productId,
        quantity: 1,
      })),
      modifiers: buildSelectedModifiers(),
      payment: {
        method: "",
        amount: 0,
        reference: "",
        tipMode: bootstrap.tipSettings.tipMode,
        tipPercent: 0,
        tipAmount: 0,
        discountAmount: Number(discountAmount || 0),
        discountPassword,
      },
    });

    setCreatingBooking(false);

    if (!result.success) {
      setCreateBookingError(
        result.error || "Could not create booking.",
      );
      return;
    }

    Alert.alert(
      "Temporary booking created",
      result.data.completionEmailStatus === "failed"
        ? `Booking #${result.data.bookingId.slice(-8)} was created, but the customer completion email failed.`
        : `Booking #${result.data.bookingId.slice(-8)} was created successfully.`,
      [
        {
          text: "Done",
          onPress: () => onClose?.(),
        },
      ],
    );
  };

  const openCompletionFlow = async () => {
    if (!pricing || !bootstrap) {
      return;
    }

    setCreateBookingError("");

    if (pricingLoading) {
      setCreateBookingError(
        "Please wait for pricing to finish updating.",
      );
      return;
    }

    if (completionStrategy === "staff_send_to_customer") {
      await submitTemporaryBooking();
      return;
    }

    const discount = Number(discountAmount || 0);

    if (!Number.isFinite(discount) || discount < 0) {
      setCreateBookingError(
        "Discount amount cannot be negative.",
      );
      return;
    }

    if (discount > Number(pricing.subtotal || 0)) {
      setCreateBookingError(
        "Discount cannot exceed products and options subtotal.",
      );
      return;
    }

    if (
      discount > 0 &&
      bootstrap.discountSecurity.discount_password_enabled
    ) {
      if (!discountPassword.trim()) {
        setCreateBookingError(
          "Enter the admin discount code before payment.",
        );
        return;
      }

      if (!discountAuthorized) {
        setDiscountAuthLoading(true);
        setDiscountAuthMessage("");

        const verification =
          await verifyNewBookingDiscountPasswordFromMobile(
            discountPassword.trim(),
          );

        setDiscountAuthLoading(false);

        if (!verification.success || !verification.data.ok) {
          const message = verification.success
            ? verification.data.message
            : verification.error;

          setDiscountAuthorized(false);
          setDiscountAuthMessage(
            message || "Invalid discount password.",
          );
          setCreateBookingError(
            message || "Invalid discount password.",
          );
          return;
        }

        setDiscountAuthorized(true);
        setDiscountAuthMessage(
          verification.data.message || "Discount authorized.",
        );
      }
    }

    const requiresContract =
      bootstrap.contractSettings
        .require_contract_before_payment !== false;

    if (!requiresContract) {
      setContractAccepted(false);
      setContractSignatureDataUrl("");
      openPaymentFlow();
      return;
    }

    setContractSignerName(selectedCustomerName);
    setContractAccepted(false);
    setContractSignatureDataUrl("");
    setContractModalOpen(true);
  };

  const continueFromContract = () => {
    const requiresTyped =
      bootstrap?.contractSettings
        .require_typed_signature !== false;

    if (requiresTyped && !contractSignerName.trim()) {
      setCreateBookingError("Enter the signer name.");
      return;
    }

    if (!contractAccepted) {
      setCreateBookingError(
        "Accept the rental agreement before continuing.",
      );
      return;
    }

    setCreateBookingError("");
    signatureRef.current?.readSignature();
  };

  const handleCapturedSignature = (signature: string) => {
    if (!signature) {
      setCreateBookingError(
        "Draw the customer signature before continuing.",
      );
      return;
    }

    setContractSignatureDataUrl(signature);
    setCreateBookingError("");
    openPaymentFlow();
  };

  const submitCompletedBooking = async () => {
    if (creatingBooking || !pricing || !bootstrap) {
      return;
    }

    const amount = Number(paymentAmount || 0);
    const discount = Number(discountAmount || 0);
    const tip = bootstrap.tipSettings.tipsEnabled
      ? Number(tipAmount || 0)
      : 0;
    const tipPct = bootstrap.tipSettings.tipsEnabled
      ? Number(tipPercent || 0)
      : 0;

    if (!Number.isFinite(amount) || amount < 0) {
      setCreateBookingError(
        "Payment amount cannot be negative.",
      );
      return;
    }

    if (amount > Number(pricing.totalAmount || 0)) {
      setCreateBookingError(
        "Payment amount cannot exceed booking total.",
      );
      return;
    }

    if (amount > 0 && !paymentMethod) {
      setCreateBookingError("Choose a payment method.");
      return;
    }

    if (
      !Number.isFinite(discount) ||
      discount < 0 ||
      discount > Number(pricing.subtotal || 0)
    ) {
      setCreateBookingError(
        "Enter a valid discount amount.",
      );
      return;
    }

    if (
      discount > 0 &&
      bootstrap.discountSecurity.discount_password_enabled &&
      !discountPassword.trim()
    ) {
      setCreateBookingError(
        "Enter the admin discount code.",
      );
      return;
    }

    const modifiers = buildSelectedModifiers();

    setCreatingBooking(true);
    setCreateBookingError("");

    const result =
      await createNewBookingFromMobile({
        bookingAttemptId,
        completionStrategy: "staff_complete_now",
        status: bookingStatus,
        existingCustomerId:
          customerMode === "existing"
            ? selectedCustomerId
            : null,
        newCustomer:
          customerMode === "new"
            ? {
                firstName: newCustomer.firstName,
                lastName: newCustomer.lastName,
                phone: newCustomer.phone,
                email: newCustomer.email,
              }
            : null,
        eventDate: event.eventDate,
        eventStartTime: event.eventStartTime,
        eventEndTime: event.eventEndTime,
        setupAddress: event.setupAddress,
        setupCity: event.setupCity,
        setupState: event.setupState || "CA",
        setupZip: event.setupZip,
        products: selectedProductIds.map(
          (productId) => ({
            productId,
            quantity: 1,
          }),
        ),
        modifiers,
        contract: {
          accepted:
            bootstrap.contractSettings
              .require_contract_before_payment === false
              ? false
              : contractAccepted,
          signerName: contractSignerName.trim(),
          manualSignature: contractSignerName.trim(),
          signatureDataUrl: contractSignatureDataUrl,
        },
        payment: {
          method: paymentMethod,
          amount,
          reference: paymentReference.trim(),
          tipMode: bootstrap.tipSettings.tipMode,
          tipPercent: tipPct,
          tipAmount: tip,
          discountAmount: discount,
          discountPassword,
        },
      });

    setCreatingBooking(false);

    if (!result.success) {
      setCreateBookingError(
        result.error || "Could not create booking.",
      );
      return;
    }

    setPaymentModalOpen(false);

    const checkoutUrl = result.data.stripeCheckoutUrl;

    if (checkoutUrl) {
      try {
        await Linking.openURL(checkoutUrl);
      } catch {
        setCreateBookingError(
          "Booking was created, but Stripe checkout could not be opened.",
        );
      }
    }

    Alert.alert(
      "Booking created",
      checkoutUrl
        ? `Booking #${result.data.bookingId.slice(-8)} was created. Complete the card payment in Stripe.`
        : `Booking #${result.data.bookingId.slice(-8)} was created successfully.`,
      [
        {
          text: "Done",
          onPress: () => onClose?.(),
        },
      ],
    );
  };

  const handleContinue = async () => {
    if (!canContinue) {
      return;
    }

    if (step === 1) {
      setStep(2);
      return;
    }

    if (step === 2) {
      setStep(3);
      return;
    }

    if (step === 3) {
      setStep(4);
      return;
    }

    if (step === 4) {
      setCreateBookingError("");
      setStep(5);
      return;
    }

    if (step !== 5 || !pricing) {
      return;
    }

    await openCompletionFlow();
    return;
  };

  if (loading) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.centerState}
        >
          <ActivityIndicator
            size="large"
            color={COLORS.gold}
          />

          <Text
            style={styles.loadingTitle}
          >
            New Booking
          </Text>

          <Text
            style={styles.loadingText}
          >
            Loading customers and booking
            data...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !bootstrap) {
    return (
      <SafeAreaView
        style={styles.safeArea}
      >
        <View
          style={styles.centerState}
        >
          <View
            style={styles.errorCard}
          >
            <Text
              style={styles.errorTitle}
            >
              Could not open New Booking
            </Text>

            <Text
              style={styles.errorText}
            >
              {error ||
                "Booking data was not returned by the server."}
            </Text>
          </View>

          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              void loadBootstrap();
            }}
          >
            <Text
              style={
                styles.primaryButtonText
              }
            >
              Try Again
            </Text>
          </Pressable>

          {onClose ? (
            <Pressable
              style={
                styles.secondaryButton
              }
              onPress={onClose}
            >
              <Text
                style={
                  styles.secondaryButtonText
                }
              >
                Back
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : undefined
        }
      >
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <Pressable
              onPress={handleBack}
              hitSlop={12}
              style={
                styles.headerBackButton
              }
            >
              <Text
                style={
                  styles.headerBackText
                }
              >
                Back
              </Text>
            </Pressable>
          </View>

          <View
            style={styles.headerCenter}
          >
            <Text
              style={styles.headerTitle}
            >
              New Booking
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              Step {step} of 5
            </Text>
          </View>

          <View style={styles.headerSide} />
        </View>

        <View
          style={styles.progressTrack}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${step * 20}%`,
              },
            ]}
          />
        </View>

        <ScrollView
          key={step}
          style={styles.scroll}
          contentContainerStyle={
            styles.scrollContent
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
        >
          {step === 1 ? (
            <CustomerStep
              customerMode={customerMode}
              setCustomerMode={
                setCustomerMode
              }
              search={search}
              setSearch={setSearch}
              selectedCustomerId={
                selectedCustomerId
              }
              setSelectedCustomerId={
                setSelectedCustomerId
              }
              selectedCustomer={
                selectedCustomer
              }
              filteredCustomers={
                filteredCustomers
              }
              newCustomer={newCustomer}
              updateNewCustomer={
                updateNewCustomer
              }
            />
          ) : null}

          {step === 2 ? (
            <DateTimeStep
              event={event}
              updateEvent={updateEvent}
              timeFormat={
                bootstrap.timeFormat
              }
            />
          ) : null}



 {step === 3 ? (
    <ProductsStep
      products={bootstrap.products}
      selectedProductIds={
        selectedProductIds
      }
      setSelectedProductIds={
        setSelectedProductIds
      }
      availabilityByProductId={
        availabilityByProductId
      }
      availabilityLoading={
        availabilityLoading
      }
      availabilityError={
        availabilityError
      }
    />
  ) : null}

          {step === 4 ? (
            <OptionsStep
              products={bootstrap.products}
              modifierGroups={bootstrap.modifierGroups}
              selectedProductIds={selectedProductIds}
              selectedModifierQuantities={
                selectedModifierQuantities
              }
              setSelectedModifierQuantities={
                setSelectedModifierQuantities
              }
              modifierAvailabilityByProductId={
                modifierAvailabilityByProductId
              }
              modifierAvailabilityLoading={
                modifierAvailabilityLoading
              }
              modifierAvailabilityError={
                modifierAvailabilityError
              }
            />
          ) : null}

          {step === 5 ? (
            <ReviewStep
              customerMode={customerMode}
              selectedCustomer={selectedCustomer}
              newCustomer={newCustomer}
              event={event}
              timeFormat={bootstrap.timeFormat}
              products={bootstrap.products}
              modifierGroups={bootstrap.modifierGroups}
              selectedProductIds={selectedProductIds}
              selectedModifierQuantities={selectedModifierQuantities}
              pricing={pricing}
              pricingLoading={pricingLoading}
              pricingError={pricingError}
              onRetry={() =>
                setPricingRefreshKey((current) => current + 1)
              }
            />
          ) : null}

          {step === 5 ? (
            <View
              style={{
                marginTop: 18,
                padding: 16,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.white,
              }}
            >
              <Text
                style={{
                  color: COLORS.navy,
                  fontSize: 16,
                  fontWeight: "900",
                }}
              >
                Discount
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  color: COLORS.mutedText,
                  fontSize: 13,
                }}
              >
                Apply and authorize any discount before the contract is signed.
              </Text>

              <TextInput
                value={discountAmount}
                onChangeText={(value) => {
                  setDiscountAmount(value);
                  setDiscountAuthorized(false);
                  setDiscountAuthMessage("");
                  setCreateBookingError("");
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                style={{
                  marginTop: 12,
                  minHeight: 50,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.background,
                  color: COLORS.navy,
                  fontSize: 16,
                }}
              />

              {bootstrap?.discountSecurity
                .discount_password_enabled &&
              Number(discountAmount || 0) > 0 ? (
                <>
                  <TextInput
                    value={discountPassword}
                    onChangeText={(value) => {
                      setDiscountPassword(value);
                      setDiscountAuthorized(false);
                      setDiscountAuthMessage("");
                      setCreateBookingError("");
                    }}
                    secureTextEntry
                    placeholder={
                      bootstrap.discountSecurity
                        .discount_password_hint ||
                      "Admin discount code"
                    }
                    style={{
                      marginTop: 10,
                      minHeight: 50,
                      paddingHorizontal: 14,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      backgroundColor: COLORS.background,
                      color: COLORS.navy,
                      fontSize: 16,
                    }}
                  />

                  <Pressable
                    disabled={discountAuthLoading}
                    onPress={async () => {
                      if (!discountPassword.trim()) {
                        setDiscountAuthorized(false);
                        setDiscountAuthMessage(
                          "Enter admin code first.",
                        );
                        return;
                      }

                      setDiscountAuthLoading(true);
                      setDiscountAuthMessage("");

                      const result =
                        await verifyNewBookingDiscountPasswordFromMobile(
                          discountPassword.trim(),
                        );

                      setDiscountAuthLoading(false);

                      if (!result.success || !result.data.ok) {
                        setDiscountAuthorized(false);
                        setDiscountAuthMessage(
                          result.success
                            ? result.data.message
                            : result.error,
                        );
                        return;
                      }

                      setDiscountAuthorized(true);
                      setDiscountAuthMessage(
                        result.data.message ||
                          "Discount authorized.",
                      );
                    }}
                    style={{
                      marginTop: 10,
                      minHeight: 46,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: COLORS.lightGold,
                      opacity: discountAuthLoading ? 0.6 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.navy,
                        fontWeight: "900",
                      }}
                    >
                      {discountAuthLoading
                        ? "Checking..."
                        : discountAuthorized
                          ? "Code accepted"
                          : "Verify code"}
                    </Text>
                  </Pressable>

                  {discountAuthMessage ? (
                    <Text
                      style={{
                        marginTop: 8,
                        color: discountAuthorized
                          ? COLORS.success
                          : COLORS.error,
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      {discountAuthMessage}
                    </Text>
                  ) : null}
                </>
              ) : null}

              {pricingLoading ? (
                <Text
                  style={{
                    marginTop: 10,
                    color: COLORS.mutedText,
                    fontSize: 13,
                  }}
                >
                  Updating total...
                </Text>
              ) : null}
            </View>
          ) : null}

          {step === 5 ? (
            <View style={{ marginTop: 18, gap: 12 }}>
              <Text
                style={{
                  color: COLORS.navy,
                  fontSize: 16,
                  fontWeight: "900",
                }}
              >
                How to finish this booking
              </Text>

              {[
                {
                  value: "staff_send_to_customer" as const,
                  title: "Send to customer",
                  description:
                    "Create a temporary reservation. The customer signs the contract and pays the deposit.",
                },
                {
                  value: "staff_complete_now" as const,
                  title: "Complete now",
                  description:
                    "Use the current contract and payment flow for an in-person customer.",
                },
              ].map((option) => {
                const active = completionStrategy === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setCompletionStrategy(option.value)}
                    style={{
                      padding: 16,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: active ? COLORS.gold : COLORS.border,
                      backgroundColor: COLORS.white,
                    }}
                  >
                    <Text style={{ color: COLORS.navy, fontSize: 15, fontWeight: "900" }}>
                      {active ? "◉ " : "○ "}{option.title}
                    </Text>
                    <Text style={{ marginTop: 5, color: COLORS.mutedText, fontSize: 13, lineHeight: 19 }}>
                      {option.description}
                    </Text>
                  </Pressable>
                );
              })}

              {completionStrategy === "staff_complete_now" ? (
                <>
                  <Text style={{ marginTop: 6, color: COLORS.navy, fontSize: 15, fontWeight: "900" }}>
                    Booking status
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {[
                      ["draft", "Draft"],
                      ["quote", "Quote"],
                      ["pending_deposit", "Pending deposit"],
                      ["booked", "Booked"],
                      ["scheduled", "Scheduled"],
                      ["inventory_reserved", "Inventory reserved"],
                      ["out_for_delivery", "Out for delivery"],
                      ["installed", "Installed"],
                      ["closed", "Closed"],
                      ["cancelled", "Cancelled"],
                    ].map(([value, label]) => {
                      const active = bookingStatus === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => setBookingStatus(value)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: active ? COLORS.gold : COLORS.border,
                            backgroundColor: active ? COLORS.lightGold : COLORS.white,
                          }}
                        >
                          <Text style={{ color: COLORS.navy, fontSize: 13, fontWeight: "800" }}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}

          {step === 5 &&
          createBookingError ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>
                Could not create booking
              </Text>

              <Text style={styles.errorText}>
                {createBookingError}
              </Text>
            </View>
          ) : null}

          <View
            style={styles.bottomSpacer}
          />
        </ScrollView>

        <Modal
          visible={contractModalOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() =>
            setContractModalOpen(false)
          }
        >
          <SafeAreaView
            style={{
              flex: 1,
              backgroundColor: COLORS.background,
            }}
          >
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 14,
                paddingBottom: 10,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: "800",
                  color: COLORS.navy,
                }}
              >
                Contract
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 14,
                  color: COLORS.mutedText,
                }}
              >
                Review and sign before payment
              </Text>
            </View>

            <ScrollView
              contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={{
                  height: 320,
                  overflow: "hidden",
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.white,
                }}
              >
                <WebView
                  originWhitelist={["*"]}
                  source={{
                    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:18px;color:#23313f;line-height:1.45}img{max-width:100%}</style></head><body>${contractHtml}</body></html>`,
                  }}
                />
              </View>

              <Text
                style={{
                  marginTop: 20,
                  marginBottom: 8,
                  fontSize: 14,
                  fontWeight: "700",
                  color: COLORS.navy,
                }}
              >
                Signer name
              </Text>
              <TextInput
                value={contractSignerName}
                onChangeText={setContractSignerName}
                placeholder="Customer name"
                style={{
                  minHeight: 50,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.white,
                  color: COLORS.navy,
                  fontSize: 16,
                }}
              />

              <Text
                style={{
                  marginTop: 20,
                  marginBottom: 8,
                  fontSize: 14,
                  fontWeight: "700",
                  color: COLORS.navy,
                }}
              >
                {bootstrap?.contractSettings.signature_label ||
                  "Signature"}
              </Text>

              <View
                style={{
                  height: 210,
                  overflow: "hidden",
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.white,
                }}
              >
                <SignatureCanvas
                  ref={signatureRef}
                  onOK={handleCapturedSignature}
                  onBegin={() =>
                    setCreateBookingError("")
                  }
                  descriptionText=""
                  clearText="Clear"
                  confirmText="Use signature"
                  webStyle={`
                    .m-signature-pad { box-shadow:none; border:0; }
                    .m-signature-pad--body { border:0; }
                    .m-signature-pad--footer { margin:8px; }
                    body,html { width:100%; height:100%; }
                  `}
                />
              </View>

              <Pressable
                onPress={() =>
                  setContractAccepted(
                    (current) => !current,
                  )
                }
                style={{
                  marginTop: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: contractAccepted
                    ? COLORS.gold
                    : COLORS.border,
                  backgroundColor: COLORS.white,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: contractAccepted
                      ? COLORS.gold
                      : COLORS.border,
                    backgroundColor: contractAccepted
                      ? COLORS.lightGold
                      : COLORS.white,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.navy,
                      fontWeight: "900",
                    }}
                  >
                    {contractAccepted ? "✓" : ""}
                  </Text>
                </View>
                <Text
                  style={{
                    flex: 1,
                    color: COLORS.navy,
                    fontSize: 15,
                    fontWeight: "700",
                  }}
                >
                  I confirm the customer accepts the rental agreement.
                </Text>
              </Pressable>

              {createBookingError ? (
                <Text
                  style={{
                    marginTop: 14,
                    color: COLORS.error,
                    fontWeight: "700",
                  }}
                >
                  {createBookingError}
                </Text>
              ) : null}

              <View
                style={{
                  marginTop: 24,
                  flexDirection: "row",
                  gap: 12,
                }}
              >
                <Pressable
                  onPress={() =>
                    setContractModalOpen(false)
                  }
                  style={{
                    flex: 1,
                    minHeight: 54,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: COLORS.white,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.navy,
                      fontWeight: "800",
                      fontSize: 16,
                    }}
                  >
                    Cancel
                  </Text>
                </Pressable>

                <Pressable
                  onPress={continueFromContract}
                  style={{
                    flex: 1.35,
                    minHeight: 54,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: COLORS.navy,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.white,
                      fontWeight: "800",
                      fontSize: 16,
                    }}
                  >
                    Payment
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <Modal
          visible={paymentModalOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() =>
            setPaymentModalOpen(false)
          }
        >
          <SafeAreaView
            style={{
              flex: 1,
              backgroundColor: COLORS.background,
            }}
          >
            <ScrollView
              contentContainerStyle={{
                padding: 20,
                paddingBottom: 44,
              }}
              keyboardShouldPersistTaps="handled"
            >
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: "800",
                  color: COLORS.navy,
                }}
              >
                Payment
              </Text>

              <View
                style={{
                  marginTop: 16,
                  padding: 18,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.white,
                }}
              >
                <Text style={{ color: COLORS.mutedText, fontSize: 14 }}>
                  Booking total
                </Text>
                <Text
                  style={{
                    marginTop: 4,
                    color: COLORS.navy,
                    fontSize: 30,
                    fontWeight: "900",
                  }}
                >
                  ${Number(pricing?.totalAmount || 0).toFixed(2)}
                </Text>
                <Text
                  style={{
                    marginTop: 8,
                    color: COLORS.mutedText,
                    fontSize: 14,
                  }}
                >
                  Minimum deposit: ${Number(pricing?.minimumDeposit || 0).toFixed(2)}
                </Text>
              </View>

              <Text
                style={{
                  marginTop: 22,
                  marginBottom: 10,
                  color: COLORS.navy,
                  fontSize: 16,
                  fontWeight: "800",
                }}
              >
                Payment method
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                {(bootstrap?.paymentMethods || []).map(
                  (method) => (
                    <Pressable
                      key={method.method}
                      onPress={() =>
                        setPaymentMethod(method.method)
                      }
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor:
                          paymentMethod === method.method
                            ? COLORS.gold
                            : COLORS.border,
                        backgroundColor:
                          paymentMethod === method.method
                            ? COLORS.lightGold
                            : COLORS.white,
                      }}
                    >
                      <Text
                        style={{
                          color: COLORS.navy,
                          fontWeight: "800",
                        }}
                      >
                        {method.displayName}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>

              <Text
                style={{
                  marginTop: 20,
                  marginBottom: 8,
                  color: COLORS.navy,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                Charge now
              </Text>
              <TextInput
                value={paymentAmount}
                onChangeText={(value) => {
                  setPaymentAmount(value);

                  if (
                    bootstrap?.tipSettings.tipsEnabled &&
                    bootstrap.tipSettings.tipMode === "percent"
                  ) {
                    const amount = Number(value || 0);
                    const percent = Number(tipPercent || 0);
                    setTipAmount(
                      ((amount * percent) / 100).toFixed(2),
                    );
                  }
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                style={{
                  minHeight: 50,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.white,
                  color: COLORS.navy,
                  fontSize: 18,
                  fontWeight: "800",
                }}
              />

              {bootstrap?.tipSettings.tipsEnabled ? (
                <>
                  <Text
                    style={{
                      marginTop: 20,
                      marginBottom: 8,
                      color: COLORS.navy,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    Tip
                  </Text>

                  {bootstrap.tipSettings.tipMode === "percent" ? (
                    <>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {bootstrap.tipSettings.tipPercentOptions.map(
                          (percent) => (
                            <Pressable
                              key={percent}
                              onPress={() => {
                                setTipPercent(String(percent));
                                setTipAmount(
                                  (
                                    (Number(paymentAmount || 0) *
                                      Number(percent)) /
                                    100
                                  ).toFixed(2),
                                );
                              }}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                borderRadius: 14,
                                borderWidth: 1,
                                borderColor:
                                  Number(tipPercent || 0) ===
                                  Number(percent)
                                    ? COLORS.gold
                                    : COLORS.border,
                                backgroundColor:
                                  Number(tipPercent || 0) ===
                                  Number(percent)
                                    ? COLORS.lightGold
                                    : COLORS.white,
                              }}
                            >
                              <Text
                                style={{
                                  color: COLORS.navy,
                                  fontWeight: "800",
                                }}
                              >
                                {percent}%
                              </Text>
                            </Pressable>
                          ),
                        )}
                      </View>
                      <Text
                        style={{
                          marginTop: 8,
                          color: COLORS.mutedText,
                        }}
                      >
                        Tip amount: ${Number(tipAmount || 0).toFixed(2)}
                      </Text>
                    </>
                  ) : (
                    <TextInput
                      value={tipAmount}
                      onChangeText={setTipAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      style={{
                        minHeight: 50,
                        paddingHorizontal: 14,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                        backgroundColor: COLORS.white,
                        color: COLORS.navy,
                        fontSize: 16,
                      }}
                    />
                  )}
                </>
              ) : null}

              <Text
                style={{
                  marginTop: 20,
                  marginBottom: 8,
                  color: COLORS.navy,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                Reference / note
              </Text>
              <TextInput
                value={paymentReference}
                onChangeText={setPaymentReference}
                placeholder="Optional"
                style={{
                  minHeight: 50,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: COLORS.white,
                  color: COLORS.navy,
                  fontSize: 16,
                }}
              />

              {createBookingError ? (
                <Text
                  style={{
                    marginTop: 14,
                    color: COLORS.error,
                    fontWeight: "700",
                  }}
                >
                  {createBookingError}
                </Text>
              ) : null}

              <View
                style={{
                  marginTop: 26,
                  flexDirection: "row",
                  gap: 12,
                }}
              >
                <Pressable
                  disabled={creatingBooking}
                  onPress={() => {
                    setPaymentModalOpen(false);

                    if (
                      bootstrap?.contractSettings
                        .require_contract_before_payment !== false
                    ) {
                      setContractModalOpen(true);
                    }
                  }}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: COLORS.white,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.navy,
                      fontWeight: "800",
                      fontSize: 16,
                    }}
                  >
                    Back
                  </Text>
                </Pressable>

                <Pressable
                  disabled={creatingBooking}
                  onPress={() => {
                    void submitCompletedBooking();
                  }}
                  style={{
                    flex: 2,
                    minHeight: 56,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: creatingBooking
                      ? COLORS.border
                      : COLORS.navy,
                  }}
                >
                  {creatingBooking ? (
                    <ActivityIndicator color={COLORS.white} />
                  ) : (
                    <Text
                      style={{
                        color: COLORS.white,
                        fontWeight: "900",
                        fontSize: 17,
                      }}
                    >
                      Create Booking
                    </Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        <View style={styles.footer}>
          {step > 1 ? (
            <Pressable
              style={
                styles.footerBackButton
              }
              onPress={handleBack}
            >
              <Text
                style={
                  styles.footerBackButtonText
                }
              >
                Back
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            disabled={!canContinue}
            style={[
              styles.continueButton,
              step > 1
                ? styles.continueButtonWithBack
                : null,
              !canContinue
                ? styles.continueButtonDisabled
                : null,
            ]}
            onPress={() => {
              void handleContinue();
            }}
          >
            <Text
              style={[
                styles.continueButtonText,
                !canContinue
                  ? styles.continueButtonTextDisabled
                  : null,
              ]}
            >
              {step === 5
                ? completionStrategy === "staff_send_to_customer"
                  ? "Create temporary booking"
                  : "Continue"
                : "Continue"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CustomerStep({
  customerMode,
  setCustomerMode,
  search,
  setSearch,
  selectedCustomerId,
  setSelectedCustomerId,
  selectedCustomer,
  filteredCustomers,
  newCustomer,
  updateNewCustomer,
}: {
  customerMode: CustomerMode;
  setCustomerMode: (
    mode: CustomerMode,
  ) => void;
  search: string;
  setSearch: (value: string) => void;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (
    value: string | null,
  ) => void;
  selectedCustomer:
    | MobileNewBookingCustomer
    | null;
  filteredCustomers:
    MobileNewBookingCustomer[];
  newCustomer: NewCustomerDraft;
  updateNewCustomer: (
    key: keyof NewCustomerDraft,
    value: string,
  ) => void;
}) {
  return (
    <>
      <Text style={styles.stepTitle}>
        Customer
      </Text>

      <Text
        style={styles.stepDescription}
      >
        Select an existing customer or
        enter a new one.
      </Text>

      <View
        style={styles.segmentedControl}
      >
        <Pressable
          style={[
            styles.segmentButton,
            customerMode === "existing"
              ? styles.segmentButtonActive
              : null,
          ]}
          onPress={() =>
            setCustomerMode("existing")
          }
        >
          <Text
            style={[
              styles.segmentText,
              customerMode === "existing"
                ? styles.segmentTextActive
                : null,
            ]}
          >
            Existing
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.segmentButton,
            customerMode === "new"
              ? styles.segmentButtonActive
              : null,
          ]}
          onPress={() =>
            setCustomerMode("new")
          }
        >
          <Text
            style={[
              styles.segmentText,
              customerMode === "new"
                ? styles.segmentTextActive
                : null,
            ]}
          >
            New Customer
          </Text>
        </Pressable>
      </View>

      {customerMode === "existing" ? (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name, phone or email"
            placeholderTextColor={
              COLORS.mutedText
            }
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />

          {selectedCustomer ? (
            <View
              style={styles.selectedCard}
            >
              <View
                style={styles.customerMain}
              >
                <Text
                  style={
                    styles.selectedLabel
                  }
                >
                  Selected
                </Text>

                <Text
                  style={
                    styles.customerName
                  }
                >
                  {customerName(
                    selectedCustomer,
                  )}
                </Text>

                {customerSubtitle(
                  selectedCustomer,
                ) ? (
                  <Text
                    style={
                      styles.customerSubtitle
                    }
                  >
                    {customerSubtitle(
                      selectedCustomer,
                    )}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() =>
                  setSelectedCustomerId(
                    null,
                  )
                }
                hitSlop={10}
              >
                <Text
                  style={styles.changeText}
                >
                  Clear
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View
            style={styles.listHeader}
          >
            <Text
              style={styles.listTitle}
            >
              Customers
            </Text>

            <Text
              style={styles.listCount}
            >
              {filteredCustomers.length}
            </Text>
          </View>

          {filteredCustomers.length ===
          0 ? (
            <View
              style={styles.emptyCard}
            >
              <Text
                style={styles.emptyTitle}
              >
                No customers found
              </Text>

              <Text
                style={styles.emptyText}
              >
                Try another search or
                create a new customer.
              </Text>
            </View>
          ) : (
            filteredCustomers.map(
              (customer) => {
                const selected =
                  selectedCustomerId ===
                  customer.id;

                return (
                  <Pressable
                    key={customer.id}
                    style={[
                      styles.customerCard,
                      selected
                        ? styles.customerCardSelected
                        : null,
                    ]}
                    onPress={() =>
                      setSelectedCustomerId(
                        customer.id,
                      )
                    }
                  >
                    <View
                      style={
                        styles.customerMain
                      }
                    >
                      <Text
                        style={
                          styles.customerName
                        }
                      >
                        {customerName(
                          customer,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.customerSubtitle
                        }
                      >
                        {customerSubtitle(
                          customer,
                        ) ||
                          "No contact details"}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.radioOuter,
                        selected
                          ? styles.radioOuterSelected
                          : null,
                      ]}
                    >
                      {selected ? (
                        <View
                          style={
                            styles.radioInner
                          }
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              },
            )
          )}
        </>
      ) : (
        <View style={styles.formCard}>
          <FieldLabel text="First name" />

          <TextInput
            value={newCustomer.firstName}
            onChangeText={(value) =>
              updateNewCustomer(
                "firstName",
                value,
              )
            }
            placeholder="First name"
            placeholderTextColor={
              COLORS.mutedText
            }
            autoCapitalize="words"
            style={styles.input}
          />

          <FieldLabel text="Last name" />

          <TextInput
            value={newCustomer.lastName}
            onChangeText={(value) =>
              updateNewCustomer(
                "lastName",
                value,
              )
            }
            placeholder="Last name"
            placeholderTextColor={
              COLORS.mutedText
            }
            autoCapitalize="words"
            style={styles.input}
          />

          <FieldLabel text="Phone" />

          <TextInput
            value={newCustomer.phone}
            onChangeText={(value) =>
              updateNewCustomer(
                "phone",
                value,
              )
            }
            placeholder="Phone"
            placeholderTextColor={
              COLORS.mutedText
            }
            keyboardType="phone-pad"
            style={styles.input}
          />

          <FieldLabel text="Email" />

          <TextInput
            value={newCustomer.email}
            onChangeText={(value) =>
              updateNewCustomer(
                "email",
                value,
              )
            }
            placeholder="Email"
            placeholderTextColor={
              COLORS.mutedText
            }
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>
      )}
    </>
  );
}

function DateTimeStep({
  event,
  updateEvent,
  timeFormat,
}: {
  event: EventDraft;
  updateEvent: (
    key: keyof EventDraft,
    value: string,
  ) => void;
  timeFormat?: string | null;
}) {
  const [datePickerOpen, setDatePickerOpen] =
    useState(false);

  const [timePickerMode, setTimePickerMode] =
    useState<TimePickerMode>(null);

  const startTimeOptions =
    useMemo(
      () =>
        buildHalfHourSlots(
          0,
          23 * 60,
        ),
      [],
    );

  const endTimeOptions =
    useMemo(() => {
      if (!event.eventStartTime) {
        return [];
      }

      return buildHalfHourSlots(
        timeToMinutes(
          event.eventStartTime,
        ) + 30,
        23 * 60 + 30,
      );
    }, [event.eventStartTime]);

  useEffect(() => {
    if (
      !event.eventEndTime ||
      !event.eventStartTime
    ) {
      return;
    }

    if (
      !endTimeOptions.includes(
        event.eventEndTime,
      )
    ) {
      updateEvent(
        "eventEndTime",
        "",
      );
    }
  }, [
    endTimeOptions,
    event.eventEndTime,
    event.eventStartTime,
    updateEvent,
  ]);

  const selectedDate =
    event.eventDate
      ? isoToDate(event.eventDate)
      : new Date();

  const options =
    timePickerMode === "start"
      ? startTimeOptions
      : endTimeOptions;

  const selectedTime =
    timePickerMode === "start"
      ? event.eventStartTime
      : event.eventEndTime;

  const selectTime = (
    value: string,
  ) => {
    if (timePickerMode === "start") {
      const oldStart =
        event.eventStartTime;

      updateEvent(
        "eventStartTime",
        value,
      );

      if (
        !event.eventEndTime ||
        timeToMinutes(
          event.eventEndTime,
        ) <
          timeToMinutes(value) + 30
      ) {
        updateEvent(
          "eventEndTime",
          "",
        );
      }

      if (oldStart !== value) {
        // Availability will be checked on the server
        // when Products are connected.
      }
    }

    if (timePickerMode === "end") {
      updateEvent(
        "eventEndTime",
        value,
      );
    }

    setTimePickerMode(null);
  };

  return (
    <>
      <Text style={styles.stepTitle}>
        Date & Time
      </Text>

      <Text
        style={styles.stepDescription}
      >
        Select the event schedule and enter
        the setup address.
      </Text>

      <View style={styles.formCard}>
        <FieldLabel text="Event date" />

        <Pressable
          style={styles.pickerField}
          onPress={() =>
            setDatePickerOpen(true)
          }
        >
          <Text
            style={[
              styles.pickerFieldText,
              !event.eventDate
                ? styles.pickerPlaceholder
                : null,
            ]}
          >
            {formatEventDate(
              event.eventDate,
            )}
          </Text>

          <Text
            style={styles.pickerChevron}
          >
            ›
          </Text>
        </Pressable>

        <View style={styles.timeRow}>
          <View style={styles.timeColumn}>
            <FieldLabel text="Start time" />

            <Pressable
              style={styles.pickerField}
              onPress={() =>
                setTimePickerMode(
                  "start",
                )
              }
            >
              <Text
                style={[
                  styles.pickerFieldText,
                  !event.eventStartTime
                    ? styles.pickerPlaceholder
                    : null,
                ]}
              >
                {event.eventStartTime
                  ? formatTimeLabel(
                      event.eventStartTime,
                      timeFormat,
                    )
                  : "Select"}
              </Text>

              <Text
                style={
                  styles.pickerChevron
                }
              >
                ›
              </Text>
            </Pressable>
          </View>

          <View style={styles.timeColumn}>
            <FieldLabel text="End time" />

            <Pressable
              disabled={
                !event.eventStartTime
              }
              style={[
                styles.pickerField,
                !event.eventStartTime
                  ? styles.pickerFieldDisabled
                  : null,
              ]}
              onPress={() =>
                setTimePickerMode(
                  "end",
                )
              }
            >
              <Text
                style={[
                  styles.pickerFieldText,
                  !event.eventEndTime
                    ? styles.pickerPlaceholder
                    : null,
                ]}
              >
                {event.eventEndTime
                  ? formatTimeLabel(
                      event.eventEndTime,
                      timeFormat,
                    )
                  : event.eventStartTime
                    ? "Select"
                    : "Start first"}
              </Text>

              <Text
                style={
                  styles.pickerChevron
                }
              >
                ›
              </Text>
            </Pressable>
          </View>
        </View>

        {event.eventStartTime &&
        event.eventEndTime ? (
          <View
            style={styles.timeSummary}
          >
            <Text
              style={
                styles.timeSummaryText
              }
            >
              {formatTimeLabel(
                event.eventStartTime,
                timeFormat,
              )}
              {"  –  "}
              {formatTimeLabel(
                event.eventEndTime,
                timeFormat,
              )}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>
        Setup address
      </Text>

      <View style={styles.formCard}>
        <FieldLabel text="Street address" />

        <TextInput
          value={event.setupAddress}
          onChangeText={(value) =>
            updateEvent(
              "setupAddress",
              value,
            )
          }
          placeholder="123 Main St"
          placeholderTextColor={
            COLORS.mutedText
          }
          autoCapitalize="words"
          style={styles.input}
        />

        <FieldLabel text="City" />

        <TextInput
          value={event.setupCity}
          onChangeText={(value) =>
            updateEvent(
              "setupCity",
              value,
            )
          }
          placeholder="Los Angeles"
          placeholderTextColor={
            COLORS.mutedText
          }
          autoCapitalize="words"
          style={styles.input}
        />

        <View style={styles.addressRow}>
          <View style={styles.stateColumn}>
            <FieldLabel text="State" />

            <TextInput
              value={event.setupState}
              onChangeText={(value) =>
                updateEvent(
                  "setupState",
                  value.toUpperCase(),
                )
              }
              placeholder="CA"
              placeholderTextColor={
                COLORS.mutedText
              }
              autoCapitalize="characters"
              maxLength={2}
              style={styles.input}
            />
          </View>

          <View style={styles.zipColumn}>
            <FieldLabel text="ZIP" />

            <TextInput
              value={event.setupZip}
              onChangeText={(value) =>
                updateEvent(
                  "setupZip",
                  value,
                )
              }
              placeholder="90000"
              placeholderTextColor={
                COLORS.mutedText
              }
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          Next: Products
        </Text>

        <Text style={styles.infoText}>
          Product availability will be checked
          by the same server logic used by the
          existing booking system.
        </Text>
      </View>

      <Modal
        visible={datePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setDatePickerOpen(false)
        }
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() =>
            setDatePickerOpen(false)
          }
        >
          <Pressable
            style={styles.dateModalCard}
            onPress={() => undefined}
          >
            <View
              style={styles.modalHeader}
            >
              <Text
                style={styles.modalTitle}
              >
                Event date
              </Text>

              <Pressable
                onPress={() =>
                  setDatePickerOpen(
                    false,
                  )
                }
                hitSlop={10}
              >
                <Text
                  style={
                    styles.modalDone
                  }
                >
                  Done
                </Text>
              </Pressable>
            </View>

            <DateTimePicker
  value={selectedDate}
  mode="date"
  display={
    Platform.OS === "ios"
      ? "inline"
      : "default"
  }
  minimumDate={
    new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      new Date().getDate(),
    )
  }
  style={
    Platform.OS === "ios"
      ? styles.inlineDatePicker
      : undefined
  }
  onChange={(
    _event,
    date,
  ) => {
    if (!date) {
      return;
    }

    updateEvent(
      "eventDate",
      toIsoDate(date),
    );
  }}
/>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={
          timePickerMode !== null
        }
        transparent
        animationType="slide"
        onRequestClose={() =>
          setTimePickerMode(null)
        }
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() =>
            setTimePickerMode(null)
          }
        >
          <Pressable
            style={styles.timeModalCard}
            onPress={() => undefined}
          >
            <View
              style={styles.modalHandle}
            />

            <View
              style={styles.modalHeader}
            >
              <View>
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  {timePickerMode ===
                  "start"
                    ? "Start time"
                    : "End time"}
                </Text>

                {timePickerMode ===
                  "end" &&
                event.eventStartTime ? (
                  <Text
                    style={
                      styles.modalSubtitle
                    }
                  >
                    After{" "}
                    {formatTimeLabel(
                      event.eventStartTime,
                      timeFormat,
                    )}
                  </Text>
                ) : null}
              </View>

              <Pressable
                onPress={() =>
                  setTimePickerMode(
                    null,
                  )
                }
                hitSlop={10}
              >
                <Text
                  style={
                    styles.modalCancel
                  }
                >
                  Cancel
                </Text>
              </Pressable>
            </View>

            <ScrollView
              style={
                styles.timeOptionsScroll
              }
              showsVerticalScrollIndicator={
                false
              }
            >
              {options.map(
                (option) => {
                  const active =
                    selectedTime ===
                    option;

                  return (
                    <Pressable
                      key={option}
                      style={[
                        styles.timeOption,
                        active
                          ? styles.timeOptionActive
                          : null,
                      ]}
                      onPress={() =>
                        selectTime(
                          option,
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.timeOptionText,
                          active
                            ? styles.timeOptionTextActive
                            : null,
                        ]}
                      >
                        {formatTimeLabel(
                          option,
                          timeFormat,
                        )}
                      </Text>

                      {active ? (
                        <Text
                          style={
                            styles.timeOptionCheck
                          }
                        >
                          ✓
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                },
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
function reviewMoney(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function ReviewStep({
  customerMode,
  selectedCustomer,
  newCustomer,
  event,
  timeFormat,
  products,
  modifierGroups,
  selectedProductIds,
  selectedModifierQuantities,
  pricing,
  pricingLoading,
  pricingError,
  onRetry,
}: {
  customerMode: CustomerMode;
  selectedCustomer: MobileNewBookingCustomer | null | undefined;
  newCustomer: NewCustomerDraft;
  event: EventDraft;
  timeFormat: string;
  products: MobileNewBookingProduct[];
  modifierGroups: MobileNewBookingModifierGroup[];
  selectedProductIds: string[];
  selectedModifierQuantities: Record<string, Record<string, number>>;
  pricing: MobileNewBookingPricing | null;
  pricingLoading: boolean;
  pricingError: string;
  onRetry: () => void;
}) {
  const reviewCustomerName =
    customerMode === "existing"
      ? selectedCustomer
        ? customerName(selectedCustomer)
        : "Customer"
      : [newCustomer.firstName, newCustomer.lastName]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .join(" ");

  const reviewCustomerSubtitle =
    customerMode === "existing"
      ? selectedCustomer
        ? customerSubtitle(selectedCustomer)
        : ""
      : [newCustomer.phone, newCustomer.email]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
          .join(" · ");

  const selectedProducts = selectedProductIds
    .map((productId) => products.find((product) => product.id === productId))
    .filter((product): product is MobileNewBookingProduct => Boolean(product));

  const selectedOptions = modifierGroups.flatMap((group) => {
    if (!selectedProductIds.includes(group.productId)) return [];
    const key = `${group.productId}:${group.id}`;
    const quantities = selectedModifierQuantities[key] || {};

    return Object.entries(quantities)
      .filter(([, quantity]) => Number(quantity || 0) > 0)
      .map(([optionId, quantity]) => {
        const option = group.options.find((item) => item.id === optionId);
        if (!option) return null;

        const product = products.find((item) => item.id === group.productId);
        return {
          productId: group.productId,
          groupId: group.id,
          optionId,
          productName: String(product?.name || "Product"),
          groupName: String(group.name || "Options"),
          optionName: String(option.name || "Option"),
          quantity: Number(quantity || 0),
        };
      })
      .filter(Boolean);
  });

  const address = [
    event.setupAddress,
    event.setupCity,
    event.setupState,
    event.setupZip,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(", ");

  const startLabel = formatTimeLabel(
    event.eventStartTime,
    timeFormat === "24h" ? "24h" : "12h",
  );
  const endLabel = formatTimeLabel(
    event.eventEndTime,
    timeFormat === "24h" ? "24h" : "12h",
  );

  return (
    <>
      <Text style={styles.stepTitle}>Review</Text>
      <Text style={styles.stepDescription}>
        Confirm the booking details and server-calculated pricing.
      </Text>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>Customer</Text>
        <Text style={styles.reviewValue}>{reviewCustomerName || "Customer"}</Text>
        {reviewCustomerSubtitle ? (
          <Text style={styles.reviewMuted}>{reviewCustomerSubtitle}</Text>
        ) : null}
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>Event</Text>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Date</Text>
          <Text style={styles.reviewValue}>{event.eventDate}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Time</Text>
          <Text style={styles.reviewValue}>{startLabel} – {endLabel}</Text>
        </View>
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Address</Text>
          <Text style={[styles.reviewValue, styles.reviewValueFlexible]}>
            {address}
          </Text>
        </View>
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>Products</Text>
        {selectedProducts.map((product) => {
          const line = pricing?.products.find((item) => item.productId === product.id);
          const productOptions = selectedOptions.filter(
            (item: any) => item.productId === product.id,
          );

          return (
            <View key={product.id}>
              <View style={styles.reviewRow}>
                <Text style={[styles.reviewValue, styles.reviewValueFlexible]}>
                  {String(product.name || "Product")}
                </Text>
                <Text style={styles.reviewValue}>
                  {line ? reviewMoney(line.lineTotal) : "—"}
                </Text>
              </View>

              {productOptions.map((item: any) => {
                const optionLine = pricing?.modifiers.find(
                  (pricingItem) =>
                    pricingItem.productId === item.productId &&
                    pricingItem.groupId === item.groupId &&
                    pricingItem.optionId === item.optionId,
                );

                return (
                  <View
                    key={`${item.productId}:${item.groupId}:${item.optionId}`}
                    style={styles.reviewOptionRow}
                  >
                    <Text style={[styles.reviewMuted, styles.reviewValueFlexible]}>
                      {item.groupName}: {item.optionName}
                      {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                    </Text>
                    <Text style={styles.reviewValue}>
                      {optionLine ? reviewMoney(optionLine.lineTotal) : "—"}
                    </Text>
                  </View>
                );
              })}

              {productOptions.length > 0 ? (
                <View style={styles.reviewDivider} />
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.reviewSection}>
        <Text style={styles.reviewSectionTitle}>Pricing</Text>

        {pricingLoading ? (
          <View style={styles.reviewPricingLoading}>
            <ActivityIndicator size="small" color={COLORS.gold} />
            <Text style={styles.reviewMuted}>Calculating delivery and tax...</Text>
          </View>
        ) : pricingError ? (
          <>
            <Text style={styles.errorText}>{pricingError}</Text>
            <Pressable style={styles.reviewRetryButton} onPress={onRetry}>
              <Text style={styles.reviewRetryButtonText}>Try Again</Text>
            </Pressable>
          </>
        ) : pricing ? (
          <>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Products</Text>
              <Text style={styles.reviewValue}>{reviewMoney(pricing.productSubtotal)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Options</Text>
              <Text style={styles.reviewValue}>{reviewMoney(pricing.modifiersSubtotal)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Subtotal</Text>
              <Text style={styles.reviewValue}>{reviewMoney(pricing.subtotal)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Delivery</Text>
              <Text style={styles.reviewValue}>{reviewMoney(pricing.deliveryFee)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>
                Tax{pricing.taxRate ? ` (${Number(pricing.taxRate).toFixed(3)}%)` : ""}
              </Text>
              <Text style={styles.reviewValue}>{reviewMoney(pricing.taxAmount)}</Text>
            </View>
            <View style={styles.reviewDivider} />
            <View style={styles.reviewTotalRow}>
              <Text style={styles.reviewTotalLabel}>Total</Text>
              <Text style={styles.reviewTotalValue}>{reviewMoney(pricing.totalAmount)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Deposit</Text>
              <Text style={styles.reviewValue}>{reviewMoney(pricing.depositAmount)}</Text>
            </View>
            <View style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>Balance due</Text>
              <Text style={styles.reviewValue}>{reviewMoney(pricing.balanceDue)}</Text>
            </View>

            {pricing.deliveryError || pricing.taxError ? (
              <View style={styles.reviewPricingWarning}>
                {pricing.deliveryError ? (
                  <Text style={styles.errorText}>Delivery: {pricing.deliveryError}</Text>
                ) : null}
                {pricing.taxError ? (
                  <Text style={styles.errorText}>Tax: {pricing.taxError}</Text>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.reviewMuted}>
              Minimum catalog deposit: {reviewMoney(pricing.minimumDeposit)}
            </Text>
          </>
        ) : null}
      </View>

    </>
  );
}

function ProductsStep({
  products,
  selectedProductIds,
  setSelectedProductIds,
  availabilityByProductId,
  availabilityLoading,
  availabilityError,
}: {
  products: MobileNewBookingProduct[];
  selectedProductIds: string[];
  setSelectedProductIds: (
    value: string[],
  ) => void;
  availabilityByProductId: Record<
    string,
    MobileNewBookingAvailabilityItem
  >;
  availabilityLoading: boolean;
  availabilityError: string;
}) {
  const activeProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.active !== false,
      ),
    [products],
  );

  const groupedProducts = useMemo(() => {
    const groups = new Map<
      string,
      MobileNewBookingProduct[]
    >();

    activeProducts.forEach(
      (product) => {
        const category =
          String(
            product.category_name ||
              "Other",
          ).trim() || "Other";

        const current =
          groups.get(category) || [];

        current.push(product);
        groups.set(
          category,
          current,
        );
      },
    );

    return Array.from(
      groups.entries(),
    ).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [activeProducts]);

  const toggleProduct = (
    productId: string,
  ) => {
    const availability =
      availabilityByProductId[productId];

    if (
      availabilityLoading ||
      availability?.available !== true
    ) {
      return;
    }

    if (
      selectedProductIds.includes(
        productId,
      )
    ) {
      setSelectedProductIds(
        selectedProductIds.filter(
          (id) => id !== productId,
        ),
      );
      return;
    }

    setSelectedProductIds([
      ...selectedProductIds,
      productId,
    ]);
  };

  return (
    <>
      <Text style={styles.stepTitle}>
        Products
      </Text>

      <Text
        style={styles.stepDescription}
      >
        Select one or more products for this
        booking.
      </Text>

      {availabilityLoading ? (
        <View style={styles.availabilityStatusCard}>
          <Text style={styles.availabilityStatusText}>
            Checking availability...
          </Text>
        </View>
      ) : availabilityError ? (
        <View
          style={[
            styles.availabilityStatusCard,
            styles.availabilityStatusCardError,
          ]}
        >
          <Text
            style={[
              styles.availabilityStatusText,
              styles.availabilityStatusTextError,
            ]}
          >
            {availabilityError}
          </Text>
        </View>
      ) : null}

      {groupedProducts.map(
        ([category, categoryProducts]) => (
          <View
            key={category}
            style={
              styles.productCategorySection
            }
          >
            <Text
              style={
                styles.productCategoryTitle
              }
            >
              {category}
            </Text>

            {categoryProducts.map(
              (product) => {
                const selected =
                  selectedProductIds.includes(
                    product.id,
                  );

                const availability =
                  availabilityByProductId[
                    product.id
                  ];

                const productAvailable =
                  availability?.available === true;

                const productUnavailable =
                  availability?.available === false;

                const productDisabled =
                  availabilityLoading ||
                  !productAvailable;

                const remaining = Number(
                  availability?.remainingQuantity,
                );

                const availabilityLabel =
                  availabilityLoading
                    ? "Checking..."
                    : productAvailable
                      ? Number.isFinite(
                          remaining,
                        )
                        ? `Available · ${remaining} remaining`
                        : "Available"
                      : productUnavailable
                        ? availability?.message ||
                          "Unavailable"
                        : availabilityError
                          ? "Availability unavailable"
                          : "Checking...";

                const name =
                  String(
                    product.name ||
                      "Unnamed product",
                  ).trim();

                const priceNumber =
                  Number(
                    product.base_price ??
                      product.price,
                  );

                const priceLabel =
                  Number.isFinite(
                    priceNumber,
                  )
                    ? `$${priceNumber.toFixed(2)}`
                    : "";

                return (
                  <Pressable
                    key={product.id}
                    disabled={productDisabled}
                    style={[
                      styles.productCard,
                      selected
                        ? styles.productCardSelected
                        : null,
                      productDisabled
                        ? styles.productCardDisabled
                        : null,
                    ]}
                    onPress={() =>
                      toggleProduct(
                        product.id,
                      )
                    }
                  >
                    <View
                      style={
                        styles.productCardMain
                      }
                    >
                      <Text
                        style={
                          styles.productName
                        }
                      >
                        {name}
                      </Text>

                      {priceLabel ? (
                        <Text
                          style={
                            styles.productPrice
                          }
                        >
                          {priceLabel}
                        </Text>
                      ) : null}

                      <Text
                        style={[
                          styles.productAvailability,
                          productAvailable
                            ? styles.productAvailabilityAvailable
                            : styles.productAvailabilityUnavailable,
                        ]}
                      >
                        {availabilityLabel}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.productCheck,
                        selected
                          ? styles.productCheckSelected
                          : null,
                      ]}
                    >
                      {selected ? (
                        <Text
                          style={
                            styles.productCheckText
                          }
                        >
                          ✓
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              },
            )}
          </View>
        ),
      )}

      {activeProducts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            No products available
          </Text>

          <Text style={styles.emptyText}>
            No active products were returned
            by the booking server.
          </Text>
        </View>
      ) : null}
    </>
  );
}

function FieldLabel({
  text,
}: {
  text: string;
}) {
  return (
    <Text style={styles.fieldLabel}>
      {text}
    </Text>
  );
}


function OptionsStep({
  products,
  modifierGroups,
  selectedProductIds,
  selectedModifierQuantities,
  setSelectedModifierQuantities,
  modifierAvailabilityByProductId,
  modifierAvailabilityLoading,
  modifierAvailabilityError,
}: {
  products: MobileNewBookingProduct[];
  modifierGroups: MobileNewBookingModifierGroup[];
  selectedProductIds: string[];
  selectedModifierQuantities: Record<
    string,
    Record<string, number>
  >;
  setSelectedModifierQuantities: React.Dispatch<
    React.SetStateAction<
      Record<string, Record<string, number>>
    >
  >;
  modifierAvailabilityByProductId: Record<
    string,
    MobileNewBookingModifierAvailabilityItem[]
  >;
  modifierAvailabilityLoading: boolean;
  modifierAvailabilityError: string;
}) {
  const selectedProducts = useMemo(
    () =>
      selectedProductIds
        .map((productId) =>
          products.find(
            (product) => product.id === productId,
          ),
        )
        .filter(
          (
            product,
          ): product is MobileNewBookingProduct =>
            Boolean(product),
        ),
    [products, selectedProductIds],
  );

  const groupsForProduct = useCallback(
    (productId: string) =>
      modifierGroups
        .filter(
          (group) =>
            group.productId === productId &&
            group.active !== false,
        )
        .sort(
          (a, b) =>
            Number(a.sortOrder || 0) -
            Number(b.sortOrder || 0),
        ),
    [modifierGroups],
  );

  const updateOptionQuantity = ({
    productId,
    group,
    option,
    quantity,
  }: {
    productId: string;
    group: MobileNewBookingModifierGroup;
    option: MobileNewBookingModifierOption;
    quantity: number;
  }) => {
    const key = `${productId}:${group.id}`;
    const safeQuantity = Math.max(
      0,
      Math.floor(Number(quantity || 0)),
    );

    setSelectedModifierQuantities(
      (current) => {
        const currentGroup = {
          ...(current[key] || {}),
        };
        const selectionType =
          group.selectionType || "single";

        if (selectionType === "single") {
          return {
            ...current,
            [key]:
              safeQuantity > 0
                ? { [option.id]: 1 }
                : {},
          };
        }

        if (safeQuantity > 0) {
          currentGroup[option.id] =
            safeQuantity;
        } else {
          delete currentGroup[option.id];
        }

        return {
          ...current,
          [key]: currentGroup,
        };
      },
    );
  };

  const toggleOption = ({
    productId,
    group,
    option,
  }: {
    productId: string;
    group: MobileNewBookingModifierGroup;
    option: MobileNewBookingModifierOption;
  }) => {
    if (option.active === false) {
      return;
    }

    const key = `${productId}:${group.id}`;
    const quantities =
      selectedModifierQuantities[key] || {};
    const currentQuantity = Math.max(
      0,
      Number(quantities[option.id] || 0),
    );
    const selectionType =
      group.selectionType || "single";

    if (selectionType === "single") {
      updateOptionQuantity({
        productId,
        group,
        option,
        quantity:
          currentQuantity > 0 ? 0 : 1,
      });
      return;
    }

    if (currentQuantity > 0) {
      updateOptionQuantity({
        productId,
        group,
        option,
        quantity: 0,
      });
      return;
    }

    const selectedTotal = Object.values(
      quantities,
    ).reduce(
      (sum, quantity) =>
        sum +
        Math.max(
          0,
          Number(quantity || 0),
        ),
      0,
    );

    const maxTotal =
      group.maxTotalQuantity == null
        ? null
        : Math.max(
            1,
            Number(group.maxTotalQuantity),
          );

    if (
      maxTotal != null &&
      selectedTotal >= maxTotal
    ) {
      return;
    }

    updateOptionQuantity({
      productId,
      group,
      option,
      quantity: 1,
    });
  };

  const changeQuantity = ({
    productId,
    group,
    option,
    delta,
  }: {
    productId: string;
    group: MobileNewBookingModifierGroup;
    option: MobileNewBookingModifierOption;
    delta: number;
  }) => {
    const key = `${productId}:${group.id}`;
    const quantities =
      selectedModifierQuantities[key] || {};
    const currentQuantity = Math.max(
      0,
      Number(quantities[option.id] || 0),
    );
    const selectedTotal = Object.values(
      quantities,
    ).reduce(
      (sum, quantity) =>
        sum +
        Math.max(
          0,
          Number(quantity || 0),
        ),
      0,
    );

    const maxTotal =
      group.maxTotalQuantity == null
        ? null
        : Math.max(
            1,
            Number(group.maxTotalQuantity),
          );

    let nextQuantity = Math.max(
      0,
      currentQuantity + delta,
    );

    if (
      delta > 0 &&
      maxTotal != null
    ) {
      const remaining = Math.max(
        0,
        maxTotal - selectedTotal,
      );

      nextQuantity =
        currentQuantity +
        Math.min(delta, remaining);
    }

    updateOptionQuantity({
      productId,
      group,
      option,
      quantity: nextQuantity,
    });
  };

  const hasAnyGroups =
    selectedProducts.some(
      (product) =>
        groupsForProduct(product.id)
          .length > 0,
    );

  return (
    <>
      <Text style={styles.stepTitle}>
        Options
      </Text>

      <Text style={styles.stepDescription}>
        Choose the options for the selected
        products. Required groups must be
        completed before you continue.
      </Text>

      {modifierAvailabilityLoading ? (
        <View style={styles.availabilityStatusCard}>
          <ActivityIndicator
            size="small"
            color={COLORS.gold}
          />
          <Text style={styles.availabilityStatusText}>
            Checking option availability...
          </Text>
        </View>
      ) : null}

      {modifierAvailabilityError ? (
        <View
          style={[
            styles.availabilityStatusCard,
            styles.availabilityStatusCardError,
          ]}
        >
          <Text
            style={[
              styles.availabilityStatusText,
              styles.availabilityStatusTextError,
            ]}
          >
            {modifierAvailabilityError}
          </Text>
        </View>
      ) : null}

      {!hasAnyGroups ? (
        <View style={styles.optionsEmptyCard}>
          <Text style={styles.optionsEmptyTitle}>
            No options required
          </Text>
          <Text style={styles.optionsEmptyText}>
            The selected products do not have
            active option groups.
          </Text>
        </View>
      ) : null}

      {selectedProducts.map(
        (product) => {
          const groups =
            groupsForProduct(product.id);

          if (groups.length === 0) {
            return null;
          }

          return (
            <View
              key={product.id}
              style={styles.optionsProductSection}
            >
              <View
                style={styles.optionsProductHeader}
              >
                <Text
                  style={styles.optionsProductLabel}
                >
                  Product
                </Text>
                <Text
                  style={styles.optionsProductTitle}
                >
                  {String(
                    product.name ||
                      "Product",
                  )}
                </Text>
              </View>

              {groups.map((group) => {
                const key =
                  `${product.id}:${group.id}`;
                const quantities =
                  selectedModifierQuantities[
                    key
                  ] || {};
                const selectionType =
                  group.selectionType ||
                  "single";
                const isSingle =
                  selectionType ===
                  "single";
                const selectedTotal =
                  Object.values(
                    quantities,
                  ).reduce(
                    (sum, quantity) =>
                      sum +
                      Math.max(
                        0,
                        Number(
                          quantity || 0,
                        ),
                      ),
                    0,
                  );
                const maxTotal =
                  group.maxTotalQuantity ==
                  null
                    ? null
                    : Math.max(
                        1,
                        Number(
                          group.maxTotalQuantity,
                        ),
                      );

                return (
                  <View
                    key={group.id}
                    style={
                      styles.optionGroupCard
                    }
                  >
                    <View
                      style={
                        styles.optionGroupHeader
                      }
                    >
                      <View
                        style={
                          styles.optionGroupTitleRow
                        }
                      >
                        <Text
                          style={
                            styles.optionGroupTitle
                          }
                        >
                          {String(
                            group.name ||
                              "Options",
                          )}
                        </Text>

                        <View
                          style={[
                            styles.optionBadge,
                            group.required
                              ? styles.optionBadgeRequired
                              : styles.optionBadgeOptional,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optionBadgeText,
                              group.required
                                ? styles.optionBadgeTextRequired
                                : styles.optionBadgeTextOptional,
                            ]}
                          >
                            {group.required
                              ? "Required"
                              : "Optional"}
                          </Text>
                        </View>
                      </View>

                      {group.description ? (
                        <Text
                          style={
                            styles.optionGroupDescription
                          }
                        >
                          {group.description}
                        </Text>
                      ) : null}

                      {!isSingle ? (
                        <Text
                          style={
                            styles.optionGroupCounter
                          }
                        >
                          {selectedTotal}
                          {maxTotal != null
                            ? ` of ${maxTotal}`
                            : ""}{" "}
                          selected
                        </Text>
                      ) : null}
                    </View>

                    {(group.options || [])
                      .filter(
                        (option) =>
                          option.active !==
                          false,
                      )
                      .map((option) => {
                        const quantity =
                          Math.max(
                            0,
                            Number(
                              quantities[
                                option.id
                              ] || 0,
                            ),
                          );
                        const selected =
                          quantity > 0;
                        const price =
                          Number(
                            option.priceDelta ||
                              0,
                          );
                        const availability =
                          (
                            modifierAvailabilityByProductId[
                              product.id
                            ] || []
                          ).find(
                            (item) =>
                              item.optionId ===
                              option.id,
                          );

                        const optionUnavailable =
                          modifierAvailabilityLoading ||
                          Boolean(
                            modifierAvailabilityError,
                          ) ||
                          availability?.available ===
                            false;

                        const inventoryPerSelection =
                          Math.max(
                            1,
                            Number(
                              option.inventoryQuantity ||
                                availability?.quantityNeeded ||
                                1,
                            ),
                          );

                        const sameInventoryDemand =
                          option.inventoryItemId
                            ? modifierGroups.reduce(
                                (
                                  total,
                                  demandGroup,
                                ) => {
                                  if (
                                    !selectedProductIds.includes(
                                      demandGroup.productId,
                                    ) ||
                                    demandGroup.active === false
                                  ) {
                                    return total;
                                  }

                                  const demandKey =
                                    `${demandGroup.productId}:${demandGroup.id}`;
                                  const demandQuantities =
                                    selectedModifierQuantities[
                                      demandKey
                                    ] || {};

                                  return (
                                    total +
                                    (
                                      demandGroup.options || []
                                    )
                                      .filter(
                                        (otherOption) =>
                                          otherOption.active !==
                                            false &&
                                          otherOption.inventoryItemId ===
                                            option.inventoryItemId &&
                                          !(
                                            demandGroup.productId ===
                                              product.id &&
                                            demandGroup.id ===
                                              group.id &&
                                            otherOption.id ===
                                              option.id
                                          ),
                                      )
                                      .reduce(
                                        (
                                          optionTotal,
                                          otherOption,
                                        ) =>
                                          optionTotal +
                                          Math.max(
                                            0,
                                            Number(
                                              demandQuantities[
                                                otherOption.id
                                              ] || 0,
                                            ),
                                          ) *
                                            Math.max(
                                              1,
                                              Number(
                                                otherOption.inventoryQuantity ||
                                                  1,
                                              ),
                                            ),
                                        0,
                                      )
                                  );
                                },
                                0,
                              )
                            : 0;

                        const stockMaximum =
                          availability &&
                          option.inventoryItemId
                            ? Math.max(
                                0,
                                Math.floor(
                                  Math.max(
                                    0,
                                    Number(
                                      availability.quantityAvailable ||
                                        0,
                                    ) -
                                      sameInventoryDemand,
                                  ) /
                                    inventoryPerSelection,
                                ),
                              )
                            : null;

                        const stockLimitReached =
                          stockMaximum != null &&
                          quantity >= stockMaximum;

                        const groupLimitReached =
                          !isSingle &&
                          !selected &&
                          maxTotal != null &&
                          selectedTotal >=
                            maxTotal;

                        const optionDisabled =
                          optionUnavailable ||
                          groupLimitReached;

                        const canIncrease =
                          !isSingle &&
                          !optionUnavailable &&
                          (maxTotal == null ||
                            selectedTotal <
                              maxTotal) &&
                          (stockMaximum == null ||
                            !stockLimitReached);

                        const availabilityLabel =
                          modifierAvailabilityLoading
                            ? "Checking..."
                            : modifierAvailabilityError
                              ? "Availability unavailable"
                              : availability?.available === false
                                ? "Unavailable"
                                : stockMaximum != null
                                  ? `Available · ${stockMaximum} remaining`
                                  : "Available";

                        return (
                          <View
                            key={option.id}
                            style={[
                              styles.optionCard,
                              selected
                                ? styles.optionCardSelected
                                : null,
                              optionDisabled
                                ? styles.optionCardDisabled
                                : null,
                            ]}
                          >
                            <Pressable
                              disabled={
                                optionDisabled
                              }
                              style={
                                styles.optionCardMain
                              }
                              onPress={() =>
                                toggleOption({
                                  productId:
                                    product.id,
                                  group,
                                  option,
                                })
                              }
                            >
                              <View
                                style={[
                                  styles.optionCheck,
                                  selected
                                    ? styles.optionCheckSelected
                                    : null,
                                ]}
                              >
                                {selected ? (
                                  <Text
                                    style={
                                      styles.optionCheckText
                                    }
                                  >
                                    ✓
                                  </Text>
                                ) : null}
                              </View>

                              <View
                                style={
                                  styles.optionTextBlock
                                }
                              >
                                <Text
                                  style={
                                    styles.optionName
                                  }
                                >
                                  {String(
                                    option.name ||
                                      "Option",
                                  )}
                                </Text>

                                {option.description ? (
                                  <Text
                                    style={
                                      styles.optionDescription
                                    }
                                  >
                                    {
                                      option.description
                                    }
                                  </Text>
                                ) : null}

                                <Text
                                  style={
                                    styles.optionPrice
                                  }
                                >
                                  {price > 0
                                    ? `+ $${price.toFixed(
                                        2,
                                      )}`
                                    : "Included"}
                                </Text>

                                <Text
                                  style={[
                                    styles.optionAvailabilityText,
                                    optionUnavailable
                                      ? styles.optionAvailabilityUnavailable
                                      : styles.optionAvailabilityAvailable,
                                  ]}
                                >
                                  {availabilityLabel}
                                </Text>
                              </View>
                            </Pressable>

                            {!isSingle &&
                            selected ? (
                              <View
                                style={
                                  styles.optionQuantityControl
                                }
                              >
                                <Pressable
                                  style={
                                    styles.optionQuantityButton
                                  }
                                  onPress={() =>
                                    changeQuantity({
                                      productId:
                                        product.id,
                                      group,
                                      option,
                                      delta: -1,
                                    })
                                  }
                                >
                                  <Text
                                    style={
                                      styles.optionQuantityButtonText
                                    }
                                  >
                                    −
                                  </Text>
                                </Pressable>

                                <Text
                                  style={
                                    styles.optionQuantityValue
                                  }
                                >
                                  {quantity}
                                </Text>

                                <Pressable
                                  disabled={
                                    !canIncrease
                                  }
                                  style={[
                                    styles.optionQuantityButton,
                                    !canIncrease
                                      ? styles.optionQuantityButtonDisabled
                                      : null,
                                  ]}
                                  onPress={() =>
                                    changeQuantity({
                                      productId:
                                        product.id,
                                      group,
                                      option,
                                      delta: 1,
                                    })
                                  }
                                >
                                  <Text
                                    style={[
                                      styles.optionQuantityButtonText,
                                      !canIncrease
                                        ? styles.optionQuantityButtonTextDisabled
                                        : null,
                                    ]}
                                  >
                                    +
                                  </Text>
                                </Pressable>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                  </View>
                );
              })}
            </View>
          );
        },
      )}
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  header: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },

  headerSide: {
    width: 64,
  },

  headerCenter: {
    flex: 1,
    alignItems: "center",
  },

  headerBackButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
  },

  headerBackText: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "600",
  },

  headerTitle: {
    color: COLORS.navy,
    fontSize: 18,
    fontWeight: "800",
  },

  headerSubtitle: {
    marginTop: 2,
    color: COLORS.mutedText,
    fontSize: 12,
    fontWeight: "600",
  },

  progressTrack: {
    height: 4,
    backgroundColor: "#e4ded3",
  },

  progressFill: {
    height: 4,
    backgroundColor: COLORS.gold,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: 18,
  },

  stepTitle: {
    color: COLORS.navy,
    fontSize: 28,
    fontWeight: "800",
  },

  stepDescription: {
    marginTop: 6,
    marginBottom: 20,
    color: COLORS.mutedText,
    fontSize: 15,
    lineHeight: 21,
  },

  sectionTitle: {
    marginTop: 22,
    marginBottom: 9,
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "800",
  },

  segmentedControl: {
    flexDirection: "row",
    padding: 4,
    marginBottom: 18,
    borderRadius: 14,
    backgroundColor: "#e9e2d6",
  },

  segmentButton: {
    flex: 1,
    minHeight: 42,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 11,
  },

  segmentButtonActive: {
    backgroundColor: COLORS.white,
  },

  segmentText: {
    color: COLORS.mutedText,
    fontSize: 14,
    fontWeight: "700",
  },

  segmentTextActive: {
    color: COLORS.navy,
  },

  searchInput: {
    minHeight: 50,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    color: COLORS.navy,
    fontSize: 16,
  },

  selectedCard: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.gold,
    borderRadius: 14,
    backgroundColor: "#fff9ec",
  },

  selectedLabel: {
    marginBottom: 3,
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  changeText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: "700",
  },

  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 9,
  },

  listTitle: {
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "800",
  },

  listCount: {
    color: COLORS.mutedText,
    fontSize: 13,
    fontWeight: "700",
  },

  customerCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },

  customerCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: "#fff9ec",
  },

  customerMain: {
    flex: 1,
    paddingRight: 12,
  },

  customerName: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "700",
  },

  customerSubtitle: {
    marginTop: 4,
    color: COLORS.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },

  radioOuter: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#bbb1a3",
    borderRadius: 11,
  },

  radioOuterSelected: {
    borderColor: COLORS.gold,
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.gold,
  },

  emptyCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },

  emptyTitle: {
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "800",
  },

  emptyText: {
    marginTop: 5,
    color: COLORS.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },

  formCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.white,
  },

  fieldLabel: {
    marginTop: 12,
    marginBottom: 7,
    color: COLORS.navy,
    fontSize: 13,
    fontWeight: "700",
  },

  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#fffdf9",
    color: COLORS.navy,
    fontSize: 16,
  },

  pickerField: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#fffdf9",
  },

  pickerFieldDisabled: {
    opacity: 0.5,
    backgroundColor: "#f1ede6",
  },

  pickerFieldText: {
    flex: 1,
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "600",
  },

  pickerPlaceholder: {
    color: COLORS.mutedText,
    fontWeight: "400",
  },

  pickerChevron: {
    marginLeft: 8,
    color: COLORS.gold,
    fontSize: 25,
    lineHeight: 26,
    fontWeight: "400",
  },

  timeRow: {
    flexDirection: "row",
    gap: 12,
  },

  timeColumn: {
    flex: 1,
  },

  timeSummary: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#f7f0df",
  },

  timeSummaryText: {
    color: COLORS.navy,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },

  addressRow: {
    flexDirection: "row",
    gap: 12,
  },

  stateColumn: {
    width: 90,
  },

  zipColumn: {
    flex: 1,
  },

  infoCard: {
    marginTop: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e7d5ad",
    borderRadius: 16,
    backgroundColor: "#fff9ec",
  },

  infoTitle: {
    color: COLORS.gold,
    fontSize: 13,
    fontWeight: "800",
  },

  infoText: {
    marginTop: 5,
    color: COLORS.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(35, 49, 63, 0.32)",
  },

  dateModalCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 16,
    borderRadius: 22,
    backgroundColor: COLORS.white,
  },

  timeModalCard: {
    maxHeight: "72%",
    paddingTop: 8,
    paddingBottom:
      Platform.OS === "ios" ? 28 : 18,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: COLORS.white,
  },

  modalHandle: {
    width: 42,
    height: 5,
    alignSelf: "center",
    marginBottom: 7,
    borderRadius: 3,
    backgroundColor: "#d2c9bb",
  },

  modalHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth:
      StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },

  modalTitle: {
    color: COLORS.navy,
    fontSize: 18,
    fontWeight: "800",
  },

  modalSubtitle: {
    marginTop: 2,
    color: COLORS.mutedText,
    fontSize: 12,
  },

  modalDone: {
    color: COLORS.gold,
    fontSize: 16,
    fontWeight: "800",
  },
  inlineDatePicker: {
  width: "100%",
  height: 340,
},

  modalCancel: {
    color: COLORS.mutedText,
    fontSize: 15,
    fontWeight: "700",
  },

  timeOptionsScroll: {
    paddingHorizontal: 16,
  },

  timeOption: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    borderBottomWidth:
      StyleSheet.hairlineWidth,
    borderBottomColor: "#ebe4da",
  },

  timeOptionActive: {
    marginHorizontal: -4,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: "#fff7e7",
  },

  timeOptionText: {
    color: COLORS.navy,
    fontSize: 17,
    fontWeight: "600",
  },

  timeOptionTextActive: {
    color: COLORS.gold,
    fontWeight: "800",
  },

  timeOptionCheck: {
    color: COLORS.gold,
    fontSize: 18,
    fontWeight: "800",
  },
availabilityStatusCard: {
  marginBottom: 16,
  paddingHorizontal: 14,
  paddingVertical: 12,
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 12,
  backgroundColor: COLORS.white,
},

availabilityStatusCardError: {
  borderColor: COLORS.error,
  backgroundColor: COLORS.errorBackground,
},

availabilityStatusText: {
  color: COLORS.mutedText,
  fontSize: 13,
  fontWeight: "700",
},

availabilityStatusTextError: {
  color: COLORS.error,
},

productCategorySection: {
  marginBottom: 20,
},

productCategoryTitle: {
  marginBottom: 9,
  color: COLORS.navy,
  fontSize: 16,
  fontWeight: "800",
},

productCard: {
  minHeight: 68,
  flexDirection: "row",
  alignItems: "center",
  marginBottom: 9,
  paddingHorizontal: 15,
  paddingVertical: 13,
  borderWidth: 1,
  borderColor: COLORS.border,
  borderRadius: 14,
  backgroundColor: COLORS.white,
},

productCardSelected: {
  borderColor: COLORS.gold,
  backgroundColor: "#fff9ec",
},

productCardDisabled: {
  opacity: 0.55,
},

productCardMain: {
  flex: 1,
  paddingRight: 12,
},

productName: {
  color: COLORS.navy,
  fontSize: 16,
  fontWeight: "700",
},

productPrice: {
  marginTop: 4,
  color: COLORS.gold,
  fontSize: 14,
  fontWeight: "800",
},

productAvailability: {
  marginTop: 5,
  fontSize: 12,
  fontWeight: "700",
},

productAvailabilityAvailable: {
  color: COLORS.success,
},

productAvailabilityUnavailable: {
  color: COLORS.error,
},

productCheck: {
  width: 24,
  height: 24,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 2,
  borderColor: "#bbb1a3",
  borderRadius: 7,
},

productCheckSelected: {
  borderColor: COLORS.gold,
  backgroundColor: COLORS.gold,
},

productCheckText: {
  color: COLORS.white,
  fontSize: 15,
  fontWeight: "900",
},

  optionsEmptyCard: {
    marginBottom: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },

  optionsEmptyTitle: {
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "800",
  },

  optionsEmptyText: {
    marginTop: 5,
    color: COLORS.mutedText,
    fontSize: 13,
    lineHeight: 19,
  },

  optionsProductSection: {
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: "#fcfaf7",
    overflow: "hidden",
  },

  optionsProductHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },

  optionsProductLabel: {
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.1,
  },

  optionsProductTitle: {
    marginTop: 3,
    color: COLORS.navy,
    fontSize: 18,
    fontWeight: "800",
  },

  optionGroupCard: {
    margin: 12,
    marginBottom: 0,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },

  optionGroupHeader: {
    marginBottom: 10,
  },

  optionGroupTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  optionGroupTitle: {
    flex: 1,
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "800",
  },

  optionGroupDescription: {
    marginTop: 5,
    color: COLORS.mutedText,
    fontSize: 13,
    lineHeight: 18,
  },

  optionGroupCounter: {
    marginTop: 7,
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: "800",
  },

  optionBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },

  optionBadgeRequired: {
    backgroundColor: "#fff4d8",
  },

  optionBadgeOptional: {
    backgroundColor: "#f1eee8",
  },

  optionBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },

  optionBadgeTextRequired: {
    color: "#8a6b20",
  },

  optionBadgeTextOptional: {
    color: COLORS.mutedText,
  },

  optionCard: {
    marginBottom: 9,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 13,
    backgroundColor: "#fcfaf7",
    overflow: "hidden",
  },

  optionCardSelected: {
    borderColor: COLORS.gold,
    backgroundColor: "#fff9ec",
  },

  optionCardDisabled: {
    opacity: 0.5,
  },

  optionCardMain: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },

  optionCheck: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#bbb1a3",
    borderRadius: 7,
  },

  optionCheckSelected: {
    borderColor: COLORS.gold,
    backgroundColor: COLORS.gold,
  },

  optionCheckText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
  },

  optionTextBlock: {
    flex: 1,
    marginLeft: 11,
  },

  optionName: {
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "800",
  },

  optionDescription: {
    marginTop: 3,
    color: COLORS.mutedText,
    fontSize: 12,
    lineHeight: 17,
  },

  optionPrice: {
    marginTop: 5,
    color: COLORS.gold,
    fontSize: 12,
    fontWeight: "800",
  },

  optionAvailabilityText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
  },

  optionAvailabilityAvailable: {
    color: COLORS.success,
  },

  optionAvailabilityUnavailable: {
    color: COLORS.error,
  },

  optionQuantityControl: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.white,
  },

  optionQuantityButton: {
    width: 36,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    backgroundColor: COLORS.white,
  },

  optionQuantityButtonDisabled: {
    backgroundColor: "#eee9e0",
  },

  optionQuantityButtonText: {
    color: COLORS.navy,
    fontSize: 19,
    fontWeight: "800",
  },

  optionQuantityButtonTextDisabled: {
    color: "#aaa094",
  },

  optionQuantityValue: {
    minWidth: 34,
    color: COLORS.navy,
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },

  bottomSpacer: {
    height: 30,
  },

  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom:
      Platform.OS === "ios" ? 8 : 14,
    borderTopWidth:
      StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },

  footerBackButton: {
    width: 96,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 15,
    backgroundColor: COLORS.white,
  },

  footerBackButtonText: {
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "800",
  },

  continueButton: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: COLORS.navy,
  },

  continueButtonWithBack: {
    flex: 1,
  },

  continueButtonDisabled: {
    backgroundColor: "#d5cec2",
  },

  continueButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
  },

  continueButtonTextDisabled: {
    color: "#948a7d",
  },

  primaryButton: {
    minWidth: 180,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: COLORS.navy,
  },

  primaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "800",
  },

  secondaryButton: {
    minWidth: 180,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },

  secondaryButtonText: {
    color: COLORS.navy,
    fontSize: 15,
    fontWeight: "700",
  },

  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingTitle: {
    marginTop: 16,
    color: COLORS.navy,
    fontSize: 20,
    fontWeight: "800",
  },

  loadingText: {
    marginTop: 6,
    color: COLORS.mutedText,
    fontSize: 14,
    textAlign: "center",
  },

  errorCard: {
    width: "100%",
    maxWidth: 420,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e0aaa7",
    borderRadius: 16,
    backgroundColor: COLORS.errorBackground,
  },

  errorTitle: {
    color: COLORS.error,
    fontSize: 17,
    fontWeight: "800",
  },

  errorText: {
    marginTop: 7,
    color: COLORS.error,
    fontSize: 14,
    lineHeight: 20,
  },  reviewSection: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    padding: 18,
    gap: 12,
  },
  reviewSectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.navy,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  reviewOptionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 3,
  },
  reviewLabel: {
    fontSize: 14,
    color: COLORS.mutedText,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.navy,
    textAlign: "right",
  },
  reviewValueFlexible: {
    flex: 1,
  },
  reviewMuted: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.mutedText,
  },
  reviewOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.navy,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  reviewPricingLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  reviewRetryButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  reviewRetryButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.white,
  },
  reviewTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  reviewTotalLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.navy,
  },
  reviewTotalValue: {
    fontSize: 21,
    fontWeight: "800",
    color: COLORS.navy,
  },
  reviewPricingWarning: {
    borderRadius: 14,
    backgroundColor: COLORS.errorBackground,
    padding: 12,
    gap: 4,
  },
  reviewReadOnlyNote: {
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: "#fff8eb",
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.lightGold,
  },

});

"use client";

import { useEffect, useMemo, useState } from "react";

type BookingActor = "customer" | "cashier";
type StepId = "product" | "time" | "options" | "customer" | "address" | "summary";

type BookingBuilderProps = {
  customers: any[];
  products: any[];
  taxRates: any[];
  deliveryZones: any[];
  action: (formData: FormData) => void;
};

const CUSTOMER_WORKING_HOURS = {
  open: "08:00",
  close: "21:00",
};

const steps: { id: StepId; label: string }[] = [
  { id: "product", label: "Product" },
  { id: "time", label: "Time" },
  { id: "options", label: "Options" },
  { id: "customer", label: "Client" },
  { id: "address", label: "Address" },
  { id: "summary", label: "Summary" },
];

function formatMoney(value: number | string | null | undefined) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numberValue);
}

function timeToMinutes(time: string) {
  if (!time) {
    return 0;
  }

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function isCustomerTimeAllowed(params: {
  startTime: string;
  endTime: string;
}) {
  const openMinutes = timeToMinutes(CUSTOMER_WORKING_HOURS.open);
  const closeMinutes = timeToMinutes(CUSTOMER_WORKING_HOURS.close);

  const startMinutes = timeToMinutes(params.startTime);
  const endMinutes = timeToMinutes(params.endTime);

  if (!params.startTime || !params.endTime) {
    return {
      allowed: false,
      message: "",
    };
  }

  if (endMinutes <= startMinutes) {
    return {
      allowed: false,
      message: `Customer bookings must be within working hours: ${CUSTOMER_WORKING_HOURS.open}–${CUSTOMER_WORKING_HOURS.close}. Overnight booking is only for cashier/admin.`,
    };
  }

  if (startMinutes < openMinutes || endMinutes > closeMinutes) {
    return {
      allowed: false,
      message: `Customer bookings are only available from ${CUSTOMER_WORKING_HOURS.open} to ${CUSTOMER_WORKING_HOURS.close}. Cashier/admin can use any time.`,
    };
  }

  return {
    allowed: true,
    message: "Time is within customer working hours.",
  };
}

function getOptionPrice(option: any) {
  return Number(option.price_override ?? option.modifiers?.price ?? 0);
}

function getOptionName(option: any) {
  return option.label_override || option.modifiers?.name || "Option";
}

function getActiveGroups(product: any) {
  return (product?.product_modifier_groups || [])
    .filter((row: any) => row.active && row.modifier_groups?.active)
    .sort(
      (a: any, b: any) =>
        Number(a.sort_order || 100) - Number(b.sort_order || 100)
    );
}

function getActiveOptions(groupRow: any) {
  return (groupRow.modifier_groups?.modifier_group_options || [])
    .filter((option: any) => option.active && option.modifiers?.active)
    .sort(
      (a: any, b: any) =>
        Number(a.sort_order || 100) - Number(b.sort_order || 100)
    );
}

function getDefaultOptionIds(product: any) {
  const ids: string[] = [];

  for (const groupRow of getActiveGroups(product)) {
    const group = groupRow.modifier_groups;
    const options = getActiveOptions(groupRow);

    if (options.length === 0) {
      continue;
    }

    const defaultOptions = options.filter((option: any) =>
      Boolean(option.selected_by_default)
    );

    if (group?.selection_type === "single") {
      if (defaultOptions[0]) {
        ids.push(defaultOptions[0].id);
      } else if (groupRow.required || group.required) {
        ids.push(options[0].id);
      }
    } else {
      for (const option of defaultOptions) {
        ids.push(option.id);
      }
    }
  }

  return ids;
}

function getDeliveryFee(params: {
  deliveryZones: any[];
  zip: string;
  city: string;
  subtotal: number;
}) {
  const zip = params.zip.trim();
  const city = params.city.trim().toLowerCase();

  const zone = params.deliveryZones.find((item) => {
    if (zip && item.zip === zip) {
      return true;
    }

    if (city && String(item.city || "").toLowerCase() === city) {
      return true;
    }

    return false;
  });

  if (!zone) {
    return 0;
  }

  if (
    zone.free_delivery_min_order &&
    params.subtotal >= Number(zone.free_delivery_min_order)
  ) {
    return 0;
  }

  return Number(zone.base_fee || 0);
}

function getTaxRate(params: {
  taxRates: any[];
  zip: string;
  city: string;
}) {
  const zip = params.zip.trim();
  const city = params.city.trim().toLowerCase();

  const rate = params.taxRates.find((item) => {
    if (zip && item.zip === zip) {
      return true;
    }

    if (city && String(item.city || "").toLowerCase() === city) {
      return true;
    }

    return false;
  });

  if (!rate) {
    return 0;
  }

  return Number(rate.tax_rate || 0);
}

function getStepIndex(step: StepId) {
  return steps.findIndex((item) => item.id === step);
}

export default function BookingBuilder({
  customers,
  products,
  taxRates,
  deliveryZones,
  action,
}: BookingBuilderProps) {
  const firstProduct = products[0] || null;

  const [step, setStep] = useState<StepId>("product");
  const [bookingActor, setBookingActor] = useState<BookingActor>("cashier");

  const [selectedProductId, setSelectedProductId] = useState<string>(
    firstProduct?.id || ""
  );

  const [eventDate, setEventDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");

  const [availabilityStatus, setAvailabilityStatus] = useState<
    "idle" | "checking" | "available" | "unavailable"
  >("idle");

  const [availabilityMessage, setAvailabilityMessage] = useState("");

  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(
    firstProduct ? getDefaultOptionIds(firstProduct) : []
  );

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(
    customers.length > 0 ? "existing" : "new"
  );

  const [selectedCustomerId, setSelectedCustomerId] = useState(
    customers[0]?.id || ""
  );

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [setupAddress, setSetupAddress] = useState("");
  const [setupCity, setSetupCity] = useState("");
  const [setupZip, setSetupZip] = useState("");

  const selectedProduct = useMemo(() => {
    return (
      products.find((product: any) => product.id === selectedProductId) || null
    );
  }, [products, selectedProductId]);

  const selectedCustomer = useMemo(() => {
    return customers.find((customer: any) => customer.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  function resetAvailability() {
    setAvailabilityStatus("idle");
    setAvailabilityMessage("");
  }

  function handleProductSelect(product: any) {
    setSelectedProductId(product.id);
    setSelectedOptionIds(getDefaultOptionIds(product));
    resetAvailability();
  }

  function handleBookingActorChange(nextActor: BookingActor) {
    setBookingActor(nextActor);
    resetAvailability();
  }

  function toggleOption(params: { groupRow: any; option: any }) {
    const { groupRow, option } = params;
    const group = groupRow.modifier_groups;
    const selectionType = group?.selection_type || "single";
    const activeOptions = getActiveOptions(groupRow);
    const optionIdsInGroup = activeOptions.map((item: any) => item.id);

    setSelectedOptionIds((current) => {
      if (selectionType === "single") {
        const withoutGroup = current.filter(
          (id) => !optionIdsInGroup.includes(id)
        );
        return [...withoutGroup, option.id];
      }

      if (current.includes(option.id)) {
        return current.filter((id) => id !== option.id);
      }

      return [...current, option.id];
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function checkAvailability() {
      if (!selectedProductId || !eventDate || !eventStartTime || !eventEndTime) {
        setAvailabilityStatus("idle");
        setAvailabilityMessage("");
        return;
      }

      if (bookingActor === "customer") {
        const customerTimeCheck = isCustomerTimeAllowed({
          startTime: eventStartTime,
          endTime: eventEndTime,
        });

        if (!customerTimeCheck.allowed) {
          setAvailabilityStatus("unavailable");
          setAvailabilityMessage(customerTimeCheck.message);
          return;
        }
      }

      setAvailabilityStatus("checking");
      setAvailabilityMessage("Checking availability...");

      const params = new URLSearchParams({
        productId: selectedProductId,
        eventDate,
        startTime: eventStartTime,
        endTime: eventEndTime,
        bookingActor,
      });

      try {
        const response = await fetch(
          `/api/admin/availability/check-product?${params.toString()}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Could not check availability.");
        }

        if (cancelled) {
          return;
        }

        if (data.available) {
          setAvailabilityStatus("available");
          setAvailabilityMessage(data.message || "Available.");
          return;
        }

        setAvailabilityStatus("unavailable");
        setAvailabilityMessage(data.message || "Not available.");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAvailabilityStatus("unavailable");
        setAvailabilityMessage(
          error instanceof Error
            ? error.message
            : "Could not check availability."
        );
      }
    }

    checkAvailability();

    return () => {
      cancelled = true;
    };
  }, [
    selectedProductId,
    eventDate,
    eventStartTime,
    eventEndTime,
    bookingActor,
  ]);

  const selectedOptions = useMemo(() => {
    if (!selectedProduct) {
      return [];
    }

    const result: any[] = [];

    for (const groupRow of getActiveGroups(selectedProduct)) {
      for (const option of getActiveOptions(groupRow)) {
        if (selectedOptionIds.includes(option.id)) {
          result.push(option);
        }
      }
    }

    return result;
  }, [selectedProduct, selectedOptionIds]);

  const productPrice = Number(selectedProduct?.base_price || 0);

  const optionsTotal = selectedOptions.reduce((sum, option) => {
    return sum + getOptionPrice(option);
  }, 0);

  const subtotal = productPrice + optionsTotal;

  const deliveryFee = getDeliveryFee({
    deliveryZones,
    zip: setupZip,
    city: setupCity,
    subtotal,
  });

  const taxRate = getTaxRate({
    taxRates,
    zip: setupZip,
    city: setupCity,
  });

  const taxableAmount = subtotal + deliveryFee;
  const taxAmount = taxableAmount * taxRate;
  const total = taxableAmount + taxAmount;

  const canContinueAfterTime = availabilityStatus === "available";

  function canGoNext() {
    if (step === "product") {
      return Boolean(selectedProductId);
    }

    if (step === "time") {
      return canContinueAfterTime;
    }

    if (step === "customer") {
      if (customerMode === "existing") {
        return Boolean(selectedCustomerId);
      }

      return Boolean(customerName.trim());
    }

    return true;
  }

  function goNext() {
    if (!canGoNext()) {
      return;
    }

    if (step === "product") setStep("time");
    else if (step === "time") setStep("options");
    else if (step === "options") setStep("customer");
    else if (step === "customer") setStep("address");
    else if (step === "address") setStep("summary");
  }

  function goBack() {
    if (step === "summary") setStep("address");
    else if (step === "address") setStep("customer");
    else if (step === "customer") setStep("options");
    else if (step === "options") setStep("time");
    else if (step === "time") setStep("product");
  }

  const currentStepIndex = getStepIndex(step);

  return (
    <form action={action}>
      <input type="hidden" name="bookingActor" value={bookingActor} />
      <input type="hidden" name="productId" value={selectedProductId} />

      <input type="hidden" name="eventDate" value={eventDate} />
      <input type="hidden" name="eventStartTime" value={eventStartTime} />
      <input type="hidden" name="eventEndTime" value={eventEndTime} />

      <input
        type="hidden"
        name="customerId"
        value={customerMode === "existing" ? selectedCustomerId : ""}
      />
      <input
        type="hidden"
        name="customerName"
        value={customerMode === "new" ? customerName : ""}
      />
      <input
        type="hidden"
        name="customerPhone"
        value={customerMode === "new" ? customerPhone : ""}
      />
      <input
        type="hidden"
        name="customerEmail"
        value={customerMode === "new" ? customerEmail : ""}
      />

      <input type="hidden" name="setupAddress" value={setupAddress} />
      <input type="hidden" name="setupCity" value={setupCity} />
      <input type="hidden" name="setupZip" value={setupZip} />

      {selectedOptionIds.map((optionId) => (
        <input
          key={optionId}
          type="hidden"
          name="selectedModifierGroupOptionIds"
          value={optionId}
        />
      ))}

      <section className="mx-auto max-w-[980px] overflow-hidden rounded-[32px] border border-black/5 bg-white shadow-[0_18px_70px_rgba(0,0,0,0.12)]">
        <div className="border-b border-[#eee5d9] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-[#1f1e1b]">
                New booking
              </h2>
              <p className="mt-1 text-sm text-[#6c6258]">
                Compact booking flow, similar to SimplyBook.
              </p>
            </div>

            <div className="flex rounded-full border border-[#d8cec0] bg-[#fcfaf7] p-1">
              <button
                type="button"
                onClick={() => handleBookingActorChange("customer")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  bookingActor === "customer"
                    ? "bg-white text-[#1f1e1b] shadow-sm"
                    : "text-[#6c6258]",
                ].join(" ")}
              >
                Customer
              </button>

              <button
                type="button"
                onClick={() => handleBookingActorChange("cashier")}
                className={[
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  bookingActor === "cashier"
                    ? "bg-[#23313f] text-white shadow-sm"
                    : "text-[#6c6258]",
                ].join(" ")}
              >
                Cashier
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-6 overflow-hidden rounded-full border border-[#d8cec0] bg-white">
            {steps.map((item, index) => {
              const active = item.id === step;
              const completed = index < currentStepIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (index <= currentStepIndex) {
                      setStep(item.id);
                    }
                  }}
                  className={[
                    "px-3 py-3 text-center text-xs font-semibold transition",
                    active
                      ? "bg-[#d8e8f7] text-[#23313f]"
                      : completed
                        ? "bg-white text-[#9a7a49]"
                        : "bg-white text-[#b5aaa0]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid min-h-[540px] lg:grid-cols-[320px_1fr]">
          <aside className="border-b border-[#eee5d9] bg-[#fcfaf7] p-6 lg:border-b-0 lg:border-r">
            <div className="text-sm font-semibold text-[#1f1e1b]">
              Booking summary
            </div>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Product
                </div>
                <div className="mt-2 text-sm font-semibold text-[#1f1e1b]">
                  {selectedProduct?.name || "Not selected"}
                </div>
                <div className="mt-1 text-sm text-[#6c6258]">
                  {formatMoney(productPrice)}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Date & time
                </div>
                <div className="mt-2 text-sm font-semibold text-[#1f1e1b]">
                  {eventDate || "No date"}
                </div>
                <div className="mt-1 text-sm text-[#6c6258]">
                  {eventStartTime || "--:--"} – {eventEndTime || "--:--"}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-4 ring-1 ring-[#eee5d9]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                  Client
                </div>
                <div className="mt-2 text-sm font-semibold text-[#1f1e1b]">
                  {customerMode === "existing"
                    ? selectedCustomer?.full_name || "Not selected"
                    : customerName || "New client"}
                </div>
                <div className="mt-1 text-sm text-[#6c6258]">
                  {customerMode === "existing"
                    ? selectedCustomer?.phone || selectedCustomer?.email || "—"
                    : customerPhone || customerEmail || "—"}
                </div>
              </div>

              <div className="rounded-2xl bg-[#23313f] p-4 text-white">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">
                  Total
                </div>
                <div className="mt-2 text-3xl font-semibold">
                  {formatMoney(total)}
                </div>
                <div className="mt-2 text-xs text-white/55">
                  Product {formatMoney(productPrice)} · Options{" "}
                  {formatMoney(optionsTotal)} · Delivery{" "}
                  {formatMoney(deliveryFee)} · Tax {formatMoney(taxAmount)}
                </div>
              </div>
            </div>
          </aside>

          <main className="flex flex-col">
            <div className="max-h-[540px] flex-1 overflow-y-auto p-6">
              {step === "product" && (
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1e1b]">
                    Select product
                  </h3>
                  <p className="mt-1 text-sm text-[#6c6258]">
                    Choose the main rental item.
                  </p>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    {products.map((product: any) => {
                      const selected = selectedProductId === product.id;

                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleProductSelect(product)}
                          className={[
                            "overflow-hidden rounded-[24px] border bg-white text-left transition hover:shadow-md",
                            selected
                              ? "border-[#23313f] ring-2 ring-[#23313f]"
                              : "border-[#eee5d9]",
                          ].join(" ")}
                        >
                          <div className="aspect-[4/3] bg-[#f1ebe1]">
                            {product.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-sm text-[#9f9488]">
                                No photo
                              </div>
                            )}
                          </div>

                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-[#1f1e1b]">
                                  {product.name}
                                </div>
                                <div className="mt-1 min-h-[80px] line-clamp-4 text-sm leading-5 text-[#6c6258]">
                                  {product.short_description || "No description"}
                                </div>
                              </div>
                              <div className="font-semibold text-[#1f1e1b]">
                                {formatMoney(product.base_price)}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === "time" && (
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1e1b]">
                    Date & time
                  </h3>
                  <p className="mt-1 text-sm text-[#6c6258]">
                    Availability is checked for the selected product and time.
                  </p>

                  <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                        Event date
                      </label>
                      <input
                        type="date"
                        value={eventDate}
                        title="Event date"
                        onChange={(event) => setEventDate(event.target.value)}
                        className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                        Start time
                      </label>
                      <input
                        type="time"
                        value={eventStartTime}
                        title="Start time"
                        min={
                          bookingActor === "customer"
                            ? CUSTOMER_WORKING_HOURS.open
                            : undefined
                        }
                        max={
                          bookingActor === "customer"
                            ? CUSTOMER_WORKING_HOURS.close
                            : undefined
                        }
                        onChange={(event) =>
                          setEventStartTime(event.target.value)
                        }
                        className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                        End time
                      </label>
                      <input
                        type="time"
                        value={eventEndTime}
                        title="End time"
                        min={
                          bookingActor === "customer"
                            ? CUSTOMER_WORKING_HOURS.open
                            : undefined
                        }
                        max={
                          bookingActor === "customer"
                            ? CUSTOMER_WORKING_HOURS.close
                            : undefined
                        }
                        onChange={(event) =>
                          setEventEndTime(event.target.value)
                        }
                        className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                      />
                    </div>
                  </div>

                  {bookingActor === "customer" && (
                    <div className="mt-5 rounded-2xl bg-[#eaf2f9] p-4 text-sm leading-6 text-[#355879] ring-1 ring-[#cfe0ef]">
                      Customer booking window: {CUSTOMER_WORKING_HOURS.open}–
                      {CUSTOMER_WORKING_HOURS.close}. For late night or special
                      schedule, switch to Cashier.
                    </div>
                  )}

                  {availabilityStatus !== "idle" && (
                    <div
                      className={[
                        "mt-5 rounded-2xl p-4 text-sm font-semibold ring-1",
                        availabilityStatus === "available"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : availabilityStatus === "checking"
                            ? "bg-[#eaf2f9] text-[#355879] ring-[#cfe0ef]"
                            : "bg-red-50 text-red-700 ring-red-200",
                      ].join(" ")}
                    >
                      {availabilityMessage}
                    </div>
                  )}
                </div>
              )}

              {step === "options" && (
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1e1b]">
                    Options
                  </h3>
                  <p className="mt-1 text-sm text-[#6c6258]">
                    Add-ons connected to this product.
                  </p>

                  <div className="mt-5 space-y-5">
                    {getActiveGroups(selectedProduct).map((groupRow: any) => {
                      const group = groupRow.modifier_groups;
                      const options = getActiveOptions(groupRow);

                      return (
                        <div
                          key={groupRow.id}
                          className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-[#1f1e1b]">
                                {group.name}
                              </div>
                              <div className="mt-1 text-sm text-[#6c6258]">
                                {group.selection_type === "single"
                                  ? "Choose one"
                                  : "Choose multiple"}
                              </div>
                            </div>

                            {(group.required || groupRow.required) && (
                              <span className="rounded-full bg-[#fff4d8] px-3 py-1 text-xs font-semibold text-[#8a6b20] ring-1 ring-[#efd582]">
                                Required
                              </span>
                            )}
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {options.map((option: any) => {
                              const selected = selectedOptionIds.includes(
                                option.id
                              );

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() =>
                                    toggleOption({ groupRow, option })
                                  }
                                  className={[
                                    "rounded-2xl border bg-white p-4 text-left transition hover:bg-[#faf8f5]",
                                    selected
                                      ? "border-[#23313f] ring-2 ring-[#23313f]"
                                      : "border-[#eee5d9]",
                                  ].join(" ")}
                                >
                                  <div className="flex justify-between gap-3">
                                    <div>
                                      <div className="font-semibold text-[#1f1e1b]">
                                        {getOptionName(option)}
                                      </div>
                                      <div className="mt-1 text-sm text-[#6c6258]">
                                        {option.modifiers?.short_description ||
                                          option.modifiers?.modifier_type ||
                                          "Add-on"}
                                      </div>
                                    </div>
                                    <div className="font-semibold text-[#1f1e1b]">
                                      {formatMoney(getOptionPrice(option))}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {getActiveGroups(selectedProduct).length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#d8cec0] bg-[#fcfaf7] p-8 text-center text-sm text-[#6c6258]">
                        No options connected to this product.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === "customer" && (
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1e1b]">
                    Client
                  </h3>
                  <p className="mt-1 text-sm text-[#6c6258]">
                    Select existing client or add a new one.
                  </p>

                  <div className="mt-5 flex rounded-full border border-[#d8cec0] bg-[#fcfaf7] p-1">
                    <button
                      type="button"
                      onClick={() => setCustomerMode("existing")}
                      className={[
                        "flex-1 rounded-full px-4 py-2 text-sm font-semibold",
                        customerMode === "existing"
                          ? "bg-white text-[#1f1e1b] shadow-sm"
                          : "text-[#6c6258]",
                      ].join(" ")}
                    >
                      Existing
                    </button>

                    <button
                      type="button"
                      onClick={() => setCustomerMode("new")}
                      className={[
                        "flex-1 rounded-full px-4 py-2 text-sm font-semibold",
                        customerMode === "new"
                          ? "bg-white text-[#1f1e1b] shadow-sm"
                          : "text-[#6c6258]",
                      ].join(" ")}
                    >
                      New
                    </button>
                  </div>

                  {customerMode === "existing" && customers.length > 0 ? (
                    <div className="mt-6">
                      <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                        Client
                      </label>

                      <select
                        value={selectedCustomerId}
                        title="Select existing customer"
                        aria-label="Select existing customer"
                        onChange={(event) =>
                          setSelectedCustomerId(event.target.value)
                        }
                        className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                      >
                        {customers.map((customer: any) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.full_name}{" "}
                            {customer.phone ? `· ${customer.phone}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="mt-6 grid gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                          Name
                        </label>
                        <input
                          value={customerName}
                          title="Customer name"
                          onChange={(event) => setCustomerName(event.target.value)}
                          className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                            Phone
                          </label>
                          <input
                            value={customerPhone}
                            title="Customer phone"
                            onChange={(event) =>
                              setCustomerPhone(event.target.value)
                            }
                            className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                            Email
                          </label>
                          <input
                            type="email"
                            value={customerEmail}
                            title="Customer email"
                            onChange={(event) =>
                              setCustomerEmail(event.target.value)
                            }
                            className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {step === "address" && (
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1e1b]">
                    Address
                  </h3>
                  <p className="mt-1 text-sm text-[#6c6258]">
                    Delivery and tax are calculated by city or ZIP.
                  </p>

                  <div className="mt-6 grid gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                        Street address
                      </label>
                      <input
                        value={setupAddress}
                        onChange={(event) => setSetupAddress(event.target.value)}
                        placeholder="Street address"
                        className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1fr_0.5fr]">
                      <div>
                        <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                          City
                        </label>
                        <input
                          value={setupCity}
                          onChange={(event) => setSetupCity(event.target.value)}
                          placeholder="Glendale"
                          className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-semibold text-[#3a342d]">
                          ZIP
                        </label>
                        <input
                          value={setupZip}
                          onChange={(event) => setSetupZip(event.target.value)}
                          placeholder="91204"
                          className="w-full rounded-2xl border border-[#d8cec0] px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === "summary" && (
                <div>
                  <h3 className="text-lg font-semibold text-[#1f1e1b]">
                    Confirm booking
                  </h3>
                  <p className="mt-1 text-sm text-[#6c6258]">
                    Review details before creating the booking.
                  </p>

                  <div className="mt-6 grid gap-4">
                    <div className="rounded-2xl border border-[#eee5d9] p-4">
                      <div className="text-sm font-semibold text-[#1f1e1b]">
                        {selectedProduct?.name}
                      </div>
                      <div className="mt-1 text-sm text-[#6c6258]">
                        {eventDate} · {eventStartTime} – {eventEndTime}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#eee5d9] p-4">
                      <div className="text-sm font-semibold text-[#1f1e1b]">
                        Client
                      </div>
                      <div className="mt-1 text-sm text-[#6c6258]">
                        {customerMode === "existing"
                          ? selectedCustomer?.full_name
                          : customerName}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[#eee5d9] p-4">
                      <div className="text-sm font-semibold text-[#1f1e1b]">
                        Address
                      </div>
                      <div className="mt-1 text-sm text-[#6c6258]">
                        {[setupAddress, setupCity, setupZip]
                          .filter(Boolean)
                          .join(", ") || "No address"}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-[#23313f] p-5 text-white">
                      <div className="grid gap-3 text-sm md:grid-cols-4">
                        <div>
                          <div className="text-white/50">Product</div>
                          <div className="font-semibold">
                            {formatMoney(productPrice)}
                          </div>
                        </div>

                        <div>
                          <div className="text-white/50">Options</div>
                          <div className="font-semibold">
                            {formatMoney(optionsTotal)}
                          </div>
                        </div>

                        <div>
                          <div className="text-white/50">Delivery + tax</div>
                          <div className="font-semibold">
                            {formatMoney(deliveryFee + taxAmount)}
                          </div>
                        </div>

                        <div>
                          <div className="text-white/50">Total</div>
                          <div className="text-2xl font-semibold">
                            {formatMoney(total)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[#eee5d9] bg-white px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === "product"}
                  className="rounded-full border border-[#d8cec0] px-6 py-3 text-sm font-semibold text-[#3a342d] transition hover:bg-[#faf8f5] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>

                {step !== "summary" ? (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canGoNext()}
                    className="rounded-full bg-[#c9964f] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744] disabled:cursor-not-allowed disabled:bg-neutral-300"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="rounded-full bg-[#c9964f] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
                  >
                    Create booking
                  </button>
                )}
              </div>
            </div>
          </main>
        </div>
      </section>
    </form>
  );
}
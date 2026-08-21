"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Customer = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
};

function customerLabel(customer: Customer) {
  return customer.full_name || customer.phone || "Customer";
}

export default function CustomerSearchSelect({
  customers,
}: {
  customers: Customer[];
}) {
  const [query, setQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] =
    useState<Customer | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsidePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener(
      "pointerdown",
      closeOnOutsidePointerDown,
    );
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeOnOutsidePointerDown,
      );
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return customers.slice(0, 20);
    }

    return customers
      .filter((customer) =>
        [customer.full_name, customer.phone]
          .map((value) => String(value || "").toLowerCase())
          .join(" ")
          .includes(normalizedQuery),
      )
      .slice(0, 20);
  }, [customers, query]);

  function chooseCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setQuery(customerLabel(customer));
    setOpen(false);
  }

  function clearSelection() {
    setSelectedCustomer(null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="hidden"
        name="customerId"
        value={selectedCustomer?.id || ""}
      />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedCustomer(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search name or phone"
        autoComplete="off"
        aria-label="Search customer by name or phone"
        className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
      />

      {query && (
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Clear customer search"
          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-lg text-[#8b8177] hover:bg-[#f5efe7]"
        >
          ×
        </button>
      )}

      {open && filteredCustomers.length > 0 && (
        <div className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#ddd2c4] bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
          {filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => chooseCustomer(customer)}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm text-[#3a342d] transition hover:bg-[#f5efe7]"
            >
              <span className="block truncate font-semibold">
                {customerLabel(customer)}
              </span>
              {customer.full_name && customer.phone && (
                <span className="mt-0.5 block text-xs text-[#8b8177]">
                  {customer.phone}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {open && query && filteredCustomers.length === 0 && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl border border-[#ddd2c4] bg-white px-3 py-3 text-sm text-[#8b8177] shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
          No customers found
        </div>
      )}
    </div>
  );
}
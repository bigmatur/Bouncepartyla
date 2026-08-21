"use client";

import { useMemo, useState } from "react";

type CustomerOption = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

function buildLabel(customer: CustomerOption) {
  const name = String(customer.full_name || "Unnamed").trim() || "Unnamed";
  const phone = String(customer.phone || "").trim();
  const email = String(customer.email || "").trim();

  const tail = [phone, email].filter(Boolean).join(" · ");
  return tail ? `${name} · ${tail}` : name;
}

export default function CustomerTypeahead({
  customers,
  currentCustomerId,
}: {
  customers: CustomerOption[];
  currentCustomerId?: string;
}) {
  const selectedInitial =
    customers.find((item) => String(item.id) === String(currentCustomerId || "")) || null;

  const [query, setQuery] = useState(selectedInitial ? buildLabel(selectedInitial) : "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    selectedInitial ? String(selectedInitial.id) : ""
  );
  const [open, setOpen] = useState(false);

  const filteredCustomers = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return customers.slice(0, 12);
    }

    return customers
      .filter((customer) => {
        const haystack = [customer.full_name, customer.phone, customer.email]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");

        return haystack.includes(normalized);
      })
      .slice(0, 20);
  }, [customers, query]);

  function chooseCustomer(customer: CustomerOption) {
    setSelectedCustomerId(String(customer.id));
    setQuery(buildLabel(customer));
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name="selectedCustomerId" value={selectedCustomerId} />

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
          Find customer by name or phone
        </span>

        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelectedCustomerId("");
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Start typing name, phone or email"
          className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]"
        />
      </label>

      {open && filteredCustomers.length > 0 && (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-[#ddd2c4] bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
          {filteredCustomers.map((customer) => {
            const active = String(customer.id) === selectedCustomerId;

            return (
              <button
                key={customer.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseCustomer(customer)}
                className={[
                  "block w-full rounded-xl px-3 py-2 text-left text-sm transition",
                  active
                    ? "bg-[#23313f] text-white"
                    : "text-[#3a342d] hover:bg-[#f5efe7]",
                ].join(" ")}
              >
                {buildLabel(customer)}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#6c6258]">
        {selectedCustomerId ? (
          <span className="rounded-full bg-[#eaf2f9] px-2 py-1 text-[#355879] ring-1 ring-[#cfe0ef]">
            Existing customer selected
          </span>
        ) : (
          <span className="rounded-full bg-[#fff8eb] px-2 py-1 text-[#8a6b20] ring-1 ring-[#efd582]">
            Manual create/update mode
          </span>
        )}

        <button
          type="button"
          onClick={() => {
            setSelectedCustomerId("");
            setQuery("");
            setOpen(false);
          }}
          className="rounded-full border border-[#d8cec0] bg-white px-2 py-1 font-semibold text-[#6c6258] hover:bg-[#faf8f5]"
        >
          Clear selection
        </button>
      </div>
    </div>
  );
}

import type { BookingModifier } from "../booking-types";

type BookingAddOnsProps = {
  modifiers: BookingModifier[];
};

function formatMoney(
  value: number | string | null | undefined,
) {
  const numericValue = Number(value ?? 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(
    Number.isFinite(numericValue) ? numericValue : 0,
  );
}

function formatQuantity(
  value: number | string | null | undefined,
) {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(/\.?0+$/, "");
}

function cleanLegacyNotes(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const cleaned = value
    .replace(/\[idx:[^\]]*\]/gi, "")
    .replace(/\[gid:[^\]]*\]/gi, "")
    .replace(/\[oid:[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
}

function getGroupName(modifier: BookingModifier) {
  return (
    modifier.group_name?.trim() ||
    modifier.modifier_name?.trim() ||
    "Booking option"
  );
}

function getOptionName(modifier: BookingModifier) {
  return (
    modifier.option_name?.trim() ||
    cleanLegacyNotes(modifier.notes) ||
    modifier.modifier_name?.trim() ||
    "Selected option"
  );
}

function getDescription(modifier: BookingModifier) {
  const optionDescription =
    modifier.option_description?.trim();

  if (optionDescription) {
    return optionDescription;
  }

  const modifierDescription =
    modifier.modifier_description?.trim();

  if (modifierDescription) {
    return modifierDescription;
  }

  return null;
}

export default function BookingAddOns({
  modifiers,
}: BookingAddOnsProps) {
  const bookingLevelModifiers = Array.isArray(modifiers)
    ? modifiers.filter(
        (modifier) => !modifier.booking_item_id,
      )
    : [];

  if (bookingLevelModifiers.length === 0) {
    return null;
  }

  const total = bookingLevelModifiers.reduce(
    (sum, modifier) => {
      const value = Number(modifier.subtotal ?? 0);

      return sum + (Number.isFinite(value) ? value : 0);
    },
    0,
  );

  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
            Event details
          </p>

          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
            Booking options
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
            General selections that apply to the whole reservation.
          </p>
        </div>

        {total > 0 ? (
          <div className="shrink-0 rounded-[16px] bg-black/[0.035] px-4 py-3 sm:text-right">
            <p className="text-xs text-black/40">
              Options total
            </p>

            <p className="mt-1 text-sm font-semibold">
              {formatMoney(total)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {bookingLevelModifiers.map((modifier) => {
          const groupName = getGroupName(modifier);
          const optionName = getOptionName(modifier);
          const description = getDescription(modifier);
          const quantity = formatQuantity(
            modifier.quantity,
          );

          const subtotal = Number(
            modifier.subtotal ?? 0,
          );
          const unitPrice = Number(
            modifier.unit_price ?? 0,
          );

          const hasSubtotal =
            Number.isFinite(subtotal) && subtotal > 0;

          const hasUnitPrice =
            Number.isFinite(unitPrice) && unitPrice > 0;

          return (
            <article
              key={modifier.id}
              className="rounded-[18px] border border-[#eadfce] bg-[#fbf7f1] px-4 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a7240]">
                    {groupName}
                  </p>

                  <p className="mt-2 text-sm font-semibold text-black/80">
                    {optionName}
                  </p>

                  {description ? (
                    <p className="mt-1.5 text-xs leading-5 text-black/45">
                      {description}
                    </p>
                  ) : null}

                  {quantity && Number(quantity) > 1 ? (
                    <p className="mt-2 text-xs text-black/40">
                      Quantity: {quantity}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold">
                    {hasSubtotal
                      ? formatMoney(subtotal)
                      : "Included"}
                  </p>

                  {quantity &&
                  Number(quantity) > 1 &&
                  hasUnitPrice ? (
                    <p className="mt-1 text-xs text-black/40">
                      {formatMoney(unitPrice)} each
                    </p>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

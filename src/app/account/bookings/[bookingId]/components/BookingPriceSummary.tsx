type BookingPriceSummaryProps = {
  booking: {
    subtotal: number | string;
    modifiers_total: number | string;
    delivery_fee: number | string;
    discount_amount: number | string;
    taxable_amount?: number | string;
    tax_rate: number | string;
    tax_amount: number | string;
    total_amount: number | string;
    deposit_amount: number | string;
    amount_paid: number | string;
    balance_due: number | string;
  };
};

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatTaxRate(value: number | string | null | undefined) {
  const rate = Number(value || 0);

  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return `${rate.toFixed(3)}%`;
}

function SummaryRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-5 py-2.5 ${
        emphasized ? "text-base" : "text-sm"
      }`}
    >
      <span className={emphasized ? "font-semibold" : "text-black/50"}>
        {label}
      </span>

      <span className={emphasized ? "font-semibold" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

export default function BookingPriceSummary({
  booking,
}: BookingPriceSummaryProps) {
  const modifiersTotal = Number(booking.modifiers_total || 0);
  const deliveryFee = Number(booking.delivery_fee || 0);
  const discountAmount = Number(booking.discount_amount || 0);
  const taxAmount = Number(booking.tax_amount || 0);
  const totalAmount = Number(booking.total_amount || 0);
  const depositAmount = Number(booking.deposit_amount || 0);
  const amountPaid = Number(booking.amount_paid || 0);
  const balanceDue = Math.max(0, Number(booking.balance_due || 0));
  const taxRateLabel = formatTaxRate(booking.tax_rate);

  const isPaidInFull = totalAmount > 0 && balanceDue <= 0;

  return (
    <section className="overflow-hidden rounded-[26px] border border-black/10 bg-white">
      <div className="p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Price summary
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Booking total
        </h2>

        <p className="mt-2 text-sm leading-6 text-black/50">
          Your booking price includes rental equipment, delivery and applicable sales tax.
        </p>

        <div className="mt-5 divide-y divide-black/[0.06]">
          <SummaryRow
            label="Equipment"
            value={formatMoney(booking.subtotal)}
          />

          {modifiersTotal !== 0 ? (
            <SummaryRow
              label="Options / add-ons"
              value={formatMoney(modifiersTotal)}
            />
          ) : null}

          <SummaryRow
            label="Delivery"
            value={formatMoney(deliveryFee)}
          />

          {discountAmount !== 0 ? (
            <SummaryRow
              label="Discount"
              value={`−${formatMoney(discountAmount)}`}
            />
          ) : null}

          <SummaryRow
            label={taxRateLabel ? `Sales tax (${taxRateLabel})` : "Sales tax"}
            value={formatMoney(taxAmount)}
          />

          <SummaryRow
            label="Total"
            value={formatMoney(totalAmount)}
            emphasized
          />
        </div>
      </div>

      <div
        className={`border-t border-black/[0.06] p-6 ${
          isPaidInFull ? "bg-emerald-50" : "bg-[#f7f4ef]"
        }`}
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/40">
              {isPaidInFull ? "Payment status" : "Balance due"}
            </p>

            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {isPaidInFull ? "Paid in full" : formatMoney(balanceDue)}
            </p>
          </div>

          {isPaidInFull ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">
              ✓
            </span>
          ) : null}
        </div>

        <div className="mt-5 space-y-3 border-t border-black/[0.07] pt-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-black/50">Deposit required</span>
            <strong>{formatMoney(depositAmount)}</strong>
          </div>

          <div className="flex items-center justify-between gap-4">
            <span className="text-black/50">Amount paid</span>
            <strong>{formatMoney(amountPaid)}</strong>
          </div>

          {!isPaidInFull ? (
            <div className="flex items-center justify-between gap-4 border-t border-black/[0.06] pt-3">
              <span className="font-semibold text-black/65">Remaining balance</span>
              <strong>{formatMoney(balanceDue)}</strong>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

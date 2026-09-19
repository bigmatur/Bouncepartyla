import { payCustomerBookingBalanceByCardAction } from "../actions";

function money(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  const safeValue = Number.isFinite(parsed) ? parsed : 0;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(safeValue);
}

type MobileBalancePaymentBarProps = {
  bookingId: string;
  balanceDue: number;
};

export default function MobileBalancePaymentBar({
  bookingId,
  balanceDue,
}: MobileBalancePaymentBarProps) {
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 rounded-[20px] border border-black/10 bg-white/95 p-2 shadow-[0_16px_45px_rgba(0,0,0,0.16)] backdrop-blur-xl print:hidden lg:hidden">
      <div className="flex items-center gap-2 rounded-2xl bg-[#f7f4ef] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a723e]">
            Balance due
          </div>
          <div className="mt-0.5 truncate text-lg font-semibold text-red-700">
            {money(balanceDue)}
          </div>
        </div>

        <form action={payCustomerBookingBalanceByCardAction}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <button className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#23313f] px-4 text-sm font-semibold text-white">
            Pay balance
          </button>
        </form>
      </div>
    </div>
  );
}

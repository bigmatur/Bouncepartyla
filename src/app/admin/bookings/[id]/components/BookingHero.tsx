import { updateBookingMarkerColorAction } from "../../marker-color-actions";

type BookingHeroProps = {
  bookingId: string;
  bookingNumber: string;
  statusLabel: string;
  statusClassName: string;
  eventDateLabel: string;
  customerName: string;
  fullAddress: string;
  primaryPhoto: string | null;
  markerColor: string;
  markerLabel: string;
};

export default function BookingHero({
  bookingId,
  bookingNumber,
  statusLabel,
  statusClassName,
  eventDateLabel,
  customerName,
  fullAddress,
  primaryPhoto,
  markerColor,
  markerLabel,
}: BookingHeroProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_8px_28px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
      <div className="p-3.5 sm:p-6">
        <a
          href="/admin/bookings"
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9a723e] transition hover:text-[#7f633a] sm:text-sm sm:font-semibold"
        >
          <span aria-hidden="true">&larr;</span>
          Bookings
        </a>

        <div className="mt-3 grid min-w-0 grid-cols-[76px_minmax(0,1fr)] gap-3 sm:mt-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-5 xl:grid-cols-[96px_minmax(0,1fr)_auto] xl:items-start">
          <div className="h-[76px] w-[76px] overflow-hidden rounded-[18px] bg-[#e7e0d7] ring-1 ring-[#ddd0be] sm:h-24 sm:w-24 sm:rounded-[22px]">
            {primaryPhoto ? (
              <img
                src={primaryPhoto}
                alt="Main booking product"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-semibold text-[#918579] sm:text-sm">
                No photo
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
              <span
                className={`max-w-full truncate rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClassName}`}
              >
                {statusLabel}
              </span>

              <span className="shrink-0 rounded-full bg-[#f4ede2] px-2.5 py-1 text-[10px] font-bold text-[#9a723e] ring-1 ring-[#e3d3bb] sm:px-3 sm:text-xs sm:font-semibold">
                {eventDateLabel}
              </span>
            </div>

            <h1 className="mt-2 truncate text-xl font-bold tracking-tight text-[#1f1e1b] sm:mt-3 sm:text-3xl sm:font-semibold">
              Booking #{bookingNumber}
            </h1>

            <div className="mt-1.5 truncate text-sm font-semibold text-[#36312d] sm:mt-2">
              {customerName}
            </div>

            <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-[#746b63] sm:text-sm">
              {fullAddress}
            </div>
          </div>

          <div className="col-span-2 mt-1 grid grid-cols-4 gap-2 xl:col-span-1 xl:mt-0 xl:flex xl:max-w-[360px] xl:flex-wrap xl:justify-end">
            <a
              href={`/admin/bookings/${bookingId}/edit-items`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c9964f] px-2 text-center text-[11px] font-bold text-white transition hover:bg-[#b78744] sm:text-xs xl:rounded-full xl:px-4 xl:text-sm xl:font-semibold"
            >
              Edit
            </a>

            <a
              href={`/admin/bookings/${bookingId}/routes`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#23313f] px-2 text-center text-[11px] font-bold text-white transition hover:bg-[#18222d] sm:text-xs xl:rounded-full xl:px-4 xl:text-sm xl:font-semibold"
            >
              Route
            </a>

            <a
              href={`/admin/bookings/${bookingId}/checklist`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2 text-center text-[11px] font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:text-xs xl:rounded-full xl:px-4 xl:text-sm xl:font-semibold"
            >
              Checklist
            </a>

            <details className="relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-2 text-center text-[11px] font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] [&::-webkit-details-marker]:hidden sm:text-xs xl:rounded-full xl:px-4 xl:text-sm xl:font-semibold">
                More
              </summary>

              <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 overflow-hidden rounded-2xl border border-[#e7ddd1] bg-white p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.16)]">
                <a href={`/admin/bookings/${bookingId}/workflow`} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-[#2b2a28] hover:bg-[#f7f1e8]">Workflow</a>
                <a href={`/admin/bookings/${bookingId}/photos`} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-[#2b2a28] hover:bg-[#f7f1e8]">Photos</a>
                <a href={`/admin/bookings/${bookingId}/inventory`} className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-[#2b2a28] hover:bg-[#f7f1e8]">Inventory lifecycle</a>
                <a href="/admin/inventory/returns" className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-[#2b2a28] hover:bg-[#f7f1e8]">Returns</a>
                <a href="/admin/bookings" className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-[#2b2a28] hover:bg-[#f7f1e8]">All bookings</a>
              </div>
            </details>
          </div>
        </div>
      </div>

      <details className="group border-t border-[#eee5d9] bg-[#fcfaf7]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3 text-xs font-bold text-[#6c6258] [&::-webkit-details-marker]:hidden sm:px-6 sm:text-sm">
          <span className="inline-flex min-w-0 items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: markerColor }}
            />
            <span className="truncate">{markerLabel} marker</span>
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#9a7a49] group-open:hidden">
            Color
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.12em] text-[#9a7a49] group-open:inline">
            Close
          </span>
        </summary>

        <form
          action={updateBookingMarkerColorAction}
          className="flex flex-col gap-3 border-t border-[#eee5d9] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4"
        >
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="returnTo" value={`/admin/bookings/${bookingId}`} />

          <div className="text-xs leading-5 text-[#6c6258] sm:text-sm">
            Used on bookings list, calendar and route previews.
          </div>

          <div className="flex items-center gap-2">
            <input
              type="color"
              name="markerColor"
              defaultValue={markerColor}
              className="h-10 w-12 cursor-pointer rounded-xl border border-[#d8cec0] bg-white p-1"
              aria-label="Change booking marker color"
            />
            <button
              type="submit"
              className="min-h-10 flex-1 rounded-xl bg-[#23313f] px-4 text-xs font-bold text-white transition hover:bg-[#18222d] sm:flex-none sm:rounded-full sm:text-sm sm:font-semibold"
            >
              Save color
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}

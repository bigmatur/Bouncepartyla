"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type {
  BookingItem,
  BookingItemComponent,
  BookingModifier,
} from "../booking-types";

type BookingEquipmentProps = {
  items: BookingItem[];
  modifiers: BookingModifier[];
};

type GalleryImage = {
  url: string;
  alt: string;
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

function formatDimension(
  value: number | string | null | undefined,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return String(value);
  }

  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(1).replace(/\.0$/, "");
}

function formatQuantity(
  value: number | string | null | undefined,
) {
  const quantity = Number(value ?? 0);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toFixed(2).replace(/\.?0+$/, "");
}

function getDimensions(item: BookingItem) {
  const dimensions = [
    formatDimension(item.setup_width_ft),
    formatDimension(item.setup_length_ft),
    formatDimension(item.setup_height_ft),
  ].filter((value): value is string => Boolean(value));

  return dimensions.length >= 2
    ? `${dimensions.join(" × ")} ft`
    : null;
}

function getAgeLabel(item: BookingItem) {
  if (
    item.min_age !== null &&
    item.max_age !== null
  ) {
    return `Ages ${item.min_age}–${item.max_age}`;
  }

  if (item.min_age !== null) {
    return `Ages ${item.min_age}+`;
  }

  if (item.max_age !== null) {
    return `Up to age ${item.max_age}`;
  }

  return null;
}

function getDescription(item: BookingItem) {
  return (
    item.product_short_description?.trim() ||
    item.product_description?.trim() ||
    null
  );
}

function getComponentName(
  component: BookingItemComponent,
) {
  return component.name?.trim() || "Component";
}

function getOptionName(modifier: BookingModifier) {
  return (
    modifier.option_name?.trim() ||
    modifier.modifier_name?.trim() ||
    modifier.group_name?.trim() ||
    "Option"
  );
}

function getOptionDescription(
  modifier: BookingModifier,
) {
  return (
    modifier.option_description?.trim() ||
    modifier.modifier_description?.trim() ||
    null
  );
}

function normalizeGalleryValue(
  value: unknown,
): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const record = value as Record<string, unknown>;
    const possibleUrl =
      record.url ??
      record.src ??
      record.image_url ??
      record.photo_url;

    if (typeof possibleUrl === "string") {
      const trimmed = possibleUrl.trim();
      return trimmed || null;
    }
  }

  return null;
}

function buildGallery(item: BookingItem): GalleryImage[] {
  const urls = [
    item.product_image_url,
    ...(Array.isArray(item.product_gallery_urls)
      ? item.product_gallery_urls.map(normalizeGalleryValue)
      : []),
  ].filter((value): value is string => Boolean(value));

  const uniqueUrls = Array.from(new Set(urls));

  return uniqueUrls.map((url, index) => ({
    url,
    alt:
      index === 0
        ? item.product_name
        : `${item.product_name} photo ${index + 1}`,
  }));
}

function DetailListCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-[#eadfce] bg-[#fbf7f1] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a7240]">
        {title}
      </p>

      <div className="mt-3 space-y-2">
        {children}
      </div>
    </div>
  );
}

function ProductGallery({
  item,
  images,
  onOpen,
}: {
  item: BookingItem;
  images: GalleryImage[];
  onOpen: (index: number) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [item.id]);

  const activeImage = images[activeIndex] ?? null;

  if (!activeImage) {
    return (
      <div className="flex min-h-[280px] items-center justify-center bg-[#f7f4ef] px-6 text-center md:min-h-[420px]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/30">
            Equipment image
          </p>

          <p className="mt-3 text-4xl" aria-hidden="true">
            🎉
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#f7f4ef] p-3">
      <button
        type="button"
        onClick={() => onOpen(activeIndex)}
        className="group relative block h-48 w-full overflow-hidden rounded-[16px] bg-white sm:aspect-[4/3] sm:h-auto sm:rounded-[18px]"
        aria-label={`Open photos for ${item.product_name}`}
      >
        <img
          src={activeImage.url}
          alt={activeImage.alt}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          loading="lazy"
          decoding="async"
        />

        {images.length > 1 ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            View all photos · {images.length}
          </span>
        ) : null}
      </button>

      {images.length > 1 ? (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => {
            const isActive = index === activeIndex;

            return (
              <button
                key={image.url}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={[
                  "relative h-16 w-20 shrink-0 overflow-hidden rounded-[12px] border-2 bg-white transition",
                  isActive
                    ? "border-black"
                    : "border-transparent opacity-70 hover:opacity-100",
                ].join(" ")}
                aria-label={`Show photo ${index + 1}`}
                aria-pressed={isActive}
              >
                <img
                  src={image.url}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ProductLightbox({
  images,
  initialIndex,
  productName,
  onClose,
}: {
  images: GalleryImage[];
  initialIndex: number;
  productName: string;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] =
    useState(initialIndex);

  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((current) =>
          (current + 1) % images.length,
        );
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((current) =>
          (current - 1 + images.length) %
          images.length,
        );
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
      document.body.style.overflow = "";
    };
  }, [images.length, onClose]);

  const activeImage = images[activeIndex];

  if (!activeImage) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} photo gallery`}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-4 text-white sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {productName}
          </p>

          <p className="mt-0.5 text-xs text-white/55">
            {activeIndex + 1} of {images.length}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl hover:bg-white/20"
          aria-label="Close gallery"
        >
          ×
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16">
        <img
          src={activeImage.url}
          alt={activeImage.alt}
          className="max-h-full max-w-full object-contain"
        />

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() =>
                setActiveIndex(
                  (activeIndex - 1 + images.length) %
                    images.length,
                )
              }
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur hover:bg-white/20 sm:left-6"
              aria-label="Previous photo"
            >
              ‹
            </button>

            <button
              type="button"
              onClick={() =>
                setActiveIndex(
                  (activeIndex + 1) % images.length,
                )
              }
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur hover:bg-white/20 sm:right-6"
              aria-label="Next photo"
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 pb-4 sm:px-6">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={[
                "h-14 w-20 shrink-0 overflow-hidden rounded-[10px] border-2",
                index === activeIndex
                  ? "border-white"
                  : "border-transparent opacity-55",
              ].join(" ")}
              aria-label={`Open photo ${index + 1}`}
            >
              <img
                src={image.url}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function BookingEquipment({
  items,
  modifiers,
}: BookingEquipmentProps) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeModifiers = Array.isArray(modifiers)
    ? modifiers
    : [];

  const galleries = useMemo(
    () =>
      new Map(
        safeItems.map((item) => [
          item.id,
          buildGallery(item),
        ]),
      ),
    [safeItems],
  );

  const [lightbox, setLightbox] = useState<{
    itemId: string;
    index: number;
  } | null>(null);

  const lightboxItem = lightbox
    ? safeItems.find(
        (item) => item.id === lightbox.itemId,
      ) ?? null
    : null;

  const lightboxImages = lightboxItem
    ? galleries.get(lightboxItem.id) ?? []
    : [];

  return (
    <>
      <section className="rounded-[20px] border border-black/10 bg-white p-4 sm:rounded-[26px] sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
            Your setup
          </p>

          <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] sm:mt-2 sm:text-xl">
            Equipment
          </h2>
        </div>

        {safeItems.length === 0 ? (
          <div className="mt-5 rounded-[20px] bg-black/[0.035] px-5 py-5">
            <p className="text-sm font-medium">
              Your equipment is being prepared.
            </p>

            <p className="mt-1 text-sm leading-6 text-black/45">
              The booked items will appear here once they are added to your reservation.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4 sm:mt-5 sm:space-y-5">
            {safeItems.map((item) => {
              const dimensions = getDimensions(item);
              const ageLabel = getAgeLabel(item);
              const description = getDescription(item);
              const images =
                galleries.get(item.id) ?? [];

              const components = Array.isArray(
                item.item_components,
              )
                ? item.item_components.filter(
                    (component) =>
                      Boolean(component?.name?.trim()),
                  )
                : [];

              const itemOptions = safeModifiers.filter(
                (modifier) =>
                  modifier.booking_item_id === item.id,
              );

              const hasDetails =
                components.length > 0 ||
                itemOptions.length > 0;

              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-[18px] border border-black/[0.08] sm:rounded-[24px]"
                >
                  <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                    <ProductGallery
                      item={item}
                      images={images}
                      onOpen={(index) =>
                        setLightbox({
                          itemId: item.id,
                          index,
                        })
                      }
                    />

                    <div className="flex min-w-0 flex-col justify-between p-4 sm:p-6 lg:p-7">
                      <div>
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div className="min-w-0">
                            {item.category_name ? (
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/35">
                                {item.category_name}
                              </p>
                            ) : null}

                            <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] sm:text-2xl">
                              {item.product_name}
                            </h3>

                            {item.variant_name ? (
                              <p className="mt-1.5 text-sm font-medium text-black/50">
                                {item.variant_name}
                              </p>
                            ) : null}
                          </div>

                          <div className="shrink-0 sm:text-right">
                            <p className="text-lg font-semibold">
                              {formatMoney(item.subtotal)}
                            </p>

                            {item.quantity > 1 ? (
                              <p className="mt-1 text-xs text-black/40">
                                {formatMoney(item.unit_price)} each
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {description ? (
                          <p className="mt-5 hidden max-w-2xl text-sm leading-6 text-black/55 sm:block">
                            {description}
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:flex sm:flex-wrap">
                        {item.quantity > 1 ? (
                          <span className="rounded-[14px] bg-black/[0.045] px-3 py-2 text-xs font-medium text-black/60">
                            Quantity · {item.quantity}
                          </span>
                        ) : null}

                        {dimensions ? (
                          <span className="rounded-[14px] bg-black/[0.045] px-3 py-2 text-xs font-medium text-black/60">
                            Setup · {dimensions}
                          </span>
                        ) : null}

                        {item.max_capacity ? (
                          <span className="rounded-[14px] bg-black/[0.045] px-3 py-2 text-xs font-medium text-black/60">
                            Capacity · {item.max_capacity}
                          </span>
                        ) : null}

                        {ageLabel ? (
                          <span className="rounded-[14px] bg-black/[0.045] px-3 py-2 text-xs font-medium text-black/60">
                            {ageLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {hasDetails ? (
                    <details className="group border-t border-black/[0.08]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold sm:px-6">
                        <span>Components and options</span>

                        <span
                          className="text-lg font-normal text-black/40 transition-transform group-open:rotate-180"
                          aria-hidden="true"
                        >
                          ⌄
                        </span>
                      </summary>

                      <div className="grid gap-4 px-5 pb-5 sm:px-6 sm:pb-6 md:grid-cols-2">
                        {components.length > 0 ? (
                          <DetailListCard title="Components">
                            {components.map(
                              (component, index) => {
                                const quantity =
                                  formatQuantity(
                                    component.quantity,
                                  );

                                return (
                                  <div
                                    key={
                                      component.id ||
                                      `${component.name}-${index}`
                                    }
                                    className="flex items-start gap-2 text-sm leading-5 text-black/55"
                                  >
                                    <span aria-hidden="true">
                                      –
                                    </span>

                                    <span>
                                      {getComponentName(
                                        component,
                                      )}
                                      {quantity &&
                                      Number(quantity) > 1
                                        ? ` × ${quantity}`
                                        : ""}
                                    </span>
                                  </div>
                                );
                              },
                            )}
                          </DetailListCard>
                        ) : null}

                        {itemOptions.length > 0 ? (
                          <DetailListCard title="Options">
                            {itemOptions.map(
                              (modifier) => {
                                const quantity =
                                  formatQuantity(
                                    modifier.quantity,
                                  );
                                const optionDescription =
                                  getOptionDescription(
                                    modifier,
                                  );

                                return (
                                  <div
                                    key={modifier.id}
                                    className="text-sm leading-5 text-black/55"
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex min-w-0 items-start gap-2">
                                        <span aria-hidden="true">
                                          –
                                        </span>

                                        <span>
                                          {getOptionName(
                                            modifier,
                                          )}
                                          {quantity &&
                                          Number(quantity) > 1
                                            ? ` × ${quantity}`
                                            : ""}
                                        </span>
                                      </div>

                                      {Number(
                                        modifier.subtotal ?? 0,
                                      ) > 0 ? (
                                        <span className="shrink-0 text-xs font-semibold text-black/60">
                                          {formatMoney(
                                            modifier.subtotal,
                                          )}
                                        </span>
                                      ) : null}
                                    </div>

                                    {optionDescription ? (
                                      <p className="ml-4 mt-0.5 text-xs leading-5 text-black/40">
                                        {optionDescription}
                                      </p>
                                    ) : null}
                                  </div>
                                );
                              },
                            )}
                          </DetailListCard>
                        ) : null}
                      </div>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {lightbox &&
      lightboxItem &&
      lightboxImages.length > 0 ? (
        <ProductLightbox
          images={lightboxImages}
          initialIndex={lightbox.index}
          productName={lightboxItem.product_name}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ProductPhotoCarouselProps = {
  title: string;
  imageUrl?: string | null;
  galleryUrls?: string[] | null;
  emptyLabel?: string;
  imageAspectClassName?: string;
  className?: string;
};

function normalizeUrls(urls: string[]) {
  const unique = new Set<string>();
  const ordered: string[] = [];

  for (const item of urls) {
    const url = String(item || "").trim();

    if (!url || unique.has(url)) {
      continue;
    }

    unique.add(url);
    ordered.push(url);
  }

  return ordered;
}

export default function ProductPhotoCarousel({
  title,
  imageUrl,
  galleryUrls,
  emptyLabel = "Photo coming soon",
  imageAspectClassName = "aspect-[16/10]",
  className = "",
}: ProductPhotoCarouselProps) {
  const photos = useMemo(
    () => normalizeUrls([imageUrl || "", ...(galleryUrls || [])]),
    [imageUrl, galleryUrls],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const mobileTrackRef = useRef<HTMLDivElement | null>(null);
  const hasPhotos = photos.length > 0;

  useEffect(() => {
    setActiveIndex((current) => {
      if (photos.length < 1) {
        return 0;
      }

      return Math.min(current, photos.length - 1);
    });
  }, [photos.length]);

  const clampedIndex = Math.min(activeIndex, Math.max(photos.length - 1, 0));
  const activePhoto = hasPhotos ? photos[clampedIndex] : null;

  function scrollMobileTrackToIndex(index: number) {
    const track = mobileTrackRef.current;

    if (!track) {
      return;
    }

    if (track.offsetParent === null) {
      return;
    }

    const width = track.clientWidth;

    if (!width) {
      return;
    }

    track.scrollTo({
      left: width * index,
      behavior: "smooth",
    });
  }

  function handleMobileScroll() {
    const track = mobileTrackRef.current;

    if (!track) {
      return;
    }

    const width = track.clientWidth;

    if (!width) {
      return;
    }

    const nextIndex = Math.max(
      0,
      Math.min(photos.length - 1, Math.round(track.scrollLeft / width)),
    );

    if (nextIndex !== clampedIndex) {
      setActiveIndex(nextIndex);
    }
  }

  return (
    <div className={className}>
      <div className={[
        imageAspectClassName,
        "relative overflow-hidden bg-[#f6f1e8]",
      ].join(" ")}>
        {activePhoto ? (
          <>
            <div
              ref={mobileTrackRef}
              onScroll={handleMobileScroll}
              className="flex h-full overflow-x-auto snap-x snap-mandatory sm:hidden"
            >
              {photos.map((photo, index) => (
                <div key={photo} className="h-full w-full flex-none snap-center">
                  <img
                    src={photo}
                    alt={`${title} photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>

            <div className="hidden h-full sm:block">
              <img
                src={activePhoto}
                alt={title}
                className="h-full w-full object-cover"
              />
            </div>

            {photos.length > 1 && (
              <div className="absolute bottom-3 right-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white sm:hidden">
                {clampedIndex + 1} / {photos.length}
              </div>
            )}

            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setActiveIndex((current) =>
                      current <= 0 ? photos.length - 1 : current - 1,
                    )
                  }
                  className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 px-2.5 py-2 text-sm font-semibold text-white transition hover:bg-black/70 sm:flex"
                  aria-label="Previous photo"
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveIndex((current) =>
                      current >= photos.length - 1 ? 0 : current + 1,
                    )
                  }
                  className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/55 px-2.5 py-2 text-sm font-semibold text-white transition hover:bg-black/70 sm:flex"
                  aria-label="Next photo"
                >
                  ›
                </button>
              </>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-black/35">
            {emptyLabel}
          </div>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-3 sm:gap-3 sm:p-4">
          {photos.map((photo, index) => {
            const isActive = index === clampedIndex;

            return (
              <button
                key={photo}
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                  scrollMobileTrackToIndex(index);
                }}
                className={[
                  "h-[76px] w-[76px] flex-none overflow-hidden rounded-xl ring-2 transition",
                  isActive ? "ring-[#c9964f]" : "ring-transparent hover:ring-[#d7c4aa]",
                ].join(" ")}
                aria-label={`Show photo ${index + 1}`}
              >
                <img
                  src={photo}
                  alt={`${title} photo ${index + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import SafeGalleryUploadForm from "@/components/admin/SafeGalleryUploadForm";

type ProductPhotosManagerProps = {
  productId: string;
  productName: string;
  imageUrl: string | null;
  galleryUrls: string[];
  uploadAction: (formData: FormData) => Promise<void>;
  setMainAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
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

export default function ProductPhotosManager({
  productId,
  productName,
  imageUrl,
  galleryUrls,
  uploadAction,
  setMainAction,
  removeAction,
}: ProductPhotosManagerProps) {
  const photos = useMemo(
    () => normalizeUrls([imageUrl || "", ...galleryUrls]),
    [imageUrl, galleryUrls],
  );

  const [selectedUrl, setSelectedUrl] = useState<string | null>(photos[0] || null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeUrl = selectedUrl && photos.includes(selectedUrl)
    ? selectedUrl
    : photos[0] || null;

  const mainUrl = photos[0] || null;
  const isSelectedMain = Boolean(activeUrl && mainUrl && activeUrl === mainUrl);

  const submitPhotoAction = (
    action: (formData: FormData) => Promise<void>,
    photoUrl: string,
  ) => {
    setError(null);

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("productId", productId);
        formData.set("photoUrl", photoUrl);
        await action(formData);
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "Photo action failed.",
        );
      }
    });
  };

  return (
    <section className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <h3 className="text-lg font-semibold text-[#1f1e1b]">Product photos</h3>
      <p className="mt-1 text-sm text-[#6c6258]">
        Main photo and gallery are managed as one ordered set. The first photo is customer-facing main.
      </p>

      {activeUrl ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#e5dacb] bg-[#efe7dc]">
          <div className="aspect-square sm:aspect-[4/3]">
            <img
              src={activeUrl}
              alt={productName}
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 flex aspect-square items-center justify-center rounded-2xl border border-dashed border-[#d8cec0] bg-[#faf7f2] text-sm font-semibold text-[#9a7a49] sm:aspect-[4/3]">
          No product photo
        </div>
      )}

      {photos.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((photoUrl, index) => {
              const isMain = index === 0;
              const isSelected = photoUrl === activeUrl;

              return (
                <button
                  key={photoUrl}
                  type="button"
                  onClick={() => setSelectedUrl(photoUrl)}
                  className={[
                    "relative h-[76px] w-[76px] flex-none overflow-hidden rounded-xl ring-2 transition",
                    isSelected ? "ring-[#c9964f]" : "ring-transparent hover:ring-[#e5dacb]",
                  ].join(" ")}
                >
                  <img
                    src={photoUrl}
                    alt={`${productName} photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  {isMain && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-[#1d1d1b]/85 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Main
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending || !activeUrl || isSelectedMain}
              onClick={() => {
                if (!activeUrl || isSelectedMain) return;
                submitPhotoAction(setMainAction, activeUrl);
              }}
              className="rounded-full bg-[#23313f] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Saving..." : isSelectedMain ? "Current main photo" : "Set as main"}
            </button>

            <button
              type="button"
              disabled={isPending || !activeUrl}
              onClick={() => {
                if (!activeUrl) return;
                submitPhotoAction(removeAction, activeUrl);
              }}
              className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Removing..." : "Remove selected"}
            </button>
          </div>
        </div>
      ) : null}

      {error && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4">
        <SafeGalleryUploadForm
          action={uploadAction}
          hiddenFields={[{ name: "productId", value: productId }]}
          buttonLabel="Add photos"
        />
      </div>
    </section>
  );
}

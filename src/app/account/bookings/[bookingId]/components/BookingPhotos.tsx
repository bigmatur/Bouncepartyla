import Image from "next/image";

type BookingPhoto = {
  id: string;
  photo_type: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
};

type BookingPhotosProps = {
  photos: BookingPhoto[];
};

function statusLabel(
  value: string | null | undefined,
) {
  if (!value) {
    return "Photo";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getPhotoBadge(photoType: string) {
  const labels: Record<string, string> = {
    setup: "Setup complete",
    pickup: "Pickup complete",
    damage: "Condition photo",
    venue: "Venue",
    customer: "Customer photo",
  };

  return labels[photoType] || statusLabel(photoType);
}

export default function BookingPhotos({
  photos,
}: BookingPhotosProps) {
  if (photos.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Event updates
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Photos
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
          Photos added by our delivery team will appear here.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {photos.map((photo) => {
          const title =
            photo.caption ||
            statusLabel(photo.photo_type);

          return (
            <figure
              key={photo.id}
              className="group overflow-hidden rounded-[20px] border border-black/[0.08] bg-white"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-black/[0.03]">
                <Image
                  src={photo.photo_url}
                  alt={title}
                  fill
                  className="object-cover transition duration-300 group-hover:scale-[1.02]"
                  sizes="(max-width: 640px) 100vw, 50vw"
                  unoptimized
                />

                <div className="absolute left-3 top-3">
                  <span className="rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-black/70 shadow-sm backdrop-blur">
                    {getPhotoBadge(photo.photo_type)}
                  </span>
                </div>
              </div>

              <figcaption className="px-4 py-4">
                <p className="text-sm font-semibold">
                  {title}
                </p>

                {photo.created_at ? (
                  <p className="mt-1 text-xs text-black/40">
                    Added to your booking
                  </p>
                ) : null}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

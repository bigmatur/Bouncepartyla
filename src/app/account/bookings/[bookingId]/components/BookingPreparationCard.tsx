type BookingPreparationCardProps = {
  venueType: string | null;
  surfaceType: string | null;
  generatorRequired: boolean;
  powerAvailable: boolean | null;
};

type PreparationItem = {
  title: string;
  description: string;
};

function normalize(value: string | null) {
  return value?.trim().toLowerCase() || "";
}

export default function BookingPreparationCard({
  venueType,
  surfaceType,
  generatorRequired,
  powerAvailable,
}: BookingPreparationCardProps) {
  const normalizedVenue = normalize(venueType);
  const normalizedSurface = normalize(surfaceType);

  const items: PreparationItem[] = [
    {
      title: "Clear the setup area",
      description:
        "Please remove furniture, toys, decorations, and other obstacles before our delivery team arrives.",
    },
    {
      title: "Keep access open",
      description:
        "Make sure the path from the unloading area to the setup location is unlocked and easy to access.",
    },
  ];

  if (
    normalizedSurface.includes("grass") ||
    normalizedVenue.includes("yard") ||
    normalizedVenue.includes("outdoor")
  ) {
    items.push({
      title: "Turn off sprinklers",
      description:
        "Please keep sprinklers off before setup and during the full rental period.",
    });
  }

  if (
    normalizedSurface.includes("concrete") ||
    normalizedSurface.includes("pavement") ||
    normalizedSurface.includes("asphalt")
  ) {
    items.push({
      title: "Keep the surface dry",
      description:
        "Concrete or paved setup areas should be clean, dry, and free from sharp objects.",
    });
  }

  if (generatorRequired) {
    items.push({
      title: "Generator space",
      description:
        "Please leave a safe open area near the setup for the generator and power cables.",
    });
  } else if (powerAvailable === true) {
    items.push({
      title: "Keep the outlet available",
      description:
        "Please make sure the confirmed electrical outlet is working and accessible when we arrive.",
    });
  }

  if (
    normalizedVenue.includes("park") ||
    normalizedVenue.includes("venue") ||
    normalizedVenue.includes("hall")
  ) {
    items.push({
      title: "Confirm venue access",
      description:
        "Please confirm the venue opening time, loading instructions, and any required access codes.",
    });
  }

  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Before we arrive
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Prepare for delivery
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
          A few simple steps help our team complete your setup safely and on time.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {items.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            className="flex items-start gap-4 rounded-[18px] border border-black/[0.06] bg-black/[0.025] px-4 py-4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
              {index + 1}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {item.title}
              </p>

              <p className="mt-1 text-xs leading-5 text-black/45">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

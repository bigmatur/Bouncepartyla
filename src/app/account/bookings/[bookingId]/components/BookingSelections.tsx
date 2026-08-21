type BookingSelectionsProps = {
  ballColors: string | null;
  generatorRequired: boolean;
  coiRequired: boolean;
  coiStatus: string;
  venueType: string | null;
  surfaceType: string | null;
  powerAvailable: boolean | null;
};

function statusLabel(
  value: string | null | undefined,
) {
  if (!value) {
    return "Not available";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function getCoiLabel(
  required: boolean,
  status: string,
) {
  if (!required) {
    return "Not required";
  }

  const labels: Record<string, string> = {
    not_requested: "Not requested",
    requested: "Requested",
    pending: "In progress",
    ready: "Ready",
    sent: "Sent to venue",
    approved: "Approved",
    rejected: "Needs attention",
  };

  return labels[status] || statusLabel(status);
}

function SelectionRow({
  icon,
  label,
  value,
  helper,
}: {
  icon: string;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-[18px] border border-black/[0.06] bg-black/[0.025] px-4 py-4">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm"
        aria-hidden="true"
      >
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-black/35">
          {label}
        </p>

        <p className="mt-1 text-sm font-semibold">
          {value}
        </p>

        {helper ? (
          <p className="mt-1 text-xs leading-5 text-black/45">
            {helper}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export default function BookingSelections({
  ballColors,
  generatorRequired,
  coiRequired,
  coiStatus,
  venueType,
  surfaceType,
  powerAvailable,
}: BookingSelectionsProps) {
  const hasData =
    Boolean(ballColors) ||
    generatorRequired ||
    coiRequired ||
    Boolean(venueType) ||
    Boolean(surfaceType) ||
    powerAvailable !== null;

  if (!hasData) {
    return null;
  }

  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Your choices
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Booking selections
        </h2>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {ballColors ? (
          <SelectionRow
            icon="🎨"
            label="Ball colors"
            value={ballColors}
          />
        ) : null}

        {surfaceType ? (
          <SelectionRow
            icon="◫"
            label="Setup surface"
            value={statusLabel(surfaceType)}
          />
        ) : null}

        {venueType ? (
          <SelectionRow
            icon="⌂"
            label="Venue"
            value={statusLabel(venueType)}
          />
        ) : null}

        <SelectionRow
          icon="⚡"
          label="Power"
          value={
            generatorRequired
              ? "Generator included"
              : powerAvailable === true
                ? "Outlet available"
                : powerAvailable === false
                  ? "No outlet confirmed"
                  : "No generator required"
          }
          helper={
            generatorRequired
              ? "Our team will bring the generator."
              : undefined
          }
        />

        <SelectionRow
          icon="✓"
          label="Venue insurance"
          value={getCoiLabel(
            coiRequired,
            coiStatus,
          )}
          helper={
            coiRequired
              ? "We will keep the insurance status updated here."
              : undefined
          }
        />
      </div>
    </section>
  );
}

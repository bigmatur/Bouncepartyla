type BookingSafetyItem = {
  id: string;
  product_name: string;
  product_description: string | null;
  min_age: number | null;
  max_age: number | null;
  max_capacity: number | null;
};

type BookingSafetyCardProps = {
  items: BookingSafetyItem[];
};

type Rule = {
  title: string;
  description: string;
};

function includesAny(
  value: string,
  words: string[],
) {
  return words.some((word) =>
    value.includes(word),
  );
}

export default function BookingSafetyCard({
  items,
}: BookingSafetyCardProps) {
  const searchableText = items
    .map(
      (item) =>
        `${item.product_name} ${item.product_description || ""}`,
    )
    .join(" ")
    .toLowerCase();

  const hasInflatable = includesAny(
    searchableText,
    [
      "bounce",
      "jumper",
      "castle",
      "inflatable",
      "bubble house",
      "slide",
    ],
  );

  const hasSoftPlay = includesAny(
    searchableText,
    ["soft play", "ball pit", "playground"],
  );

  const hasWhiteEquipment = includesAny(
    searchableText,
    ["white", "ivory", "cream"],
  );

  const rules: Rule[] = [
    {
      title: "Adult supervision is required",
      description:
        "A responsible adult must supervise children while the equipment is in use.",
    },
    {
      title: "Shoes stay outside",
      description:
        "Please remove shoes before entering any inflatable, soft play area, or ball pit.",
    },
    {
      title: "No food, drinks, or sharp objects",
      description:
        "Keep food, drinks, toys, jewelry, and other sharp objects away from the equipment.",
    },
  ];

  if (hasInflatable) {
    rules.push({
      title: "Keep the blower running",
      description:
        "Do not unplug or turn off the blower while the inflatable is being used.",
    });
  }

  if (hasSoftPlay || hasWhiteEquipment) {
    rules.push({
      title: "No face paint",
      description:
        "Face paint, markers, slime, and colored powders can permanently stain the equipment.",
    });
  }

  return (
    <section className="rounded-[26px] border border-black/10 bg-white p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
          Safe and clean fun
        </p>

        <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
          Important rental rules
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">
          Please share these reminders with everyone supervising the party.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {rules.map((rule, index) => (
          <article
            key={rule.title}
            className="rounded-[18px] border border-black/[0.06] bg-black/[0.025] px-4 py-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
                {index + 1}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {rule.title}
                </p>

                <p className="mt-1 text-xs leading-5 text-black/45">
                  {rule.description}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

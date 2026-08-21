type BookingLike = {
  marker_color?: string | null;
  internal_notes?: string | null;
  booking_modifiers?: any[];
  booking_price_calculations?: Array<{ calculation_snapshot?: any; created_at?: string | null; id?: string | null }>;
};

type BookingModifierLike = {
  modifiers?: { name?: string | null } | null;
  modifier_group_options?: { name?: string | null; label_override?: string | null } | null;
  modifier_group_option_name?: string | null;
  modifier_group_name?: string | null;
  name?: string | null;
  label?: string | null;
  label_override?: string | null;
};

const markerPalette = [
  {
    color: "#7c6f54",
    keywords: ["house", "home", "residential", "backyard", "private", "yard"],
  },
  {
    color: "#2f6fa3",
    keywords: ["park", "venue", "public", "outdoor", "field"],
  },
  {
    color: "#9a723e",
    keywords: ["school", "hall", "gym", "church", "indoor"],
  },
  {
    color: "#6b7280",
    keywords: ["other", "misc", "special"],
  },
];

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHexColor(value: any) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function getLatestSnapshotOverride(booking: BookingLike) {
  const rows = (booking.booking_price_calculations || []).slice();

  rows.sort((left, right) => {
    const leftTime = Number(new Date(String(left?.created_at || "")).getTime() || 0);
    const rightTime = Number(new Date(String(right?.created_at || "")).getTime() || 0);

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return String(right?.id || "").localeCompare(String(left?.id || ""));
  });

  for (const row of rows) {
    const color = normalizeHexColor(row?.calculation_snapshot?.marker_color);
    if (color) {
      return color;
    }
  }

  return null;
}

function getNotesOverride(booking: BookingLike) {
  const notes = String(booking.internal_notes || "");
  const match = notes.match(/\[marker_color:\s*(#[0-9a-fA-F]{6})\s*\]/i);
  return match ? normalizeHexColor(match[1]) : null;
}

function getTextsFromModifier(modifier: BookingModifierLike) {
  return [
    modifier.label_override,
    modifier.modifier_group_option_name,
    modifier.modifier_group_options?.label_override,
    modifier.modifier_group_options?.name,
    modifier.modifiers?.name,
    modifier.label,
    modifier.name,
    modifier.modifier_group_name,
  ]
    .filter(Boolean)
    .map((item) => normalizeText(item as string));
}

function getTextsFromBookingSnapshot(booking: BookingLike) {
  const overrideColor = getLatestSnapshotOverride(booking);
  if (overrideColor) {
    return [overrideColor];
  }

  return (booking.booking_price_calculations || [])
    .flatMap((row) => row.calculation_snapshot?.options || [])
    .flatMap((option: any) => [
      option.name,
      option.modifier_group_name,
      option.modifier_group_option_name,
    ])
    .filter(Boolean)
    .map((item) => normalizeText(item as string));
}

function matchesColor(texts: string[]) {
  for (const paletteEntry of markerPalette) {
    if (paletteEntry.keywords.some((keyword) => texts.some((text) => text.includes(keyword)))) {
      return paletteEntry.color;
    }
  }

  return null;
}

export function getBookingMarkerColor(booking: BookingLike, bookingModifiers: BookingModifierLike[] = []) {
  const notesOverride = getNotesOverride(booking);
  if (notesOverride) {
    return notesOverride;
  }

  const snapshotOverride = getLatestSnapshotOverride(booking);
  if (snapshotOverride) {
    return snapshotOverride;
  }

  const override = normalizeHexColor(booking.marker_color);
  if (override) {
    return override;
  }

  const texts = [
    ...bookingModifiers.flatMap((modifier) => getTextsFromModifier(modifier)),
    ...getTextsFromBookingSnapshot(booking),
  ].filter(Boolean);

  return matchesColor(texts) || "#23313f";
}

export function getBookingMarkerLabel(booking: BookingLike, bookingModifiers: BookingModifierLike[] = []) {
  const notesOverride = getNotesOverride(booking);
  if (notesOverride) {
    return "Custom";
  }

  const snapshotOverride = getLatestSnapshotOverride(booking);
  if (snapshotOverride) {
    return "Custom";
  }

  const override = normalizeHexColor(booking.marker_color);
  if (override) {
    return "Custom";
  }

  const texts = [
    ...bookingModifiers.flatMap((modifier) => getTextsFromModifier(modifier)),
    ...getTextsFromBookingSnapshot(booking),
  ].filter(Boolean);

  if (texts.some((text) => text.includes("park") || text.includes("venue") || text.includes("outdoor"))) {
    return "Park";
  }

  if (texts.some((text) => text.includes("house") || text.includes("home") || text.includes("backyard"))) {
    return "House";
  }

  return "Default";
}
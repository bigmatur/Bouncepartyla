import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

export type HomepageTextItem = {
  title: string;
  copy: string;
};

export type HomepageStep = {
  number: string;
  title: string;
  copy: string;
};

export type HomepageContent = {
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    primaryCta: string;
    secondaryCta: string;
    productSlug: string;
  };
  categories: {
    eyebrow: string;
    title: string;
    linkLabel: string;
    imageSelections: Array<{ categorySlug: string; productSlug: string }>;
  };
  popular: {
    eyebrow: string;
    title: string;
    linkLabel: string;
    productSlugs: string[];
  };
  featured: {
    eyebrow: string;
    title: string;
    body: string;
    primaryCta: string;
    fallbackCta: string;
    productSlug: string;
  };
  realParties: {
    eyebrow: string;
    title: string;
    productSlugs: string[];
  };
  whyUs: {
    eyebrow: string;
    title: string;
    body: string;
    items: HomepageTextItem[];
  };
  howItWorks: {
    eyebrow: string;
    title: string;
    steps: HomepageStep[];
  };
  serviceArea: {
    eyebrow: string;
    title: string;
    items: HomepageTextItem[];
  };
  finalCta: {
    eyebrow: string;
    title: string;
    body: string;
    primaryCta: string;
    secondaryCta: string;
  };
};

export const DEFAULT_HOMEPAGE_CONTENT: HomepageContent = {
  hero: {
    eyebrow: "Los Angeles party rentals",
    title: "Unforgettable celebrations.",
    body:
      "Modern bounce houses, soft play, bubble houses and more delivered across Los Angeles and surrounding areas.",
    primaryCta: "Browse rentals",
    secondaryCta: "Check availability",
    productSlug: "white-castle-slide-ball-pit",
  },
  categories: {
    eyebrow: "Explore our rentals",
    title: "Rentals for every kind of celebration.",
    linkLabel: "View all rentals",
    imageSelections: [],
  },
  popular: {
    eyebrow: "Popular rentals",
    title: "The ones everyone asks for.",
    linkLabel: "View all rentals",
    productSlugs: [
      "white-castle",
      "white-castle-slide-ball-pit",
      "bubble-house",
      "soft-play-ball-pit",
    ],
  },
  featured: {
    eyebrow: "Featured party setup",
    title: "More than a rental. A complete party setup.",
    body:
      "Our signature bounce house and soft play combinations are designed to make your celebration feel effortless and complete.",
    primaryCta: "Explore this setup",
    fallbackCta: "Explore packages",
    productSlug: "white-castle-3-in-1-half-soft-play",
  },
  realParties: {
    eyebrow: "Real parties",
    title: "Made for the whole celebration.",
    productSlugs: [],
  },
  whyUs: {
    eyebrow: "Why Bounce Party LA",
    title: "Beautiful. Clean. Easy.",
    body:
      "We are a family-run Los Angeles company focused on modern inventory, dependable service and a stress-free event day.",
    items: [
      {
        title: "Fully insured",
        copy: "Coverage available for parks and venues",
      },
      {
        title: "Clean every time",
        copy: "Deep cleaned and sanitized for every event",
      },
      {
        title: "Delivery + setup",
        copy: "Our team handles the heavy lifting",
      },
      {
        title: "Modern inventory",
        copy: "Fresh designs made for beautiful parties",
      },
    ],
  },
  howItWorks: {
    eyebrow: "How it works",
    title: "Three steps to party day.",
    steps: [
      {
        number: "01",
        title: "Pick your date",
        copy:
          "Start with your event date so you can shop with confidence.",
      },
      {
        number: "02",
        title: "Choose your rentals",
        copy:
          "Browse bounce houses, soft play, bubble houses and packages.",
      },
      {
        number: "03",
        title: "We deliver the fun",
        copy:
          "We arrive, set everything up safely and return for pickup.",
      },
    ],
  },
  serviceArea: {
    eyebrow: "Los Angeles + surrounding areas",
    title: "We bring the party to you.",
    items: [
      {
        title: "Full-day rentals",
        copy: "Enjoy your rental for the event day.",
      },
      {
        title: "Delivery + professional setup",
        copy: "On-time, reliable service.",
      },
      {
        title: "Parks + venues",
        copy: "Insurance documentation available.",
      },
      {
        title: "Homes + private events",
        copy: "Birthdays, showers and more.",
      },
    ],
  },
  finalCta: {
    eyebrow: "Your date is the first step",
    title: "Ready to make it unforgettable?",
    body:
      "Tell us your date, explore what is available and reserve your favorites online.",
    primaryCta: "Check availability",
    secondaryCta: "Browse rentals",
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeHomepageContent(
  value: unknown,
): HomepageContent {
  if (!isPlainObject(value)) {
    return DEFAULT_HOMEPAGE_CONTENT;
  }

  const merged = structuredClone(DEFAULT_HOMEPAGE_CONTENT);

  for (const sectionKey of Object.keys(
    DEFAULT_HOMEPAGE_CONTENT,
  ) as Array<keyof HomepageContent>) {
    const sectionValue = value[sectionKey];

    if (!isPlainObject(sectionValue)) {
      continue;
    }

    const target = merged[sectionKey] as unknown as Record<string, unknown>;

    for (const [key, fieldValue] of Object.entries(sectionValue)) {
      if (!(key in target)) {
        continue;
      }

      if (
        typeof fieldValue === "string" ||
        Array.isArray(fieldValue)
      ) {
        target[key] = fieldValue;
      }
    }
  }

  return merged;
}

export async function getHomepageContent(): Promise<HomepageContent> {
  try {
    const supabase = createServiceClient();

    const result = await supabase
      .from("homepage_content_settings")
      .select("content")
      .eq("id", "default")
      .maybeSingle();

    if (result.error || !result.data?.content) {
      return DEFAULT_HOMEPAGE_CONTENT;
    }

    return mergeHomepageContent(result.data.content);
  } catch {
    return DEFAULT_HOMEPAGE_CONTENT;
  }
}
"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageContent,
} from "@/lib/customer/homepage-content";

function getString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function getStringList(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getCategoryImageSelections(formData: FormData) {
  const categorySlugs = formData.getAll("categoryImageCategorySlug").map((value) => String(value).trim());
  const productSlugs = formData.getAll("categoryImageProductSlug").map((value) => String(value).trim());

  return categorySlugs
    .map((categorySlug, index) => ({
      categorySlug,
      productSlug: productSlugs[index] || "",
    }))
    .filter((item) => item.categorySlug && item.productSlug);
}

export async function updateHomepageContentAction(formData: FormData) {
  const { supabase, user } =
    await requireAdminPermission("settings.edit");

  const content: HomepageContent = {
    hero: {
      eyebrow: getString(
        formData,
        "heroEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.hero.eyebrow,
      ),
      title: getString(
        formData,
        "heroTitle",
        DEFAULT_HOMEPAGE_CONTENT.hero.title,
      ),
      body: getString(
        formData,
        "heroBody",
        DEFAULT_HOMEPAGE_CONTENT.hero.body,
      ),
      primaryCta: getString(
        formData,
        "heroPrimaryCta",
        DEFAULT_HOMEPAGE_CONTENT.hero.primaryCta,
      ),
      secondaryCta: getString(
        formData,
        "heroSecondaryCta",
        DEFAULT_HOMEPAGE_CONTENT.hero.secondaryCta,
      ),
      productSlug: getString(
        formData,
        "heroProductSlug",
        DEFAULT_HOMEPAGE_CONTENT.hero.productSlug,
      ),
    },

    categories: {
      eyebrow: getString(
        formData,
        "categoriesEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.categories.eyebrow,
      ),
      title: getString(
        formData,
        "categoriesTitle",
        DEFAULT_HOMEPAGE_CONTENT.categories.title,
      ),
      linkLabel: getString(
        formData,
        "categoriesLinkLabel",
        DEFAULT_HOMEPAGE_CONTENT.categories.linkLabel,
      ),
      imageSelections: getCategoryImageSelections(formData),
    },

    popular: {
      eyebrow: getString(
        formData,
        "popularEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.popular.eyebrow,
      ),
      title: getString(
        formData,
        "popularTitle",
        DEFAULT_HOMEPAGE_CONTENT.popular.title,
      ),
      linkLabel: getString(
        formData,
        "popularLinkLabel",
        DEFAULT_HOMEPAGE_CONTENT.popular.linkLabel,
      ),
      productSlugs: getStringList(formData, "popularProductSlug"),
    },

    featured: {
      eyebrow: getString(
        formData,
        "featuredEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.featured.eyebrow,
      ),
      title: getString(
        formData,
        "featuredTitle",
        DEFAULT_HOMEPAGE_CONTENT.featured.title,
      ),
      body: getString(
        formData,
        "featuredBody",
        DEFAULT_HOMEPAGE_CONTENT.featured.body,
      ),
      primaryCta: getString(
        formData,
        "featuredPrimaryCta",
        DEFAULT_HOMEPAGE_CONTENT.featured.primaryCta,
      ),
      fallbackCta: getString(
        formData,
        "featuredFallbackCta",
        DEFAULT_HOMEPAGE_CONTENT.featured.fallbackCta,
      ),
      productSlug: getString(
        formData,
        "featuredProductSlug",
        DEFAULT_HOMEPAGE_CONTENT.featured.productSlug,
      ),
    },

    realParties: {
      eyebrow: getString(
        formData,
        "realPartiesEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.realParties.eyebrow,
      ),
      title: getString(
        formData,
        "realPartiesTitle",
        DEFAULT_HOMEPAGE_CONTENT.realParties.title,
      ),
      productSlugs: getStringList(formData, "realPartyProductSlug"),
    },

    whyUs: {
      eyebrow: getString(
        formData,
        "whyUsEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.whyUs.eyebrow,
      ),
      title: getString(
        formData,
        "whyUsTitle",
        DEFAULT_HOMEPAGE_CONTENT.whyUs.title,
      ),
      body: getString(
        formData,
        "whyUsBody",
        DEFAULT_HOMEPAGE_CONTENT.whyUs.body,
      ),
      items: DEFAULT_HOMEPAGE_CONTENT.whyUs.items.map((item, index) => ({
        title: getString(formData, `whyUsItem${index}Title`, item.title),
        copy: getString(formData, `whyUsItem${index}Copy`, item.copy),
      })),
    },

    howItWorks: {
      eyebrow: getString(
        formData,
        "howItWorksEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.howItWorks.eyebrow,
      ),
      title: getString(
        formData,
        "howItWorksTitle",
        DEFAULT_HOMEPAGE_CONTENT.howItWorks.title,
      ),
      steps: DEFAULT_HOMEPAGE_CONTENT.howItWorks.steps.map(
        (step, index) => ({
          number: getString(
            formData,
            `howItWorksStep${index}Number`,
            step.number,
          ),
          title: getString(
            formData,
            `howItWorksStep${index}Title`,
            step.title,
          ),
          copy: getString(
            formData,
            `howItWorksStep${index}Copy`,
            step.copy,
          ),
        }),
      ),
    },

    serviceArea: {
      eyebrow: getString(
        formData,
        "serviceAreaEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.serviceArea.eyebrow,
      ),
      title: getString(
        formData,
        "serviceAreaTitle",
        DEFAULT_HOMEPAGE_CONTENT.serviceArea.title,
      ),
      items: DEFAULT_HOMEPAGE_CONTENT.serviceArea.items.map(
        (item, index) => ({
          title: getString(
            formData,
            `serviceAreaItem${index}Title`,
            item.title,
          ),
          copy: getString(
            formData,
            `serviceAreaItem${index}Copy`,
            item.copy,
          ),
        }),
      ),
    },

    finalCta: {
      eyebrow: getString(
        formData,
        "finalCtaEyebrow",
        DEFAULT_HOMEPAGE_CONTENT.finalCta.eyebrow,
      ),
      title: getString(
        formData,
        "finalCtaTitle",
        DEFAULT_HOMEPAGE_CONTENT.finalCta.title,
      ),
      body: getString(
        formData,
        "finalCtaBody",
        DEFAULT_HOMEPAGE_CONTENT.finalCta.body,
      ),
      primaryCta: getString(
        formData,
        "finalCtaPrimaryCta",
        DEFAULT_HOMEPAGE_CONTENT.finalCta.primaryCta,
      ),
      secondaryCta: getString(
        formData,
        "finalCtaSecondaryCta",
        DEFAULT_HOMEPAGE_CONTENT.finalCta.secondaryCta,
      ),
    },
  };

  const { error } = await supabase
    .from("homepage_content_settings")
    .upsert(
      {
        id: "default",
        content,
        updated_by: user.id,
      },
      {
        onConflict: "id",
      },
    );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/admin/settings/homepage");
}
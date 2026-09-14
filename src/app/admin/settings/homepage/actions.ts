"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  type HomepageContent,
} from "@/lib/customer/homepage-content";

const HOMEPAGE_IMAGE_BUCKET = "catalog-images";
const MAX_HOMEPAGE_IMAGE_BYTES = 10 * 1024 * 1024;

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

function getBoolean(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function isRealFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      "arrayBuffer" in value &&
      "name" in value &&
      "size" in value &&
      Number((value as File).size) > 0,
  );
}

function safeFileName(name: string) {
  return String(name || "image")
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uploadHomepageImage({
  supabase,
  file,
  folder,
}: {
  supabase: any;
  file: File;
  folder: string;
}) {
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Only image files are allowed.");
  }

  if (file.size > MAX_HOMEPAGE_IMAGE_BYTES) {
    throw new Error("Image must be 10 MB or smaller.");
  }

  const extension = file.name.includes(".")
    ? file.name.split(".").pop()
    : "jpg";

  const path = `${folder}/${Date.now()}-${crypto.randomUUID()}-${safeFileName(
    file.name || `image.${extension}`,
  )}`;

  const { error: uploadError } = await supabase.storage
    .from(HOMEPAGE_IMAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage
    .from(HOMEPAGE_IMAGE_BUCKET)
    .getPublicUrl(path);

  if (!data.publicUrl) {
    throw new Error("Could not create public image URL.");
  }

  return data.publicUrl;
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

  const { data: currentSettings } = await supabase
    .from("homepage_content_settings")
    .select("content")
    .eq("id", "default")
    .maybeSingle();

  const currentContent =
    currentSettings?.content &&
    typeof currentSettings.content === "object"
      ? (currentSettings.content as Partial<HomepageContent>)
      : null;

  const clearHeroLogo = getBoolean(formData, "clearHeroLogo");
  const clearHeroImage = getBoolean(formData, "clearHeroImage");
  const heroLogoFile = formData.get("heroLogoFile");
  const heroImageFile = formData.get("heroImageFile");

  let heroLogoUrl = clearHeroLogo
    ? ""
    : String(currentContent?.hero?.logoUrl || "").trim();

  let heroImageUrl = clearHeroImage
    ? ""
    : String(currentContent?.hero?.imageUrl || "").trim();

  if (isRealFile(heroLogoFile)) {
    heroLogoUrl = await uploadHomepageImage({
      supabase,
      file: heroLogoFile,
      folder: "homepage/logo",
    });
  }

  if (isRealFile(heroImageFile)) {
    heroImageUrl = await uploadHomepageImage({
      supabase,
      file: heroImageFile,
      folder: "homepage/hero",
    });
  }

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
      logoUrl: heroLogoUrl,
      imageUrl: heroImageUrl,
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

  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/catalog");
  revalidatePath("/admin/settings/homepage");
}

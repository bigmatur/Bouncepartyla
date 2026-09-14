import Link from "next/link";

import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  DEFAULT_HOMEPAGE_CONTENT,
  getHomepageContent,
} from "@/lib/customer/homepage-content";
import { getPublicCatalogCategories, getPublicCatalogProducts } from "@/lib/customer/public-catalog";
import { updateHomepageContentAction } from "./actions";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs leading-5 text-[#81776e]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={[
        "w-full resize-y rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <div className="border-b border-[#eee5d9] px-6 py-5">
        <h3 className="text-xl font-semibold text-[#1f1e1b]">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-[#6c6258]">
          {description}
        </p>
      </div>

      <div className="p-6">{children}</div>
    </section>
  );
}

export default async function HomepageContentSettingsPage() {
  await requireAdminPermission("settings.view");

  const [content, categories, products] = await Promise.all([
    getHomepageContent(),
    getPublicCatalogCategories(),
    getPublicCatalogProducts(),
  ]);

  const productOptions = products
    .filter((product) => Boolean(product.public_slug))
    .sort((a, b) =>
      String(a.public_title || a.name).localeCompare(
        String(b.public_title || b.name),
      ),
    );
      const categoryImageValues = Object.fromEntries(
    categories.map((category) => {
      const saved = content.categories.imageSelections.find(
        (item) => item.categorySlug === category.slug,
      );

      const fallback = products.find(
        (product) =>
          product.category_id === category.id &&
          Boolean(product.image_url),
      );

      return [
        category.slug,
        saved?.productSlug || fallback?.public_slug || "",
      ];
    }),
  );

  const popularValues =
    content.popular.productSlugs.length > 0
      ? content.popular.productSlugs
      : DEFAULT_HOMEPAGE_CONTENT.popular.productSlugs;

  const realPartyValues = [
    ...content.realParties.productSlugs,
    "",
    "",
    "",
    "",
  ].slice(0, 4);

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white px-6 py-5 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <Link
              href="/admin/settings"
              className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
            >
              ← Back to settings
            </Link>

            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Public website
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Homepage Content
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Edit homepage text and choose which catalog products are featured.
              Changes are used by the public homepage after saving.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/"
              target="_blank"
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Open Homepage
            </Link>

            <Link
              href="/catalog"
              target="_blank"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Open Catalog
            </Link>
          </div>
        </div>
      </section>

      <form
        action={updateHomepageContentAction}
        className="space-y-6"
        encType="multipart/form-data"
      >
        <SettingCard
          title="Hero"
          description="Main homepage message, optional header logo, and the image used in the hero."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow">
              <Input
                name="heroEyebrow"
                defaultValue={content.hero.eyebrow}
              />
            </Field>

            <Field label="Hero product">
              <Select
                name="heroProductSlug"
                defaultValue={content.hero.productSlug}
              >
                {productOptions.map((product) => (
                  <option key={product.id} value={product.public_slug}>
                    {product.public_title || product.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Title">
              <Input name="heroTitle" defaultValue={content.hero.title} />
            </Field>

            <Field label="Primary CTA">
              <Input
                name="heroPrimaryCta"
                defaultValue={content.hero.primaryCta}
              />
            </Field>

            <Field label="Secondary CTA">
              <Input
                name="heroSecondaryCta"
                defaultValue={content.hero.secondaryCta}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Body">
              <Textarea
                name="heroBody"
                rows={3}
                defaultValue={content.hero.body}
              />
            </Field>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#e6ddd1] bg-[#faf8f5] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                Header logo
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {content.hero.logoUrl ? (
                  <img
                    src={content.hero.logoUrl}
                    alt="Header logo"
                    className="h-12 w-12 rounded-lg object-cover ring-1 ring-[#e8ddce]"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-[11px] text-[#8f7f6b] ring-1 ring-[#e8ddce]">
                    Text
                  </div>
                )}

                <Input
                  name="heroLogoFile"
                  type="file"
                  accept="image/*"
                  className="max-w-sm"
                />

                <label className="inline-flex items-center gap-2 text-sm text-[#6c6258]">
                  <input type="checkbox" name="clearHeroLogo" className="h-4 w-4" />
                  Remove logo
                </label>
              </div>

              <p className="mt-2 text-xs text-[#81776e]">
                If empty, the text brand is shown in the top-left header.
              </p>
            </div>

            <div className="rounded-2xl border border-[#e6ddd1] bg-[#faf8f5] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                Custom hero image
              </div>

              <div className="mt-3 space-y-3">
                <div className="overflow-hidden rounded-xl border border-[#e8ddce] bg-white">
                  {content.hero.imageUrl ? (
                    <img
                      src={content.hero.imageUrl}
                      alt="Custom hero"
                      className="h-28 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center text-xs text-[#8f7f6b]">
                      Uses selected product photo
                    </div>
                  )}
                </div>

                <Input
                  name="heroImageFile"
                  type="file"
                  accept="image/*"
                />

                <label className="inline-flex items-center gap-2 text-sm text-[#6c6258]">
                  <input type="checkbox" name="clearHeroImage" className="h-4 w-4" />
                  Remove custom image
                </label>
              </div>

              <p className="mt-2 text-xs text-[#81776e]">
                If empty, hero uses the selected product image above.
              </p>
            </div>
          </div>
        </SettingCard>

        <SettingCard
          title="Categories"
          description="Text above the category cards."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Eyebrow">
              <Input
                name="categoriesEyebrow"
                defaultValue={content.categories.eyebrow}
              />
            </Field>

            <Field label="Title">
              <Input
                name="categoriesTitle"
                defaultValue={content.categories.title}
              />
            </Field>

            <Field label="Link label">
              <Input
                name="categoriesLinkLabel"
                defaultValue={content.categories.linkLabel}
              />
            </Field>
          </div>
                    <div className="mt-6 border-t border-[#eee5d9] pt-6">
            <div className="mb-4">
              <div className="text-sm font-semibold text-[#1f1e1b]">
                Category photos
              </div>
              <p className="mt-1 text-xs leading-5 text-[#81776e]">
                Choose which product photo is used for each category on the homepage.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {categories.map((category) => {
                const categoryProducts = productOptions.filter(
                  (product) =>
                    product.category_id === category.id &&
                    Boolean(product.image_url),
                );

                return (
                  <div
                    key={category.id}
                    className="rounded-2xl border border-[#e6ddd1] bg-[#faf8f5] p-4"
                  >
                    <input
                      type="hidden"
                      name="categoryImageCategorySlug"
                      value={category.slug}
                    />

                    <Field label={category.name}>
                      <Select
                        name="categoryImageProductSlug"
                        defaultValue={categoryImageValues[category.slug] || ""}
                      >
                        <option value="">Automatic</option>

                        {categoryProducts.map((product) => (
                          <option
                            key={product.id}
                            value={product.public_slug}
                          >
                            {product.public_title || product.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                );
              })}
            </div>
          </div>
        </SettingCard>

        <SettingCard
          title="Popular Rentals"
          description="Homepage heading plus up to four products shown in the Popular Rentals section."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Eyebrow">
              <Input
                name="popularEyebrow"
                defaultValue={content.popular.eyebrow}
              />
            </Field>

            <Field label="Title">
              <Input
                name="popularTitle"
                defaultValue={content.popular.title}
              />
            </Field>

            <Field label="Link label">
              <Input
                name="popularLinkLabel"
                defaultValue={content.popular.linkLabel}
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Field key={index} label={`Product ${index + 1}`}>
                <Select
                  name="popularProductSlug"
                  defaultValue={popularValues[index] || ""}
                >
                  <option value="">None</option>
                  {productOptions.map((product) => (
                    <option key={product.id} value={product.public_slug}>
                      {product.public_title || product.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </SettingCard>

        <SettingCard
          title="Featured Party Setup"
          description="Large featured package section."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow">
              <Input
                name="featuredEyebrow"
                defaultValue={content.featured.eyebrow}
              />
            </Field>

            <Field label="Featured product">
              <Select
                name="featuredProductSlug"
                defaultValue={content.featured.productSlug}
              >
                {productOptions.map((product) => (
                  <option key={product.id} value={product.public_slug}>
                    {product.public_title || product.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Title">
              <Input
                name="featuredTitle"
                defaultValue={content.featured.title}
              />
            </Field>

            <Field label="Primary CTA">
              <Input
                name="featuredPrimaryCta"
                defaultValue={content.featured.primaryCta}
              />
            </Field>

            <Field label="Fallback CTA">
              <Input
                name="featuredFallbackCta"
                defaultValue={content.featured.fallbackCta}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Body">
              <Textarea
                name="featuredBody"
                rows={3}
                defaultValue={content.featured.body}
              />
            </Field>
          </div>
        </SettingCard>

        <SettingCard
          title="Real Parties"
          description="Choose up to four products whose images will appear in the Real Parties gallery. Leave all empty to use the automatic fallback."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow">
              <Input
                name="realPartiesEyebrow"
                defaultValue={content.realParties.eyebrow}
              />
            </Field>

            <Field label="Title">
              <Input
                name="realPartiesTitle"
                defaultValue={content.realParties.title}
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Field key={index} label={`Product ${index + 1}`}>
                <Select
                  name="realPartyProductSlug"
                  defaultValue={realPartyValues[index]}
                >
                  <option value="">Automatic / none</option>
                  {productOptions.map((product) => (
                    <option key={product.id} value={product.public_slug}>
                      {product.public_title || product.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        </SettingCard>

        <SettingCard
          title="Why Bounce Party LA"
          description="Section heading and four trust cards."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow">
              <Input
                name="whyUsEyebrow"
                defaultValue={content.whyUs.eyebrow}
              />
            </Field>

            <Field label="Title">
              <Input
                name="whyUsTitle"
                defaultValue={content.whyUs.title}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Body">
              <Textarea
                name="whyUsBody"
                rows={3}
                defaultValue={content.whyUs.body}
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {content.whyUs.items.map((item, index) => (
              <div
                key={index}
                className="rounded-2xl border border-[#e2d8cb] bg-[#faf8f5] p-4"
              >
                <Field label={`Card ${index + 1} title`}>
                  <Input
                    name={`whyUsItem${index}Title`}
                    defaultValue={item.title}
                  />
                </Field>

                <div className="mt-3">
                  <Field label="Copy">
                    <Textarea
                      name={`whyUsItem${index}Copy`}
                      rows={2}
                      defaultValue={item.copy}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </SettingCard>

        <SettingCard
          title="How It Works"
          description="Three-step booking explanation."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow">
              <Input
                name="howItWorksEyebrow"
                defaultValue={content.howItWorks.eyebrow}
              />
            </Field>

            <Field label="Title">
              <Input
                name="howItWorksTitle"
                defaultValue={content.howItWorks.title}
              />
            </Field>
          </div>

          <div className="mt-5 space-y-4">
            {content.howItWorks.steps.map((step, index) => (
              <div
                key={index}
                className="grid gap-4 rounded-2xl border border-[#e2d8cb] bg-[#faf8f5] p-4 md:grid-cols-[120px_1fr_1.5fr]"
              >
                <Field label="Number">
                  <Input
                    name={`howItWorksStep${index}Number`}
                    defaultValue={step.number}
                  />
                </Field>

                <Field label="Title">
                  <Input
                    name={`howItWorksStep${index}Title`}
                    defaultValue={step.title}
                  />
                </Field>

                <Field label="Copy">
                  <Input
                    name={`howItWorksStep${index}Copy`}
                    defaultValue={step.copy}
                  />
                </Field>
              </div>
            ))}
          </div>
        </SettingCard>

        <SettingCard
          title="Service Area"
          description="Service area heading and four service cards."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow">
              <Input
                name="serviceAreaEyebrow"
                defaultValue={content.serviceArea.eyebrow}
              />
            </Field>

            <Field label="Title">
              <Input
                name="serviceAreaTitle"
                defaultValue={content.serviceArea.title}
              />
            </Field>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {content.serviceArea.items.map((item, index) => (
              <div
                key={index}
                className="rounded-2xl border border-[#e2d8cb] bg-[#faf8f5] p-4"
              >
                <Field label={`Card ${index + 1} title`}>
                  <Input
                    name={`serviceAreaItem${index}Title`}
                    defaultValue={item.title}
                  />
                </Field>

                <div className="mt-3">
                  <Field label="Copy">
                    <Textarea
                      name={`serviceAreaItem${index}Copy`}
                      rows={2}
                      defaultValue={item.copy}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </SettingCard>

        <SettingCard
          title="Final CTA"
          description="Last call-to-action before the footer."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Eyebrow">
              <Input
                name="finalCtaEyebrow"
                defaultValue={content.finalCta.eyebrow}
              />
            </Field>

            <Field label="Title">
              <Input
                name="finalCtaTitle"
                defaultValue={content.finalCta.title}
              />
            </Field>

            <Field label="Primary CTA">
              <Input
                name="finalCtaPrimaryCta"
                defaultValue={content.finalCta.primaryCta}
              />
            </Field>

            <Field label="Secondary CTA">
              <Input
                name="finalCtaSecondaryCta"
                defaultValue={content.finalCta.secondaryCta}
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Body">
              <Textarea
                name="finalCtaBody"
                rows={3}
                defaultValue={content.finalCta.body}
              />
            </Field>
          </div>
        </SettingCard>

        <div className="sticky bottom-4 flex justify-end">
          <button
            type="submit"
            className="rounded-full bg-[#23313f] px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:bg-[#18222d]"
          >
            Save Homepage
          </button>
        </div>
      </form>
    </div>
  );
}
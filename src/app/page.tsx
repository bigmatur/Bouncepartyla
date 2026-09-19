import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import PublicBookingShell from "@/components/public/PublicBookingShell";
import { getHomepageContent } from "@/lib/customer/homepage-content";
import {
  getPublicCatalogCategories,
  getPublicCatalogProducts,
} from "@/lib/customer/public-catalog";

export const metadata: Metadata = {
  title: "Modern Bounce House Rentals in Los Angeles | Bounce Party LA",
  description:
    "Modern bounce houses, soft play, bubble houses and party rentals delivered across Los Angeles. Browse rentals and book your event online.",
};

export default async function HomePage() {
  const [categories, products, homepageContent] = await Promise.all([
    getPublicCatalogCategories().catch(() => []),
    getPublicCatalogProducts().catch(() => []),
    getHomepageContent(),
  ]);

  const productsWithImages = products.filter((product) => Boolean(product.image_url));

    const categoryPreview = categories.slice(0, 6).map((category) => {
    const selectedImage = homepageContent.categories.imageSelections.find(
      (item) => item.categorySlug === category.slug,
    );

    const selectedProduct = selectedImage
      ? productsWithImages.find(
          (product) =>
            product.public_slug === selectedImage.productSlug &&
            product.category_id === category.id,
        )
      : null;

    const fallbackProduct = productsWithImages.find(
      (product) => product.category_id === category.id,
    );

    return {
      ...category,
      image_url: selectedProduct?.image_url || fallbackProduct?.image_url || null,
    };
  });

  const popularProducts = homepageContent.popular.productSlugs.map((slug) => productsWithImages.find((product) => product.public_slug === slug)).filter(Boolean);

  const heroProduct = productsWithImages.find((product) => product.public_slug === homepageContent.hero.productSlug) || popularProducts[0] || productsWithImages[0] || null;
  const heroImageUrl =
    String(homepageContent.hero.imageUrl || "").trim() ||
    heroProduct?.image_url ||
    "";

  const featuredPackage =
    productsWithImages.find(
      (product) => product.public_slug === homepageContent.featured.productSlug,
    ) || null;

  const selectedRealPartyProducts = homepageContent.realParties.productSlugs
    .map((slug) =>
      productsWithImages.find((product) => product.public_slug === slug),
    )
    .filter(Boolean);

  const realPartyProducts = (
    selectedRealPartyProducts.length
      ? selectedRealPartyProducts
      : [featuredPackage, ...popularProducts, ...productsWithImages]
  )
    .filter(
      (product, index, items) =>
        product &&
        items.findIndex((item) => item?.id === product.id) === index,
    )
    .slice(0, 4);

  return (
    <PublicBookingShell>
      <main className="overflow-hidden">
        <section className="border-b border-black/[0.06]">
          <div className="lg:hidden">
            <div className="relative min-h-[620px] overflow-hidden bg-[#ddd4c7]">
              {heroImageUrl ? (
                <Image
                  src={heroImageUrl}
                  alt={heroProduct?.public_title || heroProduct?.name || "Hero image"}
                  fill
                  priority
                  sizes="(min-width: 1024px) 61vw, 100vw"
                  className="object-cover"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/5" />

              <div className="absolute inset-x-0 bottom-0 px-5 pb-7 pt-28 text-white">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/75">
                  {homepageContent.hero.eyebrow}
                </div>
                <h1 className="mt-3 text-[48px] font-semibold leading-[0.94] tracking-[-0.055em]">
                  {homepageContent.hero.title}
                </h1>
                <p className="mt-4 max-w-sm text-[15px] leading-6 text-white/82">
                  {homepageContent.hero.body}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Link
                    href="/account"
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#1c1b18] px-4 text-sm font-bold text-white"
                  >
                    Account
                  </Link>
                  <Link
                    href="/book"
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-4 text-center text-sm font-bold text-[#1c1b18]"
                  >
                    {homepageContent.hero.secondaryCta}
                  </Link>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 border-t border-black/[0.06] bg-[#f7f3ec] px-4 py-5 text-center">
              {[
                "Fully insured",
                "Professional setup",
                "Clean & sanitized",
                "Modern inventory",
              ].map((title) => (
                <div key={title} className="flex min-w-0 flex-col items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#e8ddcf] text-xs">
                    ✓
                  </div>
                  <div className="mt-2 text-[10px] font-semibold leading-[1.25] text-[#1c1b18]">
                    {title}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-auto hidden min-h-[720px] max-w-[1500px] lg:grid lg:grid-cols-[0.78fr_1.22fr]">
            <div className="flex flex-col justify-center px-5 py-14 sm:px-8 lg:px-12 xl:px-16">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#9b7551]">
                {homepageContent.hero.eyebrow}
              </div>
              <h1 className="mt-5 max-w-[700px] text-[52px] font-semibold leading-[0.95] tracking-[-0.055em] text-[#1c1b18] sm:text-[72px] xl:text-[88px]">
                {homepageContent.hero.title}
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-black/58 sm:text-lg sm:leading-8">
                {homepageContent.hero.body}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/catalog"
                  className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#1c1b18] px-7 text-sm font-bold text-white transition hover:bg-black"
                >
                  {homepageContent.hero.primaryCta}
                </Link>
                <Link
                  href="/book"
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-black/15 bg-white/60 px-7 text-sm font-bold text-[#1c1b18] transition hover:bg-white"
                >
                  {homepageContent.hero.secondaryCta}
                </Link>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-6 border-t border-black/10 pt-7 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Fully insured", "Parks & venues"],
                  ["Professional setup", "On-time & hassle free"],
                  ["Clean & sanitized", "After every event"],
                  ["Modern inventory", "Fresh designs"],
                ].map(([title, copy]) => (
                  <div key={title}>
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="mt-1 text-xs leading-5 text-black/45">{copy}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative min-h-[720px] overflow-hidden bg-[#ddd4c7]">
              {heroImageUrl ? (
                <Image
                  src={heroImageUrl}
                  alt={heroProduct?.public_title || heroProduct?.name || "Hero image"}
                  fill
                  priority
                  sizes="(min-width: 1024px) 61vw, 100vw"
                  className="object-cover"
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
            </div>
          </div>
        </section>

        <section id="rentals" className="mx-auto max-w-[1380px] px-5 py-12 sm:px-7 sm:py-20 lg:py-24">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">{homepageContent.categories.eyebrow}</div>
              <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
                {homepageContent.categories.title}
              </h2>
            </div>
            <Link href="/catalog" className="text-sm font-bold text-[#1c1b18] underline decoration-black/20 underline-offset-8">
              {homepageContent.categories.linkLabel}
            </Link>
          </div>

          <div className="-mx-5 mt-10 flex snap-x gap-4 overflow-x-auto px-5 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {categoryPreview.map((category) => (
              <Link key={category.id} href={`/catalog/${encodeURIComponent(category.slug)}`} className="group min-w-[72vw] snap-start sm:min-w-0">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-[#e9e3da]">
                  {category.image_url ? (
                    <Image
                        src={category.image_url}
                        alt={category.name}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 72vw"
                        className="object-cover transition duration-500 group-hover:scale-[1.03]"
                      />
                  ) : (
                    <div className="h-full w-full bg-[#e9e3da]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white">
                    <div>
                      <h3 className="text-xl font-semibold tracking-[-0.03em]">{category.name}</h3>
                      <p className="mt-1 text-xs text-white/70">Explore collection</p>
                    </div>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-lg text-[#1c1b18] transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="bg-[#eee7dc] py-12 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-[1380px] px-5 sm:px-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#8f6947]">{homepageContent.popular.eyebrow}</div>
                <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">{homepageContent.popular.title}</h2>
              </div>
              <Link href="/catalog" className="text-sm font-bold text-[#1c1b18] underline decoration-black/20 underline-offset-8">
                {homepageContent.popular.linkLabel}
              </Link>
            </div>

            <div className="-mx-5 mt-10 flex snap-x gap-4 overflow-x-auto px-5 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {popularProducts.map((product) =>
                product ? (
                  <Link key={product.id} href={`/product/${encodeURIComponent(product.public_slug)}`} className="group min-w-[74vw] snap-start sm:min-w-0">
                    <article>
                      <div className="relative aspect-[4/4.6] overflow-hidden rounded-[26px] bg-[#ddd4c7]">
                        <Image
                          src={product.image_url || ""}
                          alt={product.public_title || product.name}
                          fill
                          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 74vw"
                          className="object-cover transition duration-500 group-hover:scale-[1.025]"
                        />
                        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/65 to-transparent" />
                        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 text-white">
                          <div>
                            <h3 className="text-xl font-semibold tracking-[-0.03em]">{product.public_title || product.name}</h3>
                            {product.base_price != null ? <p className="mt-1 text-sm text-white/70">From ${product.base_price}</p> : null}
                          </div>
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#1c1b18]">↗</span>
                        </div>
                      </div>
                    </article>
                  </Link>
                ) : null,
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1380px] px-5 py-12 sm:px-7 sm:py-20 lg:py-24">
          <div className="grid items-stretch gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:gap-10">
            <div className="flex flex-col justify-center">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">{homepageContent.featured.eyebrow}</div>
              <h2 className="mt-4 max-w-xl text-3xl sm:text-6xl font-semibold tracking-[-0.045em] ">
                {homepageContent.featured.title}
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-black/55">
                {homepageContent.featured.body}
              </p>
              <div className="mt-8">
                {featuredPackage ? (
                  <Link href={`/product/${encodeURIComponent(featuredPackage.public_slug)}`} className="inline-flex min-h-13 items-center justify-center rounded-full bg-[#1c1b18] px-7 text-sm font-bold text-white">
                    {homepageContent.featured.primaryCta}
                  </Link>
                ) : (
                  <Link href="/catalog" className="inline-flex min-h-13 items-center justify-center rounded-full bg-[#1c1b18] px-7 text-sm font-bold text-white">
                    {homepageContent.featured.fallbackCta}
                  </Link>
                )}
              </div>
            </div>

            <div className="relative min-h-[340px] overflow-hidden rounded-[24px] sm:min-h-[540px] sm:rounded-[28px] bg-[#ddd4c7] ">
              {featuredPackage?.image_url ? (
                <Image
                  src={featuredPackage.image_url}
                  alt={featuredPackage.public_title || featuredPackage.name}
                  fill
                  sizes="(min-width: 1024px) 59vw, 100vw"
                  className="object-cover"
                />
              ) : null}
              {featuredPackage ? (
                <div className="absolute right-3 top-3 max-w-[190px] rounded-[18px] bg-[#f7f3ec]/95 p-4 sm:right-4 sm:top-4 sm:max-w-[240px] sm:rounded-[20px] sm:p-5 shadow-sm backdrop-blur">
                  <div className="text-sm font-semibold sm:text-base tracking-[-0.025em]">{featuredPackage.public_title || featuredPackage.name}</div>
                  {featuredPackage.base_price != null ? <div className="mt-2 text-sm text-black/50">From ${featuredPackage.base_price}</div> : null}
                  <div className="mt-4 text-sm font-bold">View details →</div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1380px] px-5 pb-16 sm:px-7 sm:pb-20 lg:pb-24">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">{homepageContent.realParties.eyebrow}</div>
            <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">{homepageContent.realParties.title}</h2>
          </div>

          <div className="-mx-5 mt-10 flex snap-x gap-4 overflow-x-auto px-5 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {realPartyProducts.map((product, index) =>
              product ? (
                <Link key={`${product.id}-${index}`} href={`/product/${encodeURIComponent(product.public_slug)}`} className="group min-w-[76vw] snap-start sm:min-w-0">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-[#e8e1d8]">
                    <Image src={product.image_url || ""} alt={product.public_title || product.name} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 76vw" className="object-cover transition duration-500 group-hover:scale-[1.025]" />
                  </div>
                </Link>
              ) : null,
            )}
          </div>
        </section>

        <section id="why-us" className="border-y border-black/[0.06] bg-[#f3ede4]">
          <div className="mx-auto grid max-w-[1380px] gap-10 px-5 py-14 sm:px-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-16">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">{homepageContent.whyUs.eyebrow}</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">{homepageContent.whyUs.title}</h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-black/55">
                {homepageContent.whyUs.body}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[24px] bg-black/10 sm:grid-cols-2">
              {homepageContent.whyUs.items.map((item) => (
                <div key={item.title} className="bg-[#f7f3ec] p-4 sm:p-7">
                  <div className="mb-6 flex h-9 w-9 items-center justify-center rounded-full bg-[#ded0bd] text-sm">✓</div>
                  <h3 className="text-sm font-semibold tracking-[-0.025em] sm:text-lg">{item.title}</h3>
                  <p className="mt-2 text-xs leading-5 text-black/50 sm:text-sm sm:leading-6">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1380px] px-5 py-12 sm:px-7 sm:py-20">
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[30px] bg-[#1b1a17] px-6 py-12 text-white sm:px-10 sm:py-14">
              <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#c9ad8d]">{homepageContent.howItWorks.eyebrow}</div>
                  <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">{homepageContent.howItWorks.title}</h2>
                </div>
                <div className="divide-y divide-white/15 border-y border-white/15">
                  {homepageContent.howItWorks.steps.map((step) => (
                    <div key={step.number} className="grid gap-3 py-5 sm:grid-cols-[54px_1fr]">
                      <div className="text-xs font-semibold text-white/35">{step.number}</div>
                      <div>
                        <h3 className="text-lg font-semibold">{step.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-white/55">{step.copy}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[30px] border border-black/[0.07] bg-white/45 p-7 sm:p-9">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">{homepageContent.serviceArea.eyebrow}</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{homepageContent.serviceArea.title}</h2>
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:mt-8 sm:gap-6 sm:grid-cols-2">
                {homepageContent.serviceArea.items.map((item) => (
                  <div key={item.title}>
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-black/50 sm:mt-2 sm:text-sm sm:leading-6">{item.copy}</p>
                  </div>
                ))}             </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1380px] px-5 pb-16 sm:px-7 sm:pb-20">
          <div className="relative overflow-hidden rounded-[30px] bg-[#eee7dc]">
            {heroProduct?.image_url ? (
              <Image src={heroProduct.image_url} alt="" fill sizes="(min-width: 1380px) 1380px, 100vw" className="object-cover opacity-25" />
            ) : null}
            <div className="absolute inset-0 bg-[#eee7dc]/65" />
            <div className="relative mx-auto max-w-3xl px-6 py-16 text-center sm:px-10 sm:py-20">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#9b7551]">{homepageContent.finalCta.eyebrow}</div>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">{homepageContent.finalCta.title}</h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-black/55">
                {homepageContent.finalCta.body}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href="/book" className="inline-flex min-h-14 items-center justify-center rounded-full bg-[#1c1b18] px-8 text-sm font-bold text-white">
                  {homepageContent.finalCta.primaryCta}
                </Link>
                <Link href="/catalog" className="inline-flex min-h-14 items-center justify-center rounded-full border border-black/12 bg-white px-8 text-sm font-bold text-[#1c1b18]">
                  {homepageContent.finalCta.secondaryCta}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicBookingShell>
  );
}

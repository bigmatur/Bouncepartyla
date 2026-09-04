import Link from "next/link";
import type { Metadata } from "next";

import PublicBookingShell from "@/components/public/PublicBookingShell";
import PublicProductCard from "@/components/public/PublicProductCard";
import {
  getPublicCatalogCategories,
  getPublicCatalogProducts,
} from "@/lib/customer/public-catalog";
import {
  buildPublicMetadata,
  canonicalUrl,
  PUBLIC_SITE_NAME,
} from "@/lib/public/seo";

const trustItems = [
  "Professional delivery and setup",
  "Cleaned and sanitized before each rental",
  "Modern designs for family events",
  "Support for homes, parks, and venues",
  "Insurance documentation available when required",
];

const whyItems = [
  {
    title: "Setup handled by our team",
    body: "Our crew coordinates delivery, setup, and pickup so your event timeline stays clear.",
  },
  {
    title: "Clean, event-ready inventory",
    body: "Rentals are prepared before each event with safety and presentation in mind.",
  },
  {
    title: "Modern bounce and soft play options",
    body: "From white bounce houses to bubble houses and toddler-friendly soft play, the catalog is built for photo-ready celebrations.",
  },
  {
    title: "Venue support and documentation",
    body: "For parks and venues with requirements, we can help with logistics and insurance documentation where applicable.",
  },
];

const processSteps = [
  {
    title: "Choose your rental",
    body: "Browse categories and compare products by style, size, and party type.",
  },
  {
    title: "Check your event date",
    body: "Open a product and run the existing availability check for your date and time window.",
  },
  {
    title: "Reserve your setup",
    body: "Continue through the existing booking flow to confirm details and secure your event.",
  },
  {
    title: "Delivery and setup",
    body: "Our team delivers and sets up on event day, then returns for pickup.",
  },
];

const faqItems = [
  {
    question: "How long is a typical rental?",
    answer:
      "Rental timing depends on the item and event schedule. Select your preferred date and time in the booking flow, and the team confirms delivery and pickup windows.",
  },
  {
    question: "Do you handle delivery and setup?",
    answer:
      "Yes. Delivery and setup are handled by the Bounce Party LA team, followed by pickup after the event window.",
  },
  {
    question: "Can you set up at parks or event venues?",
    answer:
      "Many parks and venues are supported. Some locations may require permits, power planning, or insurance documentation.",
  },
  {
    question: "What about power and generators?",
    answer:
      "Power requirements vary by product. Product details include setup and power guidance so you can plan ahead.",
  },
  {
    question: "Do you provide insurance documentation?",
    answer:
      "When a venue requires it, insurance documentation can be provided based on event requirements.",
  },
  {
    question: "What if weather changes?",
    answer:
      "Weather planning is handled case by case based on product type, safety requirements, and event timing.",
  },
  {
    question: "How much setup space is needed?",
    answer:
      "Each product page includes setup dimensions so you can confirm your space before reserving.",
  },
  {
    question: "How are rentals cleaned and prepared?",
    answer:
      "Inventory is prepared before each event with cleanliness and safe setup practices in mind.",
  },
];

export const metadata: Metadata = buildPublicMetadata({
  title: "Bounce House Rentals Los Angeles | Bounce Party LA",
  description:
    "Modern bounce house, bubble house and soft play rentals in Los Angeles with professional delivery and setup.",
  path: "/",
  index: true,
});

function categoryDescriptor(name: string) {
  const value = String(name || "").toLowerCase();

  if (value.includes("white")) return "Minimal, modern styles for elevated events";
  if (value.includes("soft")) return "Toddler-focused play zones and sensory-friendly setups";
  if (value.includes("bubble")) return "Statement pieces for birthdays and milestone celebrations";
  if (value.includes("slide")) return "Bounce and slide combos for high-energy parties";
  if (value.includes("mini")) return "Compact options for smaller footprints";

  return "Popular party rentals for Los Angeles events";
}

export default async function HomePage() {
  const [categories, products] = await Promise.all([
    getPublicCatalogCategories(),
    getPublicCatalogProducts(),
  ]);

  const featuredProducts = products.slice(0, 6);
  const heroImage = featuredProducts.find((item) => item.image_url)?.image_url || "";

  const categoryImageById = new Map<string, string>();
  for (const product of products) {
    const categoryId = String(product.category_id || "").trim();
    if (!categoryId) continue;
    if (categoryImageById.has(categoryId)) continue;

    const image = String(product.image_url || "").trim();
    if (image) {
      categoryImageById.set(categoryId, image);
    }
  }

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LocalBusiness",
        "@id": canonicalUrl("/#business"),
        name: PUBLIC_SITE_NAME,
        url: canonicalUrl("/"),
        description:
          "Bounce Party LA provides bounce house, bubble house, soft play, and party rental services in Los Angeles.",
        areaServed: "Los Angeles",
        knowsAbout: [
          "bounce house rental",
          "white bounce house rental",
          "soft play rental",
          "bubble house rental",
          "toddler party rentals",
          "party rentals",
        ],
      },
      {
        "@type": "WebSite",
        "@id": canonicalUrl("/#website"),
        url: canonicalUrl("/"),
        name: PUBLIC_SITE_NAME,
        inLanguage: "en-US",
      },
      {
        "@type": "FAQPage",
        "@id": canonicalUrl("/#faq"),
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <>
      <PublicBookingShell>
        <main>
          <section className="relative overflow-hidden bg-[#f5efe6] pb-16 pt-14 sm:pb-20 sm:pt-20">
          <div className="absolute inset-0 opacity-60">
            <div className="absolute -left-10 top-0 h-40 w-40 rounded-full bg-[#e7d8c4] blur-3xl" />
            <div className="absolute -right-6 bottom-6 h-44 w-44 rounded-full bg-[#e8cfa8] blur-3xl" />
          </div>

          <div className="relative mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8f6530]">
                Bounce Party LA
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#1f1e1b] sm:text-5xl">
                Bounce House &amp; Soft Play Rentals in Los Angeles
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#5f5549]">
                Modern bounce houses, bubble houses, soft play, and party rentals with
                professional delivery and setup across Los Angeles.
              </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/book"
                    className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#1d1d1b] px-6 text-sm font-semibold text-white transition hover:bg-black"
                  >
                    Browse Rentals &amp; Check Availability
                  </Link>
                  <Link
                    href="/catalog"
                    className="inline-flex min-h-12 items-center justify-center rounded-full border border-black/10 bg-white px-6 text-sm font-semibold text-[#1d1d1b] transition hover:bg-black/[0.03]"
                  >
                    View Catalog
                  </Link>
                </div>
              </div>

              <div className="overflow-hidden rounded-[30px] border border-black/10 bg-[#f4eadf] shadow-[0_20px_65px_rgba(0,0,0,0.08)]">
                {heroImage ? (
                  <img
                    src={heroImage}
                    alt="Bounce Party LA rental setup"
                    className="h-full w-full object-cover"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center p-8 text-center text-sm font-semibold text-[#6b6052]">
                    Explore premium bounce houses and soft play setups in our catalog.
                  </div>
                )}
              </div>
            </div>
          </section>

        <section className="border-y border-black/5 bg-white/80">
          <div className="mx-auto grid w-full max-w-7xl gap-2 px-4 py-5 sm:grid-cols-2 sm:gap-3 sm:px-6 lg:grid-cols-5">
            {trustItems.map((item) => (
              <div
                key={item}
                className="rounded-2xl bg-[#f8f3ec] px-4 py-3 text-sm font-semibold text-[#4c4338]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1f1e1b]">
                Rental categories
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#615649]">
                Start with a category, then open products to check date and availability.
              </p>
            </div>
            <Link href="/catalog" className="text-sm font-semibold text-[#6f5936]">
              View all rentals
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {categories.map((category) => {
              const image = categoryImageById.get(category.id) || "";

              return (
                <Link
                  key={category.id}
                  href={`/catalog/${encodeURIComponent(category.slug)}`}
                  className="group overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)]"
                >
                  <div className="aspect-[4/3] bg-[#f4eadf]">
                    {image ? (
                      <img
                        src={image}
                        alt={`${category.name} rentals`}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-[#756857]">
                        {category.name}
                      </div>
                    )}
                  </div>
                  <div className="p-4 sm:p-5">
                    <h3 className="text-lg font-semibold text-[#1f1e1b]">{category.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#6b6052]">
                      {category.description || categoryDescriptor(category.name)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 sm:pb-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1f1e1b]">
                Popular rentals
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#615649]">
                Real products from the live catalog, ready to open and reserve.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featuredProducts.map((product) => (
              <PublicProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        <section className="bg-white/70 py-12 sm:py-16">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1f1e1b]">
              Why Bounce Party LA
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {whyItems.map((item) => (
                <article key={item.title} className="rounded-[24px] border border-black/10 bg-white p-5 sm:p-6">
                  <h3 className="text-lg font-semibold text-[#1f1e1b]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#665a4d]">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1f1e1b]">How it works</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {processSteps.map((step, index) => (
              <article key={step.title} className="rounded-[24px] border border-black/10 bg-white p-5 sm:p-6">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
                  Step {index + 1}
                </div>
                <h3 className="mt-2 text-lg font-semibold text-[#1f1e1b]">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#665a4d]">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-white/70 py-12 sm:py-16">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1f1e1b]">
              Service area
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-[#665a4d]">
              Bounce Party LA serves Los Angeles events and surrounding areas for residential
              parties, parks, and approved venues. During booking, you can share event details
              so the team can confirm setup requirements and logistics.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[#1f1e1b]">Frequently asked questions</h2>
          <div className="mt-6 space-y-3">
            {faqItems.map((item) => (
              <details key={item.question} className="rounded-2xl border border-black/10 bg-white p-5">
                <summary className="cursor-pointer list-none text-base font-semibold text-[#1f1e1b]">
                  {item.question}
                </summary>
                <p className="mt-3 text-sm leading-7 text-[#665a4d]">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-[#1f1e1b] py-12 sm:py-16">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6">
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white">
                Ready to plan your party rental?
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                Browse rentals, check availability, and continue through the existing booking flow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/catalog"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-[#1f1e1b]"
              >
                Browse Rentals
              </Link>
              <Link
                href="/book"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/40 px-6 text-sm font-semibold text-white"
              >
                Check Availability
              </Link>
            </div>
          </div>
        </section>
        </main>
      </PublicBookingShell>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
    </>
  );
}

import Link from "next/link";
import type { Metadata } from "next";

import { checkBookingItemAvailabilityAction } from "@/lib/booking/check-booking-item-availability";
import CustomerShell from "@/components/account/CustomerShell";
import { requireCustomerAccess } from "@/lib/auth/require-customer";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: product } = await supabase
    .from("products")
    .select("name, public_title, short_description, seo_title, seo_description, active")
    .eq("slug", slug)
    .maybeSingle();

  const title =
    (product as any)?.seo_title ||
    (product as any)?.public_title ||
    product?.name ||
    slug.replaceAll("-", " ");

  const description =
    (product as any)?.seo_description ||
    product?.short_description ||
    "Bounce house and party rental equipment details.";

  const canIndex = Boolean(product && product.active !== false);

  return {
    title: `${title} | Bounce Party LA`,
    description,
    robots: {
      index: canIndex,
      follow: canIndex,
    },
  };
}

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function numberValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "-";
  }

  return String(parsed);
}

function dimension(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return `${parsed} ft`;
}

function setupArea(product: any) {
  const width = dimension(product.setup_width_ft);
  const length = dimension(product.setup_length_ft);

  if (!width && !length) return "-";
  if (width && length) return `${width} x ${length}`;

  return width || length || "-";
}

function heightValue(product: any) {
  return dimension(product.setup_height_ft) || "-";
}

function ageRange(product: any) {
  if (product.min_age && product.max_age) {
    return `${numberValue(product.min_age)}-${numberValue(product.max_age)}`;
  }

  if (product.min_age) {
    return `${numberValue(product.min_age)}+`;
  }

  return "-";
}

function textBlock(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function yesNo(value: unknown, yesLabel = "Yes", noLabel = "No") {
  return value === true ? yesLabel : noLabel;
}

function hasValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : String(value || "").trim();
  return Boolean(text) && text !== "-" && text !== "Not specified";
}

function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function isValidTimeString(value: string) {
  return /^\d{2}:\d{2}$/.test(String(value || ""));
}

function statusTone(value: string) {
  if (value === "available") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value === "limited") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-red-50 text-red-700 ring-red-200";
}

function customerFacingAvailabilityLabel(value: string) {
  if (value === "available") return "Available";
  if (value === "limited") return "Limited availability";
  return "Unavailable";
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function AccountProductDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedDate = String(resolvedSearchParams?.date || resolvedSearchParams?.bn_date || isoDateToday());
  const selectedStartTime = isValidTimeString(String(resolvedSearchParams?.startTime || resolvedSearchParams?.bn_startTime || ""))
    ? String(resolvedSearchParams?.startTime || resolvedSearchParams?.bn_startTime)
    : "09:00";
  const selectedEndTime = isValidTimeString(String(resolvedSearchParams?.endTime || resolvedSearchParams?.bn_endTime || ""))
    ? String(resolvedSearchParams?.endTime || resolvedSearchParams?.bn_endTime)
    : "19:00";

  const restoredBookNowQuery = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(resolvedSearchParams || {})) {
    if (!key.startsWith("bn_")) continue;

    const targetKey = key.slice(3);
    if (!targetKey) continue;

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        const normalized = String(value || "");
        if (!normalized) continue;
        restoredBookNowQuery.append(targetKey, normalized);
      }
      continue;
    }

    const normalized = String(rawValue || "");
    if (!normalized) continue;
    restoredBookNowQuery.set(targetKey, normalized);
  }

  if (!restoredBookNowQuery.get("date")) {
    restoredBookNowQuery.set("date", selectedDate);
  }

  const { supabase, access, canPreviewCustomer } = await requireCustomerAccess();

  const productResult = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .neq("active", false)
    .maybeSingle();

  if (productResult.error) {
    throw new Error(productResult.error.message);
  }

  let productData = productResult.data;

  if (!productData && canPreviewCustomer) {
    const fallbackProductResult = await supabase
      .from("products")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (fallbackProductResult.error) {
      throw new Error(fallbackProductResult.error.message);
    }

    productData = fallbackProductResult.data;
  }

  if (!productData) {
    return (
      <CustomerShell
        displayName={access.displayName}
        userEmail={access.user?.email || null}
        role={access.role}
        defaultInterface={access.defaultInterface}
        availableInterfaces={access.availableInterfaces}
        grantedPermissions={access.grantedPermissions}
        previewMode={canPreviewCustomer}
      >
        <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-5 sm:py-10">
          <section className="rounded-[22px] border border-black/10 bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:rounded-[30px] sm:p-8">
            <h1 className="text-3xl font-semibold tracking-[-0.03em]">Product not found</h1>
            <p className="mt-3 text-sm text-black/60">This product is unavailable or unpublished.</p>
            <Link href="/account/catalog" className="mt-6 inline-flex rounded-2xl border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-black/[0.03]">
              Back to catalog
            </Link>
          </section>
        </main>
      </CustomerShell>
    );
  }

  const product = productData;
  restoredBookNowQuery.set("productId", String((restoredBookNowQuery.get("productId") || "").trim() || product.id));

  let availabilityResult: any = null;
  let availabilityStatus = "unavailable";

  try {
    const formData = new FormData();
    formData.set("productId", String(product.id));
    formData.set("quantity", "1");
    formData.set("eventDate", selectedDate);
    formData.set("eventStartTime", selectedStartTime);
    formData.set("eventEndTime", selectedEndTime);
    formData.set("bookingActor", "customer");

    availabilityResult = await checkBookingItemAvailabilityAction(formData);
    availabilityStatus = availabilityResult?.available ? "available" : "unavailable";
  } catch {
    availabilityStatus = "unavailable";
  }

  const availabilityLabel = customerFacingAvailabilityLabel(availabilityStatus);
  const availabilityTone = statusTone(availabilityStatus);

  const productComponentsResult = await supabase
    .from("product_inventory_components")
    .select(
      `
      *,
      inventory_items (
        id,
        name
      )
    `
    )
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  if (productComponentsResult.error) {
    throw new Error(productComponentsResult.error.message);
  }

  const productComponents = (productComponentsResult.data || [])
    .filter((component: any) => component?.active !== false)
    .map((component: any) => {
      const item = Array.isArray(component.inventory_items)
        ? component.inventory_items[0]
        : component.inventory_items;

      return {
        id: String(component.id || ""),
        name: String(component.component_name || item?.name || "Component"),
        quantity: Number(component.quantity_required ?? component.quantity ?? 1) || 1,
        required:
          component.is_required === false || component.required === false ? false : true,
      };
    })
    .filter((component: any) => component.id);

  const includedEquipmentFromAvailability = Array.isArray(availabilityResult?.components)
    ? (() => {
        const grouped = new Map<string, { id: string; name: string; quantity: number; required: boolean }>();

        for (const component of availabilityResult.components) {
          if (!component || component.isRequired === false) {
            continue;
          }

          if (String(component.role || "").toLowerCase() === "main") {
            continue;
          }

          const name = String(
            component.inventoryItemName || component.componentName || "Component",
          ).trim();
          const id = String(component.componentId || component.inventoryItemId || name).trim();
          const quantity = Math.max(
            1,
            toNumber(component.quantityNeeded, toNumber(component.quantityRequired, 1)),
          );

          const existing = grouped.get(name);
          if (existing) {
            existing.quantity += quantity;
          } else {
            grouped.set(name, {
              id,
              name,
              quantity,
              required: true,
            });
          }
        }

        return Array.from(grouped.values());
      })()
    : [];

  const includedEquipment =
    includedEquipmentFromAvailability.length > 0
      ? includedEquipmentFromAvailability
      : productComponents;

  const technicalDetails = [
    { label: "Setup area", value: setupArea(product) },
    { label: "Height", value: heightValue(product) },
    { label: "Age", value: ageRange(product) },
    { label: "Capacity", value: numberValue(product.max_capacity) },
    { label: "Setup surface", value: textBlock((product as any).setup_surface, "Not specified") },
    { label: "Power", value: textBlock((product as any).power_requirements, "Not specified") },
    { label: "Indoor use", value: yesNo((product as any).indoor_allowed, "Allowed", "Not specified") },
    { label: "Outdoor use", value: yesNo((product as any).outdoor_allowed, "Allowed", "Not specified") },
    { label: "Water use", value: yesNo((product as any).water_use) },
  ].filter((detail) => hasValue(detail.value));

  const gallery = Array.isArray((product as any).gallery_urls)
    ? ((product as any).gallery_urls as string[]).filter(Boolean)
    : [];

  return (
    <CustomerShell
      displayName={access.displayName}
      userEmail={access.user?.email || null}
      role={access.role}
      defaultInterface={access.defaultInterface}
      availableInterfaces={access.availableInterfaces}
      grantedPermissions={access.grantedPermissions}
      previewMode={canPreviewCustomer}
    >
      <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-5 sm:py-10">
        <section className="rounded-[22px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.05)] sm:rounded-[30px] sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">Product details</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-4xl">{(product as any).public_title || product.name}</h1>
          <p className="mt-2 line-clamp-3 max-w-3xl text-sm leading-5 text-black/60 sm:mt-3 sm:line-clamp-none sm:leading-6">{(product as any).short_description || product.description || "Product description is coming soon."}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5 sm:gap-3">
            <span className="rounded-full bg-[#1d1d1b] px-3 py-1 text-xs font-semibold text-white">From {money(product.base_price)}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${availabilityTone}`}>{availabilityLabel}</span>
          </div>

          <div className="mt-4 overflow-hidden rounded-[16px] bg-[#f6f1e8] sm:hidden">
            {(product as any).image_url ? (
              <img
                src={(product as any).image_url}
                alt={product.name || "Product"}
                className="aspect-[4/3] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center text-sm font-semibold text-black/35">
                No image
              </div>
            )}
          </div>
        </section>

        <section className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="order-2 rounded-[20px] border border-black/10 bg-white p-4 shadow-[0_12px_35px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:p-5 xl:order-1">
            <div className="hidden aspect-[16/10] overflow-hidden rounded-2xl bg-[#f6f1e8] sm:block">
              {(product as any).image_url ? (
                <img src={(product as any).image_url} alt={product.name || "Product"} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-black/35">No image</div>
              )}
            </div>

            {gallery.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {gallery.slice(0, 6).map((url) => (
                  <div key={url} className="aspect-[4/3] overflow-hidden rounded-xl bg-[#f6f1e8]">
                    <img src={url} alt={product.name || "Gallery image"} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl bg-[#f7f4ef] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Full description</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/70">{product.description || "Detailed description is coming soon."}</p>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-[#f7f4ef] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">What is included</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/70">
                  {textBlock((product as any).what_included, "Included items will be listed soon.")}
                </p>
              </div>

              <div className="rounded-2xl bg-[#f7f4ef] p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">What is not included</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/70">
                  {textBlock((product as any).what_not_included, "Exclusions are not specified yet.")}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-[#f7f4ef] p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Safety rules</div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/70">
                {textBlock((product as any).safety_rules, "Safety guidelines are not provided yet.")}
              </p>
            </div>
          </article>

          <aside className="order-1 space-y-3 sm:space-y-4 xl:order-2">
            <section className="rounded-[20px] border border-black/10 bg-white p-4 shadow-[0_12px_35px_rgba(0,0,0,0.04)] sm:rounded-[30px] sm:p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Check availability</div>
              <form className="mt-3 space-y-3">
                <input
                  type="date"
                  name="date"
                  defaultValue={selectedDate}
                  className="h-12 w-full rounded-xl border border-black/10 px-3 text-base sm:h-auto sm:py-2 sm:text-sm"
                />
                <input
                  type="time"
                  name="startTime"
                  defaultValue={selectedStartTime}
                  step={1800}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
                <input
                  type="time"
                  name="endTime"
                  defaultValue={selectedEndTime}
                  step={1800}
                  className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
                />
                {Array.from(restoredBookNowQuery.entries())
                  .filter(([key]) => key !== "date")
                  .map(([key, value], index) => (
                    <input key={`${key}-${value}-${index}`} type="hidden" name={`bn_${key}`} value={value} />
                  ))}
                <button type="submit" className="min-h-12 w-full rounded-xl bg-[#1d1d1b] px-4 py-2.5 text-sm font-semibold text-white sm:min-h-0">
                  Check availability
                </button>
              </form>

              <Link
                href={`/account/book-now?${restoredBookNowQuery.toString()}`}
                className="mt-2 inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[#c9964f] bg-[#c9964f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#b78744] sm:mt-3 sm:min-h-0"
              >
                Book now
              </Link>
            </section>

            {includedEquipment.length > 0 ? (
              <section className="rounded-[30px] border border-black/10 bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Included equipment</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {includedEquipment.map((component: any) => (
                    <li key={component.id} className="flex items-center justify-between gap-3">
                      <span className="text-black/70">{component.name}</span>
                      <span className="font-semibold">x{component.quantity}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {technicalDetails.length > 0 ? (
              <section className="rounded-[30px] border border-black/10 bg-white p-5 shadow-[0_12px_35px_rgba(0,0,0,0.04)]">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Product details</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-black/55">Price</span><span className="font-semibold">{money(product.base_price)}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-black/55">Deposit</span><span className="font-semibold">{money(product.deposit_amount)}</span></div>
                  {technicalDetails.map((detail) => (
                    <div key={detail.label} className="flex justify-between gap-3">
                      <span className="text-black/55">{detail.label}</span>
                      <span className="font-semibold">{detail.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </section>
      </main>
    </CustomerShell>
  );
}

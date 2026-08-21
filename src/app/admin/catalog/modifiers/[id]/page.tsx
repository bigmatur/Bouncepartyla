import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateModifierAction, uploadModifierImageAction } from "./actions";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatMoney(value: number | string | null | undefined) {
  const numberValue = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numberValue);
}

function numberDefault(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function textDefault(value: string | null | undefined) {
  return value || "";
}

function statusBadge(active: boolean | null | undefined) {
  if (active) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function visibilityBadge(publicVisible: boolean | null | undefined) {
  if (publicVisible) {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
}

function inventoryBadge(affectsInventory: boolean | null | undefined) {
  if (affectsInventory) {
    return "bg-[#fff4d8] text-[#8a6b20] ring-1 ring-[#efd582]";
  }

  return "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200";
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[#3a342d]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm text-[#1f1e1b] outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
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
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm text-[#1f1e1b] outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
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
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm text-[#1f1e1b] outline-none transition focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
        props.className || "",
      ].join(" ")}
    />
  );
}

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-4">
      <span className="text-sm font-semibold text-[#1f1e1b]">{label}</span>
      <input
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="h-5 w-5 rounded border-[#d8cec0]"
      />
    </label>
  );
}

export default async function ModifierEditPage(props: PageProps) {
  const params = await props.params;
  const supabase = await createClient();

  const modifierResult = await supabase
    .from("modifiers")
    .select(
      `
      id,
      name,
      price,
      taxable,
      active,
      public_visible,
      image_url,
      short_description,
      description,
      affects_inventory,
      allow_quantity,
      min_quantity,
      max_quantity,
      setup_minutes,
      teardown_minutes,
      modifier_type,
      sort_order,
      admin_notes,
      modifier_group_options (
        id,
        label_override,
        price_override,
        selected_by_default,
        active,
        sort_order,
        modifier_groups (
          id,
          name,
          selection_type,
          active
        )
      ),
      inventory_recipes (
        id,
        quantity_needed,
        optional,
        alternative_group,
        inventory_items (
          id,
          name,
          tracking_type
        )
      )
    `
    )
    .eq("id", params.id)
    .single();

  if (modifierResult.error || !modifierResult.data) {
    notFound();
  }

  const modifier = modifierResult.data as any;

  const usedInGroups = modifier.modifier_group_options || [];
  const recipes = modifier.inventory_recipes || [];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-black/5 bg-white shadow-[0_18px_70px_rgba(0,0,0,0.08)]">
        <div className="grid gap-0 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="p-6 lg:p-8">
            <Link
              href="/admin/catalog"
              className="text-sm font-semibold text-[#9a7a49] hover:text-[#7f633a]"
            >
              ← Back to catalog
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
                Add-on editor
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(
                  modifier.active
                )}`}
              >
                {modifier.active ? "Active" : "Inactive"}
              </span>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${visibilityBadge(
                  modifier.public_visible
                )}`}
              >
                {modifier.public_visible ? "Public" : "Admin only"}
              </span>

              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${inventoryBadge(
                  modifier.affects_inventory
                )}`}
              >
                {modifier.affects_inventory ? "Inventory" : "Service"}
              </span>
            </div>

            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-[#1f1e1b] lg:text-4xl">
              {modifier.name}
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6c6258]">
              {modifier.short_description ||
                "Edit add-on details, price, visibility and inventory behavior."}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/admin/bookings/new"
                className="rounded-full bg-[#c9964f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Test in booking flow
              </Link>

              <Link
                href="/admin/catalog/modifier-groups"
                className="rounded-full border border-[#d8cec0] bg-white px-6 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Option groups
              </Link>
            </div>
          </div>

          <div className="bg-[#23313f] p-6 text-white lg:p-8">
            <div className="text-sm font-medium text-white/55">
              Add-on price
            </div>

            <div className="mt-3 text-5xl font-semibold">
              {formatMoney(modifier.price)}
            </div>

            <div className="mt-2 text-sm text-white/55">
              {modifier.taxable ? "Taxable" : "Non-taxable"}
            </div>

            <div className="mt-8 grid gap-3">
              <div className="rounded-[24px] bg-white/10 p-5">
                <div className="text-sm text-white/55">Used in groups</div>
                <div className="mt-2 text-3xl font-semibold">
                  {usedInGroups.length}
                </div>
              </div>

              <div className="rounded-[24px] bg-white/10 p-5">
                <div className="text-sm text-white/55">Inventory recipes</div>
                <div className="mt-2 text-3xl font-semibold">
                  {recipes.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-6">
          <div className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="aspect-[4/3] bg-[#f1ebe1]">
              {modifier.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={modifier.image_url}
                  alt={modifier.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#9f9488]">
                  No add-on photo
                </div>
              )}
            </div>

            <div className="p-5">
              <h3 className="text-lg font-semibold text-[#1f1e1b]">
                Add-on photo
              </h3>

              <p className="mt-1 text-sm text-[#6c6258]">
                Used in catalog management and option cards.
              </p>

              <form action={uploadModifierImageAction} className="mt-5 space-y-3">
                <input type="hidden" name="modifierId" value={modifier.id} />

                <input
                  name="image"
                  type="file"
                  accept="image/*"
                  className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
                />

                <button
                  type="submit"
                  className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                >
                  Upload photo
                </button>
              </form>
            </div>
          </div>

          <div className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-lg font-semibold text-[#1f1e1b]">
              Quick summary
            </h3>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Price</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {formatMoney(modifier.price)}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Type</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {modifier.modifier_type || "—"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Quantity</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {modifier.allow_quantity
                    ? `${modifier.min_quantity || 0}–${modifier.max_quantity || 1}`
                    : "Single"}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Setup</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {modifier.setup_minutes || 0} min
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-[#6c6258]">Teardown</span>
                <span className="font-semibold text-[#1f1e1b]">
                  {modifier.teardown_minutes || 0} min
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-black/5 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <h3 className="text-lg font-semibold text-[#1f1e1b]">
              Inventory recipes
            </h3>

            <div className="mt-5 space-y-3">
              {recipes.map((recipe: any) => (
                <div
                  key={recipe.id}
                  className="rounded-2xl bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]"
                >
                  <div className="font-semibold text-[#1f1e1b]">
                    {recipe.inventory_items?.name || "Inventory item"}
                  </div>

                  <div className="mt-1 text-sm text-[#6c6258]">
                    Qty needed: {recipe.quantity_needed || 1}
                  </div>

                  <div className="mt-1 text-xs text-[#8f7f6b]">
                    {recipe.inventory_items?.tracking_type || "tracking"} ·{" "}
                    {recipe.optional ? "Optional" : "Required"}
                    {recipe.alternative_group
                      ? ` · Alternative: ${recipe.alternative_group}`
                      : ""}
                  </div>
                </div>
              ))}

              {recipes.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#d8cec0] p-5 text-center text-sm text-[#6c6258]">
                  No inventory recipe connected.
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <form
            action={updateModifierAction}
            className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]"
          >
            <input type="hidden" name="modifierId" value={modifier.id} />

            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Add-on details
              </h3>

              <p className="mt-1 text-sm text-[#6c6258]">
                Main information used inside option groups and bookings.
              </p>
            </div>

            <div className="space-y-8 p-6">
              <div className="grid gap-4 md:grid-cols-[1fr_160px_160px]">
                <Field label="Add-on name">
                  <Input
                    name="name"
                    required
                    defaultValue={textDefault(modifier.name)}
                  />
                </Field>

                <Field label="Price">
                  <Input
                    name="price"
                    type="number"
                    step="0.01"
                    defaultValue={numberDefault(modifier.price)}
                  />
                </Field>

                <Field label="Sort order">
                  <Input
                    name="sortOrder"
                    type="number"
                    defaultValue={numberDefault(modifier.sort_order)}
                  />
                </Field>
              </div>

              <Field label="Short description">
                <Input
                  name="shortDescription"
                  defaultValue={textDefault(modifier.short_description)}
                />
              </Field>

              <Field label="Description">
                <Textarea
                  name="description"
                  rows={5}
                  defaultValue={textDefault(modifier.description)}
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Toggle
                  name="active"
                  label="Active"
                  defaultChecked={Boolean(modifier.active)}
                />

                <Toggle
                  name="publicVisible"
                  label="Visible for customer booking"
                  defaultChecked={Boolean(modifier.public_visible)}
                />

                <Toggle
                  name="taxable"
                  label="Taxable"
                  defaultChecked={Boolean(modifier.taxable)}
                />

                <Toggle
                  name="affectsInventory"
                  label="Affects inventory"
                  defaultChecked={Boolean(modifier.affects_inventory)}
                />

                <Toggle
                  name="allowQuantity"
                  label="Allow quantity"
                  defaultChecked={Boolean(modifier.allow_quantity)}
                />
              </div>

              <div className="rounded-[24px] border border-[#eee5d9] bg-[#fcfaf7] p-5">
                <h4 className="font-semibold text-[#1f1e1b]">
                  Quantity and timing
                </h4>

                <p className="mt-1 text-sm text-[#6c6258]">
                  Used when add-on changes setup/teardown or can be selected
                  multiple times.
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-4">
                  <Field label="Min quantity">
                    <Input
                      name="minQuantity"
                      type="number"
                      defaultValue={numberDefault(modifier.min_quantity)}
                    />
                  </Field>

                  <Field label="Max quantity">
                    <Input
                      name="maxQuantity"
                      type="number"
                      defaultValue={numberDefault(modifier.max_quantity)}
                    />
                  </Field>

                  <Field label="Setup min">
                    <Input
                      name="setupMinutes"
                      type="number"
                      defaultValue={numberDefault(modifier.setup_minutes)}
                    />
                  </Field>

                  <Field label="Teardown min">
                    <Input
                      name="teardownMinutes"
                      type="number"
                      defaultValue={numberDefault(modifier.teardown_minutes)}
                    />
                  </Field>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                <Field label="Modifier type">
                  <Select
                    name="modifierType"
                    defaultValue={modifier.modifier_type || ""}
                  >
                    <option value="">No type</option>
                    <option value="service">Service</option>
                    <option value="inventory">Inventory</option>
                    <option value="delivery">Delivery</option>
                    <option value="decoration">Decoration</option>
                    <option value="staff">Staff</option>
                    <option value="power">Power</option>
                    <option value="soft_play">Soft play</option>
                    <option value="balloons">Balloons</option>
                  </Select>
                </Field>

                <Field label="Image URL">
                  <Input
                    name="imageUrl"
                    defaultValue={textDefault(modifier.image_url)}
                  />
                </Field>
              </div>

              <Field label="Admin notes">
                <Textarea
                  name="adminNotes"
                  rows={4}
                  defaultValue={textDefault(modifier.admin_notes)}
                />
              </Field>
            </div>

            <div className="flex justify-end border-t border-[#eee5d9] px-6 py-5">
              <button
                type="submit"
                className="rounded-full bg-[#c9964f] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Save add-on
              </button>
            </div>
          </form>

          <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="border-b border-[#eee5d9] px-6 py-5">
              <h3 className="text-xl font-semibold text-[#1f1e1b]">
                Used in option groups
              </h3>

              <p className="mt-1 text-sm text-[#6c6258]">
                This add-on appears as an option in these groups.
              </p>
            </div>

            <div className="divide-y divide-[#f0e7dc]">
              {usedInGroups.map((row: any) => {
                const group = row.modifier_groups;

                return (
                  <Link
                    key={row.id}
                    href={`/admin/catalog/modifier-groups/${group?.id}`}
                    className="grid gap-4 px-6 py-5 transition hover:bg-[#fcfaf7] md:grid-cols-[1fr_180px_160px]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-[#1f1e1b]">
                          {group?.name || "Option group"}
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(
                            row.active
                          )}`}
                        >
                          {row.active ? "Active" : "Inactive"}
                        </span>

                        {row.selected_by_default && (
                          <span className="rounded-full bg-[#eaf2f9] px-2.5 py-1 text-xs font-semibold text-[#355879] ring-1 ring-[#cfe0ef]">
                            Default
                          </span>
                        )}
                      </div>

                      <div className="mt-1 text-sm text-[#6c6258]">
                        {group?.selection_type || "single"} choice
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                        Label
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {row.label_override || modifier.name}
                      </div>
                    </div>

                    <div className="md:text-right">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
                        Price
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[#1f1e1b]">
                        {formatMoney(row.price_override ?? modifier.price)}
                      </div>
                    </div>
                  </Link>
                );
              })}

              {usedInGroups.length === 0 && (
                <div className="p-10 text-center">
                  <div className="text-lg font-semibold text-[#1f1e1b]">
                    Not used in any option group
                  </div>

                  <p className="mt-2 text-sm text-[#6c6258]">
                    Open an option group and add this add-on as an option.
                  </p>

                  <Link
                    href="/admin/catalog/modifier-groups"
                    className="mt-6 inline-flex rounded-full bg-[#c9964f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
                  >
                    Open option groups
                  </Link>
                </div>
              )}
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}
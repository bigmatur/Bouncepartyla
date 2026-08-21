import { createClient } from "@/lib/supabase/server";
import ModifierGroupSelectionFields from "./ModifierGroupSelectionFields";
import SafePhotoUploadForm from "@/components/admin/SafePhotoUploadForm";
import {
  connectProductToGroupAction,
  createModifierGroupOptionAction,
  deleteModifierGroupAction,
  deleteModifierGroupOptionAction,
  disconnectProductFromGroupAction,
  removeModifierGroupOptionPhotoAction,
  removeModifierGroupPhotoAction,
  updateModifierGroupAction,
  updateModifierGroupOptionAction,
  uploadModifierGroupOptionPhotoAction,
  uploadModifierGroupPhotoAction,
} from "./actions";

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isNaN(parsed) ? 0 : parsed);
}

function optionName(option: any) {
  return (
    option.option_name ||
    option.name ||
    option.label ||
    option.title ||
    "Option"
  );
}

function inventoryName(inventoryItems: any[], id: string | null | undefined) {
  if (!id) return "No inventory item";

  const item = inventoryItems.find((row) => row.id === id);
  return item?.name || "Inventory item";
}

function statusClass(active: boolean) {
  if (active) {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
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
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">
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
        "w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7]",
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

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
      <div className="border-b border-[#eee5d9] px-6 py-5">
        <h3 className="text-xl font-semibold text-[#1f1e1b]">{title}</h3>
        {description && (
          <p className="mt-1 text-sm leading-6 text-[#6c6258]">
            {description}
          </p>
        )}
      </div>

      <div className="p-6">{children}</div>
    </section>
  );
}

export default async function ModifierGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    groupResult,
    optionsResult,
    inventoryItemsResult,
    productsResult,
    connectionsResult,
  ] = await Promise.all([
    supabase.from("modifier_groups").select("*").eq("id", id).single(),

    supabase
      .from("modifier_group_options")
      .select("*")
      .eq("modifier_group_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),

    supabase
      .from("inventory_items")
      .select("id, name, tracking_type, active")
      .order("name", { ascending: true }),

    supabase
      .from("products")
      .select("id, name, active")
      .order("name", { ascending: true }),

    supabase
      .from("product_modifier_groups")
      .select("*")
      .eq("modifier_group_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  if (groupResult.error) throw new Error(groupResult.error.message);
  if (optionsResult.error) throw new Error(optionsResult.error.message);
  if (inventoryItemsResult.error) {
    throw new Error(inventoryItemsResult.error.message);
  }
  if (productsResult.error) throw new Error(productsResult.error.message);
  if (connectionsResult.error) throw new Error(connectionsResult.error.message);

  const group = groupResult.data;
  const options = optionsResult.data || [];
  const inventoryItems = (inventoryItemsResult.data || []).filter(
    (item: any) => item.active !== false
  );
  const products = (productsResult.data || []).filter(
    (product: any) => product.active !== false
  );
  const connections = connectionsResult.data || [];

  const connectedProductIds = new Set(
    connections.map((connection: any) => connection.product_id)
  );

  const connectedProducts = products.filter((product: any) =>
    connectedProductIds.has(product.id)
  );

  const availableProducts = products.filter(
    (product: any) => !connectedProductIds.has(product.id)
  );

  const nextOptionSortOrder =
    options.reduce(
      (highest: number, option: any) =>
        Math.max(highest, Number(option.sort_order || 0)),
      0
    ) + 10;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="grid gap-0 xl:grid-cols-[1fr_360px]">
          <div className="p-6">
            <a
              href="/admin/catalog/modifier-groups"
              className="text-sm font-semibold text-[#9a723e] hover:text-[#7f633a]"
            >
              ← Modifier groups
            </a>

            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Modifier group
            </div>

            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              {group.name}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
              Настройка группы опций: фото, варианты выбора, цена, складские
              остатки и подключенные продукты.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="/admin/bookings/new"
                className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Test in booking flow
              </a>

              <a
                href="/admin/catalog"
                className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
              >
                Catalog
              </a>
            </div>
          </div>

          <div className="bg-[#23313f] p-6 text-white">
            <div className="rounded-[24px] bg-white/10 p-5">
              <div className="text-sm text-white/60">Options</div>
              <div className="mt-2 text-4xl font-semibold">{options.length}</div>
            </div>

            <div className="mt-4 rounded-[24px] bg-white/10 p-5">
              <div className="text-sm text-white/60">Connected products</div>
              <div className="mt-2 text-4xl font-semibold">
                {connectedProducts.length}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <aside className="space-y-6">
          <section className="overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
            <div className="aspect-square bg-[#efe7dc]">
              {group.image_url ? (
                <img
                  src={group.image_url}
                  alt={group.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-[#9a7a49]">
                  No group photo
                </div>
              )}
            </div>

            <div className="space-y-4 p-5">
              <div>
                <h3 className="text-lg font-semibold text-[#1f1e1b]">
                  Group photo
                </h3>
                <p className="mt-1 text-sm text-[#6c6258]">
                  Фото будет показано в booking flow перед вариантами.
                </p>
              </div>

              <SafePhotoUploadForm
                action={uploadModifierGroupPhotoAction}
                hiddenFields={[{ name: "groupId", value: group.id }]}
                buttonLabel="Upload photo"
              />

              {group.image_url && (
                <form action={removeModifierGroupPhotoAction}>
                  <input type="hidden" name="groupId" value={group.id} />

                  <button
                    type="submit"
                    className="w-full rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    Remove photo
                  </button>
                </form>
              )}
            </div>
          </section>

          <Card
            title="Connected products"
            description="Группа будет появляться только у подключенных продуктов."
          >
            <div className="space-y-3">
              {connectedProducts.map((product: any) => {
                const connection = connections.find(
                  (row: any) => row.product_id === product.id
                );

                return (
                  <div
                    key={product.id}
                    className="rounded-[20px] border border-[#eee5d9] bg-[#fcfaf7] p-4"
                  >
                    <div className="font-semibold text-[#1f1e1b]">
                      {product.name}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs text-[#6c6258]">
                        Sort: {connection?.sort_order || 100}
                      </span>

                      <form action={disconnectProductFromGroupAction}>
                        <input type="hidden" name="groupId" value={group.id} />
                        <input
                          type="hidden"
                          name="connectionId"
                          value={connection?.id || ""}
                        />

                        <button
                          type="submit"
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-100"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}

              {connectedProducts.length === 0 && (
                <div className="rounded-[20px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-4 py-8 text-center text-sm text-[#6c6258]">
                  Not connected to products yet.
                </div>
              )}
            </div>

            <form action={connectProductToGroupAction} className="mt-5 space-y-4">
              <input type="hidden" name="groupId" value={group.id} />

              <Field label="Add to product">
                <Select name="productId" required defaultValue="">
                  <option value="">Choose product</option>
                  {availableProducts.map((product: any) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Sort order">
                  <Input
                    name="sortOrder"
                    type="number"
                    defaultValue={nextOptionSortOrder}
                  />
                </Field>

                <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                  <input type="checkbox" name="required" className="h-4 w-4" />
                  Required
                </label>
              </div>

              <button
                type="submit"
                className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
              >
                Connect product
              </button>
            </form>
          </Card>
        </aside>

        <main className="space-y-6">
          <Card
            title="Group settings"
            description="Управляет тем, как группа будет идти в booking flow."
          >
            <form action={updateModifierGroupAction} className="space-y-5">
              <input type="hidden" name="groupId" value={group.id} />

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_220px]">
                <Field label="Group name">
                  <Input name="groupName" defaultValue={group.name || ""} />
                </Field>

                <ModifierGroupSelectionFields
                  initialSelectionType={group.selection_type}
                  initialMaxTotalQuantity={group.max_total_quantity}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <Field label="Sort order">
                  <Input
                    name="sortOrder"
                    type="number"
                    defaultValue={group.sort_order || 100}
                  />
                </Field>

                <div className="rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm leading-6 text-[#6c6258]">
                  <strong>Maximum selections</strong> доступно только для
                  <strong> Multiple choice</strong>. Для остальных типов поле
                  автоматически очищается при сохранении.
                </div>
              </div>

              <Field label="Description">
                <Textarea
                  name="description"
                  rows={4}
                  defaultValue={group.description || ""}
                />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={group.active !== false}
                    className="h-4 w-4"
                  />
                  Active
                </label>

                <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                  <input
                    type="checkbox"
                    name="requiredByDefault"
                    defaultChecked={group.required_by_default === true}
                    className="h-4 w-4"
                  />
                  Required by default
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-full bg-[#c9964f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]"
                >
                  Save group
                </button>
              </div>
            </form>
          </Card>

          <Card
            title="Add option"
            description="Добавь позицию внутри группы: фото, цена, склад и количество."
          >
            <form action={createModifierGroupOptionAction} className="space-y-5">
              <input type="hidden" name="groupId" value={group.id} />
              <input type="hidden" name="initialMarkerColor" value="#2f6fa3" />

              <div className="grid gap-4 md:grid-cols-[1fr_160px_140px]">
                <Field label="Option name">
                  <Input
                    name="optionName"
                    placeholder="Pink/Clear/White"
                    required
                  />
                </Field>

                <Field label="Price delta">
                  <Input
                    name="priceDelta"
                    type="number"
                    step="0.01"
                    defaultValue="0"
                  />
                </Field>

                <Field label="Sort order">
                  <Input name="sortOrder" type="number" defaultValue="100" />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <Field label="Marker color (optional)">
                  <Input
                    name="markerColor"
                    type="color"
                    defaultValue="#2f6fa3"
                    className="h-12 w-full rounded-2xl border border-[#d8cec0] bg-white p-1"
                  />
                </Field>

                <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                  <input
                    type="checkbox"
                    name="useMarkerColor"
                    className="h-4 w-4"
                  />
                  Use this color as booking marker when this option is selected
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr_180px_180px]">
                <Field label="Inventory item">
                  <Select name="inventoryItemId" defaultValue="">
                    <option value="">No inventory item</option>
                    {inventoryItems.map((item: any) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.tracking_type || "tracking"}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Inventory quantity">
                  <Input
                    name="inventoryQuantity"
                    type="number"
                    step="1"
                    defaultValue="1"
                  />
                </Field>

                <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                  <input
                    type="checkbox"
                    name="trackInventory"
                    defaultChecked
                    className="h-4 w-4"
                  />
                  Track stock
                </label>
              </div>

              <Field label="Inventory behavior">
                <Select name="inventoryBehavior" defaultValue="reusable">
                  <option value="reusable">Reusable — reserve and return to stock after use</option>
                  <option value="consumable">Consumable — deduct from stock after use</option>
                </Select>
              </Field>

              <Field label="Description">
                <Textarea name="description" rows={3} />
              </Field>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-full bg-[#23313f] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                >
                  Add option
                </button>
              </div>
            </form>
          </Card>

          <Card
            title="Options inside this group"
            description="Группы идут последовательно в booking flow, а внутри каждой группы клиент выбирает одну или несколько позиций."
          >
            <div className="space-y-5">
              {options.map((option: any) => (
                <div
                  key={option.id}
                  className="overflow-hidden rounded-[26px] border border-[#eee5d9] bg-[#fcfaf7]"
                >
                  <div className="grid gap-0 xl:grid-cols-[220px_1fr]">
                    <div>
                      <div className="aspect-square bg-[#efe7dc]">
                        {option.image_url ? (
                          <img
                            src={option.image_url}
                            alt={optionName(option)}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm font-semibold text-[#9a7a49]">
                            No option photo
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 border-t border-[#eee5d9] bg-white p-4">
                        <SafePhotoUploadForm
                          action={uploadModifierGroupOptionPhotoAction}
                          hiddenFields={[
                            { name: "groupId", value: group.id },
                            { name: "optionId", value: option.id },
                          ]}
                          buttonLabel="Upload photo"
                          compact
                        />

                        {option.image_url && (
                          <form action={removeModifierGroupOptionPhotoAction}>
                            <input
                              type="hidden"
                              name="groupId"
                              value={group.id}
                            />
                            <input
                              type="hidden"
                              name="optionId"
                              value={option.id}
                            />

                            <button
                              type="submit"
                              className="w-full rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                            >
                              Remove photo
                            </button>
                          </form>
                        )}
                      </div>
                    </div>

                    <div className="p-5">
                      <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                            option.active !== false
                          )}`}
                        >
                          {option.active !== false ? "Active" : "Inactive"}
                        </span>

                        <span className="rounded-full bg-[#fff4d8] px-3 py-1 text-xs font-semibold text-[#8a6b20] ring-1 ring-[#efd582]">
                          {money(option.price_delta)}
                        </span>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#eee5d9]">
                          {option.track_inventory === false
                            ? "Stock ignored"
                            : "Stock tracked"}
                        </span>

                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#6c6258] ring-1 ring-[#eee5d9]">
                          {option.inventory_behavior === "consumable" ? "Consumable" : "Reusable"}
                        </span>
                      </div>

                      <form
                        action={updateModifierGroupOptionAction}
                        className="space-y-4"
                      >
                        <input type="hidden" name="groupId" value={group.id} />
                        <input type="hidden" name="optionId" value={option.id} />
                        <input
                          type="hidden"
                          name="initialMarkerColor"
                          value={option.marker_color || "#2f6fa3"}
                        />

                        <div className="grid gap-4 md:grid-cols-[1fr_150px_130px]">
                          <Field label="Option name">
                            <Input
                              name="optionName"
                              defaultValue={optionName(option)}
                              required
                            />
                          </Field>

                          <Field label="Price delta">
                            <Input
                              name="priceDelta"
                              type="number"
                              step="0.01"
                              defaultValue={option.price_delta || 0}
                            />
                          </Field>

                          <Field label="Sort order">
                            <Input
                              name="sortOrder"
                              type="number"
                              defaultValue={option.sort_order || 100}
                            />
                          </Field>
                        </div>

                        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                          <Field label="Marker color (optional)">
                            <Input
                              name="markerColor"
                              type="color"
                              defaultValue={option.marker_color || "#2f6fa3"}
                              className="h-12 w-full rounded-2xl border border-[#d8cec0] bg-white p-1"
                            />
                          </Field>

                          <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                            <input
                              type="checkbox"
                              name="useMarkerColor"
                              defaultChecked={Boolean(option.marker_color)}
                              className="h-4 w-4"
                            />
                            Use this color as booking marker when selected
                          </label>
                        </div>

                        <div className="grid gap-4 md:grid-cols-[1fr_170px_170px]">
                          <Field label="Inventory item">
                            <Select
                              name="inventoryItemId"
                              defaultValue={option.inventory_item_id || ""}
                            >
                              <option value="">No inventory item</option>
                              {inventoryItems.map((item: any) => (
                                <option key={item.id} value={item.id}>
                                  {item.name} · {item.tracking_type || "tracking"}
                                </option>
                              ))}
                            </Select>
                          </Field>

                          <Field label="Inventory quantity">
                            <Input
                              name="inventoryQuantity"
                              type="number"
                              step="1"
                              defaultValue={option.inventory_quantity || 1}
                            />
                          </Field>

                          <div className="space-y-3">
                            <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                              <input
                                type="checkbox"
                                name="trackInventory"
                                defaultChecked={option.track_inventory !== false}
                                className="h-4 w-4"
                              />
                              Track stock
                            </label>

                            <label className="flex items-center gap-3 rounded-2xl border border-[#eee5d9] bg-white px-4 py-3 text-sm font-semibold text-[#1f1e1b]">
                              <input
                                type="checkbox"
                                name="active"
                                defaultChecked={option.active !== false}
                                className="h-4 w-4"
                              />
                              Active
                            </label>
                          </div>
                        </div>

                        <Field label="Inventory behavior">
                          <Select name="inventoryBehavior" defaultValue={option.inventory_behavior || "reusable"}>
                            <option value="reusable">Reusable — reserve and return to stock after use</option>
                            <option value="consumable">Consumable — deduct from stock after use</option>
                          </Select>
                        </Field>

                        <div className="rounded-2xl bg-white p-4 text-sm leading-6 text-[#6c6258] ring-1 ring-[#eee5d9]">
                          Inventory:{" "}
                          <b className="text-[#1f1e1b]">
                            {inventoryName(
                              inventoryItems,
                              option.inventory_item_id
                            )}
                          </b>{" "}
                          · Quantity:{" "}
                          <b className="text-[#1f1e1b]">
                            {option.inventory_quantity || 1}
                          </b>
                        </div>

                        <Field label="Description">
                          <Textarea
                            name="description"
                            rows={3}
                            defaultValue={option.description || ""}
                          />
                        </Field>

                        <div className="flex flex-wrap justify-end gap-3">
                          <button
                            type="submit"
                            className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
                          >
                            Save option
                          </button>
                        </div>
                      </form>

                      <form
                        action={deleteModifierGroupOptionAction}
                        className="mt-3 flex justify-end"
                      >
                        <input type="hidden" name="groupId" value={group.id} />
                        <input type="hidden" name="optionId" value={option.id} />

                        <button
                          type="submit"
                          className="rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Delete option
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}

              {options.length === 0 && (
                <div className="rounded-[26px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-14 text-center">
                  <div className="text-lg font-semibold text-[#1f1e1b]">
                    No options yet
                  </div>
                  <p className="mt-2 text-sm text-[#6c6258]">
                    Add the first option above.
                  </p>
                </div>
              )}
            </div>
          </Card>

          <section className="rounded-[30px] border border-red-100 bg-red-50 p-6">
            <h3 className="text-lg font-semibold text-red-800">Danger zone</h3>

            <p className="mt-2 text-sm leading-6 text-red-700">
              Удаление группы также удалит ее options и связи с продуктами.
            </p>

            <form action={deleteModifierGroupAction} className="mt-4">
              <input type="hidden" name="groupId" value={group.id} />

              <button
                type="submit"
                className="rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-800"
              >
                Delete group
              </button>
            </form>
          </section>
        </main>
      </section>
    </div>
  );
}
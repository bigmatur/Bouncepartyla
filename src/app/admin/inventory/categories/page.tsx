import { createClient } from "@/lib/supabase/server";
import {
  createInventoryCategoryAction,
  deleteInventoryCategoryAction,
  toggleInventoryCategoryAction,
  updateInventoryCategoryAction,
} from "./actions";

function getParentName(categories: any[], parentId: string | null) {
  if (!parentId) return "Root category";

  const parent = categories.find((category) => category.id === parentId);
  return parent?.name || "Root category";
}

function getItemCount(items: any[], categoryId: string) {
  return items.filter((item) => item.category_id === categoryId).length;
}

function getChildrenCount(categories: any[], categoryId: string) {
  return categories.filter((category) => category.parent_id === categoryId)
    .length;
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
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#9a7a49] sm:text-xs sm:font-semibold">
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
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
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
        "w-full min-w-0 resize-y rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
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
        "w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#23313f] focus:ring-2 focus:ring-[#d8e8f7] sm:rounded-2xl sm:px-4 sm:py-3",
        props.className || "",
      ].join(" ")}
    />
  );
}

export default async function InventoryCategoriesPage() {
  const supabase = await createClient();

  const [categoriesResult, itemsResult] = await Promise.all([
    supabase
      .from("inventory_categories")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),

    supabase.from("inventory_items").select("id, category_id"),
  ]);

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }

  const categories = categoriesResult.data || [];
  const items = itemsResult.data || [];

  const activeCount = categories.filter(
    (category: any) => category.active !== false
  ).length;

  const inactiveCount = categories.filter(
    (category: any) => category.active === false
  ).length;

  const rootCount = categories.filter(
    (category: any) => !category.parent_id
  ).length;

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse structure
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Inventory Categories
            </h2>

            <p className="mt-2 hidden max-w-3xl text-sm leading-6 text-[#6c6258] sm:block">
              Категории нужны, чтобы склад не превратился в один длинный список.
              Здесь можно разделить батуты, blower, soft play, расходники, тарпы,
              декор и инструменты.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <a
              href="/admin/inventory"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] transition hover:bg-[#faf8f5] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Inventory list
            </a>

            <a
              href="/admin/inventory/receive"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#c9964f] px-3 text-center text-xs font-bold text-white transition hover:bg-[#b78744] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Receive stock
            </a>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Categories
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {categories.length}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Active
          </div>
          <div className="mt-1.5 text-2xl font-bold text-emerald-700 sm:mt-2 sm:text-3xl sm:font-semibold">
            {activeCount}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Inactive
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#6c6258] sm:mt-2 sm:text-3xl sm:font-semibold">
            {inactiveCount}
          </div>
        </div>

        <div className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
            Root categories
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#1f1e1b] sm:mt-2 sm:text-3xl sm:font-semibold">
            {rootCount}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Add category
            </h3>

            <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
              Создай новую категорию или подкатегорию склада.
            </p>
          </div>

          <form
            action={createInventoryCategoryAction}
            className="space-y-3 p-3.5 sm:space-y-5 sm:p-6"
          >
            <Field label="Name">
              <Input
                name="name"
                placeholder="Inflatables, Blowers, Cleaning Supplies..."
                required
              />
            </Field>

            <Field label="Parent category">
              <Select name="parentId" defaultValue="">
                <option value="">Root category</option>
                {categories.map((category: any) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Sort order">
              <Input name="sortOrder" type="number" defaultValue="100" />
            </Field>

            <Field label="Description">
              <Textarea
                name="description"
                rows={3}
                placeholder="What belongs in this category..."
              />
            </Field>

            <button
              type="submit"
              className="w-full rounded-xl bg-[#c9964f] px-4 py-3 text-sm font-bold text-white shadow-[0_8px_22px_rgba(201,150,79,0.20)] transition hover:bg-[#b78744] sm:rounded-full sm:px-6 sm:py-4 sm:font-semibold"
            >
              Create category
            </button>
          </form>
        </section>

        <section className="min-w-0 overflow-hidden rounded-[20px] border border-black/5 bg-white shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-3.5 py-3 sm:px-6 sm:py-5">
            <h3 className="text-base font-bold tracking-tight text-[#1f1e1b] sm:text-xl sm:font-semibold">
              Category list
            </h3>

            <p className="mt-0.5 text-xs leading-5 text-[#6c6258] sm:mt-1 sm:text-sm sm:leading-6">
              Редактирование категорий, сортировки, активности и удаление
              пустых категорий.
            </p>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {categories.map((category: any) => {
              const itemCount = getItemCount(items, category.id);
              const childrenCount = getChildrenCount(categories, category.id);
              const canDelete = itemCount === 0 && childrenCount === 0;

              return (
                <div key={category.id} className="p-3.5 sm:p-6">
                  <div className="mb-3 flex flex-wrap items-center gap-1.5 sm:mb-4 sm:gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                        category.active !== false
                      )}`}
                    >
                      {category.active !== false ? "Active" : "Inactive"}
                    </span>

                    <span className="rounded-full bg-[#eaf2f9] px-2.5 py-1 text-[10px] font-bold text-[#355879] ring-1 ring-[#cfe0ef] sm:px-3 sm:text-xs sm:font-semibold">
                      {itemCount} items
                    </span>

                    <span className="rounded-full bg-[#fff4d8] px-2.5 py-1 text-[10px] font-bold text-[#8a6b20] ring-1 ring-[#efd582] sm:px-3 sm:text-xs sm:font-semibold">
                      {childrenCount} children
                    </span>
                  </div>

                  <div className="grid min-w-0 gap-3 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_220px]">
                    <form
                      action={updateInventoryCategoryAction}
                      className="min-w-0 space-y-3 sm:space-y-4"
                    >
                      <input
                        type="hidden"
                        name="categoryId"
                        value={category.id}
                      />

                      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-[1fr_220px_120px]">
                        <Field label="Name">
                          <Input
                            name="name"
                            defaultValue={category.name || ""}
                            required
                          />
                        </Field>

                        <Field label="Parent">
                          <Select
                            name="parentId"
                            defaultValue={category.parent_id || ""}
                          >
                            <option value="">Root category</option>
                            {categories
                              .filter((item: any) => item.id !== category.id)
                              .map((item: any) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </Select>
                        </Field>

                        <div className="col-span-2 md:col-span-1">
                          <Field label="Sort">
                            <Input
                              name="sortOrder"
                              type="number"
                              defaultValue={category.sort_order || 100}
                            />
                          </Field>
                        </div>
                      </div>

                      <Field label="Description">
                        <Textarea
                          name="description"
                          rows={3}
                          defaultValue={category.description || ""}
                        />
                      </Field>

                      <label className="flex items-center justify-between gap-4 rounded-xl border border-[#eee5d9] bg-[#fcfaf7] px-3 py-2.5 text-sm font-bold text-[#1f1e1b] sm:rounded-2xl sm:px-4 sm:py-3 sm:font-semibold">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={category.active !== false}
                          className="h-5 w-5"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2 text-[11px] leading-4 text-[#6c6258] sm:text-xs">
                        <div className="truncate">
                          Slug: {category.slug || "—"}
                        </div>
                        <div className="truncate">
                          Parent:{" "}
                          {getParentName(categories, category.parent_id)}
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="w-full rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#18222d] sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold"
                      >
                        Save
                      </button>
                    </form>

                    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-1">
                      <form action={toggleInventoryCategoryAction}>
                        <input
                          type="hidden"
                          name="categoryId"
                          value={category.id}
                        />

                        <input
                          type="hidden"
                          name="active"
                          value={category.active === false ? "true" : "false"}
                        />

                        <button
                          type="submit"
                          className={[
                            "w-full rounded-xl px-3 py-2.5 text-xs font-bold transition sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold",
                            category.active === false
                              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                              : "bg-red-50 text-red-700 ring-1 ring-red-100 hover:bg-red-100",
                          ].join(" ")}
                        >
                          {category.active === false
                            ? "Activate"
                            : "Deactivate"}
                        </button>
                      </form>

                      <form action={deleteInventoryCategoryAction}>
                        <input
                          type="hidden"
                          name="categoryId"
                          value={category.id}
                        />

                        <button
                          type="submit"
                          disabled={!canDelete}
                          title={
                            canDelete
                              ? "Delete empty category"
                              : "Move items and child categories before deleting"
                          }
                          className={[
                            "w-full rounded-xl px-3 py-2.5 text-xs font-bold transition sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold",
                            canDelete
                              ? "bg-red-700 text-white hover:bg-red-800"
                              : "cursor-not-allowed bg-neutral-100 text-neutral-400 ring-1 ring-neutral-200",
                          ].join(" ")}
                        >
                          Delete
                        </button>
                      </form>

                      {!canDelete && (
                        <div className="col-span-2 rounded-xl bg-[#fff8eb] p-3 text-[11px] leading-4 text-[#8a6b20] ring-1 ring-[#efd582] sm:rounded-2xl sm:p-4 sm:text-xs sm:leading-5 xl:col-span-1">
                          Cannot delete: category has {itemCount} item(s) and{" "}
                          {childrenCount} child category/categories.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {categories.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">
                  No categories yet
                </div>

                <p className="mt-2 text-sm text-[#6c6258]">
                  Create your first inventory category.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

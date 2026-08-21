import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createModifierGroupAction } from "./actions";

export default async function ModifierGroupsPage() {
  const supabase = await createClient();

  const groupsResult = await supabase
    .from("modifier_groups")
    .select(
      `
      id,
      name,
      slug,
      short_description,
      selection_type,
      required,
      min_selections,
      max_selections,
      active,
      public_visible,
      sort_order,
      modifier_group_options (
        id,
        active,
        selected_by_default,
        modifiers (
          id,
          name,
          price,
          affects_inventory,
          active
        )
      )
    `
    )
    .order("sort_order", { ascending: true });

  if (groupsResult.error) {
    throw new Error(groupsResult.error.message);
  }

  const groups = groupsResult.data || [];

  return (
    <div className="p-4 lg:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm">
          <div>
            <Link
              href="/admin/catalog"
              className="text-sm text-neutral-500 hover:text-neutral-900"
            >
              ← Catalog
            </Link>

            <h1 className="mt-2 text-2xl font-semibold text-neutral-950">
              Modifier Groups
            </h1>

            <p className="mt-2 text-sm text-neutral-500">
              Create option groups like Generator, Balloons, Ball pit colors,
              Attendant, and Soft Play add-ons.
            </p>
          </div>

          <Link
            href="/admin/catalog"
            className="rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700"
          >
            Back to catalog
          </Link>
        </div>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">
            Create new group
          </h2>

          <form action={createModifierGroupAction} className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Group name
              </label>
              <input
                name="name"
                required
                placeholder="Balloons / Generator / Ball colors"
                className="w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Selection type
              </label>
              <select
                name="selectionType"
                defaultValue="single"
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm"
              >
                <option value="single">Single choice</option>
                <option value="multiple">Multiple choice</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-xl bg-neutral-950 px-5 py-2 text-sm font-semibold text-white"
              >
                Create group
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-4">
          {groups.map((group: any) => {
            const options = group.modifier_group_options || [];
            const activeOptions = options.filter((option: any) => option.active);

            return (
              <Link
                key={group.id}
                href={`/admin/catalog/modifier-groups/${group.id}`}
                className="block rounded-3xl bg-white p-6 shadow-sm transition hover:bg-neutral-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-neutral-950">
                        {group.name}
                      </h2>

                      <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700">
                        {group.selection_type}
                      </span>

                      {group.required && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                          required
                        </span>
                      )}

                      {!group.active && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                          inactive
                        </span>
                      )}
                    </div>

                    <p className="mt-2 text-sm text-neutral-500">
                      {group.short_description || "No description"}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {activeOptions.slice(0, 8).map((option: any) => (
                        <span
                          key={option.id}
                          className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700"
                        >
                          {option.modifiers?.name}
                          {option.selected_by_default ? " · default" : ""}
                        </span>
                      ))}

                      {activeOptions.length > 8 && (
                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">
                          +{activeOptions.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-semibold text-neutral-950">
                      {activeOptions.length}
                    </div>
                    <div className="text-sm text-neutral-500">options</div>
                  </div>
                </div>
              </Link>
            );
          })}

          {groups.length === 0 && (
            <div className="rounded-3xl bg-white p-10 text-center text-sm text-neutral-500 shadow-sm">
              No modifier groups yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
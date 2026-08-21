import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StaffTimeClockCard from "@/components/staff/StaffTimeClockCard";
import {
  completeCleaningTaskAction,
  problemCleaningTaskAction,
  startCleaningTaskAction,
} from "./actions";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getOne(value: any) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function statusClass(status: string) {
  if (status === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (status === "in_progress") {
    return "bg-[#eaf2f9] text-[#355879] ring-1 ring-[#cfe0ef]";
  }

  if (status === "problem") {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#fff8e8] text-[#8a6b20] ring-1 ring-[#ead6a8]";
}

type PageProps = {
  searchParams?: Promise<{ status?: string; category?: string }>;
};

export default async function CleaningQueuePage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedStatus = String(params.status || "open");
  const selectedCategory = String(params.category || "");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let tasksQuery = supabase
    .from("inventory_cleaning_tasks")
    .select(`
      id,
      booking_id,
      route_stop_id,
      reservation_id,
      inventory_item_id,
      inventory_unit_id,
      quantity,
      status,
      source,
      started_at,
      completed_at,
      problem_at,
      notes,
      created_at,
      assigned_profile_id,
      inventory_items!inner (
        id,
        name,
        sku,
        tracking_type,
        image_url,
        category_id,
        inventory_categories (id, name)
      ),
      inventory_units (
        id,
        unit_code,
        serial_number,
        status,
        image_url
      ),
      bookings (
        id,
        booking_number,
        event_date,
        customers (id, full_name)
      ),
      profiles (
        id,
        first_name,
        last_name
      )
    `)
    .order("created_at", { ascending: true })
    .limit(300);

  if (selectedStatus === "open") {
    tasksQuery = tasksQuery.in("status", ["waiting", "in_progress", "problem"]);
  } else if (selectedStatus !== "all") {
    tasksQuery = tasksQuery.eq("status", selectedStatus);
  }

  if (selectedCategory) {
    tasksQuery = tasksQuery.eq(
      "inventory_items.category_id",
      selectedCategory
    );
  }

  const [tasksResult, categoriesResult, openTimeResult] = await Promise.all([
    tasksQuery,
    supabase
      .from("inventory_categories")
      .select("id, name, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    user
      ? supabase
          .from("staff_time_entries")
          .select(
            "id, clock_in_at, clock_out_at, break_started_at, break_minutes, source"
          )
          .eq("auth_user_id", user.id)
          .eq("status", "active")
          .is("clock_out_at", null)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (tasksResult.error) {
    throw new Error(tasksResult.error.message);
  }

  if (categoriesResult.error) {
    throw new Error(categoriesResult.error.message);
  }

  if (openTimeResult.error) {
    throw new Error(openTimeResult.error.message);
  }

  const tasks = tasksResult.data || [];
  const categories = categoriesResult.data || [];

  const categoryOrder = new Map<string, number>(
    categories.map((category: any, index: number) => [
      String(category.id),
      index,
    ])
  );

  const sortedTasks = [...tasks].sort((a: any, b: any) => {
    const aItem = getOne(a.inventory_items);
    const bItem = getOne(b.inventory_items);
    const aCategory = getOne(aItem?.inventory_categories);
    const bCategory = getOne(bItem?.inventory_categories);

    const aOrder =
      categoryOrder.get(String(aCategory?.id || "")) ??
      Number.MAX_SAFE_INTEGER;
    const bOrder =
      categoryOrder.get(String(bCategory?.id || "")) ??
      Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    const categoryNameCompare = String(
      aCategory?.name || ""
    ).localeCompare(String(bCategory?.name || ""));

    if (categoryNameCompare !== 0) {
      return categoryNameCompare;
    }

    return (
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime()
    );
  });

  const groupedTasks = sortedTasks.reduce(
    (
      groups: Array<{ id: string; name: string; tasks: any[] }>,
      task: any
    ) => {
      const item = getOne(task.inventory_items);
      const category = getOne(item?.inventory_categories);
      const categoryId = String(category?.id || "uncategorized");
      const categoryName = String(category?.name || "Other");
      const existing = groups.find((group) => group.id === categoryId);

      if (existing) {
        existing.tasks.push(task);
      } else {
        groups.push({
          id: categoryId,
          name: categoryName,
          tasks: [task],
        });
      }

      return groups;
    },
    []
  );

  const waitingCount = tasks.filter(
    (task: any) => task.status === "waiting"
  ).length;

  const inProgressCount = tasks.filter(
    (task: any) => task.status === "in_progress"
  ).length;

  const problemCount = tasks.filter(
    (task: any) => task.status === "problem"
  ).length;

  const completedCount = tasks.filter(
    (task: any) => task.status === "completed"
  ).length;

  return (
    <div className="min-w-0 space-y-4 pb-10 sm:space-y-6">
      <StaffTimeClockCard
        entry={openTimeResult.data || null}
        title="Cleaning work time"
      />

      <section className="min-w-0 rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Warehouse workflow
            </div>

            <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1f1e1b] sm:text-3xl sm:font-semibold">
              Cleaning Queue
            </h2>

            <p className="mt-2 hidden max-w-4xl text-sm leading-6 text-[#6c6258] sm:block">
              Pickup completed → inventory reservation → only items marked
              Needs Cleaning appear here automatically.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link
              href="/admin/inventory/damages"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#d8cec0] bg-white px-3 text-center text-xs font-bold text-[#2b2a28] sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Damage reports
            </Link>

            <Link
              href="/admin/inventory/returns"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#23313f] px-3 text-center text-xs font-bold text-white sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold"
            >
              Returns
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        {[
          ["Waiting", waitingCount],
          ["In progress", inProgressCount],
          ["Problem", problemCount],
          ["Completed visible", completedCount],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="min-w-0 rounded-[18px] border border-black/5 bg-white p-3.5 shadow-[0_6px_20px_rgba(0,0,0,0.03)] sm:rounded-[24px] sm:p-5 sm:shadow-[0_10px_30px_rgba(0,0,0,0.035)]"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
              {label}
            </div>

            <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">
              {value}
            </div>
          </div>
        ))}
      </section>

      <section className="min-w-0 rounded-[20px] border border-black/5 bg-white p-3.5 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-5 sm:shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
        <form className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <select
            name="category"
            defaultValue={selectedCategory}
            className="min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3"
          >
            <option value="">All categories</option>
            {categories.map((category: any) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            name="status"
            defaultValue={selectedStatus}
            className="min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3"
          >
            <option value="open">Open queue</option>
            <option value="waiting">Waiting</option>
            <option value="in_progress">In progress</option>
            <option value="problem">Problem</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </select>

          <button className="col-span-2 rounded-xl bg-[#c9964f] px-4 py-2.5 text-sm font-bold text-white sm:col-span-1 sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold">
            Apply
          </button>
        </form>
      </section>

      <section className="min-w-0 space-y-5 sm:space-y-7">
        {groupedTasks.map((group) => (
          <div
            key={group.id}
            className="min-w-0 space-y-2.5 sm:space-y-3"
          >
            <div className="flex items-center gap-3 px-1">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                {group.name}
              </h3>

              <span className="rounded-full bg-[#f3ede4] px-2.5 py-1 text-xs font-semibold text-[#6c6258]">
                {group.tasks.length}
              </span>

              <div className="h-px flex-1 bg-[#e9e0d4]" />
            </div>

            <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-2">
              {group.tasks.map((task: any) => {
                const item = getOne(task.inventory_items);
                const unit = getOne(task.inventory_units);
                const booking = getOne(task.bookings);
                const assigned = getOne(task.profiles);

                const assignedName = [
                  assigned?.first_name,
                  assigned?.last_name,
                ]
                  .filter(Boolean)
                  .join(" ");

                const imageUrl = unit?.image_url || item?.image_url;

                return (
                  <article
                    key={task.id}
                    className="min-w-0 rounded-[20px] border border-black/5 bg-white p-3.5 shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:rounded-[28px] sm:p-5 sm:shadow-[0_10px_35px_rgba(0,0,0,0.035)]"
                  >
                    <div className="flex min-w-0 gap-3 sm:gap-4">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#efe7dc] ring-1 ring-[#eee5d9] sm:h-20 sm:w-20 sm:rounded-2xl">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={item?.name || "Inventory"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-[#9a7a49]">
                            No photo
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-[15px] font-bold leading-5 text-[#1f1e1b] sm:text-lg sm:font-semibold">
                              {item?.name || "Inventory item"}
                            </h3>

                            <p className="mt-1 text-sm text-[#6c6258]">
                              {unit?.unit_code
                                ? `Unit ${unit.unit_code}`
                                : `Quantity ${Number(task.quantity || 0)}`}
                            </p>

                            {booking?.booking_number && (
                              <p className="mt-2 text-sm text-[#6c6258]">
                                Booking:{" "}
                                <span className="font-semibold text-[#1f1e1b]">
                                  {booking.booking_number}
                                </span>
                              </p>
                            )}
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                              task.status
                            )}`}
                          >
                            {String(task.status).replace(/_/g, " ")}
                          </span>
                        </div>

                        {(assignedName || task.started_at) && (
                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#7d7369]">
                            {assignedName && (
                              <span>
                                Cleaner:{" "}
                                <strong className="font-semibold text-[#3c3935]">
                                  {assignedName}
                                </strong>
                              </span>
                            )}

                            {task.started_at && (
                              <span>
                                Started:{" "}
                                <strong className="font-semibold text-[#3c3935]">
                                  {formatDate(task.started_at)}
                                </strong>
                              </span>
                            )}
                          </div>
                        )}

                        {task.notes && (
                          <div className="mt-3 rounded-2xl bg-[#fcfaf7] px-4 py-3 text-sm text-[#6c6258]">
                            {task.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#eee5d9] pt-3 sm:mt-5 sm:flex sm:flex-wrap sm:pt-4">
                      {task.status === "waiting" && (
                        <form action={startCleaningTaskAction}>
                          <input
                            type="hidden"
                            name="taskId"
                            value={task.id}
                          />

                          <button className="w-full rounded-xl bg-[#23313f] px-3 py-2.5 text-xs font-bold text-white sm:w-auto sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold">
                            Start cleaning
                          </button>
                        </form>
                      )}

                      {["waiting", "in_progress"].includes(task.status) && (
                        <form action={completeCleaningTaskAction}>
                          <input
                            type="hidden"
                            name="taskId"
                            value={task.id}
                          />

                          <button className="w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white sm:w-auto sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold">
                            Cleaned
                          </button>
                        </form>
                      )}

                      {["waiting", "in_progress"].includes(task.status) && (
                        <form
                          action={problemCleaningTaskAction}
                          className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:min-w-[260px] sm:flex-1"
                        >
                          <input
                            type="hidden"
                            name="taskId"
                            value={task.id}
                          />

                          <input
                            name="notes"
                            placeholder="Problem / repair note"
                            className="min-w-0 flex-1 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3"
                          />

                          <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 sm:rounded-full sm:px-5 sm:py-3 sm:text-sm sm:font-semibold">
                            Problem
                          </button>
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="rounded-[28px] border border-dashed border-[#d8cec0] bg-[#fcfaf7] px-6 py-16 text-center">
            <div className="text-lg font-semibold text-[#1f1e1b]">
              Cleaning queue is empty
            </div>

            <p className="mt-2 text-sm text-[#6c6258]">
              Items marked Needs Cleaning will appear here automatically after
              pickup.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

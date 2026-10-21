import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StaffTimeClockCard from "@/components/staff/StaffTimeClockCard";
import {
  bulkApplyCleaningTasksAction,
  completeCleaningTaskAction,
  problemCleaningTaskAction,
  startCleaningTaskAction,
} from "./actions";

function weekStartISO(value: string | null | undefined) {
  const date = value ? new Date(value) : new Date();
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const day = normalized.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + diffToMonday);
  return normalized.toISOString();
}

function weekRangeLabel(isoValue: string) {
  const start = new Date(isoValue);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

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
  searchParams?: Promise<{ status?: string; category?: string; view?: string }>;
};

export default async function CleaningQueuePage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : {};
  const selectedStatus = String(params.status || "open");
  const selectedCategory = String(params.category || "");
  const selectedView = String(params.view || "compact");

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

  const groupedWeeks = sortedTasks.reduce(
    (
      weeks: Array<{
        id: string;
        label: string;
        tasks: any[];
      }>,
      task: any,
    ) => {
      const booking = getOne(task.bookings);
      const routeDate = String(task.created_at || booking?.event_date || "");
      const weekId = weekStartISO(routeDate);
      const existing = weeks.find((week) => week.id === weekId);

      if (existing) {
        existing.tasks.push(task);
      } else {
        weeks.push({
          id: weekId,
          label: weekRangeLabel(weekId),
          tasks: [task],
        });
      }

      return weeks;
    },
    [],
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

          <select
            name="view"
            defaultValue={selectedView}
            className="min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3"
          >
            <option value="compact">Compact list</option>
            <option value="cards">Cards</option>
          </select>

          <button className="col-span-2 rounded-xl bg-[#c9964f] px-4 py-2.5 text-sm font-bold text-white sm:col-span-1 sm:rounded-full sm:px-5 sm:py-3 sm:font-semibold">
            Apply
          </button>
        </form>
      </section>

      <section className="cleaning-mobile-section min-w-0 space-y-5 sm:space-y-7">
        <form id="bulk-cleaning-form" action={bulkApplyCleaningTasksAction} className="cleaning-mobile-panel fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-[80] rounded-[20px] border border-black/10 bg-white/95 p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur transition-all duration-200 sm:static sm:inset-auto sm:bottom-auto sm:z-auto sm:rounded-[28px] sm:border-black/5 sm:bg-white sm:p-4 sm:shadow-[0_8px_26px_rgba(0,0,0,0.035)] sm:backdrop-blur-0">
          <div className="flex items-center gap-2 sm:flex-wrap sm:gap-3">
            <select
              name="bulkAction"
              defaultValue="start"
              className="min-w-0 flex-1 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:min-w-[150px] sm:flex-none"
            >
              <option value="start">Start cleaning</option>
              <option value="complete">Mark cleaned</option>
              <option value="problem">Mark problem</option>
            </select>

            <input
              name="bulkNotes"
              placeholder="Problem note (required for Problem)"
              className="hidden min-w-[220px] flex-1 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:block"
            />

            <button className="shrink-0 rounded-xl bg-[#23313f] px-4 py-2.5 text-sm font-semibold text-white">
              Apply to selected
            </button>
          </div>

          <p className="mt-2 hidden text-xs text-[#7d7369] sm:block">
            Select tasks with checkboxes below, then apply one action in bulk.
          </p>
        </form>

        {groupedWeeks.map((week, weekIndex) => (
          <details
            key={week.id}
            className="overflow-hidden rounded-[18px] border border-black/5 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.03)]"
            open={weekIndex < 2}
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 border-b border-[#eee5d9] bg-[#fcfaf7] px-3 py-2.5 sm:px-4">
              <span className="text-sm font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                Week {week.label}
              </span>
              <span className="rounded-full bg-[#f3ede4] px-2.5 py-1 text-xs font-semibold text-[#6c6258]">
                {week.tasks.length}
              </span>
              <span className="ml-auto text-xs text-[#8b8177]">Open/Close</span>
            </summary>

            <div className="p-3 sm:p-4">
              {selectedView === "compact" ? (
                <div className="overflow-hidden rounded-[14px] border border-black/5">
                  <div className="hidden grid-cols-[auto_44px_1fr_auto_auto_auto_auto] gap-2 border-b border-[#eee5d9] bg-[#fcfaf7] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8b8177] sm:grid sm:px-4">
                    <span>Pick</span>
                    <span>Photo</span>
                    <span>Item</span>
                    <span>Status</span>
                    <span>Booking</span>
                    <span>When</span>
                    <span className="text-right">Actions</span>
                  </div>

                  <div className="divide-y divide-[#f0e7dc]">
                    {week.tasks.map((task: any) => {
                      const item = getOne(task.inventory_items);
                      const unit = getOne(task.inventory_units);
                      const booking = getOne(task.bookings);
                      const imageUrl = unit?.image_url || item?.image_url;

                      return (
                        <div
                          key={task.id}
                          className="grid grid-cols-[auto_44px_minmax(0,1fr)] gap-2 px-3 py-2.5 text-sm hover:bg-[#fffdfa] sm:grid-cols-[auto_44px_1fr_auto_auto_auto_auto] sm:items-center sm:px-4"
                        >
                          <input
                            type="checkbox"
                            name="taskIds"
                            value={task.id}
                            form="bulk-cleaning-form"
                            className="mt-1 h-4 w-4 rounded border-[#cabca9] sm:mt-0"
                          />

                          <div className="h-9 w-9 overflow-hidden rounded-md bg-[#efe7dc] ring-1 ring-[#eee5d9]">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={item?.name || "Inventory"}
                                className="h-full w-full object-cover"
                              />
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[#1f1e1b]">
                              {item?.name || "Inventory item"}
                            </div>
                            <div className="truncate text-xs text-[#7d7369]">
                              {item?.sku || "No SKU"}
                            </div>

                            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#6c6258] sm:hidden">
                              <span className={`rounded-full px-2 py-0.5 font-bold ${statusClass(task.status)}`}>
                                {String(task.status).replace(/_/g, " ")}
                              </span>
                              <span>{booking?.booking_number || "—"}</span>
                              <span>{formatDate(task.created_at)}</span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:hidden">
                              {task.status === "waiting" && (
                                <form action={startCleaningTaskAction}>
                                  <input type="hidden" name="taskId" value={task.id} />
                                  <button className="rounded-lg bg-[#23313f] px-2.5 py-1.5 text-[11px] font-semibold text-white">
                                    Start
                                  </button>
                                </form>
                              )}

                              {["waiting", "in_progress"].includes(task.status) && (
                                <form action={completeCleaningTaskAction}>
                                  <input type="hidden" name="taskId" value={task.id} />
                                  <button className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                                    Cleaned
                                  </button>
                                </form>
                              )}

                              {["waiting", "in_progress"].includes(task.status) && (
                                <form action={problemCleaningTaskAction} className="flex items-center gap-1.5">
                                  <input type="hidden" name="taskId" value={task.id} />
                                  <input
                                    name="notes"
                                    placeholder="Problem note"
                                    className="w-28 rounded-lg border border-[#d8cec0] bg-white px-2 py-1.5 text-[11px]"
                                  />
                                  <button className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                                    Problem
                                  </button>
                                </form>
                              )}
                            </div>
                          </div>

                          <span className={`hidden rounded-full px-2 py-1 text-[10px] font-bold sm:inline-flex ${statusClass(task.status)}`}>
                            {String(task.status).replace(/_/g, " ")}
                          </span>

                          <span className="hidden text-xs text-[#6c6258] sm:inline">
                            {booking?.booking_number || "—"}
                          </span>

                          <span className="hidden text-xs text-[#6c6258] sm:inline">
                            {formatDate(task.created_at)}
                          </span>

                          <div className="hidden min-w-[220px] items-center justify-end gap-1.5 sm:flex">
                            {task.status === "waiting" && (
                              <form action={startCleaningTaskAction}>
                                <input type="hidden" name="taskId" value={task.id} />
                                <button className="rounded-lg bg-[#23313f] px-2.5 py-1.5 text-[11px] font-semibold text-white">
                                  Start
                                </button>
                              </form>
                            )}

                            {["waiting", "in_progress"].includes(task.status) && (
                              <form action={completeCleaningTaskAction}>
                                <input type="hidden" name="taskId" value={task.id} />
                                <button className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white">
                                  Cleaned
                                </button>
                              </form>
                            )}

                            {["waiting", "in_progress"].includes(task.status) && (
                              <form
                                action={problemCleaningTaskAction}
                                className="flex items-center gap-1.5"
                              >
                                <input type="hidden" name="taskId" value={task.id} />
                                <input
                                  name="notes"
                                  placeholder="Problem note"
                                  className="w-32 rounded-lg border border-[#d8cec0] bg-white px-2 py-1.5 text-[11px]"
                                />
                                <button className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
                                  Problem
                                </button>
                              </form>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid min-w-0 gap-3 sm:gap-4 xl:grid-cols-2">
                  {week.tasks.map((task: any) => {
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
                        <div className="mb-3 flex items-center justify-between">
                          <label className="inline-flex items-center gap-2 text-xs text-[#6c6258]">
                            <input
                              type="checkbox"
                              name="taskIds"
                              value={task.id}
                              form="bulk-cleaning-form"
                              className="h-4 w-4 rounded border-[#cabca9]"
                            />
                            Select
                          </label>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:px-3 sm:text-xs sm:font-semibold ${statusClass(
                              task.status,
                            )}`}
                          >
                            {String(task.status).replace(/_/g, " ")}
                          </span>
                        </div>

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
              )}
            </div>
          </details>
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

      <style>{`
        @media (max-width: 639px) {
          .cleaning-mobile-section {
            padding-bottom: 1.5rem;
          }

          .cleaning-mobile-panel {
            opacity: 0;
            transform: translateY(16px);
            pointer-events: none;
          }

          .cleaning-mobile-section:has(input[name="taskIds"]:checked) {
            padding-bottom: 11rem;
          }

          .cleaning-mobile-section:has(input[name="taskIds"]:checked) .cleaning-mobile-panel {
            opacity: 1;
            transform: translateY(0);
            pointer-events: auto;
          }
        }
      `}</style>
    </div>
  );
}

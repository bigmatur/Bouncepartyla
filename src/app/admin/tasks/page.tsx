import Link from "next/link";
import { requireAdminPermission } from "@/lib/auth/require-admin";
import {
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  reopenTaskAction,
} from "./actions";
import BookingSearchSelect from "./BookingSearchSelect";
import CustomerSearchSelect from "./CustomerSearchSelect";

function dateInputValue(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "No due date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function isOverdue(value: string | null | undefined, status: string) {
  if (!value || status === "completed") return false;
  return new Date(value).getTime() < Date.now();
}

function taskTypeLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    follow_up: "Follow-up",
    deposit: "Deposit",
    contract: "Contract",
    coi: "COI / Insurance",
    route: "Route",
    inventory: "Inventory",
    cleaning: "Cleaning",
    review: "Review request",
  };

  return labels[String(value || "follow_up")] || value || "Task";
}

function statusClass(task: any) {
  if (task.status === "completed") {
    return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (isOverdue(task.due_at, task.status)) {
    return "bg-red-50 text-red-700 ring-1 ring-red-200";
  }

  return "bg-[#fff8e8] text-[#8a6b20] ring-1 ring-[#ead6a8]";
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

type PageProps = {
  searchParams?: Promise<{
    status?: string;
    type?: string;
  }>;
};

export default async function TasksPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedStatus = resolvedSearchParams?.status || "open";
  const selectedType = resolvedSearchParams?.type || "all";

  const { supabase } = await requireAdminPermission("dashboard.view");

  let tasksQuery = supabase
    .from("tasks")
    .select(
      `
      id,
      title,
      description,
      task_type,
      due_at,
      status,
      completed_at,
      created_at,
      bookings (
        id,
        booking_number,
        event_date,
        setup_city,
        customers (id, full_name, phone)
      ),
      customers (id, full_name, phone)
    `
    )
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (selectedStatus !== "all") {
    tasksQuery = tasksQuery.eq("status", selectedStatus);
  }

  if (selectedType !== "all") {
    tasksQuery = tasksQuery.eq("task_type", selectedType);
  }

  const [tasksResult, bookingsResult, customersResult] = await Promise.all([
    tasksQuery.limit(150),
    supabase
      .from("bookings")
      .select("id, booking_number, event_date, customers (full_name)")
      .order("event_date", { ascending: false })
      .limit(80),
    supabase.from("customers").select("id, full_name, phone").order("full_name"),
  ]);

  if (tasksResult.error) throw new Error(tasksResult.error.message);
  if (bookingsResult.error) throw new Error(bookingsResult.error.message);
  if (customersResult.error) throw new Error(customersResult.error.message);

  const tasks = tasksResult.data || [];
  const bookings = bookingsResult.data || [];
  const customers = customersResult.data || [];

  const openCount = tasks.filter((task: any) => task.status !== "completed").length;
  const overdueCount = tasks.filter((task: any) =>
    isOverdue(task.due_at, task.status)
  ).length;
  const completedCount = tasks.filter(
    (task: any) => task.status === "completed"
  ).length;
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-black/5 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Follow-up center
            </div>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Tasks / Reminders
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Контроль депозитов, контрактов, COI, delivery notes, cleaning и
              follow-up сообщений. Это список того, что нельзя забыть.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/bookings"
              className="rounded-full border border-[#d8cec0] bg-white px-5 py-3 text-sm font-semibold text-[#2b2a28] transition hover:bg-[#faf8f5]"
            >
              Bookings
            </Link>
            <Link
              href="/admin/routes"
              className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]"
            >
              Routes
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Visible</div>
          <div className="mt-2 text-3xl font-semibold text-[#1f1e1b]">{tasks.length}</div>
        </div>
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Open</div>
          <div className="mt-2 text-3xl font-semibold text-[#8a6b20]">{openCount}</div>
        </div>
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Overdue</div>
          <div className="mt-2 text-3xl font-semibold text-red-700">{overdueCount}</div>
        </div>
        <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Completed</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">{completedCount}</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <h3 className="text-xl font-semibold text-[#1f1e1b]">Add task</h3>
            <p className="mt-1 text-sm leading-6 text-[#6c6258]">
              Быстро добавь напоминание по клиенту, бронированию или складу.
            </p>
          </div>

          <form action={createTaskAction} className="space-y-5 p-6">
            <Field label="Title">
              <Input name="title" placeholder="Follow up about deposit" required />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Type">
                <Select name="taskType" defaultValue="follow_up">
                  <option value="follow_up">Follow-up</option>
                  <option value="deposit">Deposit</option>
                  <option value="contract">Contract</option>
                  <option value="coi">COI / Insurance</option>
                  <option value="route">Route</option>
                  <option value="inventory">Inventory</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="review">Review request</option>
                </Select>
              </Field>
              <Field label="Customer">
                <CustomerSearchSelect customers={customers} />
              </Field>
            </div>

            <Field label="Booking">
              <BookingSearchSelect bookings={bookings} />
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Due date">
                <Input name="dueDate" type="date" defaultValue={dateInputValue(tomorrow)} />
              </Field>
              <Field label="Due time">
                <Input name="dueTime" type="time" defaultValue="09:00" />
              </Field>
            </div>

            <Field label="Description">
              <Textarea name="description" rows={4} placeholder="Notes for the team..." />
            </Field>

            <button className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#b78744]">
              Add task
            </button>
          </form>
        </section>

        <section className="rounded-[30px] border border-black/5 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.04)]">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[#1f1e1b]">Task list</h3>
                <p className="mt-1 text-sm leading-6 text-[#6c6258]">
                  Открытые задачи, просроченные follow-ups и завершенные действия.
                </p>
              </div>

              <form className="flex flex-wrap gap-2">
                <Select name="status" defaultValue={selectedStatus}>
                  <option value="open">Open</option>
                  <option value="completed">Completed</option>
                  <option value="all">All</option>
                </Select>
                <Select name="type" defaultValue={selectedType}>
                  <option value="all">All types</option>
                  <option value="follow_up">Follow-up</option>
                  <option value="deposit">Deposit</option>
                  <option value="contract">Contract</option>
                  <option value="coi">COI</option>
                  <option value="route">Route</option>
                  <option value="inventory">Inventory</option>
                  <option value="cleaning">Cleaning</option>
                  <option value="review">Review</option>
                </Select>
                <button className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d]">
                  Filter
                </button>
              </form>
            </div>
          </div>

          <div className="divide-y divide-[#eee5d9]">
            {tasks.map((task: any) => {
              const customer = task.customers || task.bookings?.customers;
              const overdue = isOverdue(task.due_at, task.status);

              return (
                <div key={task.id} className="px-6 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(task)}`}>
                          {task.status === "completed" ? "Completed" : overdue ? "Overdue" : "Open"}
                        </span>
                        <span className="rounded-full bg-[#f4ede2] px-3 py-1 text-xs font-semibold text-[#6c6258]">
                          {taskTypeLabel(task.task_type)}
                        </span>
                        <span className="text-xs font-semibold text-[#9a7a49]">
                          {formatDateTime(task.due_at)}
                        </span>
                      </div>

                      <div className="mt-3 text-base font-semibold text-[#1f1e1b]">
                        {task.title}
                      </div>

                      {task.description && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#6c6258]">
                          {task.description}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6c6258]">
                        {customer && (
                          <span>
                            Customer: {customer.full_name || customer.phone || "Customer"}
                          </span>
                        )}
                        {task.bookings?.id && (
                          <Link
                            href={`/admin/bookings/${task.bookings.id}`}
                            className="font-semibold text-[#355879] hover:underline"
                          >
                            {task.bookings.booking_number || "Open booking"}
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {task.status === "completed" ? (
                        <form action={reopenTaskAction}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <button className="rounded-full border border-[#d8cec0] bg-white px-4 py-2 text-xs font-semibold text-[#2b2a28] hover:bg-[#faf8f5]">
                            Reopen
                          </button>
                        </form>
                      ) : (
                        <form action={completeTaskAction}>
                          <input type="hidden" name="taskId" value={task.id} />
                          <button className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                            Complete
                          </button>
                        </form>
                      )}
                      <form action={deleteTaskAction}>
                        <input type="hidden" name="taskId" value={task.id} />
                        <button className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}

            {tasks.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-lg font-semibold text-[#1f1e1b]">No tasks</div>
                <p className="mt-2 text-sm text-[#6c6258]">
                  Add follow-up reminders for quotes, deposits, COI, cleaning or reviews.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

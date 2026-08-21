import { requireAdminPermission } from "@/lib/auth/require-admin";
import { getCurrentStaffAccess } from "@/lib/staff-access";
import {
  createOrUpdateStaffAction,
  deactivateStaffAction,
  sendStaffPasswordResetAction,
} from "./actions";

const META_START = "[[STAFF_META]]";
const META_END = "[[/STAFF_META]]";

const roleOptions = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "dispatcher", label: "Dispatcher" },
  { value: "cashier", label: "Cashier" },
  { value: "warehouse", label: "Warehouse" },
  { value: "content_manager", label: "Content Manager" },
  { value: "driver", label: "Driver" },
];

const defaultInterfaceOptions = [
  { value: "admin", label: "Admin" },
  { value: "driver", label: "Driver" },
  { value: "customer", label: "Customer" },
];

const permissionOptions = [
  { key: "dashboard.view", label: "Dashboard view" },
  { key: "bookings.view", label: "Bookings view" },
  { key: "bookings.create", label: "Bookings create" },
  { key: "bookings.edit", label: "Bookings edit" },
  { key: "bookings.cancel", label: "Bookings cancel" },
  { key: "bookings.archive", label: "Bookings archive" },
  { key: "bookings.restore", label: "Bookings restore" },
  { key: "bookings.view_financials", label: "Bookings financials" },
  { key: "bookings.view_internal_notes", label: "Bookings internal notes" },
  { key: "routes.view", label: "Routes view" },
  { key: "routes.create", label: "Routes create" },
  { key: "routes.edit", label: "Routes edit" },
  { key: "routes.assign_driver", label: "Routes assign driver" },
  { key: "routes.reorder", label: "Routes reorder" },
  { key: "customers.view", label: "Customers view" },
  { key: "customers.edit", label: "Customers edit" },
  { key: "customers.view_contact_data", label: "Customers contact data" },
  { key: "payments.view", label: "Payments view" },
  { key: "payments.create", label: "Payments create" },
  { key: "payments.edit", label: "Payments edit" },
  { key: "contracts.view", label: "Contracts view" },
  { key: "contracts.edit", label: "Contracts edit" },
  { key: "contracts.send", label: "Contracts send" },
  { key: "catalog.view", label: "Catalog view" },
  { key: "catalog.create", label: "Catalog create" },
  { key: "catalog.edit", label: "Catalog edit" },
  { key: "catalog.publish", label: "Catalog publish" },
  { key: "inventory.view", label: "Inventory view" },
  { key: "inventory.edit", label: "Inventory edit" },
  { key: "inventory.mark_dirty", label: "Inventory mark dirty" },
  { key: "inventory.mark_damaged", label: "Inventory mark damaged" },
  { key: "inventory.mark_missing", label: "Inventory mark missing" },
  { key: "staff.view", label: "Staff view" },
  { key: "staff.create", label: "Staff create" },
  { key: "staff.edit", label: "Staff edit" },
  { key: "staff.disable", label: "Staff disable" },
  { key: "roles.view", label: "Roles view" },
  { key: "roles.edit", label: "Roles edit" },
  { key: "roles.assign", label: "Roles assign" },
  { key: "reports.view", label: "Reports view" },
  { key: "reports.financial", label: "Reports financial" },
  { key: "preview.customer", label: "Customer preview" },
  { key: "preview.driver", label: "Driver preview" },
  { key: "settings.view", label: "Settings view" },
  { key: "settings.edit", label: "Settings edit" },
];

const legacyPermissionMap: Record<string, string[]> = {
  routes_board: ["dashboard.view", "routes.view", "routes.edit", "routes.assign_driver", "preview.driver"],
  driver_checklists: ["routes.view", "preview.driver"],
  bookings: ["bookings.view", "bookings.create", "bookings.edit", "customers.view"],
  catalog: ["catalog.view", "catalog.edit", "catalog.publish"],
  inventory: ["inventory.view", "inventory.edit", "inventory.mark_dirty", "inventory.mark_damaged", "inventory.mark_missing"],
  reports: ["reports.view", "reports.financial"],
  settings: ["settings.view", "settings.edit", "staff.view", "staff.create", "staff.edit", "roles.view"],
};

function defaultInterfaceForRole(role: string) {
  if (role === "driver") return "driver";
  if (role === "customer") return "customer";
  return "admin";
}

function isMissingColumnError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return (
    code === "42703" ||
    message.includes("column") ||
    message.includes("does not exist")
  );
}

async function fetchStaffRows(supabase: any) {
  const selectVariants = [
    "id, name, color, phone, account_email, auth_user_id, notes, active, deleted_at, sort_order",
    "id, name, color, phone, notes, active, deleted_at, sort_order",
    "id, name, color, phone, active, sort_order",
    "id, name, color, active, sort_order",
    "id, name, color",
  ];

  for (const selectClause of selectVariants) {
    const result = await supabase
      .from("route_drivers")
      .select(selectClause)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!result.error) {
      return result.data || [];
    }

    if (!isMissingColumnError(result.error)) {
      throw new Error(result.error.message);
    }
  }

  // Last resort: query without optional filters in case active/sort columns are also unavailable.
  const fallbackResult = await supabase
    .from("route_drivers")
    .select("id, name, color");

  if (fallbackResult.error) {
    throw new Error(fallbackResult.error.message);
  }

  return fallbackResult.data || [];
}

function parseStaffMeta(notes: string | null | undefined) {
  const raw = String(notes || "");
  const start = raw.indexOf(META_START);
  const end = raw.indexOf(META_END);

  if (start === -1 || end === -1 || end < start) {
    return {
      role: "driver",
      permissions: ["routes_board", "driver_checklists"],
      plainNotes: raw,
    };
  }

  const jsonStart = start + META_START.length;
  const rawJson = raw.slice(jsonStart, end);
  let role = "driver";
  let permissions: string[] = ["routes_board", "driver_checklists"];
  let appPermissions: string[] = [];
  let deniedPermissions: string[] = [];
  let defaultInterface = "driver";

  try {
    const parsed = JSON.parse(rawJson);
    role = typeof parsed?.role === "string" ? parsed.role : role;
    permissions = Array.isArray(parsed?.permissions)
      ? parsed.permissions.map((item: any) => String(item || "")).filter(Boolean)
      : permissions;
    appPermissions = Array.isArray(parsed?.appPermissions)
      ? parsed.appPermissions.map((item: any) => String(item || "")).filter(Boolean)
      : permissions.flatMap((permission) => legacyPermissionMap[permission] || []);
    deniedPermissions = Array.isArray(parsed?.deniedPermissions)
      ? parsed.deniedPermissions.map((item: any) => String(item || "")).filter(Boolean)
      : [];
    defaultInterface =
      parsed?.defaultInterface === "admin" ||
      parsed?.defaultInterface === "driver" ||
      parsed?.defaultInterface === "customer"
        ? parsed.defaultInterface
        : defaultInterfaceForRole(role);
  } catch {
    // Ignore invalid meta payload and use defaults.
    appPermissions = permissions.flatMap((permission) => legacyPermissionMap[permission] || []);
    defaultInterface = defaultInterfaceForRole(role);
  }

  const before = raw.slice(0, start).trim();
  const after = raw.slice(end + META_END.length).trim();
  const plainNotes = [before, after].filter(Boolean).join("\n\n");

  return {
    role,
    permissions,
    appPermissions,
    deniedPermissions,
    defaultInterface,
    plainNotes,
  };
}

export default async function AdminStaffPage() {
  const { supabase } = await requireAdminPermission("staff.view");
  const access = await getCurrentStaffAccess(supabase);

  if (!access.can("settings")) {
    return (
      <div className="space-y-6">
        <section className="rounded-[30px] border border-red-200 bg-white p-6 shadow-[0_10px_35px_rgba(0,0,0,0.035)]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
            Access denied
          </div>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
            Staff
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
            You do not have permission to manage staff profiles.
            {access.enforceRbac
              ? " Ask an admin to grant the Settings permission in Staff access controls."
              : ""}
          </p>
        </section>
      </div>
    );
  }

  const rows = await fetchStaffRows(supabase);

  const staff = rows
    .filter((item: any) => (item.active === undefined ? true : Boolean(item.active)))
    .map((item: any) => ({
    ...item,
    phone: item.phone || null,
    account_email: item.account_email || null,
    auth_user_id: item.auth_user_id || null,
    notes: item.notes || null,
    sort_order: Number(item.sort_order || 100),
    profile: parseStaffMeta(item.notes),
  }));

    return (
      <div className="space-y-4 pb-28 sm:space-y-6 sm:pb-0">
        <section className="rounded-[22px] border border-black/5 bg-white p-4 shadow-[0_10px_35px_rgba(0,0,0,0.035)] sm:rounded-[30px] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
                Team management
              </div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#1f1e1b] sm:text-3xl">
                Staff
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
                Roles, contacts, marker colors and access scopes for routes, bookings and operations.
              </p>
            </div>

            <a
              href="/admin/routes"
              className="w-full rounded-full bg-[#23313f] px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-[#18222d] sm:w-auto"
            >
              Open routes board
            </a>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="rounded-[18px] border border-black/5 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.035)] sm:rounded-[24px] sm:p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a723e] sm:text-xs sm:tracking-[0.16em]">Active</div>
            <div className="mt-1 text-2xl font-semibold text-[#1f1e1b] sm:mt-2 sm:text-3xl">{staff.length}</div>
          </div>

          <div className="rounded-[18px] border border-black/5 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.035)] sm:rounded-[24px] sm:p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a723e] sm:text-xs sm:tracking-[0.16em]">Drivers</div>
            <div className="mt-1 text-2xl font-semibold text-[#1f1e1b] sm:mt-2 sm:text-3xl">
              {staff.filter((member: any) => member.profile.role === "driver").length}
            </div>
          </div>

          <div className="rounded-[18px] border border-black/5 bg-white p-3 shadow-[0_10px_30px_rgba(0,0,0,0.035)] sm:rounded-[24px] sm:p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a723e] sm:text-xs sm:tracking-[0.16em]">Admin</div>
            <div className="mt-1 text-2xl font-semibold text-[#1f1e1b] sm:mt-2 sm:text-3xl">
              {
                staff.filter((member: any) => ["dispatcher", "manager", "admin"].includes(member.profile.role))
                  .length
              }
            </div>
          </div>
        </section>

      <section className="space-y-4">
        {staff.map((member: any) => {
          const selectedPermissions = new Set(member.profile.appPermissions || []);
          const deniedPermissions = new Set(member.profile.deniedPermissions || []);

            return (
              <details
                key={member.id}
                className="group overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-[0_12px_35px_rgba(0,0,0,0.04)] sm:rounded-[28px]"
              >
                <summary className="cursor-pointer list-none px-4 py-4 sm:px-6 sm:py-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: member.color || "#23313f" }}
                        />
                        <div className="truncate text-lg font-semibold text-[#1f1e1b]">
                          {member.name || "Unnamed employee"}
                        </div>
                      </div>

                      <div className="mt-1 text-sm capitalize text-[#7b7168]">
                        {String(member.profile.role || "driver").replace(/_/g, " ")}
                        {" · "}
                        {member.profile.defaultInterface || defaultInterfaceForRole(member.profile.role || "driver")} interface
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#8b8177]">
                        {member.phone ? <span>{member.phone}</span> : null}
                        {member.account_email ? <span>{member.account_email}</span> : null}
                        {!member.phone && !member.account_email ? <span>No contact details</span> : null}
                      </div>
                    </div>

                    <div className="shrink-0 rounded-full bg-[#f4ede2] px-3 py-2 text-xs font-semibold text-[#6c6258] group-open:bg-[#23313f] group-open:text-white">
                      <span className="group-open:hidden">Edit</span>
                      <span className="hidden group-open:inline">Close</span>
                    </div>
                  </div>
                </summary>

                <form
                  action={createOrUpdateStaffAction}
                  className="border-t border-[#eee5d9] bg-[#fcfaf7] p-3 sm:p-6"
                >
                  <input type="hidden" name="driverId" value={member.id} />

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Full name</span>
                      <input name="name" defaultValue={member.name || ""} className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3" required />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Phone</span>
                      <input name="phone" defaultValue={member.phone || ""} className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3" />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Account email</span>
                      <input name="accountEmail" type="email" defaultValue={member.account_email || ""} className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3" />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Auth user id</span>
                      <input name="authUserId" defaultValue={member.auth_user_id || ""} className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-[#faf8f5] px-3 py-2.5 font-mono text-[11px] text-[#6c6258] sm:rounded-2xl sm:px-4 sm:py-3" />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Marker color</span>
                      <input name="color" type="color" defaultValue={member.color || "#23313f"} className="h-11 w-full rounded-xl border border-[#d8cec0] bg-white px-2 sm:h-[50px] sm:rounded-2xl" />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Sort order</span>
                      <input name="sortOrder" type="number" defaultValue={member.sort_order || 100} className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3" />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Role / Position</span>
                      <select name="role" defaultValue={member.profile.role || "driver"} className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3">
                        {roleOptions.map((role) => (
                          <option key={`${member.id}-${role.value}`} value={role.value}>{role.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Default interface</span>
                      <select name="defaultInterface" defaultValue={member.profile.defaultInterface || defaultInterfaceForRole(member.profile.role || "driver")} className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3">
                        {defaultInterfaceOptions.map((option) => (
                          <option key={`${member.id}-${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block md:col-span-2 xl:col-span-4">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Personal notes</span>
                      <input name="plainNotes" defaultValue={member.profile.plainNotes || ""} className="w-full min-w-0 rounded-xl border border-[#d8cec0] bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3" />
                    </label>
                  </div>

                  <details className="mt-4 overflow-hidden rounded-2xl border border-[#e7ded3] bg-white">
                    <summary className="cursor-pointer list-none px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-[#1f1e1b]">Access permissions</div>
                          <div className="mt-0.5 text-xs text-[#7b7168]">{selectedPermissions.size} granted · {deniedPermissions.size} denied</div>
                        </div>
                        <span className="text-xs font-semibold text-[#23313f]">Manage ›</span>
                      </div>
                    </summary>

                    <div className="border-t border-[#eee5d9] bg-[#fcfaf7] p-3 sm:p-4">
                      <div className="text-sm font-semibold text-[#1f1e1b]">Permission grants</div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {permissionOptions.map((permission) => (
                          <label key={`${member.id}-${permission.key}`} className="flex items-center gap-2 rounded-xl border border-[#e8ddce] bg-white px-3 py-2 text-xs text-[#3d352d] sm:text-sm">
                            <input type="checkbox" name={`grant_${permission.key}`} defaultChecked={selectedPermissions.has(permission.key)} className="h-4 w-4" />
                            {permission.label}
                          </label>
                        ))}
                      </div>

                      <div className="mt-5 text-sm font-semibold text-[#1f1e1b]">Permission denies</div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {permissionOptions.map((permission) => (
                          <label key={`${member.id}-deny-${permission.key}`} className="flex items-center gap-2 rounded-xl border border-[#f0d3cf] bg-white px-3 py-2 text-xs text-[#733d36] sm:text-sm">
                            <input type="checkbox" name={`deny_${permission.key}`} defaultChecked={deniedPermissions.has(permission.key)} className="h-4 w-4" />
                            {permission.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </details>

                  <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
                    <button type="submit" className="w-full rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white sm:w-auto sm:py-2.5">Save profile</button>
                    <button type="submit" formAction={sendStaffPasswordResetAction} className="w-full rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white sm:w-auto sm:py-2.5">Send password reset</button>
                    <button type="submit" formAction={deactivateStaffAction} className="w-full rounded-full border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 sm:w-auto sm:py-2.5">Deactivate</button>
                  </div>
                </form>
              </details>
            );
        })}
      </section>

      <section className="rounded-[30px] border border-[#e7d8bf] bg-[#fff8e8] p-6 shadow-[0_12px_35px_rgba(0,0,0,0.03)]">
        <h3 className="text-xl font-semibold text-[#1f1e1b]">Add staff member</h3>
        <p className="mt-1 text-sm text-[#6c6258]">
          Creates a profile used in routes and operations. Then send password reset to set login password.
        </p>

        <form action={createOrUpdateStaffAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            name="name"
            placeholder="Full name"
            className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            required
          />
          <input
            name="phone"
            placeholder="Phone"
            className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
          />
          <input
            name="accountEmail"
            type="email"
            placeholder="Account email"
            className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
          />
          <input
            name="authUserId"
            placeholder="Auth user id"
            className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
          />
          <input
            name="sortOrder"
            type="number"
            defaultValue="100"
            className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
          />
          <input
            name="color"
            type="color"
            defaultValue="#23313f"
            className="h-[50px] rounded-2xl border border-[#d8cec0] bg-white px-2"
          />
          <select
            name="role"
            defaultValue="driver"
            className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
          >
            {roleOptions.map((role) => (
              <option key={`new-${role.value}`} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
            <select
              name="defaultInterface"
              defaultValue="driver"
              className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
            >
              {defaultInterfaceOptions.map((option) => (
                <option key={`new-interface-${option.value}`} value={option.value}>
                  {option.label} interface
                </option>
              ))}
            </select>
          <input
            name="plainNotes"
            placeholder="Notes"
            className="rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm"
          />

            <div className="md:col-span-2 xl:col-span-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {permissionOptions.map((permission) => (
              <label
                key={`new-${permission.key}`}
                className="flex items-center gap-2 rounded-xl border border-[#e8ddce] bg-white px-3 py-2 text-sm text-[#3d352d]"
              >
                <input
                  type="checkbox"
                    name={`grant_${permission.key}`}
                  defaultChecked={
                      ["routes.view", "preview.driver"].includes(permission.key)
                  }
                  className="h-4 w-4"
                />
                {permission.label}
              </label>
            ))}
          </div>

            <div className="md:col-span-2 xl:col-span-5 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {permissionOptions.map((permission) => (
                <label
                  key={`new-deny-${permission.key}`}
                  className="flex items-center gap-2 rounded-xl border border-[#f0d3cf] bg-white px-3 py-2 text-sm text-[#733d36]"
                >
                  <input
                    type="checkbox"
                    name={`deny_${permission.key}`}
                    className="h-4 w-4"
                  />
                  Deny {permission.label}
                </label>
              ))}
            </div>

          <button
            type="submit"
              className="rounded-full bg-[#c9964f] px-5 py-3 text-sm font-semibold text-white xl:col-span-5"
          >
            Add staff member
          </button>
        </form>
      </section>
    </div>
  );
}

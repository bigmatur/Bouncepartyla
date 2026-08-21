import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import {
  ACCESS_MATRIX_ROLES,
  fetchAccessAuditLog,
  fetchManagedRoles,
  fetchManagedUsers,
  formatDateTime,
  getAllRoleOptions,
  getPermissionLabel,
  getRoleLabel,
} from "@/lib/admin/access-management";
import {
  INTERFACE_LABELS,
  SYSTEM_PERMISSIONS,
  getUnifiedAccess,
} from "@/lib/auth/access";
import {
  cloneRoleAction,
  deleteRoleAction,
  updatePermissionMatrixAction,
  updateUserAccessAction,
  upsertRoleAction,
} from "./actions";

type AccessTab = "roles" | "users" | "matrix" | "audit";

function parseTab(value?: string): AccessTab {
  if (value === "roles" || value === "users" || value === "matrix" || value === "audit") {
    return value;
  }

  return "roles";
}

function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_12px_35px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </section>
  );
}

function TabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full px-4 py-2 text-sm font-semibold transition",
        active
          ? "bg-[#111111] text-white shadow-sm"
          : "border border-[#d9d0c6] bg-white/85 text-[#3a342d] hover:bg-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default async function AdminAccessPage(props: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const activeTab = parseTab(searchParams.tab);
  const supabase = await createClient();
  const access = await getUnifiedAccess(supabase);

  if (!access.user || !access.isActive || (!access.can("roles.view") && !access.can("roles.assign") && !access.can("staff.view"))) {
    return (
      <div className="space-y-6">
        <Surface>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
            Access denied
          </div>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
            Roles & access
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6c6258]">
            You need role visibility or assignment permissions to open this section.
          </p>
        </Surface>
      </div>
    );
  }

  const [roles, users, auditLog] = await Promise.all([
    fetchManagedRoles(supabase),
    fetchManagedUsers(supabase),
    fetchAccessAuditLog(supabase),
  ]);

  const roleOptions = getAllRoleOptions(roles);
  const roleMap = new Map(roles.map((role) => [role.key, role]));
  const canEditRoles = access.can("roles.edit");
  const canAssignRoles = access.can("roles.assign");

  return (
    <div className="space-y-6">
      <Surface>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a723e]">
              Security & operations
            </div>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-[#1f1e1b]">
              Roles & access
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Manage system roles, custom roles, employee assignments, permission overrides and the audit trail for access changes.
            </p>
          </div>

          <div className="grid min-w-[240px] gap-3 sm:grid-cols-2">
            <div className="rounded-[22px] bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Roles</div>
              <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">{roles.length}</div>
            </div>
            <div className="rounded-[22px] bg-[#fcfaf7] p-4 ring-1 ring-[#eee5d9]">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#9a723e]">Employees</div>
              <div className="mt-2 text-2xl font-semibold text-[#1f1e1b]">{users.length}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <TabLink href="/admin/access?tab=roles" label="Roles" active={activeTab === "roles"} />
          <TabLink href="/admin/access?tab=users" label="Users" active={activeTab === "users"} />
          <TabLink href="/admin/access?tab=matrix" label="Permission Matrix" active={activeTab === "matrix"} />
          <TabLink href="/admin/access?tab=audit" label="Audit Log" active={activeTab === "audit"} />
        </div>
      </Surface>

      {activeTab === "roles" && (
        <div className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Surface>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                    Create custom role
                  </div>
                  <h3 className="mt-1 text-xl font-semibold text-[#1f1e1b]">New role</h3>
                </div>
                <div className="rounded-full bg-[#f4ecdf] px-3 py-1 text-xs font-semibold text-[#8e6833]">
                  Custom
                </div>
              </div>

              <form action={upsertRoleAction} className="mt-5 space-y-5">
                <input type="hidden" name="tab" value="roles" />
                <input type="hidden" name="isSystem" value="false" />

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Role key</span>
                    <input name="roleKey" className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" placeholder="ops_coordinator" disabled={!canEditRoles} required />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Role name</span>
                    <input name="roleName" className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" placeholder="Ops Coordinator" disabled={!canEditRoles} required />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Description</span>
                  <textarea name="roleDescription" className="min-h-[96px] w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" placeholder="Describe the scope of this custom role." disabled={!canEditRoles} />
                </label>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Interfaces</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {Object.entries(INTERFACE_LABELS).map(([key, label]) => (
                      <label key={key} className="inline-flex items-center gap-2 rounded-full border border-[#e6dccf] px-3 py-2 text-sm text-[#3a342d]">
                        <input type="checkbox" name="interfaces" value={key} defaultChecked={key === "admin"} disabled={!canEditRoles} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Permissions</div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {SYSTEM_PERMISSIONS.map((permission) => (
                      <label key={permission} className="flex items-start gap-2 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-3 py-3 text-sm text-[#3a342d]">
                        <input type="checkbox" name="permissions" value={permission} disabled={!canEditRoles} className="mt-1" />
                        <span>{getPermissionLabel(permission)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={!canEditRoles} className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-50">
                  Create custom role
                </button>
              </form>
            </Surface>

            <Surface>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">
                Clone existing role
              </div>
              <h3 className="mt-1 text-xl font-semibold text-[#1f1e1b]">Copy permissions from a live role</h3>

              <form action={cloneRoleAction} className="mt-5 space-y-4">
                <input type="hidden" name="tab" value="roles" />

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Source role</span>
                  <select name="sourceKey" className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" disabled={!canEditRoles} defaultValue={roles[0]?.key || ""}>
                    {roleOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Cloned role key</span>
                  <input name="clonedRoleKey" className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" placeholder="dispatcher_lite" disabled={!canEditRoles} required />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Cloned role name</span>
                  <input name="clonedRoleName" className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" placeholder="Dispatcher Lite" disabled={!canEditRoles} required />
                </label>

                <button type="submit" disabled={!canEditRoles} className="rounded-full border border-[#d9d0c6] bg-white px-5 py-3 text-sm font-semibold text-[#3a342d] transition hover:bg-[#f8f4ee] disabled:cursor-not-allowed disabled:opacity-50">
                  Clone role
                </button>
              </form>
            </Surface>
          </div>

          <div className="space-y-4">
            {roles.map((role) => (
              <Surface key={role.key}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-semibold text-[#1f1e1b]">{role.name}</h3>
                      <span className={["rounded-full px-3 py-1 text-xs font-semibold", role.isSystem ? "bg-[#23313f] text-white" : "bg-[#f4ecdf] text-[#8e6833]"].join(" ")}>{role.isSystem ? "System role" : "Custom role"}</span>
                    </div>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">{role.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#7a7066]">
                      <span className="rounded-full bg-[#f7f1e8] px-3 py-1">{role.userCount} users</span>
                      {role.interfaces.map((value) => (
                        <span key={value} className="rounded-full bg-[#eef4f8] px-3 py-1 text-[#355879]">{INTERFACE_LABELS[value]}</span>
                      ))}
                    </div>
                  </div>

                  {!role.isSystem && (
                    <form action={deleteRoleAction}>
                      <input type="hidden" name="tab" value="roles" />
                      <input type="hidden" name="roleKey" value={role.key} />
                      <button type="submit" disabled={!canEditRoles} className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                        Delete role
                      </button>
                    </form>
                  )}
                </div>

                <form action={upsertRoleAction} className="mt-5 space-y-5">
                  <input type="hidden" name="tab" value="roles" />
                  <input type="hidden" name="originalKey" value={role.key} />
                  <input type="hidden" name="roleKey" value={role.key} />
                  <input type="hidden" name="isSystem" value={role.isSystem ? "true" : "false"} />

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Role name</span>
                      <input name="roleName" defaultValue={role.name} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" disabled={!canEditRoles} required />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Role key</span>
                      <input value={role.key} readOnly className="w-full rounded-2xl border border-[#e5ddd0] bg-[#f8f4ee] px-4 py-3 text-sm text-[#7b7268]" />
                    </label>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Description</span>
                    <textarea name="roleDescription" defaultValue={role.description} className="min-h-[96px] w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" disabled={!canEditRoles} />
                  </label>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Interfaces</div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {Object.entries(INTERFACE_LABELS).map(([key, label]) => (
                        <label key={key} className="inline-flex items-center gap-2 rounded-full border border-[#e6dccf] px-3 py-2 text-sm text-[#3a342d]">
                          <input type="checkbox" name="interfaces" value={key} defaultChecked={role.interfaces.includes(key as keyof typeof INTERFACE_LABELS)} disabled={!canEditRoles} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Permissions</div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {SYSTEM_PERMISSIONS.map((permission) => (
                        <label key={`${role.key}-${permission}`} className="flex items-start gap-2 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-3 py-3 text-sm text-[#3a342d]">
                          <input type="checkbox" name="permissions" value={permission} defaultChecked={role.permissions.includes(permission)} disabled={!canEditRoles} className="mt-1" />
                          <span>{getPermissionLabel(permission)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <button type="submit" disabled={!canEditRoles} className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-50">
                    Save role
                  </button>
                </form>
              </Surface>
            ))}
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-4">
          {users.map((user) => (
            <Surface key={`${user.authUserId || "no-auth"}-${user.driverId || user.name}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-semibold text-[#1f1e1b]">{user.name}</h3>
                    <span className={["rounded-full px-3 py-1 text-xs font-semibold", user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"].join(" ")}>{user.status}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#6c6258]">
                    <span>{user.email || "No email linked"}</span>
                    <span>Last login: {formatDateTime(user.lastLoginAt)}</span>
                    <span>Default interface: {INTERFACE_LABELS[user.defaultInterface]}</span>
                  </div>
                </div>

                <div className="rounded-[20px] bg-[#fcfaf7] px-4 py-3 text-sm text-[#6c6258] ring-1 ring-[#eee5d9]">
                  {user.authUserId ? "Linked to auth account" : "Profile stored via staff record only"}
                </div>
              </div>

              <form action={updateUserAccessAction} className="mt-5 space-y-5">
                <input type="hidden" name="tab" value="users" />
                <input type="hidden" name="authUserId" value={user.authUserId || ""} />
                <input type="hidden" name="driverId" value={user.driverId || ""} />
                <input type="hidden" name="name" value={user.name} />
                <input type="hidden" name="email" value={user.email || ""} />

                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Primary role</span>
                    <select name="primaryRole" defaultValue={user.primaryRole} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" disabled={!canAssignRoles}>
                      {roleOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Additional roles</span>
                    <select name="additionalRoles" defaultValue={user.additionalRoles} multiple className="min-h-[136px] w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" disabled={!canAssignRoles}>
                      {roleOptions.map((option) => (
                        <option key={`${user.name}-${option.value}`} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Default interface</span>
                    <select name="defaultInterface" defaultValue={user.defaultInterface} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" disabled={!canAssignRoles}>
                      {Object.entries(INTERFACE_LABELS).map(([key, label]) => (
                        <option key={`${user.name}-${key}`} value={key}>{label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Account status</span>
                    <select name="isActive" defaultValue={user.isActive ? "true" : "false"} className="w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" disabled={!canAssignRoles}>
                      <option value="true">Active</option>
                      <option value="false">Disabled</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Profile notes</span>
                  <textarea name="plainNotes" defaultValue={user.plainNotes} className="min-h-[88px] w-full rounded-2xl border border-[#d8cec0] bg-white px-4 py-3 text-sm" disabled={!canAssignRoles} />
                </label>

                <div className="grid gap-5 xl:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Individual permissions</div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {SYSTEM_PERMISSIONS.map((permission) => (
                        <label key={`${user.name}-grant-${permission}`} className="flex items-start gap-2 rounded-2xl border border-[#eee5d9] bg-[#fcfaf7] px-3 py-3 text-sm text-[#3a342d]">
                          <input type="checkbox" name="permissions" value={permission} defaultChecked={user.grantedPermissions.includes(permission)} disabled={!canAssignRoles} className="mt-1" />
                          <span>{getPermissionLabel(permission)}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[#9a7a49]">Explicit denies</div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {SYSTEM_PERMISSIONS.map((permission) => (
                        <label key={`${user.name}-deny-${permission}`} className="flex items-start gap-2 rounded-2xl border border-[#eee5d9] bg-[#fff6f4] px-3 py-3 text-sm text-[#3a342d]">
                          <input type="checkbox" name="deniedPermissions" value={permission} defaultChecked={user.deniedPermissions.includes(permission)} disabled={!canAssignRoles} className="mt-1" />
                          <span>{getPermissionLabel(permission)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={!canAssignRoles} className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-50">
                  Save user access
                </button>
              </form>
            </Surface>
          ))}
        </div>
      )}

      {activeTab === "matrix" && (
        <Surface className="overflow-hidden p-0">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Permission Matrix</div>
            <h3 className="mt-1 text-xl font-semibold text-[#1f1e1b]">System role permission table</h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#6c6258]">
              Toggle access for the core system roles. Custom roles are edited on the Roles tab.
            </p>
          </div>

          <form action={updatePermissionMatrixAction}>
            <input type="hidden" name="tab" value="matrix" />

            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full text-left text-sm">
                <thead className="bg-[#fcfaf7] text-[#3a342d]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Permission</th>
                    {ACCESS_MATRIX_ROLES.map((roleKey) => (
                      <th key={roleKey} className="px-4 py-3 font-semibold">{getRoleLabel(roleKey)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SYSTEM_PERMISSIONS.map((permission) => (
                    <tr key={permission} className="border-t border-[#f0e6da] align-top">
                      <td className="px-4 py-3 font-medium text-[#1f1e1b]">{getPermissionLabel(permission)}</td>
                      {ACCESS_MATRIX_ROLES.map((roleKey) => {
                        const role = roleMap.get(roleKey);

                        return (
                          <td key={`${permission}-${roleKey}`} className="px-4 py-3 text-center">
                            <input type="checkbox" name={`matrix:${roleKey}:${permission}`} value="on" defaultChecked={role?.permissions.includes(permission)} disabled={!canEditRoles} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-[#eee5d9] px-6 py-5">
              <button type="submit" disabled={!canEditRoles} className="rounded-full bg-[#23313f] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#18222d] disabled:cursor-not-allowed disabled:opacity-50">
                Save permission matrix
              </button>
            </div>
          </form>
        </Surface>
      )}

      {activeTab === "audit" && (
        <Surface className="overflow-hidden p-0">
          <div className="border-b border-[#eee5d9] px-6 py-5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9a723e]">Audit Log</div>
            <h3 className="mt-1 text-xl font-semibold text-[#1f1e1b]">Role and permission history</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-[#fcfaf7] text-[#3a342d]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Who changed</th>
                  <th className="px-4 py-3 font-semibold">Who changed for</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                  <th className="px-4 py-3 font-semibold">Permission</th>
                  <th className="px-4 py-3 font-semibold">Old value</th>
                  <th className="px-4 py-3 font-semibold">New value</th>
                  <th className="px-4 py-3 font-semibold">Date / time</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id} className="border-t border-[#f0e6da] align-top">
                    <td className="px-4 py-3 text-[#1f1e1b]">
                      <div className="font-semibold">{entry.actorName}</div>
                      <div className="text-xs text-[#8b8177]">{entry.actorEmail || "No email"}</div>
                    </td>
                    <td className="px-4 py-3 text-[#1f1e1b]">
                      <div className="font-semibold">{entry.targetName}</div>
                      <div className="text-xs text-[#8b8177]">{entry.targetEmail || entry.targetRole || "Role update"}</div>
                    </td>
                    <td className="px-4 py-3 text-[#3a342d]">{entry.action.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3 text-[#3a342d]">{entry.permissionKey || "-"}</td>
                    <td className="px-4 py-3 text-[#6c6258]">{entry.oldValue || "-"}</td>
                    <td className="px-4 py-3 text-[#6c6258]">{entry.newValue || "-"}</td>
                    <td className="px-4 py-3 text-[#3a342d]">{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {auditLog.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-[#6c6258]">
              No audit entries yet. Apply the latest migration and make a role change to start the log.
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
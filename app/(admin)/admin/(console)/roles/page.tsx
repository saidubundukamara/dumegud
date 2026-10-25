import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/admin/Badge";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Field } from "@/components/ui/Field";
import { ADMIN_PERMISSIONS, ALL_ADMIN_PERMISSIONS, type AdminPermission } from "@/lib/admin-permissions";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm } from "@/app/(admin)/admin/action-form";
import { createRole, deleteRole, updateRole } from "./actions";

export const metadata: Metadata = { title: "Roles" };

const GROUPS = [...new Set(ALL_ADMIN_PERMISSIONS.map((p) => ADMIN_PERMISSIONS[p].group))];

export default function RolesPage() {
  return (
    <AdminPage
      title="Roles"
      description="A role is a set of permissions, and an admin can hold several. Changes apply on their next click. You can add or remove only permissions you hold yourself."
    >
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <Roles />
      </Suspense>
    </AdminPage>
  );
}

/** Permissions you don't hold are shown but can't be changed (the service refuses them anyway). */
function PermissionChecks({ checked, grantable, disabled }: { checked: Set<string>; grantable: (p: AdminPermission) => boolean; disabled?: boolean }) {
  return (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {GROUPS.map((group) => (
        <fieldset key={group} className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[0.8125rem] font-semibold">{group}</legend>
          {ALL_ADMIN_PERMISSIONS.filter((p) => ADMIN_PERMISSIONS[p].group === group).map((p) => {
            const locked = disabled || !grantable(p);
            return (
              <label key={p} className={`flex items-start gap-2 text-sm ${locked ? "text-muted" : ""}`} title={p}>
                <input type="checkbox" name="permission" value={p} defaultChecked={checked.has(p)} disabled={locked} className="mt-0.5 size-4 shrink-0 accent-primary" />
                {/* A disabled box isn't submitted: keep what the role already holds. */}
                {locked && checked.has(p) && !disabled ? <input type="hidden" name="permission" value={p} /> : null}
                {ADMIN_PERMISSIONS[p].label}
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

async function Roles() {
  const { actor } = await requirePermission("roles.manage");
  const roles = await services.adminAccounts.listRoles(actor);
  const grantable = (p: AdminPermission) => can(actor, p);
  return (
    <div className="flex flex-col gap-4">
      {roles.map((role) => {
        const readOnly = role.isSystem || (!actor.superAdmin && actor.roles.includes(role.key));
        return (
          <Section
            key={role.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {role.name}
                <Badge>{role.members === 1 ? "1 admin" : `${role.members} admins`}</Badge>
                {role.isSystem ? <Badge tone="primary">Built in</Badge> : null}
              </span>
            }
            description={role.isSystem ? "Every permission, now and in future. It can’t be changed." : role.description || undefined}
          >
            {role.isSystem ? (
              <p className="text-sm text-muted">There’s always at least one active super admin.</p>
            ) : readOnly ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">You hold this role, so another admin has to change it.</p>
                <PermissionChecks checked={new Set(role.permissions)} grantable={grantable} disabled />
              </div>
            ) : (
              <details className="group">
                <summary className="w-fit cursor-pointer select-none text-sm font-medium text-muted hover:text-text">
                  {role.permissions.length} {role.permissions.length === 1 ? "permission" : "permissions"} · <span className="group-open:hidden">edit</span>
                  <span className="hidden group-open:inline">close</span>
                </summary>
                <div className="mt-4 flex flex-col gap-4">
                  <ActionForm action={updateRole} hidden={{ roleId: role.id }} label="Save role">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field compact name="name" label="Name" defaultValue={role.name} required maxLength={60} />
                      <Field compact name="description" label="What it’s for" defaultValue={role.description} maxLength={200} />
                    </div>
                    <PermissionChecks checked={new Set(role.permissions)} grantable={grantable} />
                  </ActionForm>
                  {role.members === 0 ? (
                    <ActionForm
                      action={deleteRole}
                      hidden={{ roleId: role.id }}
                      label="Delete role"
                      variant="ghost"
                      confirm={{ title: `Delete ${role.name}?`, body: "No one holds it, so no one loses access. This can’t be undone.", danger: true, confirmLabel: "Delete" }}
                    />
                  ) : null}
                </div>
              </details>
            )}
          </Section>
        );
      })}

      <Section title="New role">
        <ActionForm action={createRole} hidden={{}} label="Create role" variant="primary">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field compact name="key" label="Key" placeholder="payouts_reviewer" hint="Lowercase letters, digits and underscores." required className="[&_input]:font-mono" />
            <Field compact name="name" label="Name" required maxLength={60} />
            <Field compact name="description" label="What it’s for" maxLength={200} />
          </div>
          <PermissionChecks checked={new Set()} grantable={grantable} />
        </ActionForm>
      </Section>
    </div>
  );
}

import { UserGearIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Field } from "@/components/ui/Field";
import { formatDateTime, formatRelative } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { ActionForm } from "@/app/(admin)/admin/action-form";
import { inviteAdmin, revokeAdminInvite } from "./actions";
import { RoleChecks } from "./role-checks";

export const metadata: Metadata = { title: "Admins" };

export default function AdminsPage() {
  return (
    <AdminPage
      title="Admins"
      description="Staff accounts, separate from creator accounts. You can grant only roles whose permissions you hold, no one changes their own access, and there’s always an active super admin."
    >
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Admins />
      </Suspense>
    </AdminPage>
  );
}

async function Admins() {
  const { actor } = await requirePermission("admins.manage");
  const [{ admins, invites }, roles] = await Promise.all([services.adminAccounts.list(actor), services.adminAccounts.listRoles(actor)]);
  const now = new Date();
  return (
    <div className="flex flex-col gap-6">
      <Section title={`${admins.length} ${admins.length === 1 ? "admin" : "admins"}`} flush>
        <DataTable
          caption="Admins"
          rows={admins}
          rowKey={(a) => a.id}
          rowHref={(a) => adminHref(`/admin/admins/${a.id}`)}
          columns={[
            {
              header: "Admin",
              cell: (a) => (
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2">
                    {a.name}
                    {a.id === actor.adminId ? <Badge tone="primary">You</Badge> : null}
                  </span>
                  <span className="truncate text-[0.8125rem] font-normal text-muted">{a.email}</span>
                </span>
              ),
            },
            { header: "Roles", cell: (a) => (a.roles.length ? a.roles.map((r) => r.name).join(", ") : <span className="text-muted">No role</span>), hideBelow: "sm" },
            { header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
            { header: "Two-step", cell: (a) => (a.totpEnabledAt ? "On" : <Badge tone="warning">Not set up</Badge>), hideBelow: "md" },
            { header: "Last sign-in", cell: (a) => <span className="whitespace-nowrap text-muted" title={formatDateTime(a.lastLoginAt)}>{formatRelative(a.lastLoginAt, now)}</span>, align: "right", hideBelow: "sm" },
          ]}
          empty={<EmptyRows icon={UserGearIcon} title="No admins" />}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Invite an admin" description="They get an email with a link that works for 72 hours, then set a password and an authenticator.">
          <ActionForm action={inviteAdmin} hidden={{}} label="Send invite" variant="primary" pendingLabel="Sending…">
            <Field compact name="email" type="email" label="Email" autoComplete="off" required />
            <RoleChecks roles={roles} checked={new Set()} />
          </ActionForm>
        </Section>
        <Section title="Open invites" flush>
          {invites.length ? (
            <ul className="divide-y divide-border">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{i.email}</span>
                    <span className="text-[0.8125rem] text-muted">
                      {roles.filter((r) => i.roleIds.includes(r.id)).map((r) => r.name).join(", ") || "No role"} · expires {formatDateTime(i.expiresAt)}
                    </span>
                  </span>
                  <ActionForm action={revokeAdminInvite} hidden={{ inviteId: i.id }} label="Withdraw" variant="ghost" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-sm text-muted sm:px-5">No invites waiting.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

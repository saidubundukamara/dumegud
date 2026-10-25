import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { KeyValue } from "@/components/admin/KeyValue";
import { DetailSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Timeline } from "@/components/admin/Timeline";
import { SelectField } from "@/components/ui/Field";
import { device, formatDateTime, formatRelative, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { ActionForm, NoteInput } from "@/app/(admin)/admin/action-form";
import { AuditTrail } from "../../audit-trail";
import { orNotFound } from "../../load";
import { resetAdminTotp, setAdminRoles, setAdminStatus, unlockAdmin } from "../actions";
import { RoleChecks } from "../role-checks";

export const metadata: Metadata = { title: "Admin" };

const EVENT: Record<string, string> = {
  login_password_ok: "Password accepted",
  login_failed: "Wrong password",
  totp_failed: "Wrong authenticator code",
  login_success: "Signed in",
  recovery_code_used: "Used a recovery code",
  totp_enrolled: "Set up an authenticator",
  step_up_success: "Unlocked sensitive actions",
  step_up_failed: "Wrong code to unlock sensitive actions",
  logout: "Signed out",
  session_revoked: "Session ended by an admin",
  password_changed: "Changed password",
  invite_accepted: "Accepted the invite",
};
const FAILED = new Set(["login_failed", "totp_failed", "step_up_failed"]);

export default function AdminDetailPage({ params }: PageProps<"/admin/admins/[adminId]">) {
  return (
    <Suspense
      fallback={
        <AdminPage title="Admin" back={{ href: adminHref("/admin/admins"), label: "Admins" }}>
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/admins/[adminId]">, "params">) {
  const { actor } = await requirePermission("admins.manage");
  const { adminId } = await params;
  if (!isUuid(adminId)) notFound();
  const [{ admin: a, roles: held, sessions, events }, roles] = await Promise.all([orNotFound(services.adminAccounts.detail(actor, adminId)), services.adminAccounts.listRoles(actor)]);
  const self = a.id === actor.adminId;
  const now = new Date();

  return (
    <AdminPage
      title={a.name}
      back={{ href: adminHref("/admin/admins"), label: "Admins" }}
      meta={
        <>
          <StatusBadge status={a.status} />
          {self ? <Badge tone="primary">You</Badge> : null}
          {a.lockedUntil ? <Badge tone="danger">Locked until {formatDateTime(a.lockedUntil)}</Badge> : null}
          {a.totpEnabledAt ? null : <Badge tone="warning">Two-step not set up</Badge>}
          <span>{a.email}</span>
        </>
      }
    >
      {self ? <p className="rounded-brand-sm bg-surface-muted px-4 py-3 text-sm text-muted">This is you. Another admin has to change your roles, status or two-step sign-in. Your own settings are on Your account.</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Account">
            <KeyValue
              items={[
                ["Roles", held.length ? held.map((r) => r.name).join(", ") : <span className="text-muted">No role</span>],
                ["Two-step sign-in", a.totpEnabledAt ? `On since ${formatDateTime(a.totpEnabledAt)}` : "Not set up yet"],
                ["Last sign-in", a.lastLoginAt ? formatDateTime(a.lastLoginAt) : "Never"],
                ["Admin since", formatDateTime(a.createdAt)],
                ["Failed attempts", a.failedLoginCount ? String(a.failedLoginCount) : "None"],
              ]}
            />
          </Section>
          <Section title={`Signed in on ${sessions.length} ${sessions.length === 1 ? "device" : "devices"}`} flush>
            {sessions.length ? (
              <ul className="divide-y divide-border">
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <span title={s.userAgent ?? undefined}>{device(s.userAgent)}</span>
                    <span className="text-muted">Active {formatRelative(s.lastSeenAt, now)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-muted sm:px-5">Not signed in anywhere.</p>
            )}
          </Section>
        </div>

        {self ? null : (
          <div className="flex min-w-0 flex-col gap-6">
            <Section title="Roles" description="Changing roles signs them out.">
              <ActionForm action={setAdminRoles} hidden={{ adminId: a.id }} label="Save roles">
                <RoleChecks roles={roles} checked={new Set(held.map((r) => r.id))} />
              </ActionForm>
            </Section>
            <Section title="Status" description="Suspended or disabled admins can’t sign in.">
              <ActionForm
                action={setAdminStatus}
                hidden={{ adminId: a.id }}
                label="Change status"
                confirm={{ title: `Change ${a.name}’s status?`, body: "Anything other than active signs them out everywhere straight away." }}
              >
                <SelectField compact name="status" label="Status" defaultValue={a.status}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="disabled">Disabled</option>
                </SelectField>
                <NoteInput required />
              </ActionForm>
            </Section>
            <Section title="Locked out?" description="After too many wrong passwords or codes, sign-in locks for a while.">
              <div className="flex flex-col gap-4">
                {a.lockedUntil || a.failedLoginCount ? (
                  <ActionForm action={unlockAdmin} hidden={{ adminId: a.id }} label={a.lockedUntil ? "Unlock now" : "Clear failed attempts"} />
                ) : (
                  <p className="text-sm text-muted">Not locked.</p>
                )}
                {a.totpEnabledAt ? (
                  <ActionForm
                    action={resetAdminTotp}
                    hidden={{ adminId: a.id }}
                    label="Reset two-step sign-in"
                    variant="danger"
                    confirm={{
                      title: `Reset ${a.name}’s two-step sign-in?`,
                      body: "Only for an admin who lost their authenticator and recovery codes. Confirm who they are another way first. They’re signed out and set up a new authenticator at their next sign-in.",
                      danger: true,
                      confirmLabel: "Reset",
                      fields: <NoteInput label="How you confirmed it’s them" required />,
                    }}
                  />
                ) : null}
              </div>
            </Section>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sign-in activity" description="The last 50 events.">
          <Timeline
            empty="No sign-in activity yet."
            items={events.map((e) => ({
              id: e.id,
              at: e.createdAt,
              title: <span className={FAILED.has(e.type) ? "text-danger" : undefined}>{EVENT[e.type] ?? humanize(e.type)}</span>,
              body: e.userAgent ? <span title={e.userAgent}>{device(e.userAgent)}</span> : undefined,
            }))}
          />
        </Section>
        <AuditTrail actor={actor} targetType="admin" targetId={a.id} title="Changes to this admin" />
      </div>
    </AdminPage>
  );
}

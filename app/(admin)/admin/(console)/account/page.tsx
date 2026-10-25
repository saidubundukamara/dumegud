import type { Metadata } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/admin/Badge";
import { KeyValue } from "@/components/admin/KeyValue";
import { DetailSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Field } from "@/components/ui/Field";
import { device, formatDateTime, formatRelative } from "@/lib/admin-format";
import { requireAdmin } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { ActionForm } from "@/app/(admin)/admin/action-form";
import { changeAdminPassword, revokeAdminSession } from "@/app/(admin)/admin/auth-actions";
import { RegenerateCodesForm } from "@/app/(admin)/admin/auth-forms";

export const metadata: Metadata = { title: "Your account" };

export default function AdminAccountPage() {
  return (
    <AdminPage title="Your account" description="Your admin sign-in: where you’re signed in, recovery codes and password." width="narrow">
      <Suspense fallback={<DetailSkeleton />}>
        <Account />
      </Suspense>
    </AdminPage>
  );
}

async function Account() {
  const session = await requireAdmin();
  const [sessions, codesLeft] = await Promise.all([services.adminAuth.listSessions(session.actor), services.adminAuth.recoveryCodesLeft(session.actor)]);
  const now = new Date();
  return (
    <div className="flex flex-col gap-6">
      <Section>
        <KeyValue
          items={[
            ["Name", session.admin.name],
            ["Email", session.admin.email],
            ["Roles", session.roleNames.join(", ") || <span className="text-warning">No role yet. Ask a super admin.</span>],
          ]}
        />
      </Section>

      <Section title="Where you’re signed in" flush>
        <ul className="divide-y divide-border">
          {sessions.map((s) => {
            const current = s.id === session.sessionId;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium" title={s.userAgent ?? undefined}>
                    {device(s.userAgent)}
                    {current ? <Badge tone="success">This browser</Badge> : null}
                  </span>
                  <span className="text-[0.8125rem] text-muted">
                    Signed in {formatDateTime(s.createdAt)} · active {formatRelative(s.lastSeenAt, now)}
                  </span>
                </span>
                {current ? null : <ActionForm action={revokeAdminSession} hidden={{ sessionId: s.id }} label="Sign out" variant="secondary" />}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Recovery codes" description={`${codesLeft} unused. Each one signs you in once if you lose your phone. New codes replace all the old ones.`}>
        <RegenerateCodesForm />
      </Section>

      <Section title="Password">
        <ActionForm action={changeAdminPassword} hidden={{}} label="Change password">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field compact name="currentPassword" type="password" label="Current password" autoComplete="current-password" required />
            <Field compact name="newPassword" type="password" label="New password" autoComplete="new-password" required minLength={10} hint="At least 10 characters, not a common one." />
          </div>
        </ActionForm>
      </Section>
    </div>
  );
}

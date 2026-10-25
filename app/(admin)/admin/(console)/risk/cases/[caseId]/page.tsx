import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { KeyValue } from "@/components/admin/KeyValue";
import { DetailSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { RecordLink } from "@/components/admin/RecordLink";
import { RawJson, Timeline } from "@/components/admin/Timeline";
import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";
import { formatDateTime, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm, NoteArea } from "@/app/(admin)/admin/action-form";
import { AuditTrail } from "../../../audit-trail";
import { orNotFound } from "../../../load";
import { addCaseNote, decideCase } from "../../actions";
import { DecideFields } from "../../decide-fields";

export const metadata: Metadata = { title: "Risk case" };

type Note = { by: string; at: string; text: string };
type Approval = { by: string; at: string; decision: string };
type Pending = { decision: string; feature?: string; notes?: string; by: string };

export default function CasePage({ params }: PageProps<"/admin/risk/cases/[caseId]">) {
  return (
    <Suspense
      fallback={
        <AdminPage title="Risk case" back={{ href: adminHref("/admin/risk?tab=cases"), label: "Open cases" }}>
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/risk/cases/[caseId]">, "params">) {
  const { actor } = await requirePermission("risk.view");
  const { caseId } = await params;
  if (!isUuid(caseId)) notFound();
  const { case: c, alerts } = await orNotFound(services.cases.caseDetail(actor, caseId));
  const notes = (Array.isArray(c.notes) ? c.notes : []) as Note[];
  const approvals = (Array.isArray(c.approvals) ? c.approvals : []) as Approval[];
  const pending = c.pendingDecision as Pending | null;
  const [labels, names] = await Promise.all([
    services.admin.creatorLabels(actor, [c.creatorId]),
    services.admin.adminNames(actor, [c.assigneeId, ...notes.map((n) => n.by), ...approvals.map((a) => a.by), pending?.by]),
  ]);
  const name = (id: string | null | undefined) => (id ? (names.get(id) ?? "Former admin") : "No one");
  const closed = c.status === "closed";
  const canAct = can(actor, "risk.cases") && !closed;
  const creator = labels.get(c.creatorId) ?? "Unknown creator";

  return (
    <AdminPage
      title={`Case: ${creator}`}
      back={{ href: adminHref(closed ? "/admin/risk?tab=closed" : "/admin/risk?tab=cases"), label: closed ? "Closed cases" : "Open cases" }}
      meta={
        <>
          <StatusBadge status={c.status} />
          {c.decision ? <Badge>{humanize(c.decision)}</Badge> : null}
          <span>Opened {formatDateTime(c.createdAt)}</span>
        </>
      }
    >
      {pending && canAct ? (
        <Section title="Waiting for a second admin" description={`${name(pending.by)} proposed: ${humanize(pending.decision).toLowerCase()}${pending.feature ? ` (${humanize(pending.feature).toLowerCase()})` : ""}. The creator is owed enough that two admins must agree.`}>
          {pending.by === actor.adminId ? (
            <p className="text-sm text-muted">You proposed this. A different admin has to approve it.</p>
          ) : (
            <ActionForm
              action={decideCase}
              hidden={{ caseId: c.id, decision: pending.decision, feature: pending.feature ?? "", notes: pending.notes ?? "" }}
              label="Approve this decision"
              variant="primary"
              confirm={{ title: "Approve the proposed decision?", body: "It takes effect straight away. Restrictions stop the creator from using the paused features until they’re lifted.", danger: pending.decision === "restrict" || pending.decision === "pause_feature" }}
            />
          )}
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Notes" description="Kept on the case. Other admins see them.">
            <div className="flex flex-col gap-4">
              <Timeline empty="No notes yet." items={notes.map((n, i) => ({ id: `${i}`, at: n.at, title: name(n.by), body: <span className="whitespace-pre-line text-text">{n.text}</span> }))} />
              {can(actor, "risk.cases") ? (
                <ActionForm action={addCaseNote} hidden={{ caseId: c.id }} label="Add note">
                  <NoteArea label="New note" rows={2} />
                </ActionForm>
              ) : null}
            </div>
          </Section>
          <Section title="Alerts in this case" flush>
            <DataTable
              caption="Alerts in this case"
              rows={alerts}
              rowKey={(a) => a.id}
              columns={[
                {
                  header: "Rule",
                  cell: (a) => (
                    <span className="flex flex-col gap-1">
                      <span className="font-medium">{humanize(a.ruleCode)}</span>
                      <RawJson value={a.evidence} label="Evidence" />
                    </span>
                  ),
                },
                { header: "Severity", cell: (a) => <StatusBadge status={a.severity} />, hideBelow: "sm" },
                { header: "Raised", cell: (a) => <span className="whitespace-nowrap text-muted">{formatDateTime(a.createdAt)}</span>, align: "right", hideBelow: "sm" },
              ]}
              empty={<EmptyRows icon={ShieldCheckIcon} title="Opened by staff">No alerts were grouped into this case.</EmptyRows>}
            />
          </Section>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Case">
            <KeyValue
              columns={1}
              items={[
                ["Creator", <RecordLink key="c" href={can(actor, "creators.view") && adminHref(`/admin/creators/${c.creatorId}`)}>{creator}</RecordLink>],
                ["Assigned to", name(c.assigneeId)],
                ["Reasons", c.reasonCodes.length ? c.reasonCodes.map(humanize).join(", ") : "Opened by staff"],
                c.decisionNotes && ["Decision notes", <span key="n" className="whitespace-pre-line">{c.decisionNotes}</span>],
                ["Approvals", approvals.length ? approvals.map((a) => `${name(a.by)}: ${humanize(a.decision).toLowerCase()}`).join("; ") : "None yet"],
              ]}
            />
          </Section>
          {canAct && !pending ? (
            <Section title="Decide" description="Restricting needs an authenticator code. If the creator is owed a lot, a second admin must approve.">
              <ActionForm
                action={decideCase}
                hidden={{ caseId: c.id }}
                label="Record decision"
                variant="primary"
                pendingLabel="Saving…"
                confirm={{
                  title: "Record this decision?",
                  body: "It applies as described under the choice, goes on the case and in the audit log. If the creator is owed a lot, a restriction waits for a second admin.",
                  confirmLabel: "Record decision",
                }}
              >
                <DecideFields />
              </ActionForm>
            </Section>
          ) : null}
        </div>
      </div>
      <AuditTrail actor={actor} targetType="risk_case" targetId={c.id} title="History" />
    </AdminPage>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/admin/Badge";
import { DataTable } from "@/components/admin/DataTable";
import { KeyValue } from "@/components/admin/KeyValue";
import { DetailSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { RecordLink } from "@/components/admin/RecordLink";
import { SelectField } from "@/components/ui/Field";
import { formatDateTime, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm, NoteInput } from "@/app/(admin)/admin/action-form";
import { AuditTrail } from "../../audit-trail";
import { orNotFound } from "../../load";
import { decideKyc } from "../actions";

export const metadata: Metadata = { title: "ID check" };

const DOC_LABELS = { id_front: "Front of ID", id_back: "Back of ID", selfie: "Selfie holding the ID" } as const;

export default function KycDetailPage({ params }: PageProps<"/admin/kyc/[id]">) {
  return (
    <Suspense
      fallback={
        <AdminPage title="ID check" back={{ href: adminHref("/admin/kyc"), label: "ID checks" }}>
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/kyc/[id]">, "params">) {
  const { actor } = await requirePermission("kyc.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const s = await orNotFound(services.kyc.getForReview(actor, id));
  const [labels, names] = await Promise.all([services.admin.creatorLabels(actor, [s.userId]), services.admin.adminNames(actor, [s.reviewerId, ...s.history.map((h) => h.reviewerId)])]);
  const pending = s.status === "pending";

  return (
    <AdminPage
      title={s.legalName}
      back={{ href: adminHref("/admin/kyc"), label: "ID checks" }}
      meta={
        <>
          <StatusBadge status={s.status} label={pending ? "Waiting for review" : undefined} />
          <span>Submitted {formatDateTime(s.submittedAt)}</span>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Section title="Documents" description="Opening this page is logged. The images never get a shareable link.">
          <div className="grid gap-4 sm:grid-cols-2">
            {s.docs.map((doc) => (
              <figure key={doc} className={`flex flex-col gap-1.5 ${doc === "selfie" ? "sm:col-span-2 sm:max-w-sm" : ""}`}>
                {/* Streamed through the authenticated viewer route; not a public URL. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/kyc/${s.id}/${doc}`} alt={DOC_LABELS[doc]} loading="lazy" className="w-full rounded-brand-sm bg-surface-muted ring-1 ring-border" />
                <figcaption className="text-[0.8125rem] text-muted">{DOC_LABELS[doc]}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <div className="flex min-w-0 flex-col gap-6">
          <Section title="What they entered">
            <KeyValue
              columns={1}
              items={[
                ["Creator", <RecordLink key="c" href={can(actor, "creators.view") && adminHref(`/admin/creators/${s.userId}`)}>{labels.get(s.userId) ?? "Unknown"}</RecordLink>],
                ["Legal name", <span key="n" className="font-semibold">{s.legalName}</span>],
                ["Date of birth", s.dateOfBirth],
                ["ID type", humanize(s.idType)],
              ]}
            />
          </Section>
          {pending && can(actor, "kyc.decide") ? (
            <Section title="Decision" description="Check the name and photo match on every document.">
              <ActionForm action={decideKyc} hidden={{ submissionId: s.id }} label="Save decision" variant="primary" pendingLabel="Saving…">
                <SelectField compact name="outcome" label="Decision" defaultValue="approved">
                  <option value="approved">Approve</option>
                  <option value="needs_more_info">Send back for a clearer photo or detail</option>
                  <option value="rejected">Reject</option>
                </SelectField>
                <NoteInput label="Note to the creator" hint="Needed unless you approve. They see it in their dashboard." />
              </ActionForm>
            </Section>
          ) : !pending ? (
            <Section title="Decision">
              <KeyValue
                columns={1}
                items={[
                  ["Outcome", <StatusBadge key="o" status={s.status} />],
                  ["Decided by", s.reviewerId ? (names.get(s.reviewerId) ?? "Former admin") : "Unknown"],
                  ["When", formatDateTime(s.reviewedAt)],
                  ["Note to the creator", s.reviewNotes || <span className="text-muted">None</span>],
                ]}
              />
            </Section>
          ) : null}
        </div>
      </div>

      {s.history.length ? (
        <Section title="Their other submissions" flush>
          <DataTable
            caption="Other submissions"
            rows={s.history}
            rowKey={(h) => h.id}
            rowHref={(h) => adminHref(`/admin/kyc/${h.id}`)}
            columns={[
              { header: "Submitted", cell: (h) => formatDateTime(h.submittedAt) },
              { header: "Name", cell: (h) => h.legalName, hideBelow: "sm" },
              { header: "Status", cell: (h) => <StatusBadge status={h.status} /> },
              { header: "Note", cell: (h) => <span className="text-muted">{h.reviewNotes || "None"}</span>, hideBelow: "md" },
            ]}
            empty={null}
          />
        </Section>
      ) : null}
      <AuditTrail actor={actor} targetType="kyc_submission" targetId={s.id} />
    </AdminPage>
  );
}

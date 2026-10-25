import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { CopyId } from "@/components/admin/CopyId";
import { KeyValue, type KeyValueItem } from "@/components/admin/KeyValue";
import { DetailSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { RecordLink } from "@/components/admin/RecordLink";
import { formatDateTime, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { formatSLE } from "@/lib/money";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm, NoteInput } from "@/app/(admin)/admin/action-form";
import { redispatchPayout, resyncPayout } from "@/app/(admin)/admin/ops-actions";
import { AuditTrail } from "../../audit-trail";
import { orNotFound } from "../../load";
import { rejectPayout, releasePayout } from "../actions";
import { destinationLabel } from "../destination";

export const metadata: Metadata = { title: "Withdrawal" };

const STUCK_MS = 30 * 60_000;

export default function PayoutPage({ params }: PageProps<"/admin/payouts/[payoutId]">) {
  return (
    <Suspense
      fallback={
        <AdminPage title="Withdrawal" back={{ href: adminHref("/admin/payouts/all"), label: "All withdrawals" }}>
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/payouts/[payoutId]">, "params">) {
  const { actor } = await requirePermission("payouts.view");
  const { payoutId } = await params;
  if (!isUuid(payoutId)) notFound();
  const { payout: p, creatorLabel, approvals, reviewerName, idName } = await orNotFound(services.admin.payoutDetail(actor, payoutId));
  const inReview = p.status === "in_review";
  const alreadyApproved = approvals.some((a) => a.by === actor.adminId);
  const open = p.status === "requested" || p.status === "processing";
  const now = new Date();
  const stuck = open && now.getTime() - p.updatedAt.getTime() > STUCK_MS;
  const back = inReview ? { href: adminHref("/admin/payouts"), label: "Withdrawals to review" } : { href: adminHref("/admin/payouts/all"), label: "All withdrawals" };

  return (
    <AdminPage
      title={
        <>
          Withdrawal of <span className="tabular-nums">{formatSLE(p.amountMinor)}</span>
        </>
      }
      back={back}
      meta={
        <>
          <StatusBadge status={p.status} />
          {approvals.length && inReview ? <Badge tone="primary">{approvals.length} of 2 approvals</Badge> : null}
          {stuck ? <Badge tone="danger">No change for 30 min</Badge> : null}
          <span>Requested {formatDateTime(p.requestedAt)}</span>
        </>
      }
    >
      {inReview && (can(actor, "payouts.approve") || can(actor, "payouts.reject")) ? (
        <Section title="Review" description={`Held because: ${humanize(p.reviewReason).toLowerCase()}. Check the payout name against their ID.`}>
          <KeyValue
            items={[
              ["Name on the number", p.holderNameAtRequest ?? <span className="text-muted">Not known</span>],
              ...(idName !== undefined ? [["Name on their ID", idName ?? <span className="text-muted">No approved ID</span>] satisfies KeyValueItem] : []),
            ]}
          />
          <div className="grid gap-6 md:grid-cols-2">
            {can(actor, "payouts.approve") ? (
              alreadyApproved ? (
                <p className="text-sm text-muted">You gave the first approval. A different admin has to give the second.</p>
              ) : (
                <ActionForm
                  action={releasePayout}
                  hidden={{ payoutId: p.id }}
                  label={approvals.length ? "Give second approval" : "Release"}
                  variant="primary"
                  pendingLabel="Releasing…"
                  confirm={{
                    title: `Send ${formatSLE(p.amountMinor)} to ${destinationLabel(p.destinationSnapshot)}?`,
                    body: "Monime sends it straight away and it can’t be called back. Large withdrawals need two different admins; if this is the first approval, it waits for the second.",
                    confirmLabel: "Release",
                  }}
                />
              )
            ) : null}
            {can(actor, "payouts.reject") ? (
              <ActionForm
                action={rejectPayout}
                hidden={{ payoutId: p.id }}
                label="Reject"
                variant="danger"
                pendingLabel="Rejecting…"
                confirm={{ title: "Reject this withdrawal?", body: "The money stays in the creator’s wallet and they see your reason. They can ask again." }}
              >
                <NoteInput name="reason" label="Reason the creator sees" required />
              </ActionForm>
            ) : null}
          </div>
        </Section>
      ) : null}

      {open && can(actor, "payouts.operate") ? (
        <Section title={stuck ? "This withdrawal looks stuck" : "Monime"} description="Re-sending reuses the same idempotency key, so Monime never pays twice.">
          <div className="flex flex-wrap gap-3">
            {p.status === "requested" ? <ActionForm action={redispatchPayout} hidden={{ payoutId: p.id }} label="Re-send to Monime" pendingLabel="Sending…" /> : null}
            <ActionForm action={resyncPayout} hidden={{ payoutId: p.id }} label="Ask Monime for its status" pendingLabel="Asking…" />
          </div>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Money">
          <KeyValue
            items={[
              ["Amount", formatSLE(p.amountMinor)],
              ["Fee (quoted)", formatSLE(p.quotedFeeMinor)],
              p.feeMinor !== null && ["Fee (charged)", <>{formatSLE(p.feeMinor)} {p.feeSource ? <span className="text-muted">({humanize(p.feeSource)})</span> : null}</>],
              p.totalDebitMinor !== null && ["Taken from wallet", formatSLE(p.totalDebitMinor)],
              ["Completed", p.completedAt ? formatDateTime(p.completedAt) : <span className="text-muted">Not yet</span>],
            ]}
          />
        </Section>
        <Section title="Where it goes">
          <KeyValue
            items={[
              ["Creator", <RecordLink key="c" href={can(actor, "creators.view") && adminHref(`/admin/creators/${p.creatorId}`)}>{creatorLabel ?? "Unknown"}</RecordLink>],
              ["Number", destinationLabel(p.destinationSnapshot)],
              ["Name on the number", p.holderNameAtRequest ?? <span className="text-muted">Not known</span>],
              p.reviewReason && ["Held because", humanize(p.reviewReason)],
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Approvals">
          {approvals.length || reviewerName ? (
            <KeyValue
              columns={1}
              items={[
                ...approvals.map((a, i): [string, string] => [i === 0 ? "First approval" : "Second approval", `${a.name}, ${formatDateTime(a.at)}`]),
                reviewerName && p.status !== "in_review" ? [p.status === "canceled" ? "Rejected by" : "Released by", reviewerName] : null,
              ]}
            />
          ) : (
            <p className="text-sm text-muted">{p.reviewReason ? "No one has approved it yet." : "Released automatically: it was under the review threshold."}</p>
          )}
        </Section>
        <Section title="Monime">
          <KeyValue
            columns={1}
            items={[
              ["Payout id", p.monimePayoutId ? <CopyId key="m" value={p.monimePayoutId} full /> : <span className="text-muted">Not sent yet</span>],
              ["Our id", <CopyId key="i" value={p.id} />],
              (p.failureMessage || p.lastError) && ["Last problem", <span key="f" className="text-danger">{p.failureMessage ?? p.lastError}{p.failureCode ? ` (${p.failureCode})` : ""}</span>],
            ]}
          />
        </Section>
      </div>

      <AuditTrail actor={actor} targetType="payout" targetId={p.id} title="History" />
    </AdminPage>
  );
}

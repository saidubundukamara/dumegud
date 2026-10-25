import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/admin/Badge";
import { CopyId } from "@/components/admin/CopyId";
import { KeyValue } from "@/components/admin/KeyValue";
import { DetailSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { RecordLink } from "@/components/admin/RecordLink";
import { Timeline } from "@/components/admin/Timeline";
import { formatDateTime, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { formatSLE } from "@/lib/money";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm, NoteInput } from "@/app/(admin)/admin/action-form";
import { releasePaymentReview, resyncPayment, retryTransfer } from "@/app/(admin)/admin/ops-actions";
import { AuditTrail } from "../../audit-trail";
import { orNotFound } from "../../load";

export const metadata: Metadata = { title: "Transaction" };

export default function TransactionPage({ params }: PageProps<"/admin/transactions/[paymentId]">) {
  return (
    <Suspense
      fallback={
        <AdminPage title="Transaction" back={{ href: adminHref("/admin/transactions"), label: "Transactions" }}>
          <DetailSkeleton />
        </AdminPage>
      }
    >
      <Detail params={params} />
    </Suspense>
  );
}

const money = (v: number | null) => (v === null ? <span className="text-muted">Not known yet</span> : <span className="tabular-nums">{formatSLE(v)}</span>);

async function Detail({ params }: Pick<PageProps<"/admin/transactions/[paymentId]">, "params">) {
  const { actor } = await requirePermission("transactions.view");
  const { paymentId } = await params;
  if (!isUuid(paymentId)) notFound();
  const { payment: p, events, ledger } = await orNotFound(services.admin.paymentDetail(actor, paymentId));
  const labels = await services.admin.creatorLabels(actor, [p.creatorId]);
  const canManage = can(actor, "payments.manage");
  const kind = p.kind === "order" ? "Product sale" : "Support";

  const actions = canManage ? (
    <>
      {p.status === "pending" || p.status === "created" ? <ActionForm action={resyncPayment} hidden={{ paymentId: p.id }} label="Re-sync from Monime" pendingLabel="Asking Monime…" /> : null}
      {p.status === "succeeded" && p.transferStatus !== "completed" ? (
        <ActionForm action={retryTransfer} hidden={{ paymentId: p.id }} label="Retry transfer" pendingLabel="Retrying…" />
      ) : null}
    </>
  ) : null;

  return (
    <AdminPage
      title={
        <>
          {kind} of <span className="tabular-nums">{formatSLE(p.grossMinor)}</span>
        </>
      }
      back={{ href: adminHref("/admin/transactions"), label: "Transactions" }}
      meta={
        <>
          <StatusBadge status={p.status} />
          <span>Created {formatDateTime(p.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <CopyId value={p.id} label="Copy payment id" />
        </>
      }
      actions={actions}
    >
      {p.status === "under_review" && canManage ? (
        <Section title="Held for review" description={p.reviewHold ? `Reason: ${humanize(p.reviewHold)}.` : "A limit sent this payment to a person before it settles."}>
          <ActionForm
            action={releasePaymentReview}
            hidden={{ paymentId: p.id }}
            label="Release payment"
            variant="primary"
            confirm={{ title: "Release this payment?", body: "It settles now and the creator’s share moves to their wallet. This can’t be undone." }}
          >
            <NoteInput label="Why it’s safe to release" required hint="Kept in the audit log." />
          </ActionForm>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Money">
          <KeyValue
            items={[
              ["Amount given", money(p.grossMinor)],
              ["Monime fee", <>{money(p.monimeFeeMinor)} {p.monimeFeeSource ? <span className="text-muted">({humanize(p.monimeFeeSource)})</span> : null}</>],
              p.lateReportedFeeMinor !== null && ["Fee reported later", money(p.lateReportedFeeMinor)],
              ["Platform fee", <>{money(p.platformFeeMinor)} <span className="text-muted">({(p.platformFeeBps / 100).toFixed(2)}%)</span></>],
              ["Creator gets", money(p.creatorNetMinor)],
              p.arrivedMinor !== null && ["Arrived in Monime", money(p.arrivedMinor)],
            ]}
          />
        </Section>
        <Section title="Details">
          <KeyValue
            items={[
              ["Creator", <RecordLink key="c" href={can(actor, "creators.view") && adminHref(`/admin/creators/${p.creatorId}`)}>{labels.get(p.creatorId) ?? "Unknown"}</RecordLink>],
              ["Network", p.channelProvider ? humanize(p.channelProvider) : <span className="text-muted">Not known yet</span>],
              ["Came from", p.trafficSource ? humanize(p.trafficSource) : <span className="text-muted">Unknown</span>],
              ["Settled", p.settledAt ? formatDateTime(p.settledAt) : <span className="text-muted">Not yet</span>],
              ["Transfer to creator", <span key="t" className="flex flex-wrap items-center gap-2"><StatusBadge status={p.transferStatus === "none" ? "not_started" : p.transferStatus} label={p.transferStatus === "none" ? "Not started" : undefined} />{p.transferAttempts ? <span className="text-muted">{p.transferAttempts} failed {p.transferAttempts === 1 ? "try" : "tries"}</span> : null}</span>],
              p.lastError && ["Last error", <span key="e" className="text-danger">{p.lastError}</span>],
            ]}
          />
        </Section>
      </div>

      <Section title="Monime references">
        <KeyValue
          columns={3}
          items={[
            ["Checkout session", p.monimeCheckoutSessionId ? <CopyId key="1" value={p.monimeCheckoutSessionId} full /> : null],
            ["Payment", p.monimePaymentId ? <CopyId key="2" value={p.monimePaymentId} full /> : null],
            ["Transaction reference", p.financialTransactionReference ? <CopyId key="3" value={p.financialTransactionReference} full /> : null],
            ["Channel reference", p.channelReference ? <CopyId key="4" value={p.channelReference} full /> : null],
            ["Transfer", p.transferId ? <CopyId key="5" value={p.transferId} full /> : null],
          ]}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Status history">
          <Timeline
            items={events.map((e) => ({
              id: e.id,
              at: e.createdAt,
              title: (
                <>
                  {e.fromStatus ? `${humanize(e.fromStatus)} → ` : ""}
                  {humanize(e.toStatus)}
                </>
              ),
              body: `From ${humanize(e.source).toLowerCase()}`,
              detail: e.detail ?? undefined,
            }))}
          />
        </Section>
        <Section title="Ledger" description="Debits are positive, credits negative." flush>
          {ledger.length ? (
            <table className="w-full text-sm">
              <caption className="sr-only">Ledger entries</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th scope="col" className="px-4 py-2 font-medium sm:pl-5">Account</th>
                  <th scope="col" className="px-4 py-2 font-medium">Journal</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium sm:pr-5">Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5 sm:pl-5">{humanize(l.account)}</td>
                    <td className="px-4 py-2.5 text-muted">{humanize(l.kind)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums sm:pr-5 ${l.amountMinor < 0 ? "text-muted" : ""}`}>
                      {l.amountMinor > 0 ? "Dr " : "Cr "}
                      {formatSLE(Math.abs(l.amountMinor))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-4 py-4 text-sm text-muted sm:px-5">No ledger entries yet. They’re written when the payment settles.</p>
          )}
        </Section>
      </div>

      <AuditTrail actor={actor} targetType="payment" targetId={p.id} />
    </AdminPage>
  );
}

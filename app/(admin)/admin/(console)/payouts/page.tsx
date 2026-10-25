import { ListChecksIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Tabs } from "@/components/admin/Tabs";
import { formatDateTime, formatRelative, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { formatSLE } from "@/lib/money";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { oneOf } from "../params";
import { approvalsOf, destinationLabel } from "./destination";

export const metadata: Metadata = { title: "Withdrawals to review" };

export default function PayoutReviewPage({ searchParams }: PageProps<"/admin/payouts">) {
  return (
    <AdminPage title="Withdrawals to review" description="Withdrawals held for a person: large amounts, new payout numbers, or a name that doesn’t match the ID.">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/admin/payouts">, "searchParams">) {
  const { actor } = await requirePermission("payouts.view");
  const tab = oneOf((await searchParams).tab, ["review", "stuck"] as const) ?? "review";
  const [review, stuck] = await Promise.all([services.payouts.listInReview(actor), services.admin.stuckPayouts(actor)]);
  const rows = tab === "review" ? review : stuck;
  const labels = await services.admin.creatorLabels(actor, rows.map((p) => p.creatorId));
  const base = adminHref("/admin/payouts");
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="Withdrawal queues"
        items={[
          { href: base, label: "In review", count: review.length, active: tab === "review" },
          { href: `${base}?tab=stuck` as Route, label: "Stuck", count: stuck.length, active: tab === "stuck" },
        ]}
      />
      {tab === "stuck" ? <p className="text-sm text-muted">Sent or waiting to be sent, with no change for 30 minutes. Open one to re-send it or ask Monime for its status.</p> : null}
      <Section flush>
        <DataTable
          caption={tab === "review" ? "Withdrawals in review" : "Stuck withdrawals"}
          rows={rows}
          rowKey={(p) => p.id}
          rowHref={(p) => adminHref(`/admin/payouts/${p.id}`)}
          columns={[
            { header: "Amount", cell: (p) => <span className="tabular-nums">{formatSLE(p.amountMinor)}</span> },
            { header: "Creator", cell: (p) => labels.get(p.creatorId) ?? "Unknown", hideBelow: "sm" },
            tab === "review"
              ? {
                  header: "Why it’s held",
                  cell: (p) => (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {humanize(p.reviewReason)}
                      {approvalsOf(p.approvals).length ? <Badge tone="primary">1 of 2 approvals</Badge> : null}
                    </span>
                  ),
                  hideBelow: "md",
                }
              : { header: "Status", cell: (p) => <StatusBadge status={p.status} />, hideBelow: "md" },
            { header: "To", cell: (p) => <span className="text-muted">{destinationLabel(p.destinationSnapshot)}</span>, hideBelow: "lg" },
            {
              header: tab === "review" ? "Waiting" : "Last change",
              cell: (p) => (
                <span className="whitespace-nowrap text-muted tabular-nums" title={formatDateTime(tab === "review" ? p.requestedAt : p.updatedAt)}>
                  {formatRelative(tab === "review" ? p.requestedAt : p.updatedAt, now)}
                </span>
              ),
              align: "right",
            },
          ]}
          empty={
            tab === "review" ? (
              <EmptyRows icon={ListChecksIcon} title="Nothing to review">
                Held withdrawals appear here. Everything else goes straight to Monime.
              </EmptyRows>
            ) : (
              <EmptyRows icon={WarningIcon} title="Nothing stuck">
                Every withdrawal moved in the last 30 minutes.
              </EmptyRows>
            )
          }
        />
      </Section>
    </div>
  );
}

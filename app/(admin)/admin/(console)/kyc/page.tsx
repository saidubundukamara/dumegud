import { IdentificationCardIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination } from "@/components/admin/Pagination";
import { Tabs } from "@/components/admin/Tabs";
import { formatDateTime, formatRelative, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { oneOf, str } from "../params";

export const metadata: Metadata = { title: "ID checks" };

const TABS = ["pending", "needs_more_info", "approved", "rejected"] as const;
const LABEL = { pending: "Waiting", needs_more_info: "Sent back", approved: "Approved", rejected: "Rejected" } as const;

export default function KycQueuePage({ searchParams }: PageProps<"/admin/kyc">) {
  return (
    <AdminPage title="ID checks" description="Creators verify their identity before their first withdrawal. Open one to see the documents.">
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function Queue({ searchParams }: Pick<PageProps<"/admin/kyc">, "searchParams">) {
  const { actor } = await requirePermission("kyc.view");
  const sp = await searchParams;
  const status = oneOf(sp.status, TABS) ?? "pending";
  const cursor = str(sp.cursor);
  const page = status === "pending" ? { rows: await services.kyc.listPending(actor), next: null } : await services.kyc.listDecided(actor, status, cursor);
  const labels = await services.admin.creatorLabels(actor, page.rows.map((r) => r.userId));
  const base = adminHref("/admin/kyc");
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <Tabs label="ID check status" items={TABS.map((t) => ({ href: (t === "pending" ? base : `${base}?status=${t}`) as Route, label: LABEL[t], active: t === status }))} />
      <Section flush>
        <DataTable
          caption={`ID checks: ${LABEL[status]}`}
          rows={page.rows}
          rowKey={(s) => s.id}
          rowHref={(s) => adminHref(`/admin/kyc/${s.id}`)}
          columns={[
            {
              header: "Creator",
              cell: (s) => (
                <span className="flex flex-col">
                  <span>{labels.get(s.userId) ?? "Unknown"}</span>
                  <span className="text-[0.8125rem] font-normal text-muted">{s.legalName}</span>
                </span>
              ),
            },
            { header: "ID type", cell: (s) => humanize(s.idType), hideBelow: "sm" },
            { header: "Status", cell: (s) => <StatusBadge status={s.status} label={LABEL[s.status as keyof typeof LABEL]} />, hideBelow: "sm" },
            {
              header: status === "pending" ? "Waiting" : "Decided",
              cell: (s) => (
                <span className="whitespace-nowrap text-muted tabular-nums" title={formatDateTime(status === "pending" ? s.submittedAt : s.reviewedAt)}>
                  {status === "pending" ? formatRelative(s.submittedAt, now).replace(/ ago$/, "") : formatDateTime(s.reviewedAt)}
                </span>
              ),
              align: "right",
            },
          ]}
          empty={
            <EmptyRows icon={IdentificationCardIcon} title={status === "pending" ? "No ID checks waiting" : `Nothing ${LABEL[status].toLowerCase()} yet`}>
              {status === "pending" ? "New submissions appear here, oldest first." : null}
            </EmptyRows>
          }
        />
        <Pagination base={base} params={{ status: status === "pending" ? undefined : status, cursor }} next={page.next} shown={page.rows.length} />
      </Section>
    </div>
  );
}

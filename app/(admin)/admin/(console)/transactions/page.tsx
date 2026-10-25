import { ReceiptIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusBadge } from "@/components/admin/Badge";
import { DataTable, DetailLine, EmptyRows } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination } from "@/components/admin/Pagination";
import { RecordLink } from "@/components/admin/RecordLink";
import { Field, SelectField } from "@/components/ui/Field";
import { formatDateTime, formatRelative, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { formatSLE } from "@/lib/money";
import { requirePermission } from "@/server/dal/admin-session";
import { paymentStatus } from "@/server/db/schema";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { dateParam, keep, oneOf, str, uuidParam } from "../params";

export const metadata: Metadata = { title: "Transactions" };

const STATUSES = paymentStatus.enumValues;
const KINDS = ["contribution", "order"] as const;
const KEYS = ["status", "kind", "creator", "from", "to", "cursor"] as const;

export default function TransactionsPage({ searchParams }: PageProps<"/admin/transactions">) {
  return (
    <AdminPage title="Transactions" description="Every checkout: support and product sales, newest first.">
      <Suspense fallback={<TableSkeleton filters rows={10} />}>
        <List searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function List({ searchParams }: Pick<PageProps<"/admin/transactions">, "searchParams">) {
  const { actor } = await requirePermission("transactions.view");
  const sp = await searchParams;
  const params = keep(sp, KEYS);
  const creatorId = uuidParam(sp.creator);
  const { rows, next } = await services.admin.listPayments(
    actor,
    { status: oneOf(sp.status, STATUSES), kind: oneOf(sp.kind, KINDS), creatorId, from: dateParam(sp.from), to: dateParam(sp.to, true) },
    str(sp.cursor),
  );
  const canSeeCreators = can(actor, "creators.view");
  const filtered = Boolean(params.status || params.kind || params.creator || params.from || params.to);
  const base = adminHref("/admin/transactions");

  return (
    <Section flush>
      <FilterBar action={base} active={filtered}>
        <SelectField compact name="status" label="Status" defaultValue={params.status ?? ""} className="w-40">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </SelectField>
        <SelectField compact name="kind" label="Kind" defaultValue={params.kind ?? ""} className="w-36">
          <option value="">Any kind</option>
          <option value="contribution">Support</option>
          <option value="order">Product sale</option>
        </SelectField>
        <Field compact name="from" type="date" label="From" defaultValue={params.from} className="w-40" />
        <Field compact name="to" type="date" label="To" defaultValue={params.to} className="w-40" />
        {creatorId ? <input type="hidden" name="creator" value={creatorId} /> : null}
      </FilterBar>
      {creatorId ? (
        <p className="border-b border-border px-4 py-2.5 text-sm text-muted sm:px-5">
          Showing one creator’s transactions. Clear filters to see everyone’s.
        </p>
      ) : null}
      <DataTable
        caption="Transactions"
        rows={rows}
        rowKey={(p) => p.id}
        rowHref={(p) => adminHref(`/admin/transactions/${p.id}`)}
        columns={[
          {
            header: "Amount",
            cell: (p) => <span className="tabular-nums">{formatSLE(p.grossMinor)}</span>,
            // Phones and small tablets: who, and (below sm) what and when, under the amount.
            detail: (p) => (
              <DetailLine
                parts={[
                  { key: "creator", content: p.creatorLabel ?? "Unknown creator" },
                  { key: "kind", content: p.kind === "order" ? "Product sale" : "Support", below: "sm" },
                  { key: "when", content: formatRelative(p.createdAt), below: "sm" },
                ]}
              />
            ),
          },
          { header: "Kind", cell: (p) => (p.kind === "order" ? "Product sale" : "Support"), hideBelow: "sm" },
          {
            header: "Creator",
            cell: (p) => <RecordLink href={canSeeCreators && adminHref(`/admin/creators/${p.creatorId}`)}>{p.creatorLabel ?? "Unknown"}</RecordLink>,
            hideBelow: "md",
          },
          { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
          { header: "Transfer", cell: (p) => (p.transferStatus === "none" ? <span className="text-muted">Not started</span> : <StatusBadge status={p.transferStatus} />), hideBelow: "lg" },
          { header: "Created", cell: (p) => <span className="whitespace-nowrap text-muted tabular-nums">{formatDateTime(p.createdAt)}</span>, align: "right", hideBelow: "sm" },
        ]}
        empty={
          <EmptyRows icon={ReceiptIcon} title={filtered ? "No transactions match these filters" : "No transactions yet"}>
            {filtered ? "Try a wider date range or another status." : "Checkouts appear here as soon as a supporter or buyer starts one."}
          </EmptyRows>
        }
      />
      <Pagination base={base} params={params} next={next} shown={rows.length} />
    </Section>
  );
}

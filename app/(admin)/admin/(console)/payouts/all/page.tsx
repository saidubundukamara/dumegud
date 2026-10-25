import { WalletIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination } from "@/components/admin/Pagination";
import { RecordLink } from "@/components/admin/RecordLink";
import { SelectField } from "@/components/ui/Field";
import { formatDateTime, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { formatSLE } from "@/lib/money";
import { requirePermission } from "@/server/dal/admin-session";
import { payoutStatus } from "@/server/db/schema";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { keep, oneOf, str, uuidParam } from "../../params";
import { destinationLabel } from "../destination";

export const metadata: Metadata = { title: "All withdrawals" };

const STATUSES = payoutStatus.enumValues;

export default function AllPayoutsPage({ searchParams }: PageProps<"/admin/payouts/all">) {
  return (
    <AdminPage title="All withdrawals" description="Every withdrawal creators asked for, newest first. Monime’s fee is charged on top of the amount.">
      <Suspense fallback={<TableSkeleton filters rows={10} />}>
        <List searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function List({ searchParams }: Pick<PageProps<"/admin/payouts/all">, "searchParams">) {
  const { actor } = await requirePermission("payouts.view");
  const sp = await searchParams;
  const params = keep(sp, ["status", "creator", "cursor"]);
  const creatorId = uuidParam(sp.creator);
  const { rows, next } = await services.admin.listPayouts(actor, { status: oneOf(sp.status, STATUSES), creatorId }, str(sp.cursor));
  const base = adminHref("/admin/payouts/all");
  const canSeeCreators = can(actor, "creators.view");
  return (
    <Section flush>
      <FilterBar action={base} active={Boolean(params.status || params.creator)}>
        <SelectField compact name="status" label="Status" defaultValue={params.status ?? ""} className="w-40">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </SelectField>
        {creatorId ? <input type="hidden" name="creator" value={creatorId} /> : null}
      </FilterBar>
      {creatorId ? <p className="border-b border-border px-4 py-2.5 text-sm text-muted sm:px-5">Showing one creator’s withdrawals. Clear filters to see everyone’s.</p> : null}
      <DataTable
        caption="Withdrawals"
        rows={rows}
        rowKey={(p) => p.id}
        rowHref={(p) => adminHref(`/admin/payouts/${p.id}`)}
        columns={[
          { header: "Amount", cell: (p) => <span className="tabular-nums">{formatSLE(p.amountMinor)}</span> },
          { header: "Creator", cell: (p) => <RecordLink href={canSeeCreators && adminHref(`/admin/creators/${p.creatorId}`)}>{p.creatorLabel ?? "Unknown"}</RecordLink>, hideBelow: "sm" },
          { header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
          { header: "To", cell: (p) => <span className="text-muted">{destinationLabel(p.destinationSnapshot)}</span>, hideBelow: "lg" },
          { header: "Requested", cell: (p) => <span className="whitespace-nowrap text-muted tabular-nums">{formatDateTime(p.requestedAt)}</span>, align: "right", hideBelow: "sm" },
        ]}
        empty={<EmptyRows icon={WalletIcon} title={params.status || params.creator ? "No withdrawals match" : "No withdrawals yet"} />}
      />
      <Pagination base={base} params={params} next={next} shown={rows.length} />
    </Section>
  );
}

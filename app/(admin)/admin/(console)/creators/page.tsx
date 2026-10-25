import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { Suspense } from "react";
import { StatusBadge } from "@/components/admin/Badge";
import { DataTable, DetailLine, EmptyRows } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination } from "@/components/admin/Pagination";
import { Field } from "@/components/ui/Field";
import { formatDate, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { keep, str } from "../params";

export const metadata: Metadata = { title: "Creators" };

export default function CreatorsPage({ searchParams }: PageProps<"/admin/creators">) {
  return (
    <AdminPage title="Creators" description="Every account, newest first. Search by handle, the full email address or the user id.">
      <Suspense fallback={<TableSkeleton filters rows={10} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/admin/creators">, "searchParams">) {
  const { actor } = await requirePermission("creators.view");
  const sp = await searchParams;
  const params = keep(sp, ["q", "cursor"]);
  const { rows, next } = await services.admin.searchCreatorsPage(actor, params.q ?? "", str(sp.cursor));
  const base = adminHref("/admin/creators");
  return (
    <Section flush>
      <FilterBar action={base} active={Boolean(params.q)} label="Search creators">
        <Field compact type="search" name="q" label="Search" placeholder="@handle, email or user id" defaultValue={params.q} className="w-full sm:w-80" autoComplete="off" />
      </FilterBar>
      <DataTable
        caption="Creators"
        rows={rows}
        rowKey={(r) => r.userId}
        rowHref={(r) => adminHref(`/admin/creators/${r.userId}`)}
        columns={[
          {
            header: "Creator",
            cell: (r) => (
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{r.handle ? `@${r.handle}` : r.name || "No page yet"}</span>
                <span className="truncate text-[0.8125rem] font-normal text-muted">{r.email}</span>
              </span>
            ),
            // Below md: risk tier; below sm also the page status and when they joined.
            detail: (r) => (
              <DetailLine
                parts={[
                  { key: "tier", content: r.riskTier ? `${humanize(r.riskTier)} risk` : "No risk tier" },
                  { key: "page", content: r.profileStatus ? `Page ${humanize(r.profileStatus).toLowerCase()}` : "No page", below: "sm" },
                  { key: "joined", content: `Joined ${formatDate(r.createdAt)}`, below: "sm" },
                ]}
              />
            ),
          },
          { header: "Account", cell: (r) => <StatusBadge status={r.status} /> },
          { header: "Page", cell: (r) => (r.profileStatus ? <StatusBadge status={r.profileStatus} /> : <span className="text-muted">None</span>), hideBelow: "sm" },
          { header: "Risk tier", cell: (r) => (r.riskTier ? <StatusBadge status={r.riskTier} /> : <span className="text-muted">None</span>), hideBelow: "md" },
          { header: "Joined", cell: (r) => <span className="whitespace-nowrap text-muted tabular-nums">{formatDate(r.createdAt)}</span>, align: "right", hideBelow: "sm" },
        ]}
        empty={
          <EmptyRows icon={UsersThreeIcon} title={params.q ? `No one matches “${params.q}”` : "No accounts yet"}>
            {params.q ? "Handles match from the start. Emails and ids must be complete." : null}
          </EmptyRows>
        }
      />
      <Pagination base={base} params={params} next={next} shown={rows.length} />
    </Section>
  );
}

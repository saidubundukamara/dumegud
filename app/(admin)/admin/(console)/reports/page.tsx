import { FlagIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination } from "@/components/admin/Pagination";
import { RecordLink } from "@/components/admin/RecordLink";
import { Tabs } from "@/components/admin/Tabs";
import { formatDateTime, formatRelative, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm, NoteInput } from "@/app/(admin)/admin/action-form";
import { oneOf, str } from "../params";
import { resolveReport } from "./actions";

export const metadata: Metadata = { title: "Reports" };

const TABS = ["open", "actioned", "dismissed"] as const;
const LABEL = { open: "Open", actioned: "Taken down", dismissed: "Dismissed" } as const;

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <AdminPage title="Reports" description="Supporters and buyers report pages and products here. Taking something down hides it for everyone.">
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/admin/reports">, "searchParams">) {
  const { actor } = await requirePermission("reports.view");
  const sp = await searchParams;
  const status = oneOf(sp.status, TABS) ?? "open";
  const cursor = str(sp.cursor);
  const { rows, next } = await services.reports.list(actor, status, cursor);
  const base = adminHref("/admin/reports");
  const canResolve = can(actor, "reports.resolve");
  const canSeeCreators = can(actor, "creators.view");
  const now = new Date();
  const target = (r: (typeof rows)[number]) => (
    <span className="flex flex-wrap items-center gap-2">
      <Badge>{r.targetType === "product" ? "Product" : "Page"}</Badge>
      <RecordLink href={canSeeCreators && r.creatorId && adminHref(`/admin/creators/${r.creatorId}`)}>{r.targetLabel}</RecordLink>
      {r.targetStatus === "suspended" ? <StatusBadge status="suspended" label="Already down" /> : null}
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <Tabs label="Report status" items={TABS.map((t) => ({ href: (t === "open" ? base : `${base}?status=${t}`) as Route, label: LABEL[t], active: t === status }))} />
      {status === "open" ? (
        rows.length ? (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Section title={humanize(r.reason)} description={<span title={formatDateTime(r.createdAt)}>Reported {formatRelative(r.createdAt, now)}</span>}>
                  <div className="flex flex-col gap-4">
                    {target(r)}
                    {r.details ? <blockquote className="max-w-[65ch] whitespace-pre-line border-l-2 border-border-strong pl-3 text-sm">{r.details}</blockquote> : <p className="text-sm text-muted">No details given.</p>}
                    {canResolve ? (
                      <div className="flex flex-wrap items-start gap-2">
                        {r.targetStatus !== "suspended" ? (
                          <ActionForm
                            action={resolveReport}
                            hidden={{ reportId: r.id, action: "suspend" }}
                            label="Take down"
                            variant="danger"
                            confirm={{
                              title: `Take ${r.targetLabel} down?`,
                              body: r.targetType === "product" ? "Buyers can’t see or buy it from now on. Anyone who bought it keeps their downloads." : "The page and its products disappear for everyone. Supporters can’t give.",
                              danger: true,
                              fields: <NoteInput name="reason" required />,
                            }}
                          />
                        ) : null}
                        <ActionForm action={resolveReport} hidden={{ reportId: r.id, action: "dismiss", reason: "" }} label={r.targetStatus === "suspended" ? "Close report" : "Dismiss"} variant="secondary" />
                      </div>
                    ) : null}
                  </div>
                </Section>
              </li>
            ))}
          </ul>
        ) : (
          <Section>
            <EmptyRows icon={FlagIcon} title="No open reports">
              New reports show up here, newest first.
            </EmptyRows>
          </Section>
        )
      ) : (
        <Section flush>
          <DataTable
            caption={`Reports: ${LABEL[status]}`}
            rows={rows}
            rowKey={(r) => r.id}
            columns={[
              { header: "About", cell: target },
              { header: "Reason", cell: (r) => humanize(r.reason), hideBelow: "sm" },
              { header: "Details", cell: (r) => <span className="line-clamp-2 max-w-[40ch] text-muted">{r.details || "None"}</span>, hideBelow: "lg" },
              { header: "Closed", cell: (r) => <span className="whitespace-nowrap text-muted">{formatDateTime(r.resolvedAt)}</span>, align: "right", hideBelow: "sm" },
            ]}
            empty={<EmptyRows icon={FlagIcon} title={`No reports ${LABEL[status].toLowerCase()}`} />}
          />
        </Section>
      )}
      <Pagination base={base} params={{ status: status === "open" ? undefined : status, cursor }} next={next} shown={rows.length} />
    </div>
  );
}

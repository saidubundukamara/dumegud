import { ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination } from "@/components/admin/Pagination";
import { RecordLink } from "@/components/admin/RecordLink";
import { Tabs } from "@/components/admin/Tabs";
import { RawJson } from "@/components/admin/Timeline";
import { formatDateTime, formatRelative, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { requirePermission } from "@/server/dal/admin-session";
import { alertStatus } from "@/server/db/schema";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ActionForm, NoteArea } from "@/app/(admin)/admin/action-form";
import { oneOf, str, uuidParam } from "../params";
import { dismissAlert, openCase } from "./actions";

export const metadata: Metadata = { title: "Risk" };

const TABS = ["alerts", "cases", "closed", "past-alerts"] as const;

export default function RiskPage({ searchParams }: PageProps<"/admin/risk">) {
  return (
    <AdminPage title="Risk" description="Alerts are signals worth a look, not findings. Group them into a case to decide what happens.">
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/admin/risk">, "searchParams">) {
  const { actor } = await requirePermission("risk.view");
  const sp = await searchParams;
  const tab = oneOf(sp.tab, TABS) ?? "alerts";
  const cursor = str(sp.cursor);
  const creator = uuidParam(sp.creator);
  const base = adminHref("/admin/risk");
  const [openAlerts, openCases] = await Promise.all([services.cases.listAlerts(actor), services.cases.listOpen(actor)]);
  const now = new Date();

  const tabs = (
    <Tabs
      label="Risk sections"
      items={[
        { href: base, label: "Open alerts", count: openAlerts.length, active: tab === "alerts" },
        { href: `${base}?tab=cases` as Route, label: "Open cases", count: openCases.length, active: tab === "cases" },
        { href: `${base}?tab=closed` as Route, label: "Closed cases", active: tab === "closed" },
        { href: `${base}?tab=past-alerts` as Route, label: "Past alerts", active: tab === "past-alerts" },
      ]}
    />
  );

  if (tab === "alerts") {
    const alerts = creator ? openAlerts.filter((a) => a.creatorId === creator) : openAlerts;
    const labels = await services.admin.creatorLabels(actor, alerts.map((a) => a.creatorId));
    const canAct = can(actor, "risk.cases");
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        {alerts.length ? (
          <ul className="flex flex-col gap-3">
            {alerts.map((a) => (
              <li key={a.id}>
                <Section
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {humanize(a.ruleCode)}
                      <StatusBadge status={a.severity} label={`${humanize(a.severity)} severity`} />
                    </span>
                  }
                  description={
                    <>
                      {a.creatorId ? (
                        <RecordLink href={can(actor, "creators.view") && adminHref(`/admin/creators/${a.creatorId}`)}>{labels.get(a.creatorId) ?? "Unknown creator"}</RecordLink>
                      ) : (
                        "No creator"
                      )}{" "}
                      · <span title={formatDateTime(a.createdAt)}>raised {formatRelative(a.createdAt, now)}</span>
                    </>
                  }
                >
                  <div className="flex flex-col gap-3">
                    <RawJson value={a.evidence} label="Evidence" open />
                    {canAct ? (
                      <div className="flex flex-wrap items-start gap-2">
                        {a.creatorId ? (
                          <ActionForm
                            action={openCase}
                            hidden={{ creatorId: a.creatorId, alertId: a.id }}
                            label="Open a case"
                            variant="secondary"
                            confirm={{ title: "Open a case for this alert?", body: "You’re assigned to it. Decide what happens from the case page.", confirmLabel: "Open case", fields: <NoteArea label="Note (optional)" rows={2} /> }}
                          />
                        ) : null}
                        <ActionForm action={dismissAlert} hidden={{ alertId: a.id }} label="Dismiss" variant="ghost" />
                      </div>
                    ) : null}
                  </div>
                </Section>
              </li>
            ))}
          </ul>
        ) : (
          <Section>
            <EmptyRows icon={ShieldCheckIcon} title="No open alerts">
              The risk rules raise alerts here. Rules are on the Risk rules page.
            </EmptyRows>
          </Section>
        )}
      </div>
    );
  }

  if (tab === "cases" || tab === "closed") {
    const page = tab === "cases" ? { rows: openCases, next: null } : await services.cases.closedCasesPage(actor, cursor);
    const labels = await services.admin.creatorLabels(actor, page.rows.map((c) => c.creatorId));
    return (
      <div className="flex flex-col gap-4">
        {tabs}
        <Section flush>
          <DataTable
            caption={tab === "cases" ? "Open cases" : "Closed cases"}
            rows={page.rows}
            rowKey={(c) => c.id}
            rowHref={(c) => adminHref(`/admin/risk/cases/${c.id}`)}
            columns={[
              { header: "Creator", cell: (c) => labels.get(c.creatorId) ?? "Unknown" },
              { header: "Reasons", cell: (c) => (c.reasonCodes.length ? c.reasonCodes.map(humanize).join(", ") : "Opened by staff"), hideBelow: "md" },
              {
                header: "Status",
                cell: (c) => (
                  <span className="flex flex-wrap gap-1.5">
                    <StatusBadge status={c.status} />
                    {c.decision && tab === "closed" ? <Badge>{humanize(c.decision)}</Badge> : null}
                  </span>
                ),
              },
              { header: tab === "cases" ? "Opened" : "Closed", cell: (c) => <span className="whitespace-nowrap text-muted">{formatDateTime(tab === "cases" ? c.createdAt : c.updatedAt)}</span>, align: "right", hideBelow: "sm" },
            ]}
            empty={<EmptyRows icon={ShieldCheckIcon} title={tab === "cases" ? "No open cases" : "No closed cases yet"} />}
          />
          <Pagination base={base} params={{ tab, cursor }} next={page.next} shown={page.rows.length} />
        </Section>
      </div>
    );
  }

  const status = oneOf(sp.status, alertStatus.enumValues.filter((s) => s !== "open")) ?? "dismissed";
  const page = await services.cases.alertsPage(actor, status, cursor);
  const labels = await services.admin.creatorLabels(actor, page.rows.map((a) => a.creatorId));
  return (
    <div className="flex flex-col gap-4">
      {tabs}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Alert outcome">
        {(["dismissed", "actioned", "escalated"] as const).map((s) => (
          <Link
            key={s}
            href={`${base}?tab=past-alerts&status=${s}` as Route}
            aria-current={s === status ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium ring-1 transition-colors ${s === status ? "bg-text text-background ring-text" : "text-muted ring-border hover:text-text"}`}
          >
            {humanize(s)}
          </Link>
        ))}
      </div>
      <Section flush>
        <DataTable
          caption="Past alerts"
          rows={page.rows}
          rowKey={(a) => a.id}
          rowHref={(a) => (a.caseId ? adminHref(`/admin/risk/cases/${a.caseId}`) : null)}
          columns={[
            { header: "Rule", cell: (a) => humanize(a.ruleCode) },
            { header: "Creator", cell: (a) => (a.creatorId ? (labels.get(a.creatorId) ?? "Unknown") : "None"), hideBelow: "sm" },
            { header: "Severity", cell: (a) => <StatusBadge status={a.severity} />, hideBelow: "md" },
            { header: "Raised", cell: (a) => <span className="whitespace-nowrap text-muted">{formatDateTime(a.createdAt)}</span>, align: "right", hideBelow: "sm" },
          ]}
          empty={<EmptyRows icon={ShieldCheckIcon} title={`No ${humanize(status).toLowerCase()} alerts`} />}
        />
        <Pagination base={base} params={{ tab, status, cursor }} next={page.next} shown={page.rows.length} />
      </Section>
    </div>
  );
}

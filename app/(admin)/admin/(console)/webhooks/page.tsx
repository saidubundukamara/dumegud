import { ClockIcon, PlugsConnectedIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { Badge, StatusBadge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination } from "@/components/admin/Pagination";
import { Tabs } from "@/components/admin/Tabs";
import { SelectField } from "@/components/ui/Field";
import { formatDateTime, formatRelative, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import type { AdminActor } from "@/server/services/actor";
import { oneOf, str } from "../params";
import { everyLabel, jobHealth } from "./job-health";

export const metadata: Metadata = { title: "Webhooks & jobs" };

const STATUSES = ["failed", "dead", "processing", "processed", "ignored"] as const;

export default function WebhooksPage({ searchParams }: PageProps<"/admin/webhooks">) {
  return (
    <AdminPage title="Webhooks & jobs" description="Events Monime sends us, and the scheduled jobs that catch anything a webhook missed.">
      <Suspense fallback={<TableSkeleton filters rows={10} />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

async function Body({ searchParams }: Pick<PageProps<"/admin/webhooks">, "searchParams">) {
  const { actor } = await requirePermission("webhooks.view");
  const sp = await searchParams;
  const tab = oneOf(sp.tab, ["events", "jobs"] as const) ?? "events";
  const base = adminHref("/admin/webhooks");
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        label="Webhooks and jobs"
        items={[
          { href: base, label: "Webhook events", active: tab === "events" },
          { href: `${base}?tab=jobs` as Route, label: "Scheduled jobs", active: tab === "jobs" },
        ]}
      />
      {tab === "events" ? <Events actor={actor} status={oneOf(sp.status, STATUSES)} cursor={str(sp.cursor)} /> : <Jobs actor={actor} />}
    </div>
  );
}

async function Events({ actor, status, cursor }: { actor: AdminActor; status: (typeof STATUSES)[number] | undefined; cursor: string | undefined }) {
  const { rows, next } = await services.admin.webhookEvents(actor, status, cursor);
  const base = adminHref("/admin/webhooks");
  const now = new Date();
  return (
    <Section flush>
      <FilterBar action={base} active={Boolean(status)}>
        <SelectField compact name="status" label="Status" defaultValue={status ?? ""} className="w-44">
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "dead" ? "Gave up (dead)" : humanize(s)}
            </option>
          ))}
        </SelectField>
      </FilterBar>
      <DataTable
        caption="Webhook events"
        rows={rows}
        rowKey={(e) => e.id}
        rowHref={(e) => adminHref(`/admin/webhooks/${e.id}`)}
        columns={[
          { header: "Event", cell: (e) => <code className="font-mono text-[0.8125rem]">{e.eventName}</code> },
          { header: "Status", cell: (e) => <StatusBadge status={e.status} label={e.status === "dead" ? "Gave up" : undefined} /> },
          { header: "Tries", cell: (e) => e.attempts, align: "right", hideBelow: "sm" },
          { header: "Last error", cell: (e) => (e.lastError ? <span className="line-clamp-1 max-w-[36ch] text-danger">{e.lastError}</span> : <span className="text-muted">None</span>), hideBelow: "lg" },
          { header: "Received", cell: (e) => <span className="whitespace-nowrap text-muted" title={formatDateTime(e.receivedAt)}>{formatRelative(e.receivedAt, now)}</span>, align: "right" },
        ]}
        empty={
          <EmptyRows icon={PlugsConnectedIcon} title={status ? `No ${humanize(status).toLowerCase()} events` : "No webhook events yet"}>
            {status === "failed" || status === "dead" ? "Nothing needs replaying." : null}
          </EmptyRows>
        }
      />
      <Pagination base={base} params={{ status, cursor }} next={next} shown={rows.length} />
    </Section>
  );
}

async function Jobs({ actor }: { actor: AdminActor }) {
  const { latest, recent, now } = await services.admin.jobHistory(actor);
  const health = jobHealth(latest, now);
  return (
    <>
      <Section title="Each job’s last run" description="A job is overdue when its last run is more than twice its interval ago." flush>
        <DataTable
          caption="Scheduled jobs"
          rows={health}
          rowKey={(j) => j.name}
          columns={[
            { header: "Job", cell: (j) => <span className="font-medium">{humanize(j.name)}</span> },
            { header: "Runs", cell: (j) => everyLabel(j.minutes), hideBelow: "sm" },
            {
              header: "State",
              cell: (j) =>
                j.failed ? <Badge tone="danger">Failed</Badge> : j.overdue ? <Badge tone="warning">{j.run ? "Overdue" : "Never run"}</Badge> : <Badge tone="success">On time</Badge>,
            },
            { header: "Done / errors", cell: (j) => (j.run ? `${j.run.processed} / ${j.run.errors}` : "None"), align: "right", hideBelow: "md" },
            { header: "Last run", cell: (j) => <span className="whitespace-nowrap text-muted">{j.run ? formatRelative(j.run.startedAt, now) : "Never"}</span>, align: "right" },
          ]}
          empty={null}
        />
      </Section>
      <Section title="Recent runs" flush>
        <DataTable
          caption="Recent job runs"
          rows={recent}
          rowKey={(r) => r.id}
          columns={[
            { header: "Job", cell: (r) => humanize(r.name) },
            { header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
            { header: "Done / errors", cell: (r) => `${r.processed} / ${r.errors}`, align: "right", hideBelow: "sm" },
            { header: "Error", cell: (r) => (r.error ? <span className="line-clamp-1 max-w-[36ch] text-danger">{r.error}</span> : null), hideBelow: "lg" },
            { header: "Started", cell: (r) => <span className="whitespace-nowrap text-muted">{formatDateTime(r.startedAt)}</span>, align: "right" },
          ]}
          empty={<EmptyRows icon={ClockIcon} title="No runs recorded yet" />}
        />
      </Section>
    </>
  );
}

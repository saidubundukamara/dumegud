import { ClockCounterClockwiseIcon, DownloadSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { Badge } from "@/components/admin/Badge";
import { DataTable, EmptyRows } from "@/components/admin/DataTable";
import { FilterBar } from "@/components/admin/FilterBar";
import { TableSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { Pagination, withQuery } from "@/components/admin/Pagination";
import { RecordLink } from "@/components/admin/RecordLink";
import { RawJson } from "@/components/admin/Timeline";
import { Field } from "@/components/ui/Field";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatDateTime, humanize } from "@/lib/admin-format";
import { adminHref } from "@/lib/admin-host";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can, type AdminActor } from "@/server/services/actor";
import { dateParam, keep, str, uuidParam } from "../params";

export const metadata: Metadata = { title: "Audit log" };

const KEYS = ["action", "targetType", "targetId", "actorId", "from", "to", "cursor"] as const;

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <AdminPage title="Audit log" description="Every staff action and security-relevant change, newest first. Rows can’t be edited or deleted.">
      <Suspense fallback={<TableSkeleton filters rows={12} />}>
        <Entries searchParams={searchParams} />
      </Suspense>
    </AdminPage>
  );
}

/** Where a target opens in the console, when the admin can open it. */
function targetHref(actor: AdminActor, type: string, id: string | null): Route | null {
  if (!id || !isUuid(id)) return null;
  switch (type) {
    case "user":
      return can(actor, "creators.view") ? adminHref(`/admin/creators/${id}`) : null;
    case "payment":
      return can(actor, "transactions.view") ? adminHref(`/admin/transactions/${id}`) : null;
    case "payout":
      return can(actor, "payouts.view") ? adminHref(`/admin/payouts/${id}`) : null;
    case "kyc_submission":
      return can(actor, "kyc.view") ? adminHref(`/admin/kyc/${id}`) : null;
    case "risk_case":
      return can(actor, "risk.view") ? adminHref(`/admin/risk/cases/${id}`) : null;
    case "admin":
      return can(actor, "admins.manage") ? adminHref(`/admin/admins/${id}`) : null;
    case "webhook_event":
      return can(actor, "webhooks.view") ? adminHref(`/admin/webhooks/${id}`) : null;
    default:
      return null;
  }
}

async function Entries({ searchParams }: Pick<PageProps<"/admin/audit">, "searchParams">) {
  const { actor } = await requirePermission("audit.view");
  const sp = await searchParams;
  const params = keep(sp, KEYS);
  const clip = (v: string | undefined) => v?.slice(0, 100);
  const filter = {
    action: clip(params.action),
    targetType: clip(params.targetType),
    targetId: clip(params.targetId),
    actorId: uuidParam(sp.actorId),
    from: dateParam(sp.from),
    to: dateParam(sp.to, true),
  };
  const { rows, next } = await services.admin.auditLog(actor, filter, str(sp.cursor));
  const names = await services.admin.adminNames(actor, rows.filter((r) => r.actorType === "admin").map((r) => r.actorId));
  const base = adminHref("/admin/audit");
  const filtered = KEYS.some((k) => k !== "cursor" && params[k]);
  const who = (r: (typeof rows)[number]) => {
    if (r.actorType === "admin") return (r.actorId && names.get(r.actorId)) || "Former admin";
    if (r.actorType === "user") return "The creator";
    // Rows from before admins moved out of users carry only a role.
    return r.actorRole ? humanize(r.actorRole) : "System";
  };
  const exportHref = withQuery("/api/admin/audit/export" as Route, { ...params, cursor: undefined });

  return (
    <Section
      flush
      actions={
        can(actor, "audit.export") ? (
          <a href={exportHref} className={buttonClasses("secondary", "", "sm")} title="Needs sensitive actions unlocked. The export is itself logged.">
            <DownloadSimpleIcon aria-hidden="true" className="size-4" />
            Export CSV
          </a>
        ) : null
      }
      title={filtered ? "Filtered" : "Everything"}
      description={can(actor, "audit.export") ? "Exporting needs sensitive actions unlocked, and is itself logged." : undefined}
    >
      <FilterBar action={base} active={filtered}>
        <Field compact name="action" label="Action starts with" placeholder="payout." defaultValue={params.action} className="w-40" autoComplete="off" />
        <Field compact name="targetType" label="Target type" placeholder="user" defaultValue={params.targetType} className="w-32" autoComplete="off" />
        <Field compact name="targetId" label="Target id" defaultValue={params.targetId} className="w-48 [&_input]:font-mono" autoComplete="off" />
        <Field compact name="actorId" label="Done by (id)" defaultValue={params.actorId} className="w-48 [&_input]:font-mono" autoComplete="off" />
        <Field compact name="from" type="date" label="From" defaultValue={params.from} className="w-40" />
        <Field compact name="to" type="date" label="To" defaultValue={params.to} className="w-40" />
      </FilterBar>
      <DataTable
        caption="Audit log"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          {
            header: "What",
            cell: (r) => (
              <span className="flex flex-col gap-1">
                <span className="font-medium">{humanize(r.action)}</span>
                <code className="font-mono text-xs text-muted">{r.action}</code>
                {r.before || r.after ? <RawJson value={{ before: r.before ?? undefined, after: r.after ?? undefined }} label="Before and after" /> : null}
              </span>
            ),
          },
          {
            header: "On",
            cell: (r) => (
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge>{humanize(r.targetType)}</Badge>
                {r.targetId ? (
                  <RecordLink href={targetHref(actor, r.targetType, r.targetId)} className="font-mono text-xs">
                    {r.targetId.length > 12 ? r.targetId.slice(0, 8) : r.targetId}
                  </RecordLink>
                ) : null}
              </span>
            ),
            hideBelow: "sm",
          },
          { header: "By", cell: (r) => <span className="whitespace-nowrap">{who(r)}</span>, hideBelow: "md" },
          { header: "When", cell: (r) => <span className="whitespace-nowrap text-muted tabular-nums">{formatDateTime(r.createdAt)}</span>, align: "right" },
        ]}
        empty={<EmptyRows icon={ClockCounterClockwiseIcon} title={filtered ? "Nothing matches these filters" : "Nothing logged yet"} />}
      />
      <Pagination base={base} params={params} next={next} shown={rows.length} />
    </Section>
  );
}

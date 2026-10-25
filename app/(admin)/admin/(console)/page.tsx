import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, redirect } from "next/navigation";
import { Suspense } from "react";
import { KeyValue } from "@/components/admin/KeyValue";
import { TilesSkeleton } from "@/components/admin/Loading";
import { AdminPage, Section } from "@/components/admin/Page";
import { StatTile } from "@/components/admin/StatTile";
import { CopyId } from "@/components/admin/CopyId";
import { adminHref } from "@/lib/admin-host";
import { formatRelative, humanize } from "@/lib/admin-format";
import { formatSLE } from "@/lib/money";
import { requireAdmin } from "@/server/dal/admin-session";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { NAV_ITEMS } from "../nav-config";
import { jobHealth } from "./webhooks/job-health";

export const metadata: Metadata = { title: "Overview" };

export default function AdminOverviewPage() {
  return (
    <AdminPage title="Overview" description="What needs a person today, and how the last 30 days went.">
      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            <TilesSkeleton />
            <TilesSkeleton />
          </div>
        }
      >
        <Overview />
      </Suspense>
    </AdminPage>
  );
}

const count = (n: number) => n.toLocaleString("en-GB");

async function Overview() {
  const session = await requireAdmin();
  const { actor } = session;
  if (!can(actor, "overview.view")) {
    // Not every role sees the overview: send them to the first page they can open.
    const first = NAV_ITEMS.find((i) => i.href !== "/admin" && can(actor, i.permission));
    if (first) redirect(adminHref(first.href));
    forbidden();
  }
  const [o, jobs] = await Promise.all([services.admin.overview(actor), can(actor, "webhooks.view") ? services.admin.jobHistory(actor) : null]);
  const health = jobs ? jobHealth(jobs.latest, jobs.now) : [];
  const unhealthy = health.filter((j) => j.failed || j.overdue);

  const queues = [
    { label: "ID checks waiting", value: o.pendingKyc, href: "/admin/kyc", permission: "kyc.view", hint: "Oldest first in the queue" },
    { label: "Withdrawals to review", value: o.payoutsInReview, href: "/admin/payouts", permission: "payouts.view", hint: "Held for a person to release" },
    { label: "Open risk alerts", value: o.openAlerts, href: "/admin/risk", permission: "risk.view", hint: "Signals, not restrictions" },
    { label: "Open reports", value: o.openReports, href: "/admin/reports", permission: "reports.view", hint: "From supporters and buyers" },
  ] as const;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="attention" className="flex flex-col gap-3">
        <h2 id="attention" className="text-[0.9375rem] font-semibold">
          Needs attention
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {queues.map((q) => (
            <StatTile
              key={q.href}
              label={q.label}
              value={count(q.value)}
              href={can(actor, q.permission) ? adminHref(q.href) : undefined}
              attention={q.value > 0}
              hint={q.value > 0 ? q.hint : "All clear"}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="money" className="flex flex-col gap-3">
        <h2 id="money" className="text-[0.9375rem] font-semibold">
          Last 30 days
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Gross volume" value={formatSLE(o.gtvMinor)} hint="Support and product sales that settled" href={can(actor, "transactions.view") ? adminHref("/admin/transactions?status=succeeded") : undefined} />
          <StatTile label="Platform revenue" value={formatSLE(o.revenueMinor)} hint="Fees kept by DuMeGud" />
          <StatTile label="Product sales" value={formatSLE(o.productSalesMinor)} hint="Part of gross volume" href={can(actor, "transactions.view") ? adminHref("/admin/transactions?kind=order&status=succeeded") : undefined} />
          <StatTile label="New accounts" value={count(o.registrations)} hint={`${count(o.published)} creator pages live now`} href={can(actor, "creators.view") ? adminHref("/admin/creators") : undefined} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Money in Monime" description="The ledger-drift job compares this and every creator wallet with the ledger each hour.">
          <KeyValue
            items={[
              ["Platform balance", o.platformBalanceMinor === null ? <span className="text-warning">Monime didn’t answer. Try again shortly.</span> : <span className="font-semibold tabular-nums">{formatSLE(o.platformBalanceMinor)}</span>],
              ["Platform account", <CopyId key="acct" value={o.platformAccountId} />],
              ["Settled, not yet moved to creators", count(o.pendingTransfers)],
              ["Ledger drift alerts", o.openDriftAlerts ? <span className="font-semibold text-danger">{count(o.openDriftAlerts)} open</span> : "None"],
            ]}
          />
        </Section>
        <Section title="System health" description={jobs ? "Webhooks from Monime and the scheduled jobs." : "Webhooks from Monime."}>
          <KeyValue
            items={[
              [
                "Failed webhooks",
                o.failedWebhooks ? (
                  <Link className="font-semibold text-danger underline-offset-2 hover:underline" href={adminHref("/admin/webhooks?status=failed")}>
                    {count(o.failedWebhooks)} to replay
                  </Link>
                ) : (
                  "None"
                ),
              ],
              jobs && [
                "Scheduled jobs",
                !jobs.recent.length ? (
                  <span className="text-warning">No job has run yet. Check the cron schedules.</span>
                ) : unhealthy.length ? (
                  <span className="text-danger">
                    {unhealthy.map((j) => `${humanize(j.name)} ${j.failed ? "failed" : "is overdue"}`).join(", ")}
                  </span>
                ) : (
                  `All ${health.length} on time`
                ),
              ],
              jobs && ["Last job run", jobs.recent[0] ? `${humanize(jobs.recent[0].name)}, ${formatRelative(jobs.recent[0].startedAt, jobs.now)}` : "Never"],
            ]}
            columns={1}
          />
        </Section>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminOverviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}

async function Overview() {
  const { actor } = await requireRole("staff", "super_admin");
  const o = await services.admin.overview(actor);
  const tiles: [string, string][] = [
    ["Registrations (30 days)", String(o.registrations)],
    ["Published creators", String(o.published)],
    ["Gross volume (30 days)", formatSLE(o.gtvMinor)],
    ["Platform revenue (30 days)", formatSLE(o.revenueMinor)],
    ["Settled, not yet transferred", String(o.pendingTransfers)],
    ["Payouts in review", String(o.payoutsInReview)],
    ["KYC waiting", String(o.pendingKyc)],
    ["Open risk alerts", String(o.openAlerts)],
    ["Open reports", String(o.openReports)],
    ["Failed webhooks", String(o.failedWebhooks)],
  ];
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-brand border border-border p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="rounded-brand border border-border p-4 text-sm">
        <p>
          Platform account <code>{o.platformAccountId}</code>:{" "}
          {o.platformBalanceMinor === null ? "balance unavailable" : formatSLE(o.platformBalanceMinor)}
        </p>
        <p className="text-muted">Ledger drift checks arrive with the Phase 9 reconciliation jobs.</p>
      </section>
    </>
  );
}

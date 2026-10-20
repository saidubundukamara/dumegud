import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { ActionForm } from "../action-form";
import { replayWebhook } from "../ops-actions";

export const metadata: Metadata = { title: "Webhooks", robots: { index: false } };

const STATUSES = ["failed", "dead", "ignored", "processing", "processed"] as const;

export default function WebhooksPage({ searchParams }: PageProps<"/admin/webhooks">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Webhook events</h1>
      <form className="flex gap-2 text-sm">
        <select name="status" aria-label="Status" className="min-h-10 rounded-brand border border-border bg-background px-3">
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="min-h-10 rounded-brand border border-border px-4 font-semibold">Filter</button>
      </form>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Events searchParams={searchParams} />
      </Suspense>
      <h2 className="text-xl font-bold">Cron runs</h2>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <CronRuns />
      </Suspense>
    </main>
  );
}

// How often each job should run; a job whose last run is older than twice this is flagged.
const JOB_INTERVAL_MIN: Record<string, number> = {
  "provision-wallets": 5,
  "retry-transfers": 5,
  "reconcile-payments": 10,
  "reconcile-payouts": 10,
  "ledger-drift": 60,
  cleanup: 24 * 60,
  "account-deletions": 24 * 60,
};

const stamp = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

async function CronRuns() {
  const { actor } = await requireRole("staff", "super_admin");
  const { latest, recent, now } = await services.admin.jobHistory(actor);
  const lastRun = new Map(latest.map((r) => [r.name, r]));
  return (
    <>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {Object.entries(JOB_INTERVAL_MIN).map(([name, minutes]) => {
          const run = lastRun.get(name);
          const late = !run || now.getTime() - run.startedAt.getTime() > 2 * minutes * 60_000;
          const bad = run?.status === "failed" || late;
          return (
            <li key={name} className={`flex flex-col gap-1 rounded-brand border p-3 ${bad ? "border-danger" : "border-border"}`}>
              <p className="font-semibold">{name}</p>
              <p className={bad ? "text-danger" : "text-muted"}>
                {run ? `${run.status} · ${stamp(run.startedAt)} · ${run.processed} done · ${run.errors} errors` : "never run"}
                {run && late ? " · overdue" : ""}
              </p>
            </li>
          );
        })}
      </ul>
      <ul className="flex flex-col gap-1 text-sm">
        {recent.map((r) => (
          <li key={r.id} className="flex flex-wrap gap-x-2">
            <span className="font-semibold">{r.name}</span>
            <span>{r.status}</span>
            <span className="text-muted">{stamp(r.startedAt)}</span>
            <span className="text-muted">
              {r.processed} done · {r.errors} errors
            </span>
            {r.error ? <span className="text-danger">{r.error}</span> : null}
          </li>
        ))}
      </ul>
    </>
  );
}

async function Events({ searchParams }: Pick<PageProps<"/admin/webhooks">, "searchParams">) {
  const { actor } = await requireRole("staff", "super_admin");
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as (typeof STATUSES)[number]) ? (status as (typeof STATUSES)[number]) : undefined;
  const events = await services.admin.webhookEvents(actor, filter);
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 rounded-brand border border-border p-3">
          <p>
            <span className="font-semibold">{e.eventName}</span> · {e.status} · attempts {e.attempts} · {e.receivedAt.toISOString().slice(0, 19).replace("T", " ")}
          </p>
          {e.lastError ? <p className="text-danger">{e.lastError}</p> : null}
          {e.status === "failed" || e.status === "dead" ? <ActionForm action={replayWebhook} hidden={{ eventId: e.id }} label="Replay" /> : null}
        </li>
      ))}
    </ul>
  );
}

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
      <p className="text-sm text-muted">Cron run history arrives with the Phase 9 jobs.</p>
    </main>
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

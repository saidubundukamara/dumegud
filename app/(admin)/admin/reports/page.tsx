import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { ResolveForm } from "./resolve-form";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

export default function ReportsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Content reports</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Queue />
      </Suspense>
    </main>
  );
}

async function Queue() {
  const { actor } = await requireRole("staff", "super_admin");
  const reports = await services.reports.listOpen(actor);
  if (!reports.length) return <p className="text-muted">No open reports.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {reports.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 rounded-brand border border-border p-4">
          <p className="font-semibold">
            {r.targetType}: {r.targetLabel} · {r.reason}
          </p>
          {r.details ? <p className="whitespace-pre-line text-sm">{r.details}</p> : null}
          <p className="text-sm text-muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}</p>
          <ResolveForm reportId={r.id} />
        </li>
      ))}
    </ul>
  );
}

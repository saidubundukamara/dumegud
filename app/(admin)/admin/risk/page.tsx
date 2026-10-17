import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { AlertActions, DecideForm } from "./forms";

export const metadata: Metadata = { title: "Risk", robots: { index: false } };

export default function RiskPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Risk alerts and cases</h1>
      <p className="text-muted">Alerts are signals for review, not findings of wrongdoing.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Risk />
      </Suspense>
    </main>
  );
}

async function Risk() {
  const { actor } = await requireRole("staff", "super_admin");
  const [alerts, cases] = await Promise.all([services.cases.listAlerts(actor), services.cases.listOpen(actor)]);
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Open alerts ({alerts.length})</h2>
        <ul className="flex flex-col gap-3">
          {alerts.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-brand border border-border p-4">
              <p className="font-semibold">
                {a.ruleCode} · {a.severity}
              </p>
              <p className="text-sm text-muted">
                {a.subjectType} {a.subjectId.slice(0, 8)} · {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </p>
              <pre className="overflow-x-auto rounded bg-surface p-2 text-xs">{JSON.stringify(a.evidence, null, 2)}</pre>
              <AlertActions alertId={a.id} creatorId={a.creatorId} />
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Open cases ({cases.length})</h2>
        <ul className="flex flex-col gap-3">
          {cases.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-brand border border-border p-4">
              <p className="font-semibold">
                Creator {c.creatorId.slice(0, 8)} · {c.status}
              </p>
              <p className="text-sm text-muted">Reasons: {c.reasonCodes.join(", ") || "manual"}</p>
              {c.pendingDecision ? (
                <p className="text-sm text-warning">Waiting for a second approval: {(c.pendingDecision as { decision: string }).decision}</p>
              ) : null}
              <DecideForm caseId={c.id} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

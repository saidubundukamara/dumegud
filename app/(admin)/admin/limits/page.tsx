import type { Metadata } from "next";
import { Suspense } from "react";
import { MINOR_PER_MAJOR } from "@/lib/money";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { LimitForm } from "./limit-form";

export const metadata: Metadata = { title: "Limits", robots: { index: false } };

export default function LimitsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Transaction limits</h1>
      <p className="text-muted">Changes apply immediately and are recorded in the audit log. Only super admins can edit.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Limits />
      </Suspense>
    </main>
  );
}

async function Limits() {
  const { actor } = await requireRole("staff", "super_admin");
  const limits = await services.adminConfig.listLimits(actor);
  const editable = actor.role === "super_admin";
  const major = (minor: number | null) => (minor === null ? "" : (minor / MINOR_PER_MAJOR).toFixed(2));
  return (
    <ul className="flex flex-col gap-4">
      {limits.map((l) => (
        <li key={l.id} className="rounded-brand border border-border p-4">
          <LimitForm
            editable={editable}
            initial={{
              id: l.id,
              scope: l.scope,
              window: l.window,
              verificationTier: l.verificationTier ?? "",
              riskTier: l.riskTier ?? "",
              maxAmount: major(l.maxAmountMinor),
              maxCount: l.maxCount === null ? "" : String(l.maxCount),
              action: l.action,
              active: l.active,
            }}
          />
        </li>
      ))}
      {editable ? (
        <li className="rounded-brand border border-dashed border-border p-4">
          <h2 className="mb-3 font-bold">New limit</h2>
          <LimitForm
            editable
            initial={{ id: "", scope: "creator_receipts", window: "24h", verificationTier: "", riskTier: "", maxAmount: "", maxCount: "", action: "review", active: true }}
          />
        </li>
      ) : null}
    </ul>
  );
}

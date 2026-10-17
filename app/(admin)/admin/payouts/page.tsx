import type { Metadata } from "next";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { ActionForm } from "../action-form";
import { redispatchPayout, resyncPayout } from "../ops-actions";
import { PayoutReviewForms } from "./review-forms";

export const metadata: Metadata = { title: "Payout review", robots: { index: false } };

export default function PayoutReviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Withdrawals waiting for review</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Queue />
      </Suspense>
      <h2 className="text-xl font-bold">Stuck (no change for 30 minutes)</h2>
      <Suspense fallback={null}>
        <Stuck />
      </Suspense>
    </main>
  );
}

async function Queue() {
  const { actor } = await requireRole("staff", "super_admin");
  const queue = await services.payouts.listInReview(actor);
  if (!queue.length) return <p className="text-muted">Nothing to review.</p>;
  return (
    <ul className="flex flex-col gap-4">
      {queue.map((p) => {
        const dest = p.destinationSnapshot as { masked?: string; providerId?: string };
        return (
          <li key={p.id} className="flex flex-col gap-3 rounded-brand border border-border p-4">
            <p className="text-xl font-bold">{formatSLE(p.amountMinor)}</p>
            <p className="text-sm text-muted">
              To {dest.providerId} {dest.masked} ({p.holderNameAtRequest ?? "no holder name"}) · fee {formatSLE(p.quotedFeeMinor)} · reason{" "}
              {p.reviewReason} · {p.requestedAt.toISOString().slice(0, 16).replace("T", " ")}
            </p>
            <PayoutReviewForms payoutId={p.id} />
          </li>
        );
      })}
    </ul>
  );
}

async function Stuck() {
  const { actor } = await requireRole("staff", "super_admin");
  const stuck = await services.admin.stuckPayouts(actor);
  if (!stuck.length) return <p className="text-muted">None.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {stuck.map((p) => (
        <li key={p.id} className="flex flex-col gap-2 rounded-brand border border-border p-4 text-sm">
          <p>
            {formatSLE(p.amountMinor)} · {p.status} · {p.monimePayoutId ?? "not sent"} · {p.lastError ?? ""}
          </p>
          {p.status === "requested" ? (
            <ActionForm action={redispatchPayout} hidden={{ payoutId: p.id }} label="Re-send (same idempotency key)" />
          ) : (
            <ActionForm action={resyncPayout} hidden={{ payoutId: p.id }} label="Re-sync from Monime" />
          )}
        </li>
      ))}
    </ul>
  );
}

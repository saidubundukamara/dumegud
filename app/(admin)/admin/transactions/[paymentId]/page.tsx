import type { Metadata } from "next";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { requireRole } from "@/server/dal/session";
import { services } from "@/server/services";
import { ActionForm, NoteInput } from "../../action-form";
import { releasePaymentReview, resyncPayment, retryTransfer } from "../../ops-actions";

export const metadata: Metadata = { title: "Transaction", robots: { index: false } };

export default function TransactionPage({ params }: PageProps<"/admin/transactions/[paymentId]">) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/transactions/[paymentId]">, "params">) {
  const { actor } = await requireRole("staff", "super_admin");
  const { paymentId } = await params;
  const { payment: p, events, ledger } = await services.admin.paymentDetail(actor, paymentId);
  const money = (v: number | null) => (v === null ? "-" : formatSLE(v));
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">
        {p.kind} · {formatSLE(p.grossMinor)} · {p.status}
      </h1>
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        {[
          ["Payment id", p.id],
          ["Creator", p.creatorId],
          ["Checkout session", p.monimeCheckoutSessionId ?? "-"],
          ["Monime payment", p.monimePaymentId ?? "-"],
          ["Transaction ref", p.financialTransactionReference ?? "-"],
          ["Channel", `${p.channelProvider ?? "-"} ${p.channelReference ?? ""}`],
          ["Monime fee", `${money(p.monimeFeeMinor)} ${p.monimeFeeSource ?? ""}${p.lateReportedFeeMinor !== null ? ` (late reported ${money(p.lateReportedFeeMinor)})` : ""}`],
          ["Platform fee", `${money(p.platformFeeMinor)} (${p.platformFeeBps} bps)`],
          ["Creator net", money(p.creatorNetMinor)],
          ["Transfer", `${p.transferStatus} ${p.transferId ?? ""} (attempts ${p.transferAttempts})`],
          ["Review hold", p.reviewHold ?? "-"],
          ["Last error", p.lastError ?? "-"],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-wrap gap-6">
        {p.status === "under_review" ? (
          <ActionForm action={releasePaymentReview} hidden={{ paymentId: p.id }} label="Release from review" variant="primary">
            <NoteInput label="Why it's safe to release" />
          </ActionForm>
        ) : null}
        {p.status === "pending" || p.status === "created" ? <ActionForm action={resyncPayment} hidden={{ paymentId: p.id }} label="Re-sync from Monime" /> : null}
        {p.status === "succeeded" && p.transferStatus !== "completed" ? <ActionForm action={retryTransfer} hidden={{ paymentId: p.id }} label="Retry transfer" /> : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Timeline</h2>
        <ul className="text-sm">
          {events.map((e) => (
            <li key={e.id}>
              {e.createdAt.toISOString().slice(0, 19).replace("T", " ")} · {e.fromStatus ?? "∅"} → {e.toStatus} · {e.source}
              {e.detail ? ` · ${JSON.stringify(e.detail)}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Ledger</h2>
        <ul className="text-sm">
          {ledger.map((l, i) => (
            <li key={i}>
              {l.key} · {l.account} · {l.amountMinor > 0 ? "Dr" : "Cr"} {formatSLE(Math.abs(l.amountMinor))}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

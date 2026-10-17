import type { Metadata } from "next";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import type { SupporterDTO } from "@/server/services/ContributionService";

export const metadata: Metadata = { title: "Supporters" };

export default function SupportersPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Supporters</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Supporters />
      </Suspense>
    </>
  );
}

async function Supporters() {
  const { actor } = await verifySession();
  const { succeeded, processing } = await services.contributions.listForCreator(actor);

  return (
    <>
      {processing.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Processing</h2>
          <p className="text-sm text-muted">Not confirmed yet. These count only once the payment succeeds.</p>
          <ul className="flex flex-col gap-2">
            {processing.map((s) => (
              <li key={s.paymentId} className="flex justify-between gap-4 rounded-brand border border-border px-4 py-3">
                <span>{s.name ?? "Anonymous"}</span>
                <span>{formatSLE(s.grossMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Received</h2>
        {succeeded.length ? (
          <ul className="flex flex-col gap-3">
            {succeeded.map((s) => (
              <SupporterCard key={s.paymentId} supporter={s} />
            ))}
          </ul>
        ) : (
          <p className="text-muted">No support yet. Share your page link to get started.</p>
        )}
      </section>
    </>
  );
}

function SupporterCard({ supporter: s }: { supporter: SupporterDTO }) {
  const fee = (minor: number | null, estimated = false) =>
    minor === null ? "pending" : `${formatSLE(minor)}${estimated ? " (est.)" : ""}`;
  return (
    <li className="flex flex-col gap-2 rounded-brand border border-border p-4">
      <div className="flex justify-between gap-4">
        <span className="font-semibold">{s.name ?? "Anonymous"}</span>
        <time dateTime={s.at.toISOString()} className="text-sm text-muted">
          {s.at.toISOString().slice(0, 10)}
        </time>
      </div>
      {s.message ? <p className="whitespace-pre-line">{s.message}</p> : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">Amount</dt>
          <dd>{formatSLE(s.grossMinor)}</dd>
        </div>
        <div>
          <dt className="text-muted">Payment fee</dt>
          <dd>{fee(s.monimeFeeMinor, s.feeEstimated)}</dd>
        </div>
        <div>
          <dt className="text-muted">DuMeGud fee</dt>
          <dd>{fee(s.platformFeeMinor)}</dd>
        </div>
        <div>
          <dt className="text-muted">You receive</dt>
          <dd className="font-semibold">{fee(s.creatorNetMinor)}</dd>
        </div>
      </dl>
    </li>
  );
}

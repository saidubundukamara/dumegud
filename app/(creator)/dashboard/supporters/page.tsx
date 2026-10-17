import type { Metadata } from "next";
import { Suspense } from "react";
import { formatSLE } from "@/lib/money";
import { SHOUTOUT_PLATFORM_LABELS } from "@/lib/shoutout";
import { TRAFFIC_SOURCE_LABELS } from "@/lib/traffic-source";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import type { SupporterDTO } from "@/server/services/ContributionService";

export const metadata: Metadata = { title: "Supporters" };

export default function SupportersPage() {
  return (
    <>
      <h1 className="text-title">Supporters</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Supporters />
      </Suspense>
    </>
  );
}

async function Supporters() {
  const { actor } = await verifySession();
  const [{ succeeded, processing }, sources] = await Promise.all([
    services.contributions.listForCreator(actor),
    services.shoutouts.sourceTotals(actor),
  ]);

  return (
    <>
      {processing.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Processing</h2>
          <p className="text-sm text-muted">Not confirmed yet. These count only once the payment succeeds.</p>
          <ul className="flex flex-col gap-2">
            {processing.map((s) => (
              <li key={s.paymentId} className="flex justify-between gap-4 rounded-brand-lg bg-surface shadow-soft ring-1 ring-border px-4 py-3">
                <span>{s.name ?? "Anonymous"}</span>
                <span>{formatSLE(s.grossMinor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sources.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Where your support comes from</h2>
          <p className="text-sm text-muted">Support and sales, counted from your share links and the app people opened your page in.</p>
          <ul className="flex flex-col gap-2">
            {sources.map((r) => (
              <li key={r.source ?? "unknown"} className="flex justify-between gap-4 rounded-brand bg-surface-muted px-4 py-2">
                <span>
                  {r.source ? TRAFFIC_SOURCE_LABELS[r.source] : "Before tracking started"}
                  <span className="ml-2 text-sm text-muted">{r.payments === 1 ? "1 payment" : `${r.payments} payments`}</span>
                </span>
                <span className="font-semibold">{formatSLE(r.grossMinor)}</span>
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
    <li className="flex flex-col gap-2 rounded-brand-lg bg-surface shadow-soft ring-1 ring-border p-4">
      <div className="flex justify-between gap-4">
        <span className="flex flex-col">
          <span className="font-semibold">{s.name ?? (s.shoutout ? `@${s.shoutout.handle}` : "Anonymous")}</span>
          {s.shoutout ? (
            <span className="text-sm text-muted">
              @{s.shoutout.handle} on {SHOUTOUT_PLATFORM_LABELS[s.shoutout.platform]}
              {s.thanked ? " · thanked" : ""}
            </span>
          ) : !s.isAnonymous ? (
            <span className="text-sm text-muted">{s.shoutoutConsent ? "Happy to be named" : "Prefers no shout-out"}</span>
          ) : null}
        </span>
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

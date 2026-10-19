import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UsersThreeIcon } from "@phosphor-icons/react/dist/ssr";
import { Panel } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatDate, formatRelative } from "@/lib/dates";
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
      <Suspense fallback={<PageSkeleton />}>
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
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">Waiting to be confirmed</h2>
            <p className="text-sm text-muted">These count once the gift goes through.</p>
          </div>
          <Panel as="ul" className="divide-y divide-border">
            {processing.map((s) => (
              <li key={s.paymentId} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="flex flex-col">
                  <span>{s.name ?? "Anonymous"}</span>
                  <time dateTime={s.at.toISOString()} className="text-sm text-muted">
                    {formatRelative(s.at)}
                  </time>
                </span>
                <span className="tabular-nums">{formatSLE(s.grossMinor)}</span>
              </li>
            ))}
          </Panel>
        </section>
      ) : null}

      {sources.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold">Where your support comes from</h2>
            <p className="text-sm text-muted">Gifts and sales, counted from your share links and the app people opened your page in.</p>
          </div>
          <Panel as="ul" className="divide-y divide-border">
            {sources.map((r) => (
              <li key={r.source ?? "unknown"} className="flex items-center justify-between gap-4 px-4 py-3">
                <span>
                  {r.source ? TRAFFIC_SOURCE_LABELS[r.source] : "Earlier gifts"}
                  <span className="ml-2 text-sm text-muted">{r.payments === 1 ? "1 time" : `${r.payments} times`}</span>
                </span>
                <span className="font-semibold tabular-nums">{formatSLE(r.grossMinor)}</span>
              </li>
            ))}
          </Panel>
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
          <EmptyState
            icon={UsersThreeIcon}
            title="No supporters yet"
            action={
              <Link href="/dashboard" className={buttonClasses("secondary")}>
                Get your page link
              </Link>
            }
          >
            Share your page link where your fans are. Every gift shows up here.
          </EmptyState>
        )}
      </section>
    </>
  );
}

function SupporterCard({ supporter: s }: { supporter: SupporterDTO }) {
  const fee = (minor: number | null, estimated = false) =>
    minor === null ? "Pending" : `${formatSLE(minor)}${estimated ? " (about)" : ""}`;
  return (
    <Panel as="li" className="flex flex-col gap-2 p-4">
      <div className="flex justify-between gap-4">
        <span className="flex flex-col">
          <span className="font-semibold">{s.name ?? (s.shoutout ? `@${s.shoutout.handle}` : "Anonymous")}</span>
          {s.shoutout ? (
            <span className="text-sm text-muted">
              @{s.shoutout.handle} on {SHOUTOUT_PLATFORM_LABELS[s.shoutout.platform]}
              {s.thanked ? ", thanked" : ""}
            </span>
          ) : !s.isAnonymous ? (
            <span className="text-sm text-muted">{s.shoutoutConsent ? "Happy to be named" : "Prefers no shout-out"}</span>
          ) : null}
        </span>
        <span className="flex flex-col items-end">
          <span className="font-semibold tabular-nums">{fee(s.creatorNetMinor)}</span>
          <time dateTime={s.at.toISOString()} className="text-sm text-muted">
            {formatDate(s.at)}
          </time>
        </span>
      </div>
      {s.message ? <p className="whitespace-pre-line">{s.message}</p> : null}
      <details className="details-smooth group text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 font-semibold text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          Gift of {formatSLE(s.grossMinor)}. See fees
        </summary>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-1 pb-1">
          <div>
            <dt className="text-muted">Gift</dt>
            <dd className="tabular-nums">{formatSLE(s.grossMinor)}</dd>
          </div>
          <div>
            <dt className="text-muted">Mobile money fee</dt>
            <dd className="tabular-nums">{fee(s.monimeFeeMinor, s.feeEstimated)}</dd>
          </div>
          <div>
            <dt className="text-muted">DuMeGud fee</dt>
            <dd className="tabular-nums">{fee(s.platformFeeMinor)}</dd>
          </div>
        </dl>
      </details>
    </Panel>
  );
}

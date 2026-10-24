import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRightIcon, CaretDownIcon, GiftIcon, MegaphoneIcon, WalletIcon } from "@phosphor-icons/react/dist/ssr";
import { Checklist } from "@/components/dashboard/Checklist";
import { withdrawReadiness } from "@/components/dashboard/withdraw-readiness";
import { Alert } from "@/components/ui/Alert";
import { Card, Panel } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/button-classes";
import { formatRelative, isWithin } from "@/lib/dates";
import { formatSLE } from "@/lib/money";
import { SHARE_SOURCES, TRAFFIC_SOURCE_LABELS } from "@/lib/traffic-source";
import { verifySession, type VerifiedSession } from "@/server/dal/session";
import { getEnv } from "@/server/env";
import { services } from "@/server/services";
import type { WalletDTO } from "@/server/services/WalletService";
import { DeletionBanner } from "./deletion-banner";
import { PublishControls, ShareLinks, TermsForm, VerifyEmailBanner, WalletRetry } from "./forms";
import { HomeHighlights } from "./home-highlights";
import { LivePageCard } from "./live-page-card";

export const metadata: Metadata = { title: "Dashboard" };

const HELP_HREF: Route = "/faq";
const NEW_GIFT_MS = 24 * 60 * 60 * 1000;

// Where each publish step gets fixed; the rest are handled in place on this page.
const STEP_HREFS: Partial<Record<string, Route>> = { profile: "/dashboard/profile" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-56 w-full !rounded-brand-xl" />
          <Skeleton className="h-40 w-full !rounded-brand-lg" />
        </div>
      }
    >
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const { actor } = await verifySession();
  const [account, profile, wallet, checklist, waiting, deletion, { notice }] = await Promise.all([
    services.auth.getAccount(actor),
    services.creators.getOwnProfile(actor),
    services.wallet.getWallet(actor),
    services.creators.getPublishChecklist(actor),
    services.shoutouts.waitingCount(actor),
    services.accountDeletions.status(actor),
    searchParams,
  ]);
  if (!account) return null;

  const published = profile?.status === "published";
  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  const firstName = account.name?.trim().split(/\s+/)[0];

  return (
    <>
      {deletion ? <DeletionBanner status={deletion} /> : null}
      {notice === "email-verified" ? <Alert tone="success">Your email is confirmed. Thanks!</Alert> : null}
      {!account.emailVerified ? <VerifyEmailBanner email={account.email} /> : null}
      {profile?.status === "suspended" ? (
        <Alert tone="danger">
          Your page is suspended and can&apos;t be viewed. <Link href={HELP_HREF}>Get help</Link>
        </Alert>
      ) : null}

      <h1 className="text-title">Hi{firstName ? `, ${firstName}` : ""}</h1>

      {published && profile ? (
        <LivePageCard profile={profile} host={new URL(base).host} base={base} shareTitle={account.name ?? undefined} />
      ) : (
        <Card as="section" inner="flex flex-col gap-5 p-5 sm:p-7">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold">Get your page ready</h2>
            <p className="text-muted">Nobody can see your page or support you until it&apos;s live.</p>
          </div>
          <Checklist items={checklist.map((i) => ({ ...i, href: STEP_HREFS[i.key] }))} label="Page setup" />

          {!profile ? (
            <Link href="/dashboard/profile" className={buttonClasses("primary", "w-full sm:w-fit", "lg")}>
              Set up your page
            </Link>
          ) : (
            <div className="flex flex-col gap-4 border-t border-border pt-5">
              {!profile.termsAccepted ? <TermsForm /> : null}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <PublishControls published={false} canPublish={checklist.every((i) => i.done)} />
                <Link href="/dashboard/profile" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                  Edit my page
                </Link>
              </div>
            </div>
          )}
        </Card>
      )}

      {published && profile ? (
        <>
          <Suspense fallback={null}>
            <HomeHighlights actor={actor} pageUrl={`${base}/${profile.handle}`} />
          </Suspense>
          {wallet.status === "active" ? (
            <Suspense fallback={<Skeleton className="h-48 w-full !rounded-brand-lg" />}>
              <MoneySummary actor={actor} />
            </Suspense>
          ) : null}
          <ThankYouCard waiting={waiting} />
          <Panel as="section" className="p-5 sm:p-6">
            <details className="details-smooth group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <h2 className="text-xl font-bold">A link for each app</h2>
                <CaretDownIcon aria-hidden="true" weight="bold" className="size-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <div className="flex flex-col gap-3 pt-4">
                <p className="text-muted">
                  Use the link for the app you&apos;re posting on. Fans there can add their username for a shout-out, and
                  you&apos;ll see which app brings you the most support.
                </p>
                <ShareLinks
                  links={SHARE_SOURCES.map((source) => ({
                    label: TRAFFIC_SOURCE_LABELS[source],
                    url: `${base}/${profile.handle}?via=${source}`,
                  }))}
                />
              </div>
            </details>
          </Panel>
        </>
      ) : null}

      {wallet.status !== "active" ? <WalletCard wallet={wallet} /> : null}
    </>
  );
}

/** The balance and the latest gifts: the first thing a creator opens the app to check. */
async function MoneySummary({ actor }: { actor: VerifiedSession["actor"] }) {
  const [balance, { succeeded }, kyc, method] = await Promise.all([
    services.balances.getBalance(actor.userId),
    services.contributions.listForCreator(actor),
    services.kyc.getStatus(actor),
    services.payoutMethods.get(actor),
  ]);
  const latest = succeeded.slice(0, 3);
  const { ready } = withdrawReadiness(kyc, method);

  return (
    <Panel as="section" className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-muted">In your wallet</h2>
          <p className="font-display text-4xl font-bold tracking-tight tabular-nums">{formatSLE(balance.displayMinor)}</p>
          {balance.pendingMinor > 0 ? <p className="text-sm text-muted">+ {formatSLE(balance.pendingMinor)} on its way</p> : null}
        </div>
        <Link href="/dashboard/wallet" className={buttonClasses(ready ? "primary" : "secondary")}>
          {ready ? "Withdraw" : "Set up withdrawals"}
        </Link>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h3 className="font-semibold">Latest gifts</h3>
        {latest.length ? (
          <ul className="flex flex-col gap-1.5">
            {latest.map((g) => {
              const fresh = isWithin(g.at, NEW_GIFT_MS);
              return (
                <li
                  key={g.paymentId}
                  className={`flex items-center gap-3 rounded-brand px-3 py-2.5 ${fresh ? "bg-secondary-soft" : "bg-surface-muted"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full ${fresh ? "bg-secondary text-secondary-foreground" : "bg-surface text-muted"}`}
                  >
                    <GiftIcon weight="fill" className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="truncate">{g.name ?? (g.shoutout ? `@${g.shoutout.handle}` : "Anonymous")}</span>
                      {fresh ? <span className="rounded-full bg-secondary px-2 py-px text-xs font-bold text-secondary-foreground">New</span> : null}
                    </span>
                    <time dateTime={g.at.toISOString()} className="text-sm text-muted">
                      {formatRelative(g.at)}
                    </time>
                  </span>
                  <span className="font-semibold tabular-nums">{formatSLE(g.grossMinor)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted">No gifts yet. Share your link and the first one will show up here.</p>
        )}
        {latest.length ? (
          <Link href="/dashboard/supporters" className="inline-flex min-h-11 w-fit items-center gap-1.5 font-semibold text-muted hover:text-text">
            All supporters <ArrowRightIcon aria-hidden="true" weight="bold" className="size-4" />
          </Link>
        ) : null}
      </div>
    </Panel>
  );
}

function ThankYouCard({ waiting }: { waiting: number }) {
  return (
    <Panel as="section" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
        <MegaphoneIcon weight="duotone" className="size-6" />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <h2 className="text-xl font-bold">Thank your fans</h2>
        {waiting ? (
          <p>
            <strong>{waiting === 1 ? "1 fan is" : `${waiting} fans are`} waiting for a thank-you.</strong> It takes a
            minute, and the people you tag often share it.
          </p>
        ) : (
          <p className="text-muted">Everyone has been thanked. New fans who want a shout-out will show up here.</p>
        )}
      </div>
      <Link href="/dashboard/shoutouts" className={buttonClasses(waiting ? "primary" : "secondary", "w-full sm:w-auto")}>
        {waiting ? "Thank them now" : "Open shout-outs"}
      </Link>
    </Panel>
  );
}

/** Only shown while the wallet isn't ready; once it is, the money summary takes its place. */
function WalletCard({ wallet }: { wallet: WalletDTO }) {
  const text: Record<Exclude<WalletDTO["status"], "active">, string> = {
    pending: "We're setting up your wallet. This usually takes a few seconds.",
    missing: "Your wallet hasn't been set up yet.",
    failed: "We couldn't set up your wallet. Our team knows about it, and you can also try again.",
    frozen: "Your wallet is frozen.",
  };
  if (wallet.status === "active") return null;
  return (
    <Panel as="section" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-muted">
        <WalletIcon weight="duotone" className="size-6" />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <h2 className="text-xl font-bold">Wallet</h2>
        <p className="text-muted">
          {text[wallet.status]}
          {wallet.status === "frozen" ? (
            <>
              {" "}
              <Link href={HELP_HREF} className="font-semibold text-text underline underline-offset-4">
                Get help
              </Link>
            </>
          ) : null}
        </p>
        {wallet.status === "missing" || wallet.status === "failed" || (wallet.status === "pending" && wallet.attempts > 0) ? (
          <WalletRetry />
        ) : null}
      </div>
    </Panel>
  );
}

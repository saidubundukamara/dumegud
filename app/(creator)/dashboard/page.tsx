import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRightIcon, CheckIcon, MegaphoneIcon, WalletIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui/Alert";
import { StatusChip } from "@/components/ui/Badge";
import { Card, Panel } from "@/components/ui/Card";
import { ShareLink } from "@/components/ui/ShareLink";
import { Skeleton } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/button-classes";
import { SHARE_SOURCES, TRAFFIC_SOURCE_LABELS } from "@/lib/traffic-source";
import { verifySession } from "@/server/dal/session";
import { getEnv } from "@/server/env";
import { services } from "@/server/services";
import type { WalletDTO } from "@/server/services/WalletService";
import { PublishControls, ShareLinks, TermsForm, VerifyEmailBanner, WalletRetry } from "./forms";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-56 w-full !rounded-brand-xl" />
          <Skeleton className="h-32 w-full !rounded-brand-lg" />
        </div>
      }
    >
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const { actor } = await verifySession();
  const [account, profile, wallet, checklist, waiting, { notice }] = await Promise.all([
    services.auth.getAccount(actor),
    services.creators.getOwnProfile(actor),
    services.wallet.getWallet(actor),
    services.creators.getPublishChecklist(actor),
    services.shoutouts.waitingCount(actor),
    searchParams,
  ]);
  if (!account) return null;

  const published = profile?.status === "published";
  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  const pageUrl = profile ? `${new URL(base).host}/${profile.handle}` : null;
  const firstName = account.name?.trim().split(/\s+/)[0];
  const doneCount = checklist.filter((i) => i.done).length;

  return (
    <>
      {notice === "email-verified" ? <Alert tone="success">Your email is confirmed. Thanks!</Alert> : null}
      {!account.emailVerified ? <VerifyEmailBanner email={account.email} /> : null}
      {profile?.status === "suspended" ? (
        <Alert tone="danger">Your page is suspended and can&apos;t be viewed. Contact support.</Alert>
      ) : null}

      <h1 className="text-title animate-rise">Hi{firstName ? `, ${firstName}` : ""}</h1>

      <Card inner="flex flex-col gap-5 p-5 sm:p-7" className="animate-rise [animation-delay:60ms]">
        {published && profile ? (
          <>
            <div className="flex flex-col gap-2">
              <StatusChip tone="success">
                <span aria-hidden="true" className="size-2 rounded-full bg-success" />
                Your page is live
              </StatusChip>
              <Link
                href={`/${profile.handle}`}
                className="break-all font-display text-2xl font-bold tracking-tight hover:text-primary sm:text-3xl"
              >
                {pageUrl}
              </Link>
              <p className="text-muted">Share this link anywhere. Fans tap it and pay with mobile money.</p>
            </div>
            <ShareLink url={`${base}/${profile.handle}`} title={account.name ?? undefined} variant="primary" />
            <Link href={`/${profile.handle}`} className="inline-flex min-h-11 w-fit items-center gap-1.5 font-semibold text-muted hover:text-text">
              See my page <ArrowUpRightIcon aria-hidden="true" weight="bold" className="size-4" />
            </Link>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="text-2xl font-bold">Get your page ready</h2>
              <p className="text-muted">Nobody can see your page or send you money until it&apos;s live.</p>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm font-semibold">
                <span>
                  {doneCount} of {checklist.length} done
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-label="Page setup"
                aria-valuemin={0}
                aria-valuemax={checklist.length}
                aria-valuenow={doneCount}
              >
                <div
                  className="h-full origin-left rounded-full bg-primary transition-transform duration-700 ease-brand"
                  style={{ transform: `scaleX(${checklist.length ? doneCount / checklist.length : 0})` }}
                />
              </div>
            </div>
            <ol className="flex flex-col gap-1">
              {checklist.map((item) => (
                <li key={item.key} className="flex min-h-10 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                      item.done ? "bg-success text-white" : "ring-2 ring-border-strong"
                    }`}
                  >
                    {item.done ? <CheckIcon weight="bold" className="size-4" /> : null}
                  </span>
                  <span className={item.done ? "text-muted line-through decoration-border-strong" : "font-semibold"}>
                    {item.label}
                    <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}

        {!profile ? (
          <Link href="/dashboard/profile" className={buttonClasses("primary", "w-full sm:w-fit", "lg")}>
            Set up your page
          </Link>
        ) : (
          <div className="flex flex-col gap-4 border-t border-border pt-5">
            {!profile.termsAccepted ? <TermsForm /> : null}
            <PublishControls published={published} canPublish={checklist.every((i) => i.done)} />
            <Link href="/dashboard/profile" className="w-fit font-semibold underline underline-offset-4">
              Edit your page
            </Link>
          </div>
        )}
      </Card>

      {published && profile ? (
        <>
          <ThankYouCard waiting={waiting} />
          <Panel as="section" className="flex flex-col gap-3 p-5 sm:p-6">
            <h2 className="text-xl font-bold">A link for each app</h2>
            <p className="text-muted">
              Use the link for the app you&apos;re posting on. Fans there can add their username for a shout-out, and
              you&apos;ll see which app brings the most support.
            </p>
            <ShareLinks
              links={SHARE_SOURCES.map((source) => ({
                label: TRAFFIC_SOURCE_LABELS[source],
                url: `${base}/${profile.handle}?via=${source}`,
              }))}
            />
          </Panel>
        </>
      ) : null}

      <WalletCard wallet={wallet} />
    </>
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

function WalletCard({ wallet }: { wallet: WalletDTO }) {
  const text: Record<WalletDTO["status"], string> = {
    active: "Your wallet is ready. Money from fans arrives here.",
    pending: "We're setting up your wallet. This usually takes a few seconds.",
    missing: "Your wallet hasn't been set up yet.",
    failed: "We couldn't set up your wallet. Our team knows about it, and you can also try again.",
    frozen: "Your wallet is frozen. Contact support.",
  };
  return (
    <Panel as="section" className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-muted">
        <WalletIcon weight="duotone" className="size-6" />
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <h2 className="text-xl font-bold">Wallet</h2>
        <p className="text-muted">{text[wallet.status]}</p>
        {wallet.status === "missing" || wallet.status === "failed" || (wallet.status === "pending" && wallet.attempts > 0) ? (
          <WalletRetry />
        ) : null}
      </div>
      {wallet.status === "active" ? (
        <Link href="/dashboard/wallet" className={buttonClasses("secondary", "w-full sm:w-auto")}>
          Open wallet
        </Link>
      ) : null}
    </Panel>
  );
}

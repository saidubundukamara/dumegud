import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
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
    <Suspense fallback={<p className="text-muted">Loading your dashboard…</p>}>
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
  const pageUrl = profile ? `${new URL(getEnv().APP_BASE_URL).host}/${profile.handle}` : null;

  return (
    <>
      {notice === "email-verified" ? <Alert tone="success">Your email is confirmed. Thanks!</Alert> : null}
      {!account.emailVerified ? <VerifyEmailBanner email={account.email} /> : null}
      {profile?.status === "suspended" ? (
        <Alert tone="danger">Your page is suspended and can&apos;t be viewed. Contact support.</Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Hi{account.name ? `, ${account.name}` : ""}</h1>
        {published && profile ? (
          <p>
            Your page is live at{" "}
            <Link href={`/${profile.handle}`} className="font-semibold underline underline-offset-4">
              {pageUrl}
            </Link>
          </p>
        ) : (
          <p className="text-muted">Your page isn&apos;t public yet. Visitors can&apos;t see it or support you.</p>
        )}
      </div>

      <section className="flex flex-col gap-4 rounded-brand border border-border p-4 sm:p-6">
        <h2 className="text-xl font-bold">Get your page live</h2>
        <ol className="flex flex-col gap-2">
          {checklist.map((item) => (
            <li key={item.key} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  item.done ? "bg-success-surface text-success" : "border border-border text-muted"
                }`}
              >
                {item.done ? "✓" : ""}
              </span>
              <span className={item.done ? "" : "font-semibold"}>
                {item.label}
                <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
              </span>
            </li>
          ))}
        </ol>

        {!profile ? (
          <Link href="/dashboard/profile" className={buttonClasses("primary", "self-start")}>
            Set up your page
          </Link>
        ) : (
          <>
            {!profile.termsAccepted ? <TermsForm /> : null}
            <PublishControls published={published} canPublish={checklist.every((i) => i.done)} />
            <Link href="/dashboard/profile" className="self-start font-semibold underline underline-offset-4">
              Edit your page
            </Link>
          </>
        )}
      </section>

      {published && profile ? (
        <>
          <ThankYouCard waiting={waiting} />
          <section className="flex flex-col gap-3 rounded-brand border border-border p-4 sm:p-6">
            <h2 className="text-xl font-bold">Share your page</h2>
            <p className="text-muted">
              Use the link for the app you&apos;re posting on. Supporters can then add their username there to get a
              shout-out from you, and you can see which app brings the most support.
            </p>
            <ShareLinks
              links={SHARE_SOURCES.map((source) => ({
                label: TRAFFIC_SOURCE_LABELS[source],
                url: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/${profile.handle}?via=${source}`,
              }))}
            />
          </section>
        </>
      ) : null}

      <WalletCard wallet={wallet} />
    </>
  );
}

function ThankYouCard({ waiting }: { waiting: number }) {
  return (
    <section className="flex flex-col gap-3 rounded-brand border border-border p-4 sm:p-6">
      <h2 className="text-xl font-bold">Thank your supporters</h2>
      {waiting ? (
        <p>
          <strong>
            {waiting === 1 ? "1 supporter is" : `${waiting} supporters are`} waiting for a thank-you.
          </strong>{" "}
          A shout-out takes a minute, and the people you tag often share it.
        </p>
      ) : (
        <p className="text-muted">Everyone has been thanked. New supporters who want a shout-out will show up here.</p>
      )}
      <Link href="/dashboard/shoutouts" className={buttonClasses(waiting ? "primary" : "secondary", "self-start")}>
        {waiting ? "Thank them now" : "Open shout-outs"}
      </Link>
    </section>
  );
}

function WalletCard({ wallet }: { wallet: WalletDTO }) {
  const text: Record<WalletDTO["status"], string> = {
    active: "Your wallet is ready. Money from supporters will arrive here.",
    pending: "We're setting up your wallet. This usually takes a few seconds.",
    missing: "Your wallet hasn't been set up yet.",
    failed: "We couldn't set up your wallet. Our team has been alerted; you can also try again.",
    frozen: "Your wallet is frozen. Contact support.",
  };
  return (
    <section className="flex flex-col gap-3 rounded-brand border border-border p-4 sm:p-6">
      <h2 className="text-xl font-bold">Wallet</h2>
      <p>{text[wallet.status]}</p>
      {wallet.status === "missing" || wallet.status === "failed" || (wallet.status === "pending" && wallet.attempts > 0) ? (
        <WalletRetry />
      ) : null}
    </section>
  );
}

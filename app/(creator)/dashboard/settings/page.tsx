import type { Metadata, Route } from "next";
import { Suspense } from "react";
import { Checklist } from "@/components/dashboard/Checklist";
import { ConfirmAction } from "@/components/dashboard/ConfirmAction";
import { StatusChip } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { LEGAL } from "@/lib/legal";
import { formatSLE } from "@/lib/money";
import { verifySession, type VerifiedSession } from "@/server/dal/session";
import { services } from "@/server/services";
import type { DeletionFix } from "@/server/services/AccountDeletionService";
import { DeletionBanner } from "../deletion-banner";
import { DeleteAccountForm } from "./delete-account";
import { signOutEverywhere } from "../actions";
import { ChangePasswordForm } from "../forms";
import { PageSkeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <h1 className="text-title">Settings</h1>
      <Suspense fallback={<PageSkeleton />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const { actor } = await verifySession();
  const [account, deletion] = await Promise.all([services.auth.getAccount(actor), services.accountDeletions.status(actor)]);
  if (!account) return null;

  return (
    <>
      {deletion ? <DeletionBanner status={deletion} /> : null}
      <Panel as="section" className="flex flex-col gap-2 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Account</h2>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted">Email</span>
          <span className="font-semibold">{account.email}</span>
          <StatusChip tone={account.emailVerified ? "success" : "warning"}>{account.emailVerified ? "Confirmed" : "Not confirmed"}</StatusChip>
        </p>
      </Panel>

      <Panel as="section" className="flex flex-col gap-4 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Password</h2>
        {account.hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-muted">You sign in with Google, so there&apos;s no DuMeGud password to change.</p>
        )}
      </Panel>

      <Panel as="section" className="flex flex-col items-start gap-3 p-5 sm:p-6">
        <h2 className="text-xl font-bold">Devices</h2>
        <p className="text-muted">Lost a phone or signed in on a shared computer? Sign out everywhere, this device included.</p>
        <ConfirmAction
          trigger="Sign out everywhere"
          title="Sign out everywhere?"
          confirm="Sign out everywhere"
          pendingLabel="Signing out…"
          action={signOutEverywhere}
        >
          You&apos;ll be signed out on every phone and computer, this one too. You can sign back in any time.
        </ConfirmAction>
      </Panel>

      {deletion ? null : <DeleteAccount actor={actor} hasPassword={account.hasPassword} email={account.email} />}
    </>
  );
}

const FIX_HREFS: Partial<Record<DeletionFix, Route>> = { withdraw: "/dashboard/wallet?final=1" };

/** Money first: the checklist until nothing is owed, then the confirmation form. */
async function DeleteAccount({ actor, hasPassword, email }: { actor: VerifiedSession["actor"]; hasPassword: boolean; email: string }) {
  const [readiness, profile] = await Promise.all([services.accountDeletions.readiness(actor), services.creators.getOwnProfile(actor)]);
  const needsSupport = readiness.checks.some((c) => !c.done && c.fix === "support");
  return (
    <Panel as="section" className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Delete account</h2>
        <p className="text-muted">
          {!readiness.canDelete
            ? "Before you go, your wallet needs to be empty. We won't delete an account that still has your money in it."
            : readiness.forfeitableMinor > 0
              ? `Only ${formatSLE(readiness.forfeitableMinor)} is left in your wallet. That's too little to send to a phone, so you can give it up and delete your account.`
              : "Your wallet is empty, so you can delete your account."}
        </p>
      </div>
      {readiness.canDelete ? null : (
        <Checklist
          label="Ready to delete"
          items={readiness.checks.map((c) => ({
            key: c.key,
            label: c.label,
            done: c.done,
            pending: c.fix === "wait",
            href: c.fix ? FIX_HREFS[c.fix] : undefined,
            detail: c.detail,
          }))}
        />
      )}
      {needsSupport ? (
        <a href={`mailto:${LEGAL.contactEmail}`} className="w-fit font-semibold underline underline-offset-4">
          Contact support
        </a>
      ) : null}
      {readiness.canDelete ? (
        <DeleteAccountForm confirmWith={profile ? `@${profile.handle}` : email} hasPassword={hasPassword} forfeitableMinor={readiness.forfeitableMinor} />
      ) : null}
    </Panel>
  );
}

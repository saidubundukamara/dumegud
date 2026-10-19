import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmAction } from "@/components/dashboard/ConfirmAction";
import { StatusChip } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Card";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
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
  const account = await services.auth.getAccount(actor);
  if (!account) return null;

  return (
    <>
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
    </>
  );
}

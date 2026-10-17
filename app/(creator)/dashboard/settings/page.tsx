import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { signOutEverywhere } from "../actions";
import { ChangePasswordForm } from "../forms";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
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
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold">Account</h2>
        <p>
          <span className="text-muted">Email:</span> {account.email}{" "}
          <span className="text-sm text-muted">({account.emailVerified ? "confirmed" : "not confirmed"})</span>
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">Password</h2>
        {account.hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-muted">You sign in with Google, so there&apos;s no DuMeGud password to change.</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Devices</h2>
        <p className="text-muted">Lost a phone or signed in on a shared computer? Sign out everywhere, this device included.</p>
        <form action={signOutEverywhere}>
          <SubmitButton variant="secondary" pendingLabel="Signing out…">
            Sign out everywhere
          </SubmitButton>
        </form>
      </section>
    </>
  );
}

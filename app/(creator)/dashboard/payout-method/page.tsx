import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { BindNumberForm } from "../wallet/forms";

export const metadata: Metadata = { title: "Payout number" };

export default function PayoutMethodPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Payout number</h1>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <PayoutMethod />
      </Suspense>
    </>
  );
}

async function PayoutMethod() {
  const { actor } = await verifySession();
  const [kyc, method] = await Promise.all([services.kyc.getStatus(actor), services.payoutMethods.get(actor)]);
  if (kyc.status !== "approved") {
    return (
      <Alert tone="info">
        <Link href="/dashboard/verification" className="font-semibold underline underline-offset-4">
          Verify your identity
        </Link>{" "}
        before adding a payout number.
      </Alert>
    );
  }
  return (
    <>
      {method ? (
        <section className="flex flex-col gap-2 rounded-brand border border-border p-4">
          <p className="font-semibold">
            {method.providerLabel} {method.masked}
          </p>
          {method.holderName ? <p className="text-muted">Registered to {method.holderName}</p> : null}
          {method.status === "cooling_off" ? (
            <Alert tone="warning">
              New numbers are paused for safety. Withdrawals open on {method.cooldownUntil?.toISOString().slice(0, 16).replace("T", " ")} UTC.
            </Alert>
          ) : null}
          {method.status === "needs_recheck" ? <Alert tone="warning">Our team is checking this number. We&apos;ll email you.</Alert> : null}
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{method ? "Change number" : "Add your number"}</h2>
        {method ? <p className="text-muted">Changing your number pauses withdrawals for 48 hours and we&apos;ll email you.</p> : null}
        <BindNumberForm />
      </section>
    </>
  );
}

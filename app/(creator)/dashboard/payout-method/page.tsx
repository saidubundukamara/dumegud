import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { BindNumberForm } from "../wallet/forms";

export const metadata: Metadata = { title: "My mobile money" };

export default function PayoutMethodPage() {
  return (
    <>
      <h1 className="text-title">Where should we send your money?</h1>
      <p className="text-muted">Add the mobile money number you want your money to go to. It must be in your own name.</p>
      <Suspense fallback={<Skeleton className="h-32 w-full !rounded-brand-lg" />}>
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
          Verify your ID
        </Link>{" "}
        first. Then you can add your mobile money number.
      </Alert>
    );
  }
  return (
    <>
      {method ? (
        <section className="flex flex-col gap-2 rounded-brand-lg bg-surface shadow-soft ring-1 ring-border p-4">
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

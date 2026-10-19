import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { Panel } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatDateTime } from "@/lib/dates";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { BindNumberForm } from "../wallet/forms";

export const metadata: Metadata = { title: "My mobile money" };

export default function PayoutMethodPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">My mobile money</h1>
        <p className="text-muted">The number we send your withdrawals to. It must be registered in your own name.</p>
      </div>
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
        <Panel as="section" className="flex flex-col gap-2 p-5">
          <p className="font-semibold">
            {method.providerLabel} {method.masked}
          </p>
          {method.holderName ? <p className="text-muted">Registered to {method.holderName}</p> : null}
          {method.status === "cooling_off" ? (
            <Alert tone="warning">
              New numbers are paused for safety. {method.cooldownUntil ? `Withdrawals open ${formatDateTime(method.cooldownUntil)}.` : null}
            </Alert>
          ) : null}
          {method.status === "needs_recheck" ? <Alert tone="warning">Our team is checking this number. We&apos;ll email you.</Alert> : null}
          {method.status === "active" ? (
            <Link href="/dashboard/wallet" className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4">
              Go to your wallet
            </Link>
          ) : null}
        </Panel>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{method ? "Change number" : "Add your number"}</h2>
        {method ? <p className="text-muted">Changing your number pauses withdrawals for 48 hours and we&apos;ll email you.</p> : null}
        <BindNumberForm />
      </section>
    </>
  );
}

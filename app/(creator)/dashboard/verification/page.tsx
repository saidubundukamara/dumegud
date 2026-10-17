import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { KycForm } from "../wallet/forms";

export const metadata: Metadata = { title: "Verify your ID" };

export default function VerificationPage() {
  return (
    <>
      <h1 className="text-title">Verify your ID</h1>
      <p className="text-muted">We check every creator once before they can withdraw. This keeps your money safe, and your fans too.</p>
      <Suspense fallback={<Skeleton className="h-40 w-full !rounded-brand-lg" />}>
        <Verification />
      </Suspense>
    </>
  );
}

async function Verification() {
  const { actor } = await verifySession();
  const status = await services.kyc.getStatus(actor);
  if (status.status === "approved") return <Alert tone="success">You&apos;re verified. You can withdraw your money.</Alert>;
  if (status.status === "pending") return <Alert tone="info">Thanks! We&apos;re checking your documents now. We&apos;ll email you when it&apos;s done.</Alert>;
  return (
    <>
      {status.status === "rejected" || status.status === "needs_more_info" ? (
        <Alert tone="warning">
          {status.status === "rejected" ? "We couldn't approve your documents." : "We need a bit more from you."}
          {status.note ? ` ${status.note}` : ""} Please send them again.
        </Alert>
      ) : null}
      {services.kyc.uploadsEnabled ? <KycForm /> : <p className="text-muted">ID checks aren&apos;t open yet. We&apos;ll email you when they are.</p>}
    </>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { Alert } from "@/components/ui/Alert";
import { verifySession } from "@/server/dal/session";
import { services } from "@/server/services";
import { KycForm } from "../wallet/forms";

export const metadata: Metadata = { title: "Verification" };

export default function VerificationPage() {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight">Verify your identity</h1>
      <p className="text-muted">We verify every creator before they can withdraw. It keeps your money, and your supporters, safe.</p>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Verification />
      </Suspense>
    </>
  );
}

async function Verification() {
  const { actor } = await verifySession();
  const status = await services.kyc.getStatus(actor);
  if (status.status === "approved") return <Alert tone="success">You&apos;re verified.</Alert>;
  if (status.status === "pending") return <Alert tone="info">Your documents are waiting for review. We&apos;ll email you.</Alert>;
  return (
    <>
      {status.status === "rejected" || status.status === "needs_more_info" ? (
        <Alert tone="warning">
          {status.status === "rejected" ? "We couldn't approve your last submission." : "We need a little more information."}
          {status.note ? ` ${status.note}` : ""} Please submit again.
        </Alert>
      ) : null}
      {services.kyc.uploadsEnabled ? <KycForm /> : <p className="text-muted">Verification uploads aren&apos;t available yet.</p>}
    </>
  );
}

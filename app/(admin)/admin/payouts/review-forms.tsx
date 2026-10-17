"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { rejectPayout, releasePayout } from "./actions";

export function PayoutReviewForms({ payoutId }: { payoutId: string }) {
  const [released, release] = useActionState(releasePayout, initialFormState);
  const [rejected, reject] = useActionState(rejectPayout, initialFormState);
  const latest = released.status !== "idle" ? released : rejected;
  if (latest.status === "success") return <Alert tone="success">{latest.message}</Alert>;
  return (
    <div className="flex flex-col gap-3">
      {latest.message ? <Alert tone="danger">{latest.message}</Alert> : null}
      <form action={release}>
        <input type="hidden" name="payoutId" value={payoutId} />
        <SubmitButton pendingLabel="Releasing…">Release payout</SubmitButton>
      </form>
      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="payoutId" value={payoutId} />
        <Field label="Reason (shown to the creator)" name="reason" maxLength={300} />
        <SubmitButton variant="secondary" className="self-start" pendingLabel="Rejecting…">
          Reject
        </SubmitButton>
      </form>
    </div>
  );
}

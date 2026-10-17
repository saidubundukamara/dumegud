"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { decideKyc } from "./actions";

export function KycReviewForm({ submissionId }: { submissionId: string }) {
  const [state, action] = useActionState(decideKyc, initialFormState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="submissionId" value={submissionId} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <SelectField label="Decision" name="outcome" defaultValue="approved">
        <option value="approved">Approve</option>
        <option value="needs_more_info">Needs more information</option>
        <option value="rejected">Reject</option>
      </SelectField>
      <Field label="Note to the creator (required unless approving)" name="note" maxLength={500} />
      <SubmitButton className="self-start" pendingLabel="Saving…">
        Save decision
      </SubmitButton>
    </form>
  );
}

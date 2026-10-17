"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { decideCase, dismissAlert, openCase } from "./actions";

export function AlertActions({ alertId, creatorId }: { alertId: string; creatorId: string | null }) {
  const [opened, open] = useActionState(openCase, initialFormState);
  const [dismissed, dismiss] = useActionState(dismissAlert, initialFormState);
  const latest = opened.status !== "idle" ? opened : dismissed;
  if (latest.status === "success") return <p className="text-sm text-success">{latest.message}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {latest.message ? <Alert tone="danger">{latest.message}</Alert> : null}
      {creatorId ? (
        <form action={open}>
          <input type="hidden" name="creatorId" value={creatorId} />
          <input type="hidden" name="alertId" value={alertId} />
          <input type="hidden" name="note" value="" />
          <SubmitButton variant="secondary" pendingLabel="Opening…">
            Open case
          </SubmitButton>
        </form>
      ) : null}
      <form action={dismiss}>
        <input type="hidden" name="alertId" value={alertId} />
        <SubmitButton variant="ghost" pendingLabel="Dismissing…">
          Dismiss
        </SubmitButton>
      </form>
    </div>
  );
}

export function DecideForm({ caseId }: { caseId: string }) {
  const [state, action] = useActionState(decideCase, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      {state.message ? <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert> : null}
      <SelectField label="Decision" name="decision" defaultValue="dismiss">
        <option value="dismiss">Dismiss (no action)</option>
        <option value="request_info">Request information</option>
        <option value="pause_feature">Pause a feature</option>
        <option value="restrict">Restrict account</option>
        <option value="escalate">Escalate</option>
        <option value="restore">Restore access</option>
      </SelectField>
      <SelectField label="Feature (for pause)" name="feature" defaultValue="">
        <option value="">-</option>
        <option value="receive">Receiving money</option>
        <option value="withdraw">Withdrawals</option>
        <option value="publish">Publishing</option>
        <option value="upload">Uploads</option>
      </SelectField>
      <Field label="Notes (kept on the case)" name="notes" maxLength={2000} />
      <SubmitButton className="self-start" pendingLabel="Saving…">
        Record decision
      </SubmitButton>
    </form>
  );
}

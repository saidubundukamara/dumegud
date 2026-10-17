"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { resolveReport } from "./actions";

export function ResolveForm({ reportId }: { reportId: string }) {
  const [state, action] = useActionState(resolveReport, initialFormState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="reportId" value={reportId} />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <SelectField label="Action" name="action" defaultValue="dismiss">
        <option value="dismiss">Dismiss</option>
        <option value="suspend">Take down (suspend)</option>
      </SelectField>
      <Field label="Reason" name="reason" maxLength={500} />
      <SubmitButton className="self-start" pendingLabel="Saving…">
        Resolve
      </SubmitButton>
    </form>
  );
}

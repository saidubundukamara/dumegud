"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { submitReport } from "./actions";

export function ReportForm({ targetType, targetId }: { targetType: "creator" | "product"; targetId: string }) {
  const [state, action] = useActionState(submitReport, initialFormState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <SelectField label="What's wrong?" name="reason" defaultValue="" errors={state.fieldErrors?.reason}>
        <option value="" disabled>
          Choose a reason
        </option>
        <option value="scam">Scam or fraud</option>
        <option value="impersonation">Pretending to be someone else</option>
        <option value="copyright">Selling someone else&apos;s work</option>
        <option value="illegal">Illegal content</option>
        <option value="other">Something else</option>
      </SelectField>
      <TextAreaField label="Details (optional)" name="details" maxLength={1000} rows={4} defaultValue={state.values?.details} errors={state.fieldErrors?.details} />
      <Field
        label="Your email (optional)"
        name="reporterEmail"
        type="email"
        defaultValue={state.values?.reporterEmail}
        hint="Only if you're happy for us to follow up."
        errors={state.fieldErrors?.reporterEmail}
      />
      <SubmitButton className="self-start" pendingLabel="Sending…">
        Send report
      </SubmitButton>
    </form>
  );
}

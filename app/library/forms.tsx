"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { downloadFile, recoverLibrary } from "./actions";

export function DownloadButton({ accessToken, assetId, label }: { accessToken: string; assetId: string; label: string }) {
  const [state, action] = useActionState(downloadFile, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="accessToken" value={accessToken} />
      <input type="hidden" name="assetId" value={assetId} />
      <SubmitButton variant="secondary" pendingLabel="Preparing…">
        Download {label}
      </SubmitButton>
      {state.status === "error" && state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
    </form>
  );
}

export function RecoverForm() {
  const [state, action] = useActionState(recoverLibrary, initialFormState);
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field
        label="Email you bought with"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <SubmitButton pendingLabel="Sending…">Email me my links</SubmitButton>
    </form>
  );
}

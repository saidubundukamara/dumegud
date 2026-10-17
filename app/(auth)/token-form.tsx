"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { resetPassword, verifyEmail } from "./actions";

// Emailed links land on a page with a button rather than acting on GET: link scanners and
// prefetchers must not be able to consume a single-use token.

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action] = useActionState(verifyEmail, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Confirming…">Confirm my email</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, initialFormState);
  const tokenError = state.fieldErrors?.token?.[0];
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && (tokenError ?? state.message) ? (
        <Alert tone="danger">{tokenError ?? state.message}</Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        hint="At least 10 characters."
        errors={state.fieldErrors?.password}
      />
      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  );
}

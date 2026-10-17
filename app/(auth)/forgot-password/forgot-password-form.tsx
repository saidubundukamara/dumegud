"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { forgotPassword } from "../actions";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPassword, initialFormState);

  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

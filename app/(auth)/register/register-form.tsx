"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { register } from "../actions";

export function RegisterForm() {
  const [state, action] = useActionState(register, initialFormState);

  if (state.status === "success") {
    return (
      <Alert tone="success">
        <p className="font-semibold">Check your email</p>
        <p>{state.message}</p>
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field
        label="Your name"
        name="name"
        autoComplete="name"
        required
        maxLength={80}
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
      />
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
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        hint="At least 10 characters. A short phrase is easy to remember and hard to guess."
        errors={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Creating your account…">Create account</SubmitButton>
    </form>
  );
}

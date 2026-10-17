"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { login } from "../actions";
import { NextField } from "../next-field";

export function LoginForm() {
  const [state, action] = useActionState(login, initialFormState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <NextField />
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
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.password}
      />
      <Link href="/forgot-password" className="self-start text-sm font-semibold underline underline-offset-4">
        Forgot your password?
      </Link>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

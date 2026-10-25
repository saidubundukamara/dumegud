"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { adminHref } from "@/lib/admin-host";
import { Result } from "./action-form";
import { initialFormState } from "@/lib/form-state";
import { acceptAdminInvite, confirmAdminEnrollment, regenerateAdminRecoveryCodes, signInAdmin, verifyAdminCode } from "./auth-actions";

// Forms for the admin sign-in pages. Server actions redirect on success, except enrollment and
// recovery-code regeneration, which show the new recovery codes once.

export function AdminLoginForm() {
  const [state, action] = useActionState(signInAdmin, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field label="Email" name="email" type="email" autoComplete="username" inputMode="email" required defaultValue={state.values?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
    </form>
  );
}

function CodeField({ label = "Code from your authenticator app", hint }: { label?: string; hint?: string }) {
  return (
    <Field
      label={label}
      name="code"
      autoComplete="one-time-code"
      required
      maxLength={20}
      hint={hint}
      className="[&_input]:tracking-widest"
    />
  );
}

export function AdminCodeForm() {
  const [state, action] = useActionState(verifyAdminCode, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <CodeField hint="Lost your phone? Enter one of your recovery codes instead." />
      <SubmitButton pendingLabel="Checking…">Sign in</SubmitButton>
    </form>
  );
}

export function RecoveryCodes({ codes }: { codes: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning">
        Save these recovery codes somewhere safe (a password manager is best). Each one works once if you lose your authenticator. You won&apos;t see them
        again.
      </Alert>
      <pre className="rounded-brand border border-border bg-surface p-4 font-mono text-lg leading-relaxed">{codes}</pre>
    </div>
  );
}

export function EnrollForm() {
  const [state, action] = useActionState(confirmAdminEnrollment, initialFormState);
  if (state.status === "success" && state.values?.recoveryCodes) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">{state.message}</Alert>
        <RecoveryCodes codes={state.values.recoveryCodes} />
        <Link href={adminHref("/admin")} className="self-start font-semibold underline underline-offset-4">
          I&apos;ve saved them. Continue to the admin
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <CodeField label="Enter the 6-digit code it shows" />
      <SubmitButton pendingLabel="Checking…">Turn on two-step sign-in</SubmitButton>
    </form>
  );
}

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(acceptAdminInvite, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="email" value={email} autoComplete="username" />
      <Field label="Your name" name="name" autoComplete="name" required defaultValue={state.values?.name} />
      <Field label="Choose a password" name="password" type="password" autoComplete="new-password" required hint="At least 10 characters. Not one you use anywhere else." />
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}

export function RegenerateCodesForm() {
  const [state, action] = useActionState(regenerateAdminRecoveryCodes, initialFormState);
  if (state.status === "success" && state.values?.recoveryCodes) return <RecoveryCodes codes={state.values.recoveryCodes} />;
  return (
    <form action={action} className="flex flex-col gap-2">
      <SubmitButton variant="secondary" size="sm" className="self-start" pendingLabel="Making codes…">
        Make new recovery codes
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

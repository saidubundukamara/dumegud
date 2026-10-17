"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import Link from "next/link";
import {
  acceptCreatorTerms,
  changePassword,
  publishPage,
  resendVerificationEmail,
  retryWalletSetup,
  unpublishPage,
} from "./actions";

export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, action] = useActionState(resendVerificationEmail, initialFormState);
  return (
    <Alert tone={state.status === "error" ? "danger" : "warning"}>
      <div className="flex flex-col gap-3">
        <p>
          <span className="font-semibold">Confirm your email.</span> We sent a link to {email}. You need to confirm it
          before you can publish your page, receive support or withdraw.
        </p>
        {state.message ? <p>{state.message}</p> : null}
        {state.status !== "success" ? (
          <form action={action}>
            <SubmitButton variant="secondary" pendingLabel="Sending…">
              Send a new link
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </Alert>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePassword, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field
        label="Current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.currentPassword}
      />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        maxLength={128}
        hint="At least 10 characters. You'll be signed out on every device."
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
      <SubmitButton className="self-start" pendingLabel="Saving…">
        Change password
      </SubmitButton>
    </form>
  );
}

export function TermsForm() {
  const [state, action] = useActionState(acceptCreatorTerms, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="accept" className="mt-1 size-5" required />
        <span>
          I accept the{" "}
          <Link href="/legal/creator-terms" className="font-semibold underline underline-offset-4" target="_blank">
            DuMeGud creator terms
          </Link>
          .
        </span>
      </label>
      {state.fieldErrors?.accept ? <p className="text-sm text-danger">{state.fieldErrors.accept[0]}</p> : null}
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Saving…">
        Accept terms
      </SubmitButton>
    </form>
  );
}

export function PublishControls({ published, canPublish }: { published: boolean; canPublish: boolean }) {
  const [publishState, publish] = useActionState(publishPage, initialFormState);
  const [unpublishState, unpublish] = useActionState(unpublishPage, initialFormState);
  const latest = publishState.status !== "idle" ? publishState : unpublishState;

  return (
    <div className="flex flex-col gap-3">
      {latest.message ? <Alert tone={latest.status === "error" ? "danger" : "success"}>{latest.message}</Alert> : null}
      {published ? (
        <form action={unpublish}>
          <SubmitButton variant="secondary" pendingLabel="Hiding…">
            Unpublish my page
          </SubmitButton>
        </form>
      ) : (
        <form action={publish}>
          <SubmitButton disabled={!canPublish} pendingLabel="Publishing…">
            Publish my page
          </SubmitButton>
          {!canPublish ? (
            <p className="mt-2 text-sm text-muted">Finish the checklist above to publish.</p>
          ) : null}
        </form>
      )}
    </div>
  );
}

export function WalletRetry() {
  const [state, action] = useActionState(retryWalletSetup, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.message ? <p className={state.status === "error" ? "text-danger" : "text-success"}>{state.message}</p> : null}
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Setting up…">
        Try again
      </SubmitButton>
    </form>
  );
}

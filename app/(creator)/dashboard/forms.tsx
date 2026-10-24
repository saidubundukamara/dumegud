"use client";

import { useActionState, useState } from "react";
import { EyeSlashIcon } from "@phosphor-icons/react/dist/ssr";
import { ConfirmAction } from "@/components/dashboard/ConfirmAction";
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
  saveEmailPreferences,
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

/** `onBrand`: on the maroon live-page card, where Hide my page is a quiet text link. */
export function PublishControls({ published, canPublish, tone = "default" }: { published: boolean; canPublish: boolean; tone?: "default" | "onBrand" }) {
  const [publishState, publish] = useActionState(publishPage, initialFormState);
  const [unpublishState, unpublish] = useActionState(unpublishPage, initialFormState);
  const latest = publishState.status !== "idle" ? publishState : unpublishState;

  return (
    <div className="flex flex-col gap-3">
      {latest.message ? <Alert tone={latest.status === "error" ? "danger" : "success"}>{latest.message}</Alert> : null}
      {published ? (
        <ConfirmAction
          trigger={
            tone === "onBrand" ? (
              <>
                <EyeSlashIcon aria-hidden="true" weight="bold" className="size-4" />
                Hide page
              </>
            ) : (
              "Hide my page"
            )
          }
          triggerClassName={
            tone === "onBrand" ? "inline-flex min-h-11 items-center gap-1.5 font-semibold text-white/85 transition-colors duration-200 hover:text-white" : undefined
          }
          title="Hide your page?" confirm="Hide my page" cancel="Keep it live" pendingLabel="Hiding…" action={unpublish}>
          Fans won&apos;t be able to see your page or support you until you make it live again. Your products and money stay safe.
        </ConfirmAction>
      ) : (
        <form action={publish}>
          <SubmitButton disabled={!canPublish} pendingLabel="Going live…">
            Make my page live
          </SubmitButton>
          {!canPublish ? (
            <p className="mt-2 text-sm text-muted">Finish the steps above to go live.</p>
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

/** One link per platform (`?via=`), so DuMeGud can tell where supporters come from. */
export function ShareLinks({ links }: { links: Array<{ label: string; url: string }> }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <ul className="flex flex-col gap-2">
      {links.map((l) => (
        <li key={l.url} className="flex flex-wrap items-center justify-between gap-2 rounded-brand bg-surface-muted px-4 py-2">
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold">{l.label}</span>
            <span className="truncate text-sm text-muted">{l.url}</span>
          </span>
          <button
            type="button"
            aria-label={copied === l.url ? `${l.label} link copied` : `Copy ${l.label} link`}
            className="min-h-11 rounded-full bg-surface px-4 font-semibold shadow-soft ring-1 ring-border transition-[box-shadow,transform] duration-200 ease-brand hover:ring-border-strong active:scale-[0.97]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(l.url);
                setCopied(l.url);
              } catch {
                setCopied(null);
              }
            }}
          >
            {copied === l.url ? "Copied" : "Copy"}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Settings → Emails. Saves both switches together. */
export function EmailPreferencesForm({ recapEmails, milestoneEmails }: { recapEmails: boolean; milestoneEmails: boolean }) {
  const [state, action] = useActionState(saveEmailPreferences, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="recapEmails" className="mt-1 size-5" defaultChecked={recapEmails} />
        <span>
          <span className="font-semibold">Monthly recap</span>
          <span className="block text-sm text-muted">On the 1st, after a month with gifts or sales.</span>
        </span>
      </label>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="milestoneEmails" className="mt-1 size-5" defaultChecked={milestoneEmails} />
        <span>
          <span className="font-semibold">Milestones</span>
          <span className="block text-sm text-muted">When you reach one, like your first supporter or your first sale.</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save
        </SubmitButton>
        <span aria-live="polite" className={`text-sm ${state.status === "error" ? "text-danger" : "text-muted"}`}>
          {state.message ?? ""}
        </span>
      </div>
    </form>
  );
}

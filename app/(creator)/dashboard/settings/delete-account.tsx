"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { formatSLE } from "@/lib/money";
import { keepAccount, requestAccountDeletion } from "../actions";

/**
 * The last step: says plainly what happens, then asks the creator to type their handle (and
 * password, if they have one). The button stays disabled until the handle matches.
 */
export function DeleteAccountForm({ confirmWith, hasPassword, forfeitableMinor }: { confirmWith: string; hasPassword: boolean; forfeitableMinor: number }) {
  const [state, action] = useActionState(requestAccountDeletion, initialFormState);
  const [typed, setTyped] = useState(state.values?.handle ?? "");
  const [forfeit, setForfeit] = useState(false);
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === confirmWith.replace(/^@/, "").toLowerCase();

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted">
        <li>Your page goes offline straight away and you&apos;re signed out everywhere.</li>
        <li>You have 30 days to change your mind: sign in and choose Keep my account.</li>
        <li>After 30 days we delete your name, photo, page, links and ID photos. Someone else can then take your handle.</li>
        <li>People who bought your products keep their downloads until their access ends.</li>
        <li>We keep records of money sent and received, without your details, as the law requires.</li>
      </ul>

      {forfeitableMinor > 0 ? (
        <label className="flex items-start gap-3 rounded-brand bg-warning-surface p-4">
          <input type="checkbox" name="forfeit" className="mt-1 size-5 shrink-0" checked={forfeit} onChange={(e) => setForfeit(e.target.checked)} />
          <span>
            Give up the <strong>{formatSLE(forfeitableMinor)}</strong> left in my wallet
            <span className="block text-sm text-muted">It&apos;s too little to send to a phone. You won&apos;t get it back.</span>
            {state.fieldErrors?.forfeit ? <span className="mt-1 block text-sm font-medium text-danger">{state.fieldErrors.forfeit[0]}</span> : null}
          </span>
        </label>
      ) : null}

      <Field
        label={`Type ${confirmWith} to confirm`}
        name="handle"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        errors={state.fieldErrors?.handle}
      />
      {hasPassword ? <Field label="Your password" name="password" type="password" autoComplete="current-password" errors={state.fieldErrors?.password} /> : null}

      <SubmitButton
        variant="secondary"
        className="self-start !text-danger"
        pendingLabel="Deleting…"
        disabled={!matches || (forfeitableMinor > 0 && !forfeit)}
      >
        Delete my account
      </SubmitButton>
    </form>
  );
}

export function KeepAccountForm() {
  const [state, action] = useActionState(keepAccount, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.status === "error" && state.message ? <p className="text-sm font-medium text-danger">{state.message}</p> : null}
      <SubmitButton className="self-start" pendingLabel="Keeping…">
        Keep my account
      </SubmitButton>
    </form>
  );
}

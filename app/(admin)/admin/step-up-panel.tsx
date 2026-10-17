"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { initialFormState } from "@/lib/form-state";
import { confirmStepUp } from "./step-up-actions";

export function StepUpPanel({ secondsLeft }: { secondsLeft: number }) {
  const router = useRouter();
  const [state, action] = useActionState(confirmStepUp, initialFormState);
  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [state, router]);

  if (secondsLeft > 0) {
    return <p className="text-sm text-success">Sensitive actions unlocked ({Math.ceil(secondsLeft / 60)} min left).</p>;
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label htmlFor="step-up-password" className="text-sm font-semibold">
        Confirm password for sensitive actions
      </label>
      <input
        id="step-up-password"
        name="password"
        type="password"
        autoComplete="current-password"
        className="min-h-10 rounded-brand border border-border bg-background px-3"
      />
      <SubmitButton variant="secondary" pendingLabel="Checking…">
        Unlock
      </SubmitButton>
      {state.status === "error" && state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
    </form>
  );
}

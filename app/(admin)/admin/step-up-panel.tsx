"use client";

import { LockKeyIcon, LockKeyOpenIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useState } from "react";
import { Sheet } from "@/components/motion/Sheet";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { CONTROL_COMPACT } from "@/components/ui/Field";
import { initialFormState, type FormState } from "@/lib/form-state";
import { confirmStepUp } from "./step-up-actions";

// Step-up: a fresh authenticator code unlocks sensitive actions for 10 minutes. The top bar shows
// whether it's on; forms that hit a sensitive action without it show the code field in place.

function CodeForm({ onDone, autoFocus = false, compact = false }: { onDone?: () => void; autoFocus?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [state, action] = useActionState(confirmStepUp, initialFormState);
  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onDone?.();
    }
  }, [state, router, onDone]);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className={`flex gap-2 ${compact ? "items-end" : "flex-col sm:flex-row sm:items-end"}`}>
        <label className="flex flex-col gap-1">
          <span className="text-[0.8125rem] font-medium">Authenticator code</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus={autoFocus}
            className={`min-h-9 tracking-[0.3em] ${CONTROL_COMPACT} !w-36`}
          />
        </label>
        <SubmitButton size="sm" variant="dark" pendingLabel="Checking…">
          Verify
        </SubmitButton>
      </div>
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Top bar: "Verified, 8 min left", or a button that asks for a code. */
export function StepUpChip({ secondsLeft }: { secondsLeft: number }) {
  // Remount when it turns on or off, so the countdown starts from the server's new value.
  return <Chip key={secondsLeft > 0 ? "on" : "off"} secondsLeft={secondsLeft} />;
}

function Chip({ secondsLeft }: { secondsLeft: number }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const minutes = useMinutesLeft(secondsLeft);
  if (minutes > 0) {
    return (
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-brand-sm bg-success-surface px-2.5 text-[0.8125rem] font-medium text-success" title="Sensitive actions are unlocked">
        <LockKeyOpenIcon aria-hidden="true" weight="bold" className="size-4" />
        Verified <span className="hidden sm:inline">· {minutes} min left</span>
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClasses("secondary", "", "sm")}>
        <LockKeyIcon aria-hidden="true" weight="bold" className="size-4" />
        <span className="hidden lg:inline">Unlock sensitive actions</span>
        <span className="whitespace-nowrap lg:hidden">Unlock</span>
      </button>
      <Sheet open={open} onClose={close} title="Unlock sensitive actions">
        <div className="flex flex-col gap-4 px-2 pb-2">
          <p className="text-sm text-muted">Enter the 6-digit code from your authenticator app. Releasing money, changing settings and changing access stay unlocked for 10 minutes.</p>
          <CodeForm onDone={close} autoFocus />
        </div>
      </Sheet>
    </>
  );
}

/** Under a form whose action needs step-up: the code field, right where the admin is working. */
export function StepUpPrompt({ state }: { state: FormState }) {
  const [verified, setVerified] = useState<FormState | null>(null);
  const done = useCallback(() => setVerified(state), [state]);
  if (state.code !== "STEP_UP_REQUIRED") return null;
  if (verified === state) {
    return (
      <p role="status" className="text-sm font-medium text-success">
        Unlocked for 10 minutes. Press the button again to finish.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-brand-sm bg-warning-surface/60 p-3 ring-1 ring-warning/25">
      <p className="text-sm">This is a sensitive action. Enter a code from your authenticator app first.</p>
      <CodeForm onDone={done} compact />
    </div>
  );
}

function useMinutesLeft(secondsLeft: number) {
  const [deadline] = useState(() => Date.now() + secondsLeft * 1000);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [secondsLeft]);
  return secondsLeft <= 0 ? 0 : Math.max(0, Math.ceil((deadline - now) / 60_000));
}

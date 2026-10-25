"use client";

import { useActionState, useCallback, useEffect, useState, type ReactNode } from "react";
import { Sheet } from "@/components/motion/Sheet";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses, type ButtonVariant } from "@/components/ui/button-classes";
import { Field, TextAreaField } from "@/components/ui/Field";
import { initialFormState, type FormState } from "@/lib/form-state";
import { StepUpPrompt } from "./step-up-panel";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type Confirm = {
  title: string;
  /** What will happen, in a sentence or two. */
  body: ReactNode;
  /** The confirm button's label (defaults to the trigger's). */
  confirmLabel?: string;
  /** Inputs asked for in the dialog (a reason), so a row action stays one button. */
  fields?: ReactNode;
  /** Destructive: the confirm button is red even when the trigger is quiet. */
  danger?: boolean;
};

/**
 * One admin action: hidden fields, optional inputs, a button and the result message. With
 * `confirm`, the button asks once in a dialog before running (for anything hard to undo). If the
 * action needs step-up, the code field appears under the form.
 */
export function ActionForm({
  action,
  hidden,
  label,
  children,
  variant = "secondary",
  confirm,
  pendingLabel = "Working…",
  layout = "stack",
  onSuccess,
}: {
  action: Action;
  hidden: Record<string, string>;
  label: string;
  children?: ReactNode;
  variant?: ButtonVariant;
  confirm?: Confirm;
  pendingLabel?: string;
  /** `inline` puts the fields and the button on one row (filters, one-field actions). */
  layout?: "stack" | "inline";
  onSuccess?: (state: FormState) => void;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  // The dialog remembers the result it opened on: a newer success closes it, an error keeps it open.
  const [openedOn, setOpenedOn] = useState<FormState | null>(null);
  const open = openedOn !== null && (state === openedOn || state.status !== "success");
  const close = useCallback(() => setOpenedOn(null), []);
  useEffect(() => {
    if (state.status === "success") onSuccess?.(state);
  }, [state, onSuccess]);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className={layout === "inline" ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-3"}>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {children}
        {confirm ? (
          <>
            <button type="button" onClick={() => setOpenedOn(state)} className={buttonClasses(variant, "self-start", "sm")}>
              {label}
            </button>
            <Sheet open={open} onClose={close} title={confirm.title}>
              <div className="flex flex-col gap-5 px-2 pb-2">
                <div className="text-sm text-muted">{confirm.body}</div>
                {confirm.fields ? <div className="flex flex-col gap-3">{confirm.fields}</div> : null}
                {open && state.status === "error" ? <Result state={state} /> : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" className={buttonClasses("secondary", "", "sm")} onClick={close}>
                    Cancel
                  </button>
                  <SubmitButton size="sm" variant={confirm.danger ? "danger" : variant === "ghost" || variant === "secondary" ? "dark" : variant} pendingLabel={pendingLabel}>
                    {confirm.confirmLabel ?? label}
                  </SubmitButton>
                </div>
              </div>
            </Sheet>
          </>
        ) : (
          <SubmitButton size="sm" variant={variant} className="self-start" pendingLabel={pendingLabel}>
            {label}
          </SubmitButton>
        )}
      </form>
      {open ? null : <Result state={state} />}
    </div>
  );
}

/** The outcome of a form action: success or error text, and the step-up prompt when needed. */
export function Result({ state }: { state: FormState }) {
  if (state.code === "STEP_UP_REQUIRED") return <StepUpPrompt state={state} />;
  if (!state.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={`text-sm font-medium ${state.status === "error" ? "text-danger" : "text-success"}`}>
      {state.message}
    </p>
  );
}

/** A short reason, kept in the audit log. */
export function NoteInput({ name = "note", label = "Reason", hint, required = false }: { name?: string; label?: string; hint?: string; required?: boolean }) {
  return <Field compact name={name} label={label} hint={hint} maxLength={500} required={required} autoComplete="off" />;
}

export function NoteArea({ name = "note", label = "Note", hint, rows = 3 }: { name?: string; label?: string; hint?: string; rows?: number }) {
  return <TextAreaField compact name={name} label={label} hint={hint} maxLength={2000} rows={rows} />;
}


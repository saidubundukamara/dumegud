"use client";

import { useActionState, type ReactNode } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { initialFormState, type FormState } from "@/lib/form-state";

/** One admin action: hidden fields, optional extra inputs, a button and the result message. */
export function ActionForm({
  action,
  hidden,
  label,
  children,
  variant = "secondary",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  label: string;
  children?: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <SubmitButton variant={variant} className="self-start" pendingLabel="Working…">
        {label}
      </SubmitButton>
      {state.message ? (
        <p role="status" className={`text-sm ${state.status === "error" ? "text-danger" : "text-success"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function NoteInput({ name = "note", label = "Reason" }: { name?: string; label?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      <input name={name} maxLength={500} className="min-h-10 rounded-brand border border-border bg-background px-3" />
    </label>
  );
}

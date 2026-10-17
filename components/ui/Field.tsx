import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Common = { label: string; name: string; errors?: string[]; hint?: ReactNode; className?: string };

const CONTROL =
  "rounded-brand border border-border bg-background px-3 text-base aria-invalid:border-danger disabled:opacity-60";

/** Label, hint and errors wired to the control through aria-describedby. */
function FieldShell({
  label,
  errors,
  hint,
  className,
  children,
}: Omit<Common, "name"> & {
  children: (ids: { id: string; describedBy?: string; invalid?: true }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = Boolean(errors?.length);
  const describedBy = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      {children({ id, describedBy, invalid: hasError || undefined })}
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <ul id={errorId} className="text-sm text-danger">
          {errors!.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Field({ label, name, errors, hint, className, ...input }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} errors={errors} hint={hint} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`min-h-12 ${CONTROL}`}
          {...input}
        />
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  name,
  errors,
  hint,
  className,
  ...textarea
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} errors={errors} hint={hint} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`min-h-32 py-2 ${CONTROL}`}
          {...textarea}
        />
      )}
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  errors,
  hint,
  className,
  children,
  ...select
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} errors={errors} hint={hint} className={className}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={`min-h-12 ${CONTROL}`}
          {...select}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}

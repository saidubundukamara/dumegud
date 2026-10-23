import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Common = { label: string; name: string; errors?: string[]; hint?: ReactNode; className?: string };

// Filled control: no grey box, a soft ring that turns blue on focus and crimson when invalid.
// Exported for the few controls laid out by hand (inline link rows, the caption editor).
export const CONTROL =
  "w-full rounded-brand bg-surface-muted px-4 text-[1.0625rem] text-text ring-1 ring-control-border transition-[box-shadow,background-color] duration-200 ease-brand placeholder:text-muted hover:ring-text focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus aria-invalid:ring-2 aria-invalid:ring-danger disabled:opacity-60";

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
  const { describedBy, invalid, messages } = fieldMessages(id, hint, errors);
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="text-[0.9375rem] font-semibold">
        {label}
      </label>
      {children({ id, describedBy, invalid })}
      {messages}
    </div>
  );
}

/**
 * Several controls answering one question (a date as day, month and year): a fieldset whose
 * legend is the label. The hint and errors describe every control in the group.
 */
export function FieldGroup({
  label,
  errors,
  hint,
  className,
  children,
}: Omit<Common, "name"> & {
  children: (ids: { id: string; describedBy?: string; invalid?: true }) => ReactNode;
}) {
  const id = useId();
  const { describedBy, invalid, messages } = fieldMessages(id, hint, errors);
  return (
    <fieldset className={`flex min-w-0 flex-col gap-1.5 ${className ?? ""}`}>
      <legend className="mb-1.5 text-[0.9375rem] font-semibold">{label}</legend>
      {children({ id, describedBy, invalid })}
      {messages}
    </fieldset>
  );
}

function fieldMessages(id: string, hint: ReactNode, errors: string[] | undefined) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = Boolean(errors?.length);
  const describedBy = [hint ? hintId : null, hasError ? errorId : null].filter(Boolean).join(" ") || undefined;
  const messages = (
    <>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {hasError ? (
        <ul id={errorId} className="flex flex-col gap-0.5 text-sm font-medium text-danger">
          {errors!.map((e) => (
            <li key={e} className="flex items-start gap-1.5">
              <WarningCircleIcon aria-hidden="true" weight="fill" className="mt-0.5 size-4 shrink-0" />
              {e}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
  return { describedBy, invalid: hasError || undefined, messages };
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
          className={`min-h-13 ${CONTROL}`}
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
          className={`min-h-32 py-3 ${CONTROL}`}
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
          className={`min-h-13 ${CONTROL}`}
          {...select}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}

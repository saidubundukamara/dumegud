import { CaretDownIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Common = { label: string; name: string; errors?: string[]; hint?: ReactNode; className?: string; compact?: boolean };

// Filled control: no grey box, a soft ring that turns blue on focus and crimson when invalid.
// Exported for the few controls laid out by hand (inline link rows, the caption editor).
export const CONTROL =
  "w-full rounded-brand bg-surface-muted px-4 text-[1.0625rem] text-text ring-1 ring-control-border transition-[box-shadow,background-color] duration-200 ease-brand placeholder:text-muted hover:ring-text focus:bg-surface focus:outline-none focus:ring-2 focus:ring-focus aria-invalid:ring-2 aria-invalid:ring-danger disabled:opacity-60";

/** The same control for dense staff screens (admin): 36px tall, 14px text, white fill. */
export const CONTROL_COMPACT =
  "w-full rounded-brand-sm bg-surface px-3 text-sm text-text ring-1 ring-control-border transition-[box-shadow] duration-150 ease-brand placeholder:text-muted hover:ring-text focus:outline-none focus:ring-2 focus:ring-focus aria-invalid:ring-2 aria-invalid:ring-danger disabled:bg-surface-muted disabled:opacity-70";

/**
 * A <select> drawn like the other controls. Without `appearance-none`, iOS Safari paints its own
 * short, flat box that ignores the height, ring and radius, so a select sitting beside inputs
 * (the date of birth) looks broken; the caret is ours. A required select still on its empty
 * placeholder option is `:invalid`, so the placeholder reads muted like an input's.
 */
export function Select({
  className,
  containerClassName,
  compact,
  children,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & { containerClassName?: string; compact?: boolean }) {
  return (
    <div className={`relative min-w-0 ${containerClassName ?? ""}`}>
      <select
        className={`appearance-none ${compact ? "pr-9" : "pr-11"} invalid:text-muted [&>option]:text-text ${className ?? ""}`}
        {...select}
      >
        {children}
      </select>
      <CaretDownIcon
        aria-hidden="true"
        weight="bold"
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted ${compact ? "right-3 size-3.5" : "right-4 size-4"}`}
      />
    </div>
  );
}

const control = (compact: boolean | undefined, height: string, compactHeight: string) => (compact ? `${compactHeight} ${CONTROL_COMPACT}` : `${height} ${CONTROL}`);

/** Label, hint and errors wired to the control through aria-describedby. */
function FieldShell({
  label,
  errors,
  hint,
  className,
  compact,
  children,
}: Omit<Common, "name"> & {
  children: (ids: { id: string; describedBy?: string; invalid?: true }) => ReactNode;
}) {
  const id = useId();
  const { describedBy, invalid, messages } = fieldMessages(id, hint, errors);
  return (
    <div className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"} ${className ?? ""}`}>
      <label htmlFor={id} className={compact ? "text-[0.8125rem] font-medium text-text" : "text-[0.9375rem] font-semibold"}>
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

export function Field({ label, name, errors, hint, className, compact, ...input }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} errors={errors} hint={hint} className={className} compact={compact}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={control(compact, "min-h-13", "min-h-9")}
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
  compact,
  ...textarea
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} errors={errors} hint={hint} className={className} compact={compact}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={control(compact, "min-h-32 py-3", "min-h-20 py-2")}
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
  compact,
  children,
  ...select
}: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} errors={errors} hint={hint} className={className} compact={compact}>
      {({ id, describedBy, invalid }) => (
        <Select
          id={id}
          name={name}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          compact={compact}
          className={control(compact, "min-h-13", "min-h-9")}
          {...select}
        >
          {children}
        </Select>
      )}
    </FieldShell>
  );
}

import type { ReactNode } from "react";
import { CONTROL, FieldGroup, Select } from "@/components/ui/Field";
import { MONTHS } from "@/lib/age";

/**
 * Date of birth as three boxes rather than <input type="date">: on Android Chrome the native
 * picker is a calendar that opens on this month, and reaching a 1990s year means finding the
 * hidden year tap. Day and year get the number pad; the month is named, so 03/04 can't be read
 * the American way. The action joins them with isoFromParts.
 */
export function DateOfBirthField({
  values,
  errors,
  hint,
}: {
  values?: Record<string, string>;
  errors?: string[];
  hint?: ReactNode;
}) {
  return (
    <FieldGroup label="Date of birth" hint={hint} errors={errors}>
      {({ id, describedBy, invalid }) => (
        <div className="grid grid-cols-[minmax(0,4.5rem)_minmax(0,1fr)_minmax(0,6rem)] gap-2">
          <Part label="Day" htmlFor={`${id}-day`}>
            <input
              id={`${id}-day`}
              name="dobDay"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              autoComplete="bday-day"
              placeholder="DD"
              required
              defaultValue={values?.dobDay}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className={`min-h-13 text-center tabular-nums ${CONTROL}`}
            />
          </Part>
          <Part label="Month" htmlFor={`${id}-month`}>
            <Select
              // React's post-action form reset doesn't re-apply a <select>'s defaultValue; remount it.
              key={values?.dobMonth ?? ""}
              id={`${id}-month`}
              name="dobMonth"
              autoComplete="bday-month"
              required
              defaultValue={values?.dobMonth ?? ""}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className={`min-h-13 ${CONTROL}`}
            >
              <option value="" disabled>
                Month
              </option>
              {MONTHS.map((name, i) => (
                <option key={name} value={String(i + 1)}>
                  {name}
                </option>
              ))}
            </Select>
          </Part>
          <Part label="Year" htmlFor={`${id}-year`}>
            <input
              id={`${id}-year`}
              name="dobYear"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="bday-year"
              placeholder="YYYY"
              required
              defaultValue={values?.dobYear}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              className={`min-h-13 text-center tabular-nums ${CONTROL}`}
            />
          </Part>
        </div>
      )}
    </FieldGroup>
  );
}

function Part({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

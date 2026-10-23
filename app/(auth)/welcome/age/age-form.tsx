"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { ageOn, formatCalendarDate, isoFromParts, parseIsoDate } from "@/lib/age";
import { initialFormState, type FormState } from "@/lib/form-state";
import { confirmDateOfBirth } from "../../actions";
import { DateOfBirthField } from "../../date-of-birth-field";
import { useFocusFirstError } from "../../use-focus-first-error";

export function AgeForm() {
  const [state, action] = useActionState(confirmDateOfBirth, initialFormState);
  const formRef = useFocusFirstError(state);
  // "Change it" dismisses the check for this answer only; a new submit brings a new state.
  const [changing, setChanging] = useState<FormState | null>(null);
  const v = state.values;
  const dob = v?.confirmUnderAge === "yes" ? parseIsoDate(isoFromParts(v.dobDay, v.dobMonth, v.dobYear)) : null;

  if (dob && changing !== state) {
    return (
      <form action={action} className="flex flex-col gap-4">
        <div role="alert" className="flex flex-col gap-2 rounded-brand bg-warning-surface px-4 py-4">
          <p className="font-semibold">Is {formatCalendarDate(dob)} right?</p>
          <p>
            That would make you {ageOn(dob, new Date())}. DuMeGud pages are for people 18 and over, so if it&apos;s right
            we&apos;ll cancel this sign-up and delete what Google sent us.
          </p>
        </div>
        <input type="hidden" name="dobDay" value={v!.dobDay} />
        <input type="hidden" name="dobMonth" value={v!.dobMonth} />
        <input type="hidden" name="dobYear" value={v!.dobYear} />
        <input type="hidden" name="underAgeConfirmed" value="yes" />
        <button
          type="button"
          onClick={() => setChanging(state)}
          className={buttonClasses("primary")}
          autoFocus
        >
          No, change it
        </button>
        <SubmitButton variant="quiet" pendingLabel="Cancelling…">
          Yes, that&apos;s right
        </SubmitButton>
      </form>
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message && !state.fieldErrors ? <Alert tone="danger">{state.message}</Alert> : null}
      <DateOfBirthField values={v} hint="We never show your birthday on your page." errors={state.fieldErrors?.dateOfBirth} />
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}

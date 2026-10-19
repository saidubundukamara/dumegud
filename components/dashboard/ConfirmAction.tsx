"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Sheet } from "@/components/motion/Sheet";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses, type ButtonVariant } from "@/components/ui/button-classes";

type Props = {
  /** The button that opens the confirmation (text, optionally with an icon). */
  trigger: ReactNode;
  triggerVariant?: ButtonVariant;
  /** Replaces the button styling, e.g. to show the trigger as a text link on a brand surface. */
  triggerClassName?: string;
  title: string;
  children: ReactNode;
  confirm: string;
  pendingLabel: string;
  cancel?: string;
  action: (formData: FormData) => void | Promise<void>;
};

/** A one-tap action with consequences, asked about once in a sheet before it runs. */
export function ConfirmAction({ trigger, triggerVariant = "secondary", triggerClassName, title, children, confirm, pendingLabel, cancel = "Cancel", action }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={triggerClassName ?? buttonClasses(triggerVariant)} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Sheet open={open} onClose={close} title={title}>
        <form action={action} className="flex flex-col gap-5 px-2 pb-2">
          <div className="text-muted">{children}</div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <button type="button" className={buttonClasses("secondary", "w-full sm:w-auto")} onClick={close}>
              {cancel}
            </button>
            <SubmitButton className="w-full sm:w-auto" pendingLabel={pendingLabel}>
              {confirm}
            </SubmitButton>
          </div>
          <CloseWhenDone onDone={close} />
        </form>
      </Sheet>
    </>
  );
}

/** Closes the sheet once the form's action has finished, so its result shows on the page. */
function CloseWhenDone({ onDone }: { onDone: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) onDone();
    wasPending.current = pending;
  }, [pending, onDone]);
  return null;
}

"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonVariant } from "./button-classes";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; pendingLabel?: string };

/** Submit button that disables itself and shows `pendingLabel` while its form is submitting. */
export function SubmitButton({ variant = "primary", pendingLabel, children, className, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className={buttonClasses(variant, className)}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

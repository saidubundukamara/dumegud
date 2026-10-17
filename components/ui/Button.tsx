"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button-classes";
import { Spinner } from "./Spinner";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; pendingLabel?: string };

/** Submit button that disables itself and shows `pendingLabel` while its form is submitting. */
export function SubmitButton({ variant = "primary", size = "md", pendingLabel, children, className, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || disabled}
      aria-disabled={pending || disabled}
      className={buttonClasses(variant, className, size)}
    >
      {pending && variant !== "ghost" ? <Spinner /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

"use client";

import { useEffect, useRef } from "react";
import type { FormState } from "@/lib/form-state";

/** After a failed submit, put focus on the first field that needs fixing (not left on <body>). */
export function useFocusFirstError(state: FormState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return ref;
}

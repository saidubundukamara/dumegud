"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { safeRedirectPath } from "@/lib/redirect";

function NextInput() {
  const next = useSearchParams().get("next");
  return next ? <input type="hidden" name="next" value={safeRedirectPath(next)} /> : null;
}

/**
 * Carries `?next=` into a sign-in form as a hidden field. It suspends on its own, so the form
 * around it stays in the static shell and is usable immediately.
 */
export function NextField() {
  return (
    <Suspense fallback={null}>
      <NextInput />
    </Suspense>
  );
}

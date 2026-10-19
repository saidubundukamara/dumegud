"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { initialFormState } from "@/lib/form-state";
import { submitProduct, unpublishProduct } from "./actions";
import { WizardFooter } from "./ui";

/** The last wizard step. Submit stays disabled until the checklist above it is complete. */
export function SubmitForReview({ productId, ready, back }: { productId: string; ready: boolean; back: Route }) {
  const [state, action] = useActionState(submitProduct, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="productId" value={productId} />
      <label className="flex cursor-pointer items-start gap-3 rounded-brand bg-surface p-4 ring-1 ring-border has-[:checked]:ring-2 has-[:checked]:ring-primary">
        <input type="checkbox" name="ownership" required className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span>I created this product or have the rights to sell it, and it follows the DuMeGud content policy.</span>
      </label>
      {state.message ? <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert> : null}
      <WizardFooter>
        <Link href={back} className={buttonClasses("secondary", "shrink-0")}>
          Back
        </Link>
        <SubmitButton className="flex-1 sm:flex-none" pendingLabel="Sending…" disabled={!ready}>
          Send for review
        </SubmitButton>
      </WizardFooter>
    </form>
  );
}

export function Unpublish({ productId, inReview }: { productId: string; inReview: boolean }) {
  const [state, action] = useActionState(unpublishProduct, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      {state.message ? <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert> : null}
      <SubmitButton variant="secondary" className="w-full sm:w-fit" pendingLabel={inReview ? "Withdrawing…" : "Hiding…"}>
        {inReview ? "Withdraw from review" : "Hide from my shop"}
      </SubmitButton>
    </form>
  );
}

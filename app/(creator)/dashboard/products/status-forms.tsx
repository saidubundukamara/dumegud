"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { initialFormState } from "@/lib/form-state";
import { submitProduct, unpublishProduct } from "./actions";

export function SubmitForReview({ productId }: { productId: string }) {
  const [state, action] = useActionState(submitProduct, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <label className="flex items-start gap-3">
        <input type="checkbox" name="ownership" className="mt-1 size-5" />
        <span>I created this product or have the rights to sell it, and it follows the DuMeGud content policy.</span>
      </label>
      {state.message ? <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert> : null}
      <SubmitButton className="self-start" pendingLabel="Submitting…">
        Submit for review
      </SubmitButton>
    </form>
  );
}

export function Unpublish({ productId }: { productId: string }) {
  const [state, action] = useActionState(unpublishProduct, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      {state.message ? <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert> : null}
      <SubmitButton variant="secondary" className="self-start" pendingLabel="Unpublishing…">
        Unpublish
      </SubmitButton>
    </form>
  );
}

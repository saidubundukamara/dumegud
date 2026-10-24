"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { approveProduct, rejectProduct } from "./actions";

export function ReviewForms({ productId, version }: { productId: string; version: string }) {
  const [approved, approve] = useActionState(approveProduct, initialFormState);
  const [rejected, reject] = useActionState(rejectProduct, initialFormState);
  const latest = approved.status !== "idle" ? approved : rejected;
  if (latest.status === "success") return <Alert tone="success">{latest.message}</Alert>;
  return (
    <div className="flex flex-col gap-3">
      {latest.message ? <Alert tone="danger">{latest.message}</Alert> : null}
      <form action={approve}>
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="version" value={version} />
        <SubmitButton pendingLabel="Publishing…">Approve and publish</SubmitButton>
      </form>
      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="productId" value={productId} />
        <Field label="Reason (shown to the creator)" name="note" maxLength={500} />
        <SubmitButton variant="secondary" className="self-start" pendingLabel="Sending back…">
          Send back
        </SubmitButton>
      </form>
    </div>
  );
}

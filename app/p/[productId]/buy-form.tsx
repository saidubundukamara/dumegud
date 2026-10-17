"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { formatSLE } from "@/lib/money";
import { startPurchase } from "./actions";

export function BuyForm({ productId, priceMinor }: { productId: string; priceMinor: number }) {
  const [state, action] = useActionState(startPurchase, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="productId" value={productId} />
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field
        label="Email for your download link"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        hint="We send your receipt and download link here. No account needed."
        errors={state.fieldErrors?.email}
      />
      <Field
        label="Your name (optional)"
        name="buyerName"
        autoComplete="name"
        maxLength={60}
        defaultValue={state.values?.buyerName}
        errors={state.fieldErrors?.buyerName}
      />
      <SubmitButton pendingLabel="Opening checkout…">Buy for {formatSLE(priceMinor)}</SubmitButton>
      <p className="text-sm text-muted">You&apos;ll pay with Orange Money or AfriMoney on Monime&apos;s secure checkout.</p>
    </form>
  );
}

"use client";

import { LockKeyIcon } from "@phosphor-icons/react/dist/ssr";
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
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="productId" value={productId} />
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field
        label="Your email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        hint="We send your download link here. No account needed."
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
      <SubmitButton size="lg" pendingLabel="Opening checkout…" className="w-full">
        Buy for {formatSLE(priceMinor)}
      </SubmitButton>
      <p className="flex items-center justify-center gap-1.5 text-center text-sm text-muted">
        <LockKeyIcon aria-hidden="true" className="size-4 shrink-0" />
        Pay with Orange Money or AfriMoney. Safe checkout by Monime.
      </p>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { LICENSE_SUMMARIES, LICENSE_TYPES } from "@/lib/license";
import { createProduct, updateProduct } from "./actions";

export type ProductFormValues = {
  productId?: string;
  title: string;
  description: string;
  categoryId: string;
  price: string;
  licenseType: (typeof LICENSE_TYPES)[number];
  licenseText: string;
};

export function ProductForm({
  initial,
  categories,
  live,
}: {
  initial: ProductFormValues;
  categories: { id: string; name: string }[];
  live: boolean;
}) {
  const [state, action] = useActionState(initial.productId ? updateProduct : createProduct, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {initial.productId ? <input type="hidden" name="productId" value={initial.productId} /> : null}
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" && state.message ? <Alert tone="success">{state.message}</Alert> : null}
      {live ? <Alert tone="warning">This product is live. Saving changes sends it back for a quick review.</Alert> : null}

      <Field label="Title" name="title" required maxLength={120} defaultValue={initial.title} errors={state.fieldErrors?.title} />
      <TextAreaField
        label="Description"
        name="description"
        maxLength={5000}
        rows={6}
        defaultValue={initial.description}
        hint="What's inside, who it's for, and anything buyers should know."
        errors={state.fieldErrors?.description}
      />
      <Field
        label="Price (Le)"
        name="price"
        inputMode="decimal"
        required
        defaultValue={initial.price}
        hint="Buyers pay this price. Our fee comes out of it."
        errors={state.fieldErrors?.price}
      />
      <SelectField label="Category" name="categoryId" defaultValue={initial.categoryId} errors={state.fieldErrors?.categoryId}>
        <option value="">Choose a category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <SelectField label="Licence" name="licenseType" defaultValue={initial.licenseType} errors={state.fieldErrors?.licenseType}>
        {LICENSE_TYPES.map((t) => (
          <option key={t} value={t}>
            {LICENSE_SUMMARIES[t].label}
          </option>
        ))}
      </SelectField>
      <TextAreaField
        label="Extra licence terms (optional)"
        name="licenseText"
        maxLength={1000}
        rows={3}
        defaultValue={initial.licenseText}
        errors={state.fieldErrors?.licenseText}
      />
      <SubmitButton className="self-start" pendingLabel="Saving…">
        {initial.productId ? "Save changes" : "Create draft"}
      </SubmitButton>
    </form>
  );
}

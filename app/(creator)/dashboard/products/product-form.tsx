"use client";

import type { Route } from "next";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Field, SelectField, TextAreaField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { LICENSE_SUMMARIES, LICENSE_TYPES } from "@/lib/license";
import { createProduct, updateProduct } from "./actions";
import { PriceField, type PricingSettings } from "./price-field";
import { WizardFooter } from "./ui";

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
  pricing,
  live,
  next,
  back,
  submitLabel,
}: {
  initial: ProductFormValues;
  categories: { id: string; name: string }[];
  pricing: PricingSettings;
  live: boolean;
  /** Where saving an existing product goes: on to the files step, or back to its overview. */
  next?: "files" | "hub";
  back: { href: Route; label: string };
  submitLabel: string;
}) {
  const [state, action] = useActionState(initial.productId ? updateProduct : createProduct, initialFormState);
  const [dirty, setDirty] = useState(false);
  const v = { ...initial, ...state.values } as ProductFormValues;
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} onChange={() => setDirty(true)} className="flex flex-col gap-6" noValidate>
      {initial.productId ? <input type="hidden" name="productId" value={initial.productId} /> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <Field label="Title" name="title" required maxLength={120} defaultValue={v.title} errors={fe.title} placeholder="e.g. Krio Recipes e-book" />
      <TextAreaField
        label="Description"
        name="description"
        maxLength={5000}
        rows={5}
        defaultValue={v.description}
        hint="What's inside, who it's for, and anything buyers should know."
        errors={fe.description}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <PriceField key={v.price} defaultValue={v.price} errors={fe.price} pricing={pricing} />
        <SelectField label="Category" name="categoryId" defaultValue={v.categoryId} errors={fe.categoryId}>
          <option value="">Choose a category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset className="flex flex-col gap-2.5" aria-describedby={fe.licenseType ? "licence-error" : undefined}>
        <legend className="mb-1.5 text-[0.9375rem] font-semibold">What buyers may do with it</legend>
        {LICENSE_TYPES.map((t) => (
          <label
            key={t}
            className="flex cursor-pointer items-start gap-3 rounded-brand bg-surface p-4 ring-1 ring-border transition-[box-shadow,background-color] duration-200 ease-brand hover:ring-border-strong has-[:checked]:bg-primary-soft/60 has-[:checked]:ring-2 has-[:checked]:ring-primary has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus"
          >
            <input type="radio" name="licenseType" value={t} defaultChecked={v.licenseType === t} className="mt-0.5 size-5 shrink-0 accent-primary" />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">{LICENSE_SUMMARIES[t].label}</span>
              <span className="text-sm text-muted">{LICENSE_SUMMARIES[t].summary}</span>
            </span>
          </label>
        ))}
        {fe.licenseType ? (
          <p id="licence-error" className="text-sm font-medium text-danger">
            {fe.licenseType[0]}
          </p>
        ) : null}
      </fieldset>

      <details className="details-smooth group rounded-brand ring-1 ring-border" open={Boolean(v.licenseText || fe.licenseText)}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold [&::-webkit-details-marker]:hidden">
          Add your own licence terms
          <span className="text-sm font-normal text-muted group-open:hidden">Optional</span>
        </summary>
        <div className="px-4 pb-4">
          <TextAreaField
            label="Extra terms"
            name="licenseText"
            maxLength={1000}
            rows={3}
            defaultValue={v.licenseText}
            hint="Shown to buyers under the licence above."
            errors={fe.licenseText}
          />
        </div>
      </details>

      {live && dirty ? (
        <Alert tone="warning">
          This product is live. Saving sends your changes for review, and it&apos;s hidden from buyers until we approve them.
        </Alert>
      ) : null}

      <WizardFooter>
        <Link href={back.href} className={buttonClasses("secondary", "shrink-0")}>
          {back.label}
        </Link>
        <SubmitButton className="flex-1 sm:flex-none" pendingLabel="Saving…">
          {submitLabel}
        </SubmitButton>
      </WizardFooter>
    </form>
  );
}

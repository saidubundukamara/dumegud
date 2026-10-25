"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { Result } from "@/app/(admin)/admin/action-form";
import { saveLimit } from "./actions";

export type LimitValues = {
  id: string;
  scope: string;
  window: string;
  verificationTier: string;
  riskTier: string;
  maxAmount: string;
  maxCount: string;
  action: string;
  active: boolean;
};

export const SCOPE_LABEL: Record<string, string> = {
  per_contribution: "One payment",
  supporter_to_creator: "One supporter to one creator",
  supporter_global: "One supporter, all creators",
  creator_receipts: "What a creator receives",
  creator_payouts: "What a creator withdraws",
  velocity_count: "Checkouts per phone number",
};

export function LimitForm({ initial }: { initial: LimitValues }) {
  const [state, action] = useActionState(saveLimit, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={initial.id} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField compact label="Applies to" name="scope" defaultValue={initial.scope}>
          {Object.entries(SCOPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
        <SelectField compact label="Over" name="window" defaultValue={initial.window}>
          <option value="single">A single payment</option>
          <option value="24h">24 hours</option>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
        </SelectField>
        <SelectField compact label="Verification" name="verificationTier" defaultValue={initial.verificationTier}>
          <option value="">Any creator</option>
          <option value="none">Not verified</option>
          <option value="email">Email verified</option>
          <option value="id_verified">ID verified</option>
        </SelectField>
        <SelectField compact label="Risk tier" name="riskTier" defaultValue={initial.riskTier}>
          <option value="">Any tier</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="restricted">Restricted</option>
        </SelectField>
        <Field compact label="Most money (Le)" name="maxAmount" inputMode="decimal" defaultValue={initial.maxAmount} errors={state.fieldErrors?.maxAmount} hint="Blank for no amount cap." />
        <Field compact label="Most payments" name="maxCount" inputMode="numeric" defaultValue={initial.maxCount} errors={state.fieldErrors?.maxCount} hint="Blank for no count cap." />
        <SelectField compact label="Over the limit" name="action" defaultValue={initial.action}>
          <option value="block">Refuse the payment</option>
          <option value="review">Hold it for review</option>
          <option value="flag">Let it through, raise an alert</option>
        </SelectField>
        <label className="flex min-h-9 items-center gap-2.5 self-end pb-0.5 text-sm">
          <input type="checkbox" name="active" defaultChecked={initial.active} className="size-[1.125rem] accent-primary" />
          Limit is on
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <SubmitButton size="sm" variant={initial.id ? "secondary" : "primary"} className="self-start" pendingLabel="Saving…">
          {initial.id ? "Save limit" : "Add limit"}
        </SubmitButton>
        <Result state={state} />
      </div>
    </form>
  );
}

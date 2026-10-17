"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { Field, SelectField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
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

export function LimitForm({ initial, editable }: { initial: LimitValues; editable: boolean }) {
  const [state, action] = useActionState(saveLimit, initialFormState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={initial.id} />
      {state.message ? (
        <div className="sm:col-span-2">
          <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert>
        </div>
      ) : null}
      <SelectField label="Scope" name="scope" defaultValue={initial.scope} disabled={!editable}>
        <option value="per_contribution">Per contribution</option>
        <option value="supporter_to_creator">One supporter → one creator</option>
        <option value="supporter_global">One supporter, all creators</option>
        <option value="creator_receipts">Creator receipts</option>
        <option value="creator_payouts">Creator payouts</option>
        <option value="velocity_count">Checkouts per network</option>
      </SelectField>
      <SelectField label="Window" name="window" defaultValue={initial.window} disabled={!editable}>
        <option value="single">Single payment</option>
        <option value="24h">24 hours</option>
        <option value="7d">7 days</option>
        <option value="30d">30 days</option>
      </SelectField>
      <SelectField label="Verification tier" name="verificationTier" defaultValue={initial.verificationTier} disabled={!editable}>
        <option value="">Any</option>
        <option value="none">None</option>
        <option value="email">Email</option>
        <option value="id_verified">ID verified</option>
      </SelectField>
      <SelectField label="Risk tier" name="riskTier" defaultValue={initial.riskTier} disabled={!editable}>
        <option value="">Any</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="restricted">Restricted</option>
      </SelectField>
      <Field label="Max amount (Le)" name="maxAmount" defaultValue={initial.maxAmount} disabled={!editable} errors={state.fieldErrors?.maxAmount} />
      <Field label="Max count" name="maxCount" inputMode="numeric" defaultValue={initial.maxCount} disabled={!editable} />
      <SelectField label="When exceeded" name="action" defaultValue={initial.action} disabled={!editable}>
        <option value="block">Block</option>
        <option value="review">Hold for review</option>
        <option value="flag">Flag only</option>
      </SelectField>
      <label className="flex items-center gap-3 self-end">
        <input type="checkbox" name="active" defaultChecked={initial.active} disabled={!editable} className="size-5" />
        Active
      </label>
      {editable ? (
        <SubmitButton className="self-start" pendingLabel="Saving…">
          {initial.id ? "Save" : "Add limit"}
        </SubmitButton>
      ) : null}
    </form>
  );
}

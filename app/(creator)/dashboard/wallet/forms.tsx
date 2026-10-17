"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Field, SelectField } from "@/components/ui/Field";
import { initialFormState } from "@/lib/form-state";
import { formatSLE, MINOR_PER_MAJOR, parseMajorToMinor } from "@/lib/money";
import { payoutFee } from "@/lib/phone";
import { bindPayoutMethod, requestKycUpload, submitKyc, withdraw } from "./actions";

export function WithdrawForm({ maxMinor, minMinor, feeBps }: { maxMinor: number; minMinor: number; feeBps: number }) {
  const [state, action] = useActionState(withdraw, initialFormState);
  const [amount, setAmount] = useState(state.values?.amount ?? "");
  const minor = parseMajorToMinor(amount);
  const fee = minor ? payoutFee(minor, feeBps) : 0;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message ? <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert> : null}
      <Field
        label="Amount to withdraw (Le)"
        name="amount"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint={`Between ${formatSLE(minMinor)} and ${formatSLE(maxMinor)}.`}
        errors={state.fieldErrors?.amount}
      />
      <button type="button" className={buttonClasses("ghost", "self-start")} onClick={() => setAmount((maxMinor / MINOR_PER_MAJOR).toFixed(2))}>
        Withdraw the maximum
      </button>
      {minor ? (
        <p className="rounded-brand bg-surface-muted px-4 py-3" aria-live="polite">
          You receive <strong>{formatSLE(minor)}</strong> on your phone. A {formatSLE(fee)} transfer fee is taken from your
          balance on top (total {formatSLE(minor + fee)}).
        </p>
      ) : null}
      <SubmitButton className="self-start" disabled={maxMinor < minMinor} pendingLabel="Sending…">
        Withdraw
      </SubmitButton>
    </form>
  );
}

export function BindNumberForm() {
  const [state, action] = useActionState(bindPayoutMethod, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.message ? <Alert tone={state.status === "error" ? "danger" : "success"}>{state.message}</Alert> : null}
      <Field
        label="Mobile money number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        defaultValue={state.values?.phone}
        hint="For example 076 123 456. It must be registered in your own name."
        errors={state.fieldErrors?.phone}
      />
      <SelectField label="Operator" name="providerId" defaultValue={state.values?.providerId ?? ""} errors={state.fieldErrors?.providerId}>
        <option value="">Detect from the number</option>
        <option value="m17">Orange Money</option>
        <option value="m18">AfriMoney</option>
      </SelectField>
      <SubmitButton className="self-start" pendingLabel="Checking the number…">
        Save number
      </SubmitButton>
    </form>
  );
}

const DOCS = [
  { doc: "id_front", label: "Front of your ID", required: true },
  { doc: "id_back", label: "Back of your ID (if it has one)", required: false },
  { doc: "selfie", label: "A selfie holding your ID", required: true },
] as const;

function PhotoInput({ doc, label, onKey }: { doc: string; label: string; onKey: (key: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <span className="font-semibold">{label}</span>
      <button type="button" className={buttonClasses("secondary", "self-start")} disabled={pending} onClick={() => input.current?.click()}>
        {status === "Added" ? "Replace photo" : "Add photo"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          start(async () => {
            setStatus("Uploading…");
            const ticket = await requestKycUpload({ doc, contentType: file.type, size: file.size });
            if (!ticket.ok) return setStatus(ticket.message);
            const put = await fetch(ticket.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).catch(() => null);
            if (!put?.ok) return setStatus("The upload didn't go through. Try again.");
            onKey(ticket.data.key);
            setStatus("Added");
          });
        }}
      />
      {status ? <span className="text-sm text-muted" role="status">{status}</span> : null}
    </div>
  );
}

export function KycForm() {
  const [state, action] = useActionState(submitKyc, initialFormState);
  const [keys, setKeys] = useState<Record<string, string>>({});
  if (state.status === "success") return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <Field label="Full legal name (as on your ID)" name="legalName" autoComplete="name" defaultValue={state.values?.legalName} errors={state.fieldErrors?.legalName} />
      <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={state.values?.dateOfBirth} errors={state.fieldErrors?.dateOfBirth} />
      <SelectField label="ID type" name="idType" defaultValue={state.values?.idType ?? "national_id"} errors={state.fieldErrors?.idType}>
        <option value="national_id">National ID</option>
        <option value="passport">Passport</option>
        <option value="drivers_license">Driver&apos;s licence</option>
        <option value="voter_id">Voter ID</option>
      </SelectField>
      <Field label="ID number" name="idNumber" autoComplete="off" errors={state.fieldErrors?.idNumber} />
      {DOCS.map((d) => (
        <div key={d.doc}>
          <PhotoInput doc={d.doc} label={d.label} onKey={(key) => setKeys((k) => ({ ...k, [d.doc]: key }))} />
          {state.fieldErrors?.[d.doc === "id_front" ? "idFrontKey" : d.doc === "selfie" ? "selfieKey" : "idBackKey"]?.map((e) => (
            <p key={e} className="text-sm text-danger">
              {e}
            </p>
          ))}
        </div>
      ))}
      <input type="hidden" name="idFrontKey" value={keys.id_front ?? ""} />
      <input type="hidden" name="idBackKey" value={keys.id_back ?? ""} />
      <input type="hidden" name="selfieKey" value={keys.selfie ?? ""} />
      <p className="text-sm text-muted">Your documents are stored privately and only our verification team can see them.</p>
      <SubmitButton className="self-start" pendingLabel="Submitting…">
        Submit for verification
      </SubmitButton>
    </form>
  );
}

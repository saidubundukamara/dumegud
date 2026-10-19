"use client";

import { useActionState, useId, useRef, useState, useTransition } from "react";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert } from "@/components/ui/Alert";
import { SubmitButton } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Panel } from "@/components/ui/Card";
import { Field, SelectField } from "@/components/ui/Field";
import { Spinner } from "@/components/ui/Spinner";
import { initialFormState } from "@/lib/form-state";
import { formatDateTime } from "@/lib/dates";
import { formatMajorInput, formatSLE, parseMajorToMinor } from "@/lib/money";
import { payoutFee } from "@/lib/phone";
import { bindPayoutMethod, requestKycUpload, submitKyc, withdraw } from "./actions";

type PayoutTarget = { providerLabel: string; masked: string; holderName: string | null };

/**
 * Amount → review → confirm → receipt. Nothing is sent until the creator has seen exactly what
 * reaches their phone, the fee and the number it goes to.
 */
export function WithdrawForm({
  maxMinor,
  minMinor,
  feeBps,
  to,
  final = false,
}: {
  maxMinor: number;
  minMinor: number;
  feeBps: number;
  to: PayoutTarget;
  /** Emptying the wallet before deleting the account: the full amount, minimum waived. */
  final?: boolean;
}) {
  const [state, action] = useActionState(withdraw, initialFormState);
  const [amount, setAmount] = useState(state.values?.amount ?? (final && maxMinor > 0 ? formatMajorInput(maxMinor) : ""));
  const [step, setStep] = useState<"amount" | "review">("amount");
  const [localError, setLocalError] = useState<string | null>(null);
  // Adjust state when a new result arrives: errors go back to the amount step, a success shows
  // the receipt until the creator starts another withdrawal.
  const [seen, setSeen] = useState(state);
  const [receipt, setReceipt] = useState<{ minor: number; fee: number; at: Date } | null>(null);
  const minor = parseMajorToMinor(amount);
  const fee = minor ? payoutFee(minor, feeBps) : 0;
  if (state !== seen) {
    setSeen(state);
    if (state.status === "error") setStep("amount");
    if (state.status === "success" && minor) setReceipt({ minor, fee, at: new Date() });
  }

  if (maxMinor < minMinor && !final) {
    return (
      <p className="text-muted">
        The smallest withdrawal is {formatSLE(minMinor)}. You can withdraw once your balance reaches it.
      </p>
    );
  }

  if (receipt) {
    return (
      <Panel className="flex flex-col gap-4 p-5 sm:p-6" as="section">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-surface text-success">
            <CheckCircleIcon weight="fill" className="size-6" />
          </span>
          <div className="flex flex-col gap-0.5" role="status">
            <h3 className="text-lg font-bold">Withdrawal requested</h3>
            <p className="text-muted">{state.message}</p>
          </div>
        </div>
        <SummaryList
          rows={[
            ["To your phone", formatSLE(receipt.minor)],
            ["Transfer fee", formatSLE(receipt.fee)],
            ["Taken from your balance", formatSLE(receipt.minor + receipt.fee)],
            ["Sent to", `${to.providerLabel} ${to.masked}${to.holderName ? ` (${to.holderName})` : ""}`],
            ["Requested", formatDateTime(receipt.at)],
          ]}
        />
        <p className="text-sm text-muted">You can follow it under Withdrawals below.</p>
        <button
          type="button"
          className={buttonClasses("secondary", "self-start")}
          onClick={() => {
            setReceipt(null);
            setAmount("");
            setStep("amount");
          }}
        >
          Done
        </button>
      </Panel>
    );
  }

  const review = () => {
    if (!minor) return setLocalError("Enter an amount, for example 250.");
    if (final && minor !== maxMinor) return setLocalError(`A final withdrawal sends everything you can withdraw: ${formatSLE(maxMinor)}.`);
    if (!final && minor < minMinor) return setLocalError(`The smallest withdrawal is ${formatSLE(minMinor)}.`);
    if (minor > maxMinor) return setLocalError(`You can withdraw up to ${formatSLE(maxMinor)}.`);
    setLocalError(null);
    setStep("review");
  };

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      {final ? <input type="hidden" name="final" value="1" /> : null}
      {final ? (
        <Alert tone="info">
          This is your last withdrawal before deleting your account. It sends everything you can withdraw, so the usual{" "}
          {formatSLE(minMinor)} minimum doesn&apos;t apply.
        </Alert>
      ) : null}
      {step === "amount" ? (
        <>
          <Field
            label="Amount to withdraw (Le)"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setLocalError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                review();
              }
            }}
            hint={final ? `Everything you can withdraw: ${formatSLE(maxMinor)}.` : `Between ${formatSLE(minMinor)} and ${formatSLE(maxMinor)}.`}
            errors={localError ? [localError] : state.fieldErrors?.amount}
          />
          <button type="button" className={buttonClasses("ghost", "self-start !min-h-11 !px-0")} onClick={() => setAmount(formatMajorInput(maxMinor))}>
            Withdraw the maximum
          </button>
          {minor ? (
            <p className="rounded-brand bg-surface-muted px-4 py-3" aria-live="polite">
              You receive <strong>{formatSLE(minor)}</strong> on your phone. A {formatSLE(fee)} transfer fee is taken from your
              balance on top (total {formatSLE(minor + fee)}).
            </p>
          ) : null}
          <button type="button" className={buttonClasses("primary", "self-start")} onClick={review}>
            Review withdrawal
          </button>
        </>
      ) : (
        <>
          <input type="hidden" name="amount" value={amount} />
          <Panel className="flex flex-col gap-4 p-5 sm:p-6" as="section">
            <h3 className="text-lg font-bold">
              Send {formatSLE(minor ?? 0)} to {to.providerLabel} {to.masked}?
            </h3>
            <SummaryList
              rows={[
                ["To your phone", formatSLE(minor ?? 0)],
                ["Transfer fee", formatSLE(fee)],
                ["Taken from your balance", formatSLE((minor ?? 0) + fee)],
                ["Registered to", to.holderName ?? "Your verified name"],
              ]}
            />
            <p className="text-sm text-muted">Mobile money transfers can&apos;t be reversed. Check the number before you confirm.</p>
            <div className="flex flex-wrap gap-3">
              <SubmitButton pendingLabel="Sending…">Confirm withdrawal</SubmitButton>
              <button type="button" className={buttonClasses("secondary")} onClick={() => setStep("amount")}>
                Change amount
              </button>
            </div>
          </Panel>
        </>
      )}
    </form>
  );
}

function SummaryList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="flex flex-col divide-y divide-border">
      {rows.map(([label, value], i) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-muted">{label}</dt>
          <dd className={`text-right tabular-nums ${i === rows.length - 1 && rows.length > 4 ? "" : "font-semibold"}`}>{value}</dd>
        </div>
      ))}
    </dl>
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
  { doc: "id_front", label: "Front of your ID", action: "Add front of ID", field: "idFrontKey" },
  { doc: "id_back", label: "Back of your ID (if it has one)", action: "Add back of ID", field: "idBackKey" },
  { doc: "selfie", label: "A selfie holding your ID", action: "Add a selfie", field: "selfieKey" },
] as const;

type Upload = { state: "idle" } | { state: "uploading"; preview: string } | { state: "added"; preview: string } | { state: "error"; message: string };

function PhotoInput({
  doc,
  label,
  actionLabel,
  errors,
  onKey,
  onBusy,
}: {
  doc: string;
  label: string;
  actionLabel: string;
  errors?: string[];
  onKey: (key: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<Upload>({ state: "idle" });
  const [, start] = useTransition();
  const errorId = useId();
  const message = upload.state === "error" ? upload.message : errors?.[0];
  const preview = upload.state === "uploading" || upload.state === "added" ? upload.preview : null;
  return (
    <div className="flex flex-col gap-2">
      <span className="font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        {preview ? (
          // A local object URL of the photo just picked; never a remote image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-14 shrink-0 rounded-brand-sm object-cover ring-1 ring-border" />
        ) : null}
        <button
          type="button"
          className={buttonClasses("secondary")}
          disabled={upload.state === "uploading"}
          aria-describedby={message ? errorId : undefined}
          onClick={() => input.current?.click()}
        >
          {upload.state === "uploading" ? <Spinner /> : null}
          {upload.state === "uploading" ? "Uploading…" : upload.state === "added" ? "Replace photo" : actionLabel}
        </button>
        {upload.state === "added" ? (
          <span className="flex items-center gap-1 text-sm font-semibold text-success" role="status">
            <CheckCircleIcon aria-hidden="true" weight="fill" className="size-4" />
            Added
          </span>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const preview = URL.createObjectURL(file);
          setUpload({ state: "uploading", preview });
          onBusy(true);
          start(async () => {
            const fail = (message: string) => {
              URL.revokeObjectURL(preview);
              setUpload({ state: "error", message });
              onBusy(false);
            };
            const ticket = await requestKycUpload({ doc, contentType: file.type, size: file.size });
            if (!ticket.ok) return fail(ticket.message);
            const put = await fetch(ticket.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).catch(() => null);
            if (!put?.ok) return fail("The upload didn't go through. Check your connection and try again.");
            onKey(ticket.data.key);
            setUpload({ state: "added", preview });
            onBusy(false);
          });
        }}
      />
      {message ? (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-danger" role="alert">
          <WarningCircleIcon aria-hidden="true" weight="fill" className="size-4 shrink-0" />
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function KycForm() {
  const [state, action] = useActionState(submitKyc, initialFormState);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const uploading = Object.values(busy).some(Boolean);
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
      <p className="text-sm text-muted">
        Take clear photos in good light. The selfie shows us the ID really is yours. We usually check within one working day.
      </p>
      {DOCS.map((d) => (
        <PhotoInput
          key={d.doc}
          doc={d.doc}
          label={d.label}
          actionLabel={d.action}
          errors={state.fieldErrors?.[d.field]}
          onKey={(key) => setKeys((k) => ({ ...k, [d.doc]: key }))}
          onBusy={(b) => setBusy((prev) => ({ ...prev, [d.doc]: b }))}
        />
      ))}
      <input type="hidden" name="idFrontKey" value={keys.id_front ?? ""} />
      <input type="hidden" name="idBackKey" value={keys.id_back ?? ""} />
      <input type="hidden" name="selfieKey" value={keys.selfie ?? ""} />
      <p className="text-sm text-muted">Your documents are stored privately and only our verification team can see them.</p>
      <SubmitButton className="self-start" pendingLabel="Submitting…" disabled={uploading}>
        {uploading ? "Waiting for photos…" : "Submit for verification"}
      </SubmitButton>
    </form>
  );
}
